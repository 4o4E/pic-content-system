import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ApiResp, CreateMediaFileDto, MediaFileDto } from "@pic/shared";
import type { AppConfig } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { toMediaFileDto } from "../media/mapper.js";

export async function registerFileRoutes(app: FastifyInstance, config: AppConfig) {
  app.get<{ Params: { md5: string } }>("/api/files/:md5", async (request, reply) => {
    const file = await prisma.mediaFile.findUnique({ where: { md5: request.params.md5 } });
    if (!file) return reply.code(404).send({ success: false, message: "文件不存在" });
    const target = path.resolve(process.cwd(), config.filesDir, file.storageKey);
    if (!fs.existsSync(target)) return reply.code(404).send({ success: false, message: "文件不存在" });
    reply.type(file.mimeType ?? "application/octet-stream");
    return fs.createReadStream(target);
  });

  app.post<{ Body: CreateMediaFileDto; Reply: ApiResp<MediaFileDto> }>("/api/files", async (request) => {
    const buffer = Buffer.from(request.body.contentBase64, "base64");
    const md5 = crypto.createHash("md5").update(buffer).digest("hex");
    const extension = request.body.format ? `.${request.body.format.replace(/^\./, "")}` : "";
    const storageKey = request.body.storageKey ?? `${md5}${extension}`;
    const targetDir = path.resolve(process.cwd(), config.filesDir);
    const target = path.resolve(targetDir, storageKey);
    if (!target.startsWith(`${targetDir}${path.sep}`) && target !== targetDir) {
      throw new Error("storageKey 不能指向文件目录外部");
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);

    const file = await prisma.mediaFile.upsert({
      where: { md5 },
      create: {
        md5,
        storageKey,
        mimeType: request.body.mimeType,
        format: request.body.format,
        sizeBytes: BigInt(buffer.length),
        width: request.body.width,
        height: request.body.height,
        durationSeconds: request.body.durationSeconds,
      },
      update: {
        storageKey,
        mimeType: request.body.mimeType,
        format: request.body.format,
        sizeBytes: BigInt(buffer.length),
        width: request.body.width,
        height: request.body.height,
        durationSeconds: request.body.durationSeconds,
      },
    });
    return { success: true, message: "ok", data: toMediaFileDto(file) };
  });
}
