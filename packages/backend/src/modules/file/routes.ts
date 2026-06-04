import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ApiResp, BatchDeleteMediaFilesDto, BatchDeleteMediaFilesResultDto, CreateMediaFileDto, MediaFileDto, MediaFileReferenceListDto, MediaFileReferenceMode, PageResp } from "@pic/shared";
import { Prisma } from "@prisma/client";
import type { AppConfig } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { toMediaFileDto } from "../media/mapper.js";
import { COMMON_IMAGE_FORMATS, commonImageFormatText, inspectFileBuffer, isCommonImageInspection, type FileInspection } from "./file-inspector.js";
import { storeMediaFile } from "./file-storage.js";

const DECLARED_IMAGE_FORMATS = new Set<string>([...COMMON_IMAGE_FORMATS, "jpeg", "svg", "svg+xml", "avif", "bmp", "tif", "tiff", "ico", "heic", "heif"]);
const FILE_MD5_RE = /^[0-9a-f]{32}$/;
const FILE_CACHE_CONTROL = "private, max-age=31536000, immutable";

function isImageUploadRequest(body: CreateMediaFileDto, inspection: FileInspection) {
  const mimeType = body.mimeType?.trim().toLowerCase();
  const format = body.format?.trim().toLowerCase().replace(/^\./, "");
  return inspection.mimeType.startsWith("image/") || mimeType?.startsWith("image/") || (format ? DECLARED_IMAGE_FORMATS.has(format) : false);
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function parseReferenceMode(value: string | undefined): MediaFileReferenceMode {
  return value === "all" || value === "unreferenced" ? value : "multiple";
}

function toNumber(value: number | bigint | null | undefined) {
  return Number(value ?? 0);
}

function normalizeFileMd5s(values: string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter((value) => FILE_MD5_RE.test(value))));
}

function resolveStoredFilePath(config: AppConfig, storageKey: string) {
  const root = path.resolve(process.cwd(), config.filesDir);
  const target = path.resolve(root, storageKey);
  if (target !== root && target.startsWith(`${root}${path.sep}`)) return target;
  throw new Error("文件存储路径越界");
}

function fileEtag(md5: string) {
  return `"${md5}"`;
}

function requestMatchesEtag(value: string | undefined, etag: string) {
  return value?.split(",").map((item) => item.trim()).some((item) => item === "*" || item === etag) ?? false;
}

function removeStoredObjects(config: AppConfig, files: Array<{ storageKey: string }>) {
  for (const file of files) {
    const target = resolveStoredFilePath(config, file.storageKey);
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

type ReferenceStatsRow = Record<keyof MediaFileReferenceListDto["stats"], number | bigint>;

type ReferencePageRow = {
  md5: string;
  referenceCount: number | bigint;
  ownerCount: number | bigint;
};

function referenceModeFilter(mode: MediaFileReferenceMode) {
  if (mode === "multiple") return Prisma.sql`AND COALESCE(file_refs.owner_count, 0) > 1`;
  if (mode === "unreferenced") return Prisma.sql`AND COALESCE(file_refs.owner_count, 0) = 0`;
  return Prisma.empty;
}

function referenceKeywordFilter(keyword: string | undefined) {
  if (!keyword) return Prisma.empty;
  const like = `%${keyword}%`;
  return Prisma.sql`
    AND (
      media_file.md5 ILIKE ${like}
      OR media_file.storage_key ILIKE ${like}
      OR COALESCE(media_file.mime_type, '') ILIKE ${like}
      OR COALESCE(media_file.format, '') ILIKE ${like}
    )
  `;
}

export async function registerFileRoutes(app: FastifyInstance, config: AppConfig) {
  app.get<{
    Querystring: { mode?: MediaFileReferenceMode; q?: string; page?: string; size?: string };
    Reply: ApiResp<MediaFileReferenceListDto>;
  }>("/api/files/references", async (request) => {
    const page = parsePositiveInt(request.query.page, 1, Number.MAX_SAFE_INTEGER);
    const size = parsePositiveInt(request.query.size, 100, 200);
    const mode = parseReferenceMode(request.query.mode);
    const keyword = request.query.q?.trim();
    const skip = (page - 1) * size;
    const modeFilter = referenceModeFilter(mode);
    const keywordFilter = referenceKeywordFilter(keyword);

    const [statsRow] = await prisma.$queryRaw<ReferenceStatsRow[]>`
      SELECT
        (SELECT COUNT(*) FROM media_file)::INTEGER AS "fileCount",
        (SELECT COUNT(DISTINCT file_md5) FROM media_file_reference)::INTEGER AS "referencedFileCount",
        (SELECT COUNT(*) FROM media_file WHERE NOT EXISTS (SELECT 1 FROM media_file_reference WHERE media_file_reference.file_md5 = media_file.md5))::INTEGER AS "unreferencedFileCount",
        (SELECT COUNT(*) FROM (SELECT file_md5 FROM media_file_reference GROUP BY file_md5 HAVING COUNT(DISTINCT owner_type || ':' || owner_id) > 1) AS repeated_files)::INTEGER AS "multiReferencedFileCount",
        (SELECT COUNT(*) FROM media_file_reference)::INTEGER AS "referenceCount"
    `;

    const [totalRow] = await prisma.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
      WITH file_refs AS (
        SELECT file_md5, COUNT(*)::INTEGER AS reference_count, COUNT(DISTINCT owner_type || ':' || owner_id)::INTEGER AS owner_count
        FROM media_file_reference
        GROUP BY file_md5
      )
      SELECT COUNT(*)::INTEGER AS total
      FROM media_file
      LEFT JOIN file_refs ON file_refs.file_md5 = media_file.md5
      WHERE TRUE
      ${keywordFilter}
      ${modeFilter}
    `);

    const pageRows = await prisma.$queryRaw<ReferencePageRow[]>(Prisma.sql`
      WITH file_refs AS (
        SELECT file_md5, COUNT(*)::INTEGER AS reference_count, COUNT(DISTINCT owner_type || ':' || owner_id)::INTEGER AS owner_count
        FROM media_file_reference
        GROUP BY file_md5
      )
      SELECT media_file.md5, COALESCE(file_refs.reference_count, 0)::INTEGER AS "referenceCount", COALESCE(file_refs.owner_count, 0)::INTEGER AS "ownerCount"
      FROM media_file
      LEFT JOIN file_refs ON file_refs.file_md5 = media_file.md5
      WHERE TRUE
      ${keywordFilter}
      ${modeFilter}
      ORDER BY COALESCE(file_refs.owner_count, 0) DESC, COALESCE(file_refs.reference_count, 0) DESC, media_file.created_at DESC, media_file.md5 ASC
      OFFSET ${skip}
      LIMIT ${size}
    `);

    const md5s = pageRows.map((row) => row.md5);
    const files = md5s.length
      ? await prisma.mediaFile.findMany({
          where: { md5: { in: md5s } },
          include: { references: { orderBy: [{ ownerType: "asc" }, { ownerId: "asc" }, { refPath: "asc" }] } },
        })
      : [];
    const fileByMd5 = new Map(files.map((file) => [file.md5, file]));
    const data: MediaFileReferenceListDto["files"]["data"] = pageRows.flatMap((row) => {
      const file = fileByMd5.get(row.md5);
      if (!file) return [];
      return [
        {
          ...toMediaFileDto(file),
          referenceCount: toNumber(row.referenceCount),
          ownerCount: toNumber(row.ownerCount),
          references: file.references.map((reference) => ({
            ownerType: reference.ownerType as MediaFileReferenceListDto["files"]["data"][number]["references"][number]["ownerType"],
            ownerId: reference.ownerId,
            refPath: reference.refPath,
            elementType: reference.elementType ?? undefined,
            createdAt: reference.createdAt.toISOString(),
          })),
        },
      ];
    });
    const filesPage: PageResp<MediaFileReferenceListDto["files"]["data"][number]> = { total: toNumber(totalRow?.total), data };
    const statsSource = statsRow ?? { fileCount: 0, referencedFileCount: 0, unreferencedFileCount: 0, multiReferencedFileCount: 0, referenceCount: 0 };

    return {
      success: true,
      message: "ok",
      data: {
        stats: {
          fileCount: toNumber(statsSource.fileCount),
          referencedFileCount: toNumber(statsSource.referencedFileCount),
          unreferencedFileCount: toNumber(statsSource.unreferencedFileCount),
          multiReferencedFileCount: toNumber(statsSource.multiReferencedFileCount),
          referenceCount: toNumber(statsSource.referenceCount),
        },
        files: filesPage,
      },
    };
  });

  app.delete<{ Body: BatchDeleteMediaFilesDto; Reply: ApiResp<BatchDeleteMediaFilesResultDto> }>("/api/files/unreferenced", async (request, reply) => {
    const md5s = normalizeFileMd5s(request.body?.md5s);
    if (md5s.length === 0) return { success: true, message: "ok", data: { deleted: 0 } };

    const files = await prisma.$transaction(async (tx) => {
      const rows = await tx.mediaFile.findMany({
        where: { md5: { in: md5s } },
        include: { references: { select: { fileMd5: true } } },
      });
      const referenced = rows.filter((file) => file.references.length > 0);
      if (referenced.length > 0) return { referenced: referenced.map((file) => file.md5), rows: [] };

      await tx.mediaFile.deleteMany({ where: { md5: { in: rows.map((file) => file.md5) } } });
      return { referenced: [], rows };
    });
    if (files.referenced.length > 0) {
      return reply.code(409).send({ success: false, message: `有 ${files.referenced.length} 个文件仍存在引用，已取消删除` });
    }

    removeStoredObjects(config, files.rows);
    return { success: true, message: "ok", data: { deleted: files.rows.length } };
  });

  app.get<{ Params: { md5: string } }>("/api/files/:md5", async (request, reply) => {
    const file = await prisma.mediaFile.findUnique({ where: { md5: request.params.md5 } });
    if (!file) return reply.code(404).send({ success: false, message: "文件不存在" });
    const target = resolveStoredFilePath(config, file.storageKey);
    if (!fs.existsSync(target)) return reply.code(404).send({ success: false, message: "文件不存在" });
    const etag = fileEtag(file.md5);
    reply.header("Cache-Control", FILE_CACHE_CONTROL);
    reply.header("ETag", etag);
    if (requestMatchesEtag(request.headers["if-none-match"], etag)) return reply.code(304).send();
    reply.header("Content-Length", file.sizeBytes.toString());
    reply.type(file.mimeType ?? "application/octet-stream");
    return fs.createReadStream(target);
  });

  app.post<{ Body: CreateMediaFileDto; Reply: ApiResp<MediaFileDto> }>("/api/files", async (request, reply) => {
    const buffer = Buffer.from(request.body.contentBase64, "base64");
    const inspection = inspectFileBuffer(buffer);
    if (isImageUploadRequest(request.body, inspection) && !isCommonImageInspection(inspection)) {
      return reply.code(400).send({ success: false, message: `上传图片仅支持 ${commonImageFormatText()} 常见图片格式` });
    }
    const result = await prisma.$transaction(async (tx) => {
      const { file } = await storeMediaFile(tx, config, buffer, inspection);
      return file;
    });
    return { success: true, message: "ok", data: toMediaFileDto(result) };
  });
}
