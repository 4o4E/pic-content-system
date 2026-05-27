import type { FastifyInstance } from "fastify";
import type {
  AuditState,
  ApiResp,
  BatchDeleteMediaContentsDto,
  BatchMergeMediaContentsDto,
  BatchRestoreMediaContentsToWorkspaceDto,
  BatchRestoreMediaContentsToWorkspaceResultDto,
  BatchUpdateMediaTagsDto,
  CreateMediaContentDto,
  MediaContentDto,
  MediaElement,
  MediaType,
  PageResp,
  PatchMediaTagsDto,
  UpdateMediaTagsDto,
} from "@pic/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { nextSnowflakeId } from "../../lib/snowflake.js";
import { contentSign, fileMd5FromElement, inferContentType, normalizeIds } from "./media-utils.js";
import { toMediaContentDto } from "./mapper.js";
import { resolveTagAliases, syncContentTags } from "../tag/tag-service.js";
import { writeSourceBinding } from "../source/source-service.js";

function parseTags(value: string | undefined) {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      q?: string;
      tags?: string;
      tagMode?: "and" | "or";
      sort?: "time_desc" | "time_asc" | "like_desc" | "like_asc";
      type?: MediaType | "all";
      auditState?: AuditState | "all";
      sourcePlatform?: string;
      sourceGroupId?: string;
      sourceUserId?: string;
      page?: string;
      size?: string;
    };
    Reply: ApiResp<PageResp<MediaContentDto>>;
  }>(
    "/api/media",
    async (request) => {
      const page = Math.max(Number(request.query.page ?? 1), 1);
      const size = Math.min(Math.max(Number(request.query.size ?? 60), 1), 200);
      const q = request.query.q?.trim();
      const tags = await resolveTagAliases(prisma, parseTags(request.query.tags));
      const tagMode = request.query.tagMode ?? "and";
      const orderBy: Prisma.MediaContentOrderByWithRelationInput[] =
        request.query.sort === "time_asc"
          ? [{ createdAt: "asc" }]
          : request.query.sort === "like_desc"
            ? [{ likeCount: "desc" }, { createdAt: "desc" }]
            : request.query.sort === "like_asc"
              ? [{ likeCount: "asc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }];
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
      if (request.query.type && request.query.type !== "all") where.type = request.query.type;
      if (request.query.auditState && request.query.auditState !== "all") where.auditState = request.query.auditState;
      if (request.query.sourcePlatform || request.query.sourceGroupId || request.query.sourceUserId) {
        where.sources = {
          some: {
            platform: request.query.sourcePlatform,
            platformGroupId: request.query.sourceGroupId,
            platformUserId: request.query.sourceUserId,
          },
        };
      }

      const [total, rows] = await Promise.all([
        prisma.mediaContent.count({ where }),
        prisma.mediaContent.findMany({
          where,
          include: { sources: true },
          orderBy,
          skip: (page - 1) * size,
          take: size,
        }),
      ]);

      return { success: true, message: "ok", data: { total, data: rows.map(toMediaContentDto) } };
    },
  );

  app.get<{ Params: { md5: string }; Reply: ApiResp<MediaContentDto[]> }>("/api/media/by-file/:md5", async (request, reply) => {
    const md5 = request.params.md5.trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(md5)) return reply.code(400).send({ success: false, message: "文件 MD5 格式错误" });

    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM media_content
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(elements) AS element
        WHERE element ->> 'id' = ${md5}
      )
    `;
    if (ids.length === 0) return { success: true, message: "ok", data: [] };

    const rows = await prisma.mediaContent.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: { sources: true },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, message: "ok", data: rows.map(toMediaContentDto) };
  });

  app.get<{ Params: { id: string }; Reply: ApiResp<MediaContentDto> }>("/api/media/:id", async (request, reply) => {
    const content = await prisma.mediaContent.findUnique({ where: { id: request.params.id }, include: { sources: true } });
    if (!content) return reply.code(404).send({ success: false, message: "内容不存在" });
    return { success: true, message: "ok", data: toMediaContentDto(content) };
  });

  app.post<{ Body: CreateMediaContentDto; Reply: ApiResp<MediaContentDto> }>("/api/media", async (request, reply) => {
    const elements = request.body.elements ?? [];
    const assetIds = request.body.assetIds ?? [];
    const sign = contentSign(elements);
    const tags = await resolveTagAliases(prisma, request.body.tags);
    if (tags.length === 0) return reply.code(400).send({ success: false, message: "请至少添加一个 tag 后再提交" });
    const content = await prisma.$transaction(async (tx) => {
      const row = await tx.mediaContent.upsert({
        where: { sign },
        create: {
          id: nextSnowflakeId(),
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

      await syncContentTags(tx, row.id, tags);
      await writeSourceBinding(tx, row.id, elements, request.body.source);
      if (assetIds.length > 0) {
        await tx.mediaAsset.updateMany({
          where: { id: { in: assetIds } },
          data: { status: "used" },
        });
      }
      return row;
    });
    const row = await prisma.mediaContent.findUnique({ where: { id: content.id }, include: { sources: true } });
    return { success: true, message: "ok", data: toMediaContentDto(row ?? content) };
  });

  app.put<{ Params: { id: string }; Body: UpdateMediaTagsDto; Reply: ApiResp<MediaContentDto> }>("/api/media/:id/tags", async (request, reply) => {
    const content = await prisma.$transaction(async (tx) => {
      const tags = await resolveTagAliases(tx, request.body.tags);
      const row = await tx.mediaContent.update({
        where: { id: request.params.id },
        data: { tags },
      }).catch(() => undefined);
      if (!row) return undefined;
      await syncContentTags(tx, row.id, tags);
      return row;
    });
    if (!content) return reply.code(404).send({ success: false, message: "内容不存在" });
    const row = await prisma.mediaContent.findUnique({ where: { id: content.id }, include: { sources: true } });
    return { success: true, message: "ok", data: toMediaContentDto(row ?? content) };
  });

  app.patch<{ Params: { id: string }; Body: PatchMediaTagsDto; Reply: ApiResp<MediaContentDto> }>("/api/media/:id/tags", async (request, reply) => {
    const content = await prisma.$transaction(async (tx) => {
      const row = await tx.mediaContent.findUnique({ where: { id: request.params.id } });
      if (!row) return undefined;
      const addTags = await resolveTagAliases(tx, request.body.addTags);
      const removeTags = new Set(await resolveTagAliases(tx, request.body.removeTags));
      const tags = Array.from(new Set([...row.tags.filter((tag) => !removeTags.has(tag)), ...addTags]));
      const updated = await tx.mediaContent.update({
        where: { id: row.id },
        data: { tags },
      });
      await syncContentTags(tx, updated.id, tags);
      return updated;
    });
    if (!content) return reply.code(404).send({ success: false, message: "内容不存在" });
    const row = await prisma.mediaContent.findUnique({ where: { id: content.id }, include: { sources: true } });
    return { success: true, message: "ok", data: toMediaContentDto(row ?? content) };
  });

  app.patch<{ Body: BatchUpdateMediaTagsDto; Reply: ApiResp<MediaContentDto[]> }>("/api/media/tags", async (request) => {
    const ids = normalizeIds(request.body.ids);
    if (ids.length === 0) return { success: true, message: "ok", data: [] };

    const rows = await prisma.$transaction(async (tx) => {
      const addTags = await resolveTagAliases(tx, request.body.addTags);
      const removeTags = new Set(await resolveTagAliases(tx, request.body.removeTags));
      const contents = await tx.mediaContent.findMany({ where: { id: { in: ids } } });
      const updated: typeof contents = [];
      for (const content of contents) {
        const nextTags = Array.from(new Set([...content.tags.filter((tag) => !removeTags.has(tag)), ...addTags]));
        const row = await tx.mediaContent.update({
          where: { id: content.id },
          data: { tags: nextTags },
        });
        await syncContentTags(tx, row.id, nextTags);
        updated.push(row);
      }
      return updated;
    });

    const withSources = await prisma.mediaContent.findMany({ where: { id: { in: rows.map((row) => row.id) } }, include: { sources: true } });
    return { success: true, message: "ok", data: withSources.map(toMediaContentDto) };
  });

  app.post<{ Body: BatchMergeMediaContentsDto; Reply: ApiResp<MediaContentDto> }>("/api/media/merge", async (request, reply) => {
    const ids = normalizeIds(request.body.ids);
    if (ids.length < 2) return reply.code(400).send({ success: false, message: "至少选择 2 条内容才能合并" });

    const merged = await prisma.$transaction(async (tx) => {
      const contents = await tx.mediaContent.findMany({
        where: { id: { in: ids } },
        include: { sources: true },
      });
      const contentById = new Map(contents.map((content) => [content.id, content]));
      const orderedContents = ids.map((id) => contentById.get(id));
      if (orderedContents.some((content) => !content)) return undefined;

      const elements = orderedContents.flatMap((content) => {
        const value = content?.elements;
        return Array.isArray(value) ? (value as unknown as MediaElement[]) : [];
      });
      if (elements.length === 0) return null;

      const tags = Array.from(new Set(orderedContents.flatMap((content) => content?.tags ?? [])));
      const sign = contentSign(elements);
      const existing = await tx.mediaContent.findUnique({ where: { sign } });
      const mergedTitle = `合并内容（${ids.length} 条）`;
      const row = existing
        ? await tx.mediaContent.update({
            where: { id: existing.id },
            data: {
              title: existing.title ?? mergedTitle,
              tags: Array.from(new Set([...existing.tags, ...tags])),
              elements: elements as unknown as Prisma.InputJsonValue,
              type: inferContentType(elements),
              auditState: "approved",
            },
          })
        : await tx.mediaContent.create({
            data: {
              id: nextSnowflakeId(),
              type: inferContentType(elements),
              title: mergedTitle,
              tags,
              elements: elements as unknown as Prisma.InputJsonValue,
              sign,
              auditState: "approved",
            },
          });

      await tx.sourceBinding.updateMany({
        where: { contentId: { in: ids } },
        data: { contentId: row.id },
      });

      // 合并是内容级迁移，先清旧索引，再为目标内容重建 tag 索引。
      await tx.contentTag.deleteMany({ where: { contentId: { in: ids } } });
      const rowTags = Array.from(new Set([...(row.tags ?? []), ...tags]));
      await syncContentTags(tx, row.id, rowTags);
      await tx.mediaContent.deleteMany({ where: { id: { in: ids.filter((id) => id !== row.id) } } });
      return row;
    });

    if (merged === undefined) return reply.code(404).send({ success: false, message: "选中的内容不存在或已被删除" });
    if (merged === null) return reply.code(400).send({ success: false, message: "选中的内容没有可合并元素" });

    const row = await prisma.mediaContent.findUnique({ where: { id: merged.id }, include: { sources: true } });
    return { success: true, message: "ok", data: toMediaContentDto(row ?? merged) };
  });

  app.delete<{ Body: BatchDeleteMediaContentsDto; Reply: ApiResp<{ deleted: number }> }>("/api/media", async (request) => {
    const ids = normalizeIds(request.body.ids);
    if (ids.length === 0) return { success: true, message: "ok", data: { deleted: 0 } };

    const deleted = await prisma.$transaction(async (tx) => {
      // 内容 tag 索引没有 Prisma 级联关系，删除内容前先清理索引。
      await tx.contentTag.deleteMany({ where: { contentId: { in: ids } } });
      const result = await tx.mediaContent.deleteMany({ where: { id: { in: ids } } });
      return result.count;
    });

    return { success: true, message: "ok", data: { deleted } };
  });

  app.post<{
    Body: BatchRestoreMediaContentsToWorkspaceDto;
    Reply: ApiResp<BatchRestoreMediaContentsToWorkspaceResultDto>;
  }>("/api/media/workspace-assets", async (request) => {
    const ids = normalizeIds(request.body.ids);
    if (ids.length === 0) return { success: true, message: "ok", data: { created: 0, moved: 0 } };

    const result = await prisma.$transaction(async (tx) => {
      const contents = await tx.mediaContent.findMany({
        where: { id: { in: ids } },
        include: { sources: { select: { id: true } } },
      });
      const contentIds = contents.map((content) => content.id);
      let created = 0;

      if (contentIds.length === 0) return { created: 0, moved: 0 };

      // 先断开来源与内容的级联关系，再让拆出的素材继续引用来源。
      await tx.sourceBinding.updateMany({
        where: { contentId: { in: contentIds } },
        data: { contentId: null },
      });

      for (const content of contents) {
        const elements = Array.isArray(content.elements) ? (content.elements as unknown as MediaElement[]) : [];
        const sourceId = content.sources[0]?.id;
        for (const element of elements) {
          await tx.mediaAsset.create({
            data: {
              id: nextSnowflakeId(),
              kind: element.type,
              fileMd5: fileMd5FromElement(element),
              element: element as unknown as Prisma.InputJsonValue,
              sourceId,
              status: "pending",
              metadata: {
                restoredFromContentId: content.id,
                restoredFromContentSign: content.sign,
              } as Prisma.InputJsonObject,
            },
          });
          created++;
        }
      }

      await tx.contentTag.deleteMany({ where: { contentId: { in: contentIds } } });
      const moved = await tx.mediaContent.deleteMany({ where: { id: { in: contentIds } } });

      return { created, moved: moved.count };
    });

    return { success: true, message: "ok", data: result };
  });
}
