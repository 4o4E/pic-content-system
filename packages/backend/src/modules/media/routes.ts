import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ApiResp, CreateMediaContentDto, MediaContentDto, MediaElement, PageResp } from "@pic/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { toMediaContentDto } from "./mapper.js";

function contentSign(elements: unknown) {
  return crypto.createHash("md5").update(JSON.stringify(elements)).digest("hex");
}

function parseTags(value: string | undefined) {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
}

function inferContentType(elements: MediaElement[]) {
  if (elements.length !== 1) return "composite";
  return elements[0]?.type ?? "composite";
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; tags?: string; tagMode?: "and" | "or"; page?: string; size?: string }; Reply: ApiResp<PageResp<MediaContentDto>> }>(
    "/api/media",
    async (request) => {
      const page = Math.max(Number(request.query.page ?? 1), 1);
      const size = Math.min(Math.max(Number(request.query.size ?? 60), 1), 200);
      const q = request.query.q?.trim();
      const tags = parseTags(request.query.tags);
      const tagMode = request.query.tagMode ?? "and";
      const where: Prisma.MediaContentWhereInput = {};

      if (q) {
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { sign: { contains: q, mode: "insensitive" } },
          { tags: { has: q } },
        ];
      }
      if (tags.length > 0) {
        where.tags = tagMode === "or" ? { hasSome: tags } : { hasEvery: tags };
      }

      const [total, rows] = await Promise.all([
        prisma.mediaContent.count({ where }),
        prisma.mediaContent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);

      return { success: true, message: "ok", data: { total, data: rows.map(toMediaContentDto) } };
    },
  );

  app.get<{ Params: { id: string }; Reply: ApiResp<MediaContentDto> }>("/api/media/:id", async (request, reply) => {
    const content = await prisma.mediaContent.findUnique({ where: { id: request.params.id } });
    if (!content) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data: toMediaContentDto(content) };
  });

  app.post<{ Body: CreateMediaContentDto; Reply: ApiResp<MediaContentDto> }>("/api/media", async (request) => {
    const elements = request.body.elements ?? [];
    const tags = Array.from(new Set(request.body.tags.map((tag) => tag.trim()).filter(Boolean)));
    const assetIds = request.body.assetIds ?? [];
    const sign = contentSign(elements);
    const content = await prisma.$transaction(async (tx) => {
      const row = await tx.mediaContent.upsert({
        where: { sign },
        create: {
          type: inferContentType(elements),
          title: request.body.title,
          tags,
          elements: elements as unknown as Prisma.InputJsonValue,
          sign,
          auditState: "approved",
        },
        update: {
          title: request.body.title,
          tags,
          elements: elements as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.contentTag.deleteMany({ where: { contentId: row.id } });
      if (tags.length > 0) {
        await tx.contentTag.createMany({
          data: tags.map((tag) => ({ contentId: row.id, tag })),
          skipDuplicates: true,
        });
      }
      if (assetIds.length > 0) {
        await tx.mediaAsset.updateMany({
          where: { id: { in: assetIds } },
          data: { status: "used" },
        });
      }
      return row;
    });
    return { success: true, message: "ok", data: toMediaContentDto(content) };
  });
}
