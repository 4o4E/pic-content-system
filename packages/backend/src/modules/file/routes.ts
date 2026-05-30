import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ApiResp, CreateMediaFileDto, MediaFileDto } from "@pic/shared";
import type { AppConfig } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { toMediaFileDto } from "../media/mapper.js";
import { COMMON_IMAGE_FORMATS, commonImageFormatText, inspectFileBuffer, isCommonImageInspection, type FileInspection } from "./file-inspector.js";
import { storeMediaFile } from "./file-storage.js";

const DECLARED_IMAGE_FORMATS = new Set<string>([...COMMON_IMAGE_FORMATS, "jpeg", "svg", "svg+xml", "avif", "bmp", "tif", "tiff", "ico", "heic", "heif"]);

function isImageUploadRequest(body: CreateMediaFileDto, inspection: FileInspection) {
  const mimeType = body.mimeType?.trim().toLowerCase();
  const format = body.format?.trim().toLowerCase().replace(/^\./, "");
  return inspection.mimeType.startsWith("image/") || mimeType?.startsWith("image/") || (format ? DECLARED_IMAGE_FORMATS.has(format) : false);
}

export async function registerFileRoutes(app: FastifyInstance, config: AppConfig) {
  app.get<{ Params: { md5: string } }>("/api/files/:md5", async (request, reply) => {
    const file = await prisma.mediaFile.findUnique({ where: { md5: request.params.md5 } });
    if (!file) return reply.code(404).send({ success: false, message: "文件不存在" });
    const target = path.resolve(process.cwd(), config.filesDir, file.storageKey);
    if (!fs.existsSync(target)) return reply.code(404).send({ success: false, message: "文件不存在" });
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
