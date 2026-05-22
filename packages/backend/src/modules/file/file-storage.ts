import fs from "node:fs";
import path from "node:path";
import type { MediaFile, Prisma } from "@prisma/client";
import type { AppConfig } from "../../config/env.js";
import { inspectFileBuffer, type FileInspection } from "./file-inspector.js";

export interface StoredFileResult {
  file: MediaFile;
  inspection: FileInspection;
}

function storageKeyFor(md5: string, format: string) {
  const extension = format === "bin" ? "" : `.${format}`;
  return path.join("objects", md5.slice(0, 2), md5.slice(2, 4), `${md5}${extension}`).replaceAll(path.sep, "/");
}

export async function storeMediaFile(tx: Prisma.TransactionClient, config: AppConfig, buffer: Buffer): Promise<StoredFileResult> {
  const inspection = inspectFileBuffer(buffer);
  const storageKey = storageKeyFor(inspection.md5, inspection.format);
  const targetDir = path.resolve(process.cwd(), config.filesDir);
  const target = path.resolve(targetDir, storageKey);
  if (!target.startsWith(`${targetDir}${path.sep}`)) throw new Error("文件存储路径越界");

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.writeFileSync(target, buffer);

  const file = await tx.mediaFile.upsert({
    where: { md5: inspection.md5 },
    create: {
      md5: inspection.md5,
      storageKey,
      mimeType: inspection.mimeType,
      format: inspection.format,
      sizeBytes: BigInt(inspection.sizeBytes),
      width: inspection.width,
      height: inspection.height,
      durationSeconds: inspection.durationSeconds,
    },
    update: {
      storageKey,
      mimeType: inspection.mimeType,
      format: inspection.format,
      sizeBytes: BigInt(inspection.sizeBytes),
      width: inspection.width,
      height: inspection.height,
      durationSeconds: inspection.durationSeconds,
    },
  });

  return { file, inspection };
}
