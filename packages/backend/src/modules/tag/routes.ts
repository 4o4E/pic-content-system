import type { FastifyInstance } from "fastify";
import type {
  ApiResp,
  RenameTagDto,
  RenameTagResultDto,
  ResolveTagsDto,
  ResolveTagsResultDto,
  TagAliasDto,
  TagDto,
  UpsertTagAliasDto,
} from "@pic/shared";
import { prisma } from "../../db/prisma.js";
import { normalizeAlias, normalizeTags, resolveTagAliases, syncContentTags } from "./tag-service.js";

function toTagAliasDto(row: { alias: string; tag: string; createdAt: Date; updatedAt: Date }): TagAliasDto {
  return {
    alias: row.alias,
    tag: row.tag,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

  app.get<{ Querystring: { q?: string }; Reply: ApiResp<TagAliasDto[]> }>("/api/tag-aliases", async (request) => {
    const q = request.query.q?.trim();
    const rows = await prisma.tagAlias.findMany({
      where: q
        ? {
            OR: [
              { alias: { contains: normalizeAlias(q), mode: "insensitive" } },
              { tag: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ alias: "asc" }],
      take: 500,
    });
    return { success: true, message: "ok", data: rows.map(toTagAliasDto) };
  });

  app.post<{ Body: UpsertTagAliasDto; Reply: ApiResp<TagAliasDto> }>("/api/tag-aliases", async (request, reply) => {
    const alias = normalizeAlias(request.body.alias);
    const tag = normalizeTags([request.body.tag])[0];
    if (!alias || !tag) return reply.code(400).send({ success: false, message: "alias 和 tag 不能为空" });
    const row = await prisma.tagAlias.upsert({
      where: { alias },
      create: { alias, tag },
      update: { tag },
    });
    return { success: true, message: "ok", data: toTagAliasDto(row) };
  });

  app.delete<{ Params: { alias: string }; Reply: ApiResp<{ deleted: number }> }>("/api/tag-aliases/:alias", async (request) => {
    const alias = normalizeAlias(decodeURIComponent(request.params.alias));
    const result = await prisma.tagAlias.deleteMany({ where: { alias } });
    return { success: true, message: "ok", data: { deleted: result.count } };
  });

  app.post<{ Body: ResolveTagsDto; Reply: ApiResp<ResolveTagsResultDto> }>("/api/tags/resolve", async (request) => {
    const tags = await resolveTagAliases(prisma, request.body.tags);
    return { success: true, message: "ok", data: { tags } };
  });

  app.post<{ Body: RenameTagDto; Reply: ApiResp<RenameTagResultDto> }>("/api/tags/rename", async (request, reply) => {
    const from = normalizeTags([request.body.from])[0];
    const to = normalizeTags([request.body.to])[0];
    if (!from || !to) return reply.code(400).send({ success: false, message: "from 和 to 不能为空" });

    const updated = await prisma.$transaction(async (tx) => {
      const contents = await tx.mediaContent.findMany({ where: { tags: { has: from } } });
      for (const content of contents) {
        const tags = normalizeTags(content.tags.map((tag) => (tag === from ? to : tag)));
        await tx.mediaContent.update({ where: { id: content.id }, data: { tags } });
        await syncContentTags(tx, content.id, tags);
      }
      await tx.tagAlias.updateMany({ where: { tag: from }, data: { tag: to } });
      return contents.length;
    });

    return { success: true, message: "ok", data: { updated } };
  });
}
