import type { FastifyInstance } from "fastify";
import type { ApiResp, BatchDeleteMediaAssetsDto, CreateMediaAssetDto, MediaAssetDto, PageResp } from "@pic/shared";
import type { MediaAssetStatus, MediaType, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { toMediaAssetDto } from "../media/mapper.js";

function normalizeIds(ids: string[] | undefined) {
  return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
}

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; status?: MediaAssetStatus | "all"; kind?: MediaType | "all"; page?: string; size?: string }; Reply: ApiResp<PageResp<MediaAssetDto>> }>(
    "/api/assets",
    async (request) => {
      const page = Math.max(Number(request.query.page ?? 1), 1);
      const size = Math.min(Math.max(Number(request.query.size ?? 60), 1), 200);
      const where: Prisma.MediaAssetWhereInput = {};
      if (request.query.status && request.query.status !== "all") where.status = request.query.status;
      if (request.query.kind && request.query.kind !== "all") where.kind = request.query.kind;
      if (request.query.q) {
        const keyword = request.query.q.trim();
        where.OR = [{ fileMd5: { contains: keyword, mode: "insensitive" } }];
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keyword)) {
          where.OR.push({ id: keyword });
        }
      }

      const [total, rows] = await Promise.all([
        prisma.mediaAsset.count({ where }),
        prisma.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
      ]);
      return { success: true, message: "ok", data: { total, data: rows.map(toMediaAssetDto) } };
    },
  );

  app.patch<{ Params: { id: string }; Reply: ApiResp<MediaAssetDto> }>("/api/assets/:id/ignore", async (request, reply) => {
    try {
      const asset = await prisma.mediaAsset.update({ where: { id: request.params.id }, data: { status: "ignored" } });
      return { success: true, message: "ok", data: toMediaAssetDto(asset) };
    } catch {
      return reply.code(404).send({ success: false, message: "素材不存在" });
    }
  });

  app.post<{ Body: CreateMediaAssetDto; Reply: ApiResp<MediaAssetDto> }>("/api/assets", async (request) => {
    const asset = await prisma.mediaAsset.create({
      data: {
        kind: request.body.kind,
        fileMd5: request.body.fileMd5,
        element: request.body.element as unknown as Prisma.InputJsonValue,
        sourceId: request.body.sourceId,
        status: request.body.status ?? "pending",
      },
    });
    return { success: true, message: "ok", data: toMediaAssetDto(asset) };
  });

  app.delete<{ Body: BatchDeleteMediaAssetsDto; Reply: ApiResp<{ deleted: number }> }>("/api/assets", async (request) => {
    const ids = normalizeIds(request.body?.ids);
    if (ids.length === 0) return { success: true, message: "ok", data: { deleted: 0 } };

    const result = await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
    return { success: true, message: "ok", data: { deleted: result.count } };
  });
}
