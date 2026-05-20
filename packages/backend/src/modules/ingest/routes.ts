import type { FastifyInstance } from "fastify";
import type { ApiResp, CreateIngestEventDto, IngestEventDto, PageResp } from "@pic/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

function toIngestEventDto(row: Awaited<ReturnType<typeof prisma.ingestEvent.findMany>>[number]): IngestEventDto {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    platform: row.platform,
    platformEventId: row.platformEventId ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function registerIngestRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { page?: string; size?: string }; Reply: ApiResp<PageResp<IngestEventDto>> }>("/api/ingest-events", async (request) => {
    const page = Math.max(Number(request.query.page ?? 1), 1);
    const size = Math.min(Math.max(Number(request.query.size ?? 50), 1), 200);
    const [total, rows] = await Promise.all([
      prisma.ingestEvent.count(),
      prisma.ingestEvent.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
    ]);
    return {
      success: true,
      message: "ok",
      data: {
        total,
        data: rows.map(toIngestEventDto),
      },
    };
  });

  app.post<{ Body: CreateIngestEventDto; Reply: ApiResp<IngestEventDto> }>("/api/ingest-events", async (request) => {
    const row = await prisma.ingestEvent.create({
      data: {
        source: request.body.source,
        status: request.body.status,
        platform: request.body.platform,
        platformEventId: request.body.platformEventId,
        payload: (request.body.payload ?? {}) as Prisma.InputJsonValue,
        error: request.body.error,
      },
    });
    return { success: true, message: "ok", data: toIngestEventDto(row) };
  });
}
