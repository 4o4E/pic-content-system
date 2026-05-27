import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
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

type TagSort = "count_desc" | "count_asc" | "time_desc" | "time_asc";

function toTagAliasDto(row: { alias: string; tag: string; createdAt: Date; updatedAt: Date }): TagAliasDto {
  return {
    alias: row.alias,
    tag: row.tag,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function resolveTagSort(sort: string | undefined): TagSort {
  return sort === "count_asc" || sort === "time_desc" || sort === "time_asc" ? sort : "count_desc";
}

function tagCreatedTime(value: string | undefined, fallback: number) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : fallback;
}

function sortTagRows(left: TagDto, right: TagDto, sort: TagSort) {
  if (sort === "count_asc") return left.count - right.count || left.name.localeCompare(right.name, "zh-CN");
  if (sort === "time_desc") return tagCreatedTime(right.createdAt, 0) - tagCreatedTime(left.createdAt, 0) || left.name.localeCompare(right.name, "zh-CN");
  if (sort === "time_asc") return tagCreatedTime(left.createdAt, Number.MAX_SAFE_INTEGER) - tagCreatedTime(right.createdAt, Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "zh-CN");
  return right.count - left.count || left.name.localeCompare(right.name, "zh-CN");
}

export async function registerTagRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; sort?: TagSort }; Reply: ApiResp<TagDto[]> }>("/api/tags", async (request) => {
    const q = request.query.q?.trim();
    const sort = resolveTagSort(request.query.sort);
    const matchedAliases = await prisma.tagAlias.findMany({
      where: q
        ? {
            OR: [
              { alias: { contains: normalizeAlias(q), mode: "insensitive" } },
              { tag: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ alias: "asc" }],
    });
    const aliasTargetTags = Array.from(new Set(matchedAliases.map((row) => row.tag)));
    const tagNameFilters: Prisma.ContentTagWhereInput[] = [];
    if (q) tagNameFilters.push({ tag: { contains: q, mode: "insensitive" } });
    if (aliasTargetTags.length > 0) tagNameFilters.push({ tag: { in: aliasTargetTags } });
    const tagGroups = await prisma.contentTag.groupBy({
      by: ["tag"],
      _count: { tag: true },
      _min: { createdAt: true },
      where: q ? { OR: tagNameFilters } : undefined,
    });

    const tagNames = Array.from(new Set([...tagGroups.map((row) => row.tag), ...aliasTargetTags]));
    const aliases = tagNames.length > 0
      ? await prisma.tagAlias.findMany({
          where: { tag: { in: tagNames } },
          orderBy: [{ tag: "asc" }, { alias: "asc" }],
        })
      : [];
    const tagMap = new Map<string, TagDto>();
    for (const row of tagGroups) {
      const count = row._count as { tag: number };
      tagMap.set(row.tag, {
        name: row.tag,
        count: count.tag,
        aliases: [],
        createdAt: row._min?.createdAt?.toISOString(),
      });
    }
    for (const row of aliases) {
      const tag = tagMap.get(row.tag) ?? { name: row.tag, count: 0, aliases: [], createdAt: row.createdAt.toISOString() };
      tag.aliases = [...(tag.aliases ?? []), row.alias];
      if (!tag.createdAt || row.createdAt < new Date(tag.createdAt)) tag.createdAt = row.createdAt.toISOString();
      tagMap.set(row.tag, tag);
    }

    return {
      success: true,
      message: "ok",
      data: Array.from(tagMap.values()).sort((left, right) => sortTagRows(left, right, sort)).slice(0, 500),
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
