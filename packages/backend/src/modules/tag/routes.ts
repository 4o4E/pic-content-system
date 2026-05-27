import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import type {
  ApiResp,
  DeleteTagResultDto,
  MergeTagDto,
  RenameTagDto,
  RenameTagResultDto,
  ResolveTagsDto,
  ResolveTagsResultDto,
  TagAliasDto,
  TagDto,
  UpsertTagDto,
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

async function replaceTagInContents(tx: Prisma.TransactionClient, from: string, to: string) {
  const contents = await tx.mediaContent.findMany({ where: { tags: { has: from } } });
  for (const content of contents) {
    const tags = normalizeTags(content.tags.map((tag) => (tag === from ? to : tag)));
    await tx.mediaContent.update({ where: { id: content.id }, data: { tags } });
    await syncContentTags(tx, content.id, tags);
  }
  return contents.length;
}

async function removeTagFromContents(tx: Prisma.TransactionClient, tag: string) {
  const contents = await tx.mediaContent.findMany({ where: { tags: { has: tag } } });
  for (const content of contents) {
    const tags = normalizeTags(content.tags.filter((item) => item !== tag));
    await tx.mediaContent.update({ where: { id: content.id }, data: { tags } });
    await syncContentTags(tx, content.id, tags);
  }
  return contents.length;
}

export async function registerTagRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; sort?: TagSort }; Reply: ApiResp<TagDto[]> }>("/api/tags", async (request) => {
    const q = request.query.q?.trim();
    const sort = resolveTagSort(request.query.sort);
    const matchedTags = await prisma.tag.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      orderBy: [{ name: "asc" }],
    });
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
    const candidateTagNames = Array.from(new Set([...matchedTags.map((row) => row.name), ...matchedAliases.map((row) => row.tag)]));
    const tagNameFilters: Prisma.ContentTagWhereInput[] = [];
    if (q && candidateTagNames.length === 0) tagNameFilters.push({ tag: { contains: q, mode: "insensitive" } });
    if (candidateTagNames.length > 0) tagNameFilters.push({ tag: { in: candidateTagNames } });
    const tagGroups = await prisma.contentTag.groupBy({
      by: ["tag"],
      _count: { tag: true },
      _min: { createdAt: true },
      where: tagNameFilters.length > 0 ? { OR: tagNameFilters } : undefined,
    });

    const tagNames = Array.from(new Set([...matchedTags.map((row) => row.name), ...tagGroups.map((row) => row.tag), ...matchedAliases.map((row) => row.tag)]));
    const aliases = tagNames.length > 0
      ? await prisma.tagAlias.findMany({
          where: { tag: { in: tagNames } },
          orderBy: [{ tag: "asc" }, { alias: "asc" }],
        })
      : [];
    const tagMap = new Map<string, TagDto>();
    for (const row of matchedTags) {
      tagMap.set(row.name, {
        name: row.name,
        count: 0,
        aliases: [],
        createdAt: row.createdAt.toISOString(),
      });
    }
    for (const row of tagGroups) {
      const count = row._count as { tag: number };
      const existing = tagMap.get(row.tag);
      tagMap.set(row.tag, {
        name: row.tag,
        count: count.tag,
        aliases: [],
        createdAt: existing?.createdAt ?? row._min?.createdAt?.toISOString(),
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

  app.post<{ Body: UpsertTagDto; Reply: ApiResp<TagDto> }>("/api/tags", async (request, reply) => {
    const name = normalizeTags([request.body.name])[0];
    if (!name) return reply.code(400).send({ success: false, message: "tag 不能为空" });
    const row = await prisma.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    return { success: true, message: "ok", data: { name: row.name, count: 0, aliases: [], createdAt: row.createdAt.toISOString() } };
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
    const row = await prisma.$transaction(async (tx) => {
      await tx.tag.upsert({ where: { name: tag }, create: { name: tag }, update: {} });
      return tx.tagAlias.upsert({
        where: { alias },
        create: { alias, tag },
        update: { tag },
      });
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
    if (from === to) return { success: true, message: "ok", data: { updated: 0 } };

    const updated = await prisma.$transaction(async (tx) => {
      const target = await tx.tag.findUnique({ where: { name: to } });
      if (target) return undefined;
      const source = await tx.tag.findUnique({ where: { name: from } });
      await tx.tag.upsert({
        where: { name: to },
        create: { name: to, createdAt: source?.createdAt },
        update: {},
      });
      const changed = await replaceTagInContents(tx, from, to);
      await tx.tagAlias.updateMany({ where: { tag: from }, data: { tag: to } });
      await tx.tag.deleteMany({ where: { name: from } });
      return changed;
    });
    if (updated == null) return reply.code(409).send({ success: false, message: "目标 tag 已存在，请使用合并" });

    return { success: true, message: "ok", data: { updated } };
  });

  app.post<{ Body: MergeTagDto; Reply: ApiResp<RenameTagResultDto> }>("/api/tags/merge", async (request, reply) => {
    const from = normalizeTags([request.body.from])[0];
    const to = normalizeTags([request.body.to])[0];
    if (!from || !to) return reply.code(400).send({ success: false, message: "from 和 to 不能为空" });
    if (from === to) return { success: true, message: "ok", data: { updated: 0 } };

    const updated = await prisma.$transaction(async (tx) => {
      const source = await tx.tag.findUnique({ where: { name: from } });
      await tx.tag.upsert({
        where: { name: to },
        create: { name: to, createdAt: source?.createdAt },
        update: {},
      });
      const changed = await replaceTagInContents(tx, from, to);
      await tx.tagAlias.updateMany({ where: { tag: from }, data: { tag: to } });
      await tx.tag.deleteMany({ where: { name: from } });
      return changed;
    });

    return { success: true, message: "ok", data: { updated } };
  });

  app.delete<{ Params: { name: string }; Reply: ApiResp<DeleteTagResultDto> }>("/api/tags/:name", async (request) => {
    const name = normalizeTags([decodeURIComponent(request.params.name)])[0] ?? "";
    const result = await prisma.$transaction(async (tx) => {
      const updated = name ? await removeTagFromContents(tx, name) : 0;
      const aliases = name ? await tx.tagAlias.deleteMany({ where: { tag: name } }) : { count: 0 };
      const deleted = name ? await tx.tag.deleteMany({ where: { name } }) : { count: 0 };
      return { deleted: deleted.count + aliases.count, updated };
    });
    return { success: true, message: "ok", data: result };
  });
}
