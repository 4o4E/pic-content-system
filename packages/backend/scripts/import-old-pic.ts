import { PrismaClient, type Prisma } from "@prisma/client";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

interface OldPicItem {
  time?: string;
  name?: string;
  uploader?: number;
  tags?: string[];
  md5?: string;
  sha?: string;
}

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
  const envPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!envPath) return Promise.resolve();
  return fs
    .readFile(envPath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index < 0) continue;
        const key = trimmed.slice(0, index);
        const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
        process.env[key] ??= value;
      }
    })
    .catch(() => undefined);
}

function parseOldTime(value: string | undefined) {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return new Date();
  const [, year, month, day, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
}

function mimeByExt(ext: string) {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function md5OfBuffer(buffer: Buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function contentSign(elements: unknown) {
  return crypto.createHash("md5").update(JSON.stringify(elements)).digest("hex");
}

async function ensureFileStored(sourceFile: string, filesDir: string, md5: string, ext: string) {
  const relative = path.join("objects", md5.slice(0, 2), md5.slice(2, 4), `${md5}${ext.toLowerCase()}`);
  const target = path.resolve(filesDir, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(sourceFile, target).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return relative.replaceAll(path.sep, "/");
}

async function main() {
  await loadEnv();
  const prisma = new PrismaClient();

  const sourceDir = process.argv.find((arg, index) => index > 1 && arg !== "--") ?? "F:/Desktop/pic/pic";
  const dataPath = path.join(sourceDir, "data.json");
  const storeDir = path.join(sourceDir, "store");
  const filesDir = path.resolve(process.env.FILES_DIR ?? "./data/files");

  const raw = await fs.readFile(dataPath, "utf8");
  const data = JSON.parse(raw) as Record<string, OldPicItem>;
  const entries = Object.entries(data);

  let imported = 0;
  let missing = 0;
  let skipped = 0;
  let md5Mismatch = 0;

  for (const [filename, item] of entries) {
    const sourceFile = path.join(storeDir, item.name ?? filename);
    const ext = path.extname(sourceFile);

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(sourceFile);
    } catch {
      missing++;
      continue;
    }

    const actualMd5 = md5OfBuffer(buffer);
    if (item.md5 && item.md5 !== actualMd5) md5Mismatch++;
    const md5 = actualMd5;
    const storageKey = await ensureFileStored(sourceFile, filesDir, md5, ext);
    const createdAt = parseOldTime(item.time);
    const tags = [...new Set((item.tags ?? []).filter(Boolean))];
    const element = {
      type: "image",
      id: md5,
      format: ext.replace(/^\./, "").toLowerCase() || "bin",
      file: false,
      width: 1,
      height: 1,
    };
    const elements = [element];
    const sign = contentSign(elements);

    await prisma.mediaFile.upsert({
      where: { md5 },
      create: {
        md5,
        storageKey,
        mimeType: mimeByExt(ext),
        format: element.format,
        sizeBytes: BigInt(buffer.length),
        metadata: {
          oldName: item.name ?? filename,
          oldSha: item.sha,
        } as Prisma.InputJsonObject,
      },
      update: {
        storageKey,
        mimeType: mimeByExt(ext),
        format: element.format,
        sizeBytes: BigInt(buffer.length),
      },
    });

    const existing = await prisma.mediaContent.findUnique({ where: { sign } });
    const content =
      existing ??
      (await prisma.mediaContent.create({
        data: {
          type: "image",
          title: item.name ?? filename,
          tags,
          elements: elements as Prisma.InputJsonValue,
          sign,
          auditState: "approved",
          metadata: {
            importedFrom: "old-pic",
            oldName: item.name ?? filename,
            uploader: item.uploader,
            oldTime: item.time,
            oldSha: item.sha,
          } as Prisma.InputJsonObject,
          createdAt,
          updatedAt: createdAt,
        },
      }));

    if (existing) {
      skipped++;
    } else {
      imported++;
    }

    if (tags.length > 0) {
      await prisma.contentTag.createMany({
        data: tags.map((tag) => ({ contentId: content.id, tag })),
        skipDuplicates: true,
      });
    }

    if ((imported + skipped + missing) % 500 === 0) {
      console.log(`progress ${imported + skipped + missing}/${entries.length}, imported=${imported}, skipped=${skipped}, missing=${missing}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        total: entries.length,
        imported,
        skipped,
        missing,
        md5Mismatch,
        filesDir,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
