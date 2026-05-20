import type { FastifyInstance } from "fastify";
import type { ApiResp, TagDto } from "@pic/shared";
import { prisma } from "../../db/prisma.js";

export async function registerTagRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string }; Reply: ApiResp<TagDto[]> }>("/api/tags", async (request) => {
    const rows = await prisma.contentTag.groupBy({
      by: ["tag"],
      _count: { tag: true },
      where: request.query.q ? { tag: { contains: request.query.q, mode: "insensitive" } } : undefined,
      orderBy: { _count: { tag: "desc" } },
      take: 500,
    });
    return {
      success: true,
      message: "ok",
      data: rows.map((row) => ({ name: row.tag, count: row._count.tag })),
    };
  });
}
