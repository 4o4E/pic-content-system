import type { FastifyInstance } from "fastify";
import type { ApiResp, AuditActionDto, AuditDetailDto, AuditListItemDto, AuditState, MediaType, PageResp } from "@pic/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { toMediaContentDto } from "../media/mapper.js";
import { deleteMediaFileReferences } from "../file/file-reference-service.js";
import { resolveSourceProfile } from "../source/source-service.js";
import { toAuditEventDto, writeAuditEvent } from "./audit-service.js";

function withSourceProfile(content: Parameters<typeof toMediaContentDto>[0]): AuditListItemDto {
  const dto = toMediaContentDto(content);
  return {
    ...dto,
    sourceProfile: resolveSourceProfile(dto.source),
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

async function changeAuditState(contentId: string, toState: AuditState, body: AuditActionDto | undefined) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.mediaContent.findUnique({ where: { id: contentId } });
    if (!current) return undefined;
    const updated = await tx.mediaContent.update({
      where: { id: contentId },
      data: { auditState: toState },
      include: { sources: true },
    });
    await writeAuditEvent(tx, {
      contentId,
      action: toState === "approved" ? "approve" : toState === "rejected" ? "reject" : toState === "archived" ? "archive" : "reset",
      fromState: current.auditState,
      toState,
      body,
    });
    return updated;
  });
  return result ? withSourceProfile(result) : undefined;
}

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { state?: AuditState | "all"; type?: MediaType | "all"; page?: string; size?: string };
    Reply: ApiResp<PageResp<AuditListItemDto>>;
  }>("/api/audits", async (request) => {
    const page = parsePositiveInt(request.query.page, 1, Number.MAX_SAFE_INTEGER);
    const size = parsePositiveInt(request.query.size, 20, 100);
    const where: Prisma.MediaContentWhereInput = {};
    if (!request.query.state) where.auditState = "pending";
    else if (request.query.state !== "all") where.auditState = request.query.state;
    if (request.query.type && request.query.type !== "all") where.type = request.query.type;

    const [total, rows] = await Promise.all([
      prisma.mediaContent.count({ where }),
      prisma.mediaContent.findMany({
        where,
        include: { sources: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return { success: true, message: "ok", data: { total, data: rows.map(withSourceProfile) } };
  });

  app.get<{ Params: { contentId: string }; Reply: ApiResp<AuditDetailDto> }>("/api/audits/:contentId", async (request, reply) => {
    const content = await prisma.mediaContent.findUnique({ where: { id: request.params.contentId }, include: { sources: true } });
    if (!content) return reply.code(404).send({ success: false, message: "内容不存在" });
    const events = await prisma.auditEvent.findMany({ where: { contentId: content.id }, orderBy: { createdAt: "desc" } });
    return {
      success: true,
      message: "ok",
      data: {
        content: withSourceProfile(content),
        events: events.map(toAuditEventDto),
      },
    };
  });

  app.post<{ Params: { contentId: string }; Body: AuditActionDto; Reply: ApiResp<AuditListItemDto> }>("/api/audits/:contentId/approve", async (request, reply) => {
    const data = await changeAuditState(request.params.contentId, "approved", request.body);
    if (!data) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data };
  });

  app.post<{ Params: { contentId: string }; Body: AuditActionDto; Reply: ApiResp<AuditListItemDto> }>("/api/audits/:contentId/reject", async (request, reply) => {
    const data = await changeAuditState(request.params.contentId, "rejected", request.body);
    if (!data) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data };
  });

  app.post<{ Params: { contentId: string }; Body: AuditActionDto; Reply: ApiResp<AuditListItemDto> }>("/api/audits/:contentId/archive", async (request, reply) => {
    const data = await changeAuditState(request.params.contentId, "archived", request.body);
    if (!data) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data };
  });

  app.post<{ Params: { contentId: string }; Body: AuditActionDto; Reply: ApiResp<AuditListItemDto> }>("/api/audits/:contentId/reset", async (request, reply) => {
    const data = await changeAuditState(request.params.contentId, "pending", request.body);
    if (!data) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data };
  });

  app.delete<{ Params: { contentId: string }; Body: AuditActionDto; Reply: ApiResp<{ deleted: number }> }>("/api/audits/:contentId", async (request, reply) => {
    const current = await prisma.mediaContent.findUnique({ where: { id: request.params.contentId } });
    if (!current) return reply.code(404).send({ success: false, message: "内容不存在" });
    await prisma.$transaction(async (tx) => {
      // 审批流水不依赖内容行存在，删除前写入才能保留删除原因和操作人。
      await writeAuditEvent(tx, {
        contentId: current.id,
        action: "delete",
        fromState: current.auditState,
        body: request.body,
      });
      await tx.contentTag.deleteMany({ where: { contentId: current.id } });
      await deleteMediaFileReferences(tx, "media_content", [current.id]);
      await tx.mediaContent.delete({ where: { id: current.id } });
    });
    return { success: true, message: "ok", data: { deleted: 1 } };
  });
}
