import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  ApiResp,
  BatchDeleteMediaContentsDto,
  BatchRestoreMediaContentsToWorkspaceDto,
  BatchRestoreMediaContentsToWorkspaceResultDto,
  BatchUpdateMediaTagsDto,
  CreateMediaContentDto,
  MediaContentDto,
  MediaElement,
  PageResp,
} from "@pic/shared";
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

function normalizeTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeIds(ids: string[] | undefined) {
  return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
}

function fileMd5FromElement(element: MediaElement) {
  switch (element.type) {
    case "image":
    case "video":
    case "audio":
    case "file":
      return element.id;
    default:
      return undefined;
  }
}

async function syncContentTags(tx: Prisma.TransactionClient, contentId: string, tags: string[]) {
  await tx.contentTag.deleteMany({ where: { contentId } });
  if (tags.length > 0) {
    await tx.contentTag.createMany({
      data: tags.map((tag) => ({ contentId, tag })),
      skipDuplicates: true,
    });
  }
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { q?: string; tags?: string; tagMode?: "and" | "or"; sort?: "time_desc" | "time_asc"; page?: string; size?: string };
    Reply: ApiResp<PageResp<MediaContentDto>>;
  }>(
    "/api/media",
    async (request) => {
      const page = Math.max(Number(request.query.page ?? 1), 1);
      const size = Math.min(Math.max(Number(request.query.size ?? 60), 1), 200);
      const q = request.query.q?.trim();
      const tags = parseTags(request.query.tags);
      const tagMode = request.query.tagMode ?? "and";
      const createdAtSort = request.query.sort === "time_asc" ? "asc" : "desc";
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
          orderBy: { createdAt: createdAtSort },
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
    const tags = normalizeTags(request.body.tags);
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

      await syncContentTags(tx, row.id, tags);
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

  app.patch<{ Body: BatchUpdateMediaTagsDto; Reply: ApiResp<MediaContentDto[]> }>("/api/media/tags", async (request) => {
    const ids = normalizeIds(request.body.ids);
    const addTags = normalizeTags(request.body.addTags);
    const removeTags = new Set(normalizeTags(request.body.removeTags));
    if (ids.length === 0) return { success: true, message: "ok", data: [] };

    const rows = await prisma.$transaction(async (tx) => {
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

    return { success: true, message: "ok", data: rows.map(toMediaContentDto) };
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
