import type { FastifyInstance } from "fastify";
import type { ApiResp, ImportPicImageDto, MediaElement, MediaType, PicImageResultDto, PicRandomResultDto, SourceBindingDto } from "@pic/shared";
import type { Prisma } from "@prisma/client";
import type { AppConfig } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { inspectFileBuffer } from "../file/file-inspector.js";
import { storeMediaFile } from "../file/file-storage.js";
import { contentSign } from "../media/media-utils.js";
import { toMediaAssetDto, toMediaContentDto, toMediaFileDto } from "../media/mapper.js";
import { resolveTagAliases, syncContentTags } from "../tag/tag-service.js";
import { writeSourceBinding } from "../source/source-service.js";
import { writeAuditEvent } from "../audit/audit-service.js";

function parseTags(value: string | undefined) {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
}

function buildImageElement(md5: string, format: string, width?: number, height?: number): MediaElement {
  return {
    type: "image",
    id: md5,
    format,
    file: false,
    width: width ?? 1,
    height: height ?? 1,
  };
}

function firstImageMd5(elements: MediaElement[]) {
  return elements.find((element) => element.type === "image")?.id;
}

export async function registerPicRoutes(app: FastifyInstance, config: AppConfig) {
  app.get<{
    Querystring: { tags?: string; tagMode?: "and" | "or"; type?: MediaType };
    Reply: ApiResp<PicRandomResultDto>;
  }>("/api/pic/random", async (request, reply) => {
    const tags = await resolveTagAliases(prisma, parseTags(request.query.tags));
    const tagMode = request.query.tagMode ?? "and";
    const type = request.query.type ?? "image";
    const where: Prisma.MediaContentWhereInput = {
      type,
      auditState: "approved",
    };
    if (tags.length > 0) where.tags = tagMode === "or" ? { hasSome: tags } : { hasEvery: tags };

    const total = await prisma.mediaContent.count({ where });
    if (total === 0) return reply.code(404).send({ success: false, message: "没有找到符合条件的图片" });

    const [content] = await prisma.mediaContent.findMany({
      where,
      include: { sources: true },
      skip: Math.floor(Math.random() * total),
      take: 1,
    });
    if (!content) return reply.code(404).send({ success: false, message: "没有找到符合条件的图片" });

    const dto = toMediaContentDto(content);
    const fileMd5 = firstImageMd5(dto.elements);
    return {
      success: true,
      message: "ok",
      data: {
        ...dto,
        fileMd5,
        fileUrl: fileMd5 ? `/api/files/${fileMd5}` : undefined,
      },
    };
  });

  app.post<{ Body: ImportPicImageDto; Reply: ApiResp<PicImageResultDto> }>("/api/pic/images", async (request, reply) => {
    const buffer = Buffer.from(request.body.contentBase64, "base64");
    const preflight = inspectFileBuffer(buffer);
    if (!preflight.mimeType.startsWith("image/")) {
      return reply.code(400).send({ success: false, message: "上传内容不是可识别的图片文件" });
    }
    const result = await prisma.$transaction(async (tx) => {
      const { file, inspection } = await storeMediaFile(tx, config, buffer);
      const element = buildImageElement(file.md5, inspection.format, inspection.width, inspection.height);
      const elements = [element];
      const source: SourceBindingDto = request.body.source ?? { platform: "import" };
      const tags = await resolveTagAliases(tx, request.body.tags);
      if (tags.length === 0) {
        const sourceBinding = await writeSourceBinding(tx, undefined, elements, {
          ...source,
          fileId: source.fileId ?? file.md5,
          sourceKey: source.sourceKey ?? file.md5,
        });
        const asset = await tx.mediaAsset.create({
          data: {
            kind: "image",
            fileMd5: file.md5,
            element: element as unknown as Prisma.InputJsonValue,
            sourceId: sourceBinding?.id,
            status: "pending",
          },
        });
        return { file, asset, existed: false };
      }

      const sign = contentSign(elements);
      const existing = await tx.mediaContent.findUnique({ where: { sign } });
      const auditRequired = request.body.auditRequired ?? source.platform !== "import";
      const nextAuditState = existing?.auditState === "approved" && auditRequired ? "approved" : auditRequired ? "pending" : "approved";
      const content = existing
        ? await tx.mediaContent.update({
            where: { id: existing.id },
            data: {
              tags: Array.from(new Set([...existing.tags, ...tags])),
              auditState: nextAuditState,
            },
          })
        : await tx.mediaContent.create({
            data: {
              type: "image",
              tags,
              elements: elements as unknown as Prisma.InputJsonValue,
              sign,
              auditState: nextAuditState,
            },
          });
      await syncContentTags(tx, content.id, content.tags);
      await writeSourceBinding(tx, content.id, elements, {
        ...source,
        fileId: source.fileId ?? file.md5,
        sourceKey: source.sourceKey ?? file.md5,
      });
      await writeAuditEvent(tx, {
        contentId: content.id,
        action: "submit",
        fromState: existing?.auditState,
        toState: content.auditState,
        body: {
          operator: {
            platform: source.platform,
            userId: source.userId,
            raw: source.raw,
          },
          reason: auditRequired ? "提交审核" : "跳过审核",
        },
      });
      return { file, content, existed: Boolean(existing) };
    });

    if ("asset" in result && result.asset) {
      return {
        success: true,
        message: "ok",
        data: {
          asset: toMediaAssetDto(result.asset),
          file: toMediaFileDto(result.file),
          existed: false,
        },
      };
    }

    const content = await prisma.mediaContent.findUnique({ where: { id: result.content.id }, include: { sources: true } });
    return {
      success: true,
      message: "ok",
      data: {
        content: toMediaContentDto(content ?? result.content),
        file: toMediaFileDto(result.file),
        existed: result.existed,
      },
    };
  });
}
