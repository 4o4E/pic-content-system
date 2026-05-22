import { PrismaClient, type Prisma } from "@prisma/client";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaElement, MediaType } from "@pic/shared";

interface NapCatExport {
  version?: number;
  peer?: {
    chatType?: number;
    peerUid?: string;
    guildId?: string;
  };
  messages?: Record<string, NapCatMessageSummary>;
  assets?: Record<string, NapCatAsset>;
  updatedAt?: string;
}

interface NapCatMessageSummary {
  msgId: string;
  msgSeq?: string;
  msgTime?: string;
  senderUid?: string;
  senderName?: string;
  raw?: NapCatRawMessage;
}

interface NapCatRawMessage {
  msgId: string;
  msgSeq?: string;
  msgTime?: string;
  senderUid?: string;
  sendNickName?: string;
  sendMemberName?: string;
  peerUid?: string;
  peerName?: string;
  elements?: NapCatElement[];
  records?: NapCatRawMessage[];
}

interface NapCatElement {
  textElement?: { content?: string } | null;
  picElement?: {
    fileName?: string;
    md5HexStr?: string;
    picWidth?: number;
    picHeight?: number;
  } | null;
  videoElement?: {
    fileName?: string;
    videoMd5?: string;
    fileTime?: number;
    thumbWidth?: number;
    thumbHeight?: number;
  } | null;
  fileElement?: {
    fileName?: string;
    fileMd5?: string;
    fileSize?: string;
    picWidth?: number;
    picHeight?: number;
    videoDuration?: number;
  } | null;
}

interface NapCatAsset {
  key: string;
  type?: string;
  status?: string;
  relativePath?: string;
  sourcePath?: string;
  size?: number;
  error?: string;
}

interface ImportArgs {
  sourceDir: string;
  commit: boolean;
  tags: string[];
  failureReportPath: string;
}

interface SourceFile {
  asset: NapCatAsset;
  path: string;
  ext: string;
  buffer: Buffer;
  md5: string;
  storageKey: string;
}

interface ImportStats {
  scannedMessages: number;
  scannedAssets: number;
  candidates: number;
  imported: number;
  existing: number;
  files: number;
  sourceBindings: number;
  skippedTextOnly: number;
  skippedNoUsableElement: number;
  missingAssets: number;
  failedAssets: number;
  importFailed: number;
}

interface ImportFailure {
  stage: "export-asset" | "resolve-asset" | "copy-file" | "database";
  msgId?: string;
  msgSeq?: string;
  assetKey?: string;
  relativePath?: string;
  sourcePath?: string;
  reason: string;
}

const defaultTags = ["弔图"];

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2);
  const sourceDir = args.find((arg) => !arg.startsWith("--")) ?? ".";
  const tags = [...defaultTags];
  const reportArg = args.find((arg) => arg.startsWith("--failure-report="));
  for (const arg of args) {
    if (arg.startsWith("--tag=")) tags.push(arg.slice("--tag=".length));
  }
  const resolvedSourceDir = path.resolve(sourceDir);
  const defaultReportName = `import-failures-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  return {
    sourceDir: resolvedSourceDir,
    commit: args.includes("--commit"),
    tags: Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))),
    failureReportPath: path.resolve(resolvedSourceDir, reportArg?.slice("--failure-report=".length) || defaultReportName),
  };
}

async function loadEnv() {
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env"), path.resolve(process.cwd(), "../../.env")];
  const envPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!envPath) return;
  const content = await fs.readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
    process.env[key] ??= value;
  }
}

function md5OfBuffer(buffer: Buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function contentSign(elements: unknown) {
  return crypto.createHash("md5").update(JSON.stringify(elements)).digest("hex");
}

function sanitizeJsonValue<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "") as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJsonValue(item)])) as T;
  }
  return value;
}

function dateFromUnixSecond(value: string | undefined) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function formatFromExt(ext: string) {
  return ext.replace(/^\./, "").toLowerCase() || "bin";
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
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

function mediaKindFromExt(ext: string): MediaType {
  const normalized = ext.toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(normalized)) return "image";
  if ([".mp4", ".mov"].includes(normalized)) return "video";
  if ([".mp3", ".wav", ".silk", ".amr"].includes(normalized)) return "audio";
  return "file";
}

function storageKeyFor(md5: string, ext: string) {
  return path.join("objects", md5.slice(0, 2), md5.slice(2, 4), `${md5}${ext.toLowerCase()}`).replaceAll(path.sep, "/");
}

function safeResolveAssetPath(sourceDir: string, relativePath: string | undefined) {
  if (!relativePath) return undefined;
  const base = path.resolve(sourceDir);
  const target = path.resolve(base, relativePath);
  if (!target.startsWith(`${base}${path.sep}`) && target !== base) return undefined;
  return target;
}

function assetKind(asset: NapCatAsset) {
  if (asset.type === "video") return "video";
  if (asset.type === "audio") return "audio";
  return mediaKindFromExt(path.extname(asset.relativePath ?? asset.sourcePath ?? ""));
}

function buildAssetQueues(exportData: NapCatExport) {
  const queues = new Map<string, NapCatAsset[]>();
  for (const asset of Object.values(exportData.assets ?? {})) {
    const msgId = asset.key.split("_")[0];
    if (!msgId) continue;
    const queue = queues.get(msgId) ?? [];
    queue.push(asset);
    queues.set(msgId, queue);
  }
  for (const queue of queues.values()) {
    queue.sort((a, b) => (a.relativePath ?? "").localeCompare(b.relativePath ?? ""));
  }
  return queues;
}

function takeAsset(queue: NapCatAsset[] | undefined, kind: MediaType) {
  if (!queue) return undefined;
  const index = queue.findIndex((asset) => asset.status === "ok" && assetKind(asset) === kind);
  if (index < 0) return undefined;
  return queue.splice(index, 1)[0];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readSourceFile(sourceDir: string, filesDir: string, asset: NapCatAsset): Promise<SourceFile | undefined> {
  const assetPath = safeResolveAssetPath(sourceDir, asset.relativePath);
  if (!assetPath) return undefined;
  const buffer = await fs.readFile(assetPath).catch(() => undefined);
  if (!buffer) return undefined;
  const md5 = md5OfBuffer(buffer);
  const ext = path.extname(assetPath);
  return {
    asset,
    path: assetPath,
    ext,
    buffer,
    md5,
    storageKey: storageKeyFor(md5, ext),
  };
}

async function copyFileIfNeeded(file: SourceFile, filesDir: string) {
  const base = path.resolve(filesDir);
  const target = path.resolve(base, file.storageKey);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error(`文件存储路径越界：${file.storageKey}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!fsSync.existsSync(target)) await fs.copyFile(file.path, target);
}

function pushResolveFailure(failures: ImportFailure[], raw: NapCatRawMessage, reason: string, asset?: NapCatAsset) {
  failures.push({
    stage: "resolve-asset",
    msgId: raw.msgId,
    msgSeq: raw.msgSeq,
    assetKey: asset?.key,
    relativePath: asset?.relativePath,
    sourcePath: asset?.sourcePath,
    reason,
  });
}

async function buildElements(
  raw: NapCatRawMessage,
  sourceDir: string,
  filesDir: string,
  queues: Map<string, NapCatAsset[]>,
  stats: ImportStats,
  failures: ImportFailure[],
) {
  const elements: MediaElement[] = [];
  const files: SourceFile[] = [];
  const queue = queues.get(raw.msgId);

  for (const item of raw.elements ?? []) {
    const text = item.textElement?.content?.trim();
    if (text) elements.push({ type: "text", content: text });

    if (item.picElement) {
      const asset = takeAsset(queue, "image");
      if (!asset) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "图片元素没有匹配到可用导出资产");
        continue;
      }
      const file = await readSourceFile(sourceDir, filesDir, asset);
      if (!file) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "图片资产文件不存在或不可读取", asset);
        continue;
      }
      files.push(file);
      elements.push({
        type: "image",
        id: file.md5,
        format: formatFromExt(file.ext),
        file: false,
        width: item.picElement.picWidth ?? 1,
        height: item.picElement.picHeight ?? 1,
      });
    }

    if (item.videoElement) {
      const asset = takeAsset(queue, "video");
      if (!asset) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "视频元素没有匹配到可用导出资产");
        continue;
      }
      const file = await readSourceFile(sourceDir, filesDir, asset);
      if (!file) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "视频资产文件不存在或不可读取", asset);
        continue;
      }
      files.push(file);
      elements.push({
        type: "video",
        id: file.md5,
        format: formatFromExt(file.ext),
        file: false,
        width: item.videoElement.thumbWidth ?? 1,
        height: item.videoElement.thumbHeight ?? 1,
        durationSeconds: item.videoElement.fileTime ?? 0,
      });
    }

    if (item.fileElement) {
      const kind = mediaKindFromExt(path.extname(item.fileElement.fileName ?? ""));
      const asset = takeAsset(queue, kind);
      if (!asset) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "文件元素没有匹配到可用导出资产");
        continue;
      }
      const file = await readSourceFile(sourceDir, filesDir, asset);
      if (!file) {
        stats.missingAssets++;
        pushResolveFailure(failures, raw, "文件资产不存在或不可读取", asset);
        continue;
      }
      files.push(file);
      if (kind === "image") {
        elements.push({
          type: "image",
          id: file.md5,
          format: formatFromExt(file.ext),
          file: true,
          width: item.fileElement.picWidth ?? 1,
          height: item.fileElement.picHeight ?? 1,
        });
      } else if (kind === "video") {
        elements.push({
          type: "video",
          id: file.md5,
          format: formatFromExt(file.ext),
          file: true,
          width: item.fileElement.picWidth ?? 1,
          height: item.fileElement.picHeight ?? 1,
          durationSeconds: item.fileElement.videoDuration ?? 0,
        });
      } else {
        elements.push({
          type: "file",
          id: file.md5,
          format: formatFromExt(file.ext),
          file: true,
          mimeType: mimeByExt(file.ext),
          sizeBytes: Number(item.fileElement.fileSize ?? file.buffer.length),
        });
      }
    }
  }

  return { elements, files };
}

function flattenMessages(exportData: NapCatExport) {
  const rows: NapCatRawMessage[] = [];
  const seen = new Set<string>();
  const visit = (raw: NapCatRawMessage | undefined) => {
    if (!raw?.msgId || seen.has(raw.msgId)) return;
    seen.add(raw.msgId);
    rows.push(raw);
    for (const record of raw.records ?? []) visit(record);
  };
  for (const summary of Object.values(exportData.messages ?? {})) visit(summary.raw ?? (summary as unknown as NapCatRawMessage));
  return rows;
}

function inferContentType(elements: MediaElement[]): MediaType {
  if (elements.length !== 1) return "composite";
  return elements[0]?.type ?? "composite";
}

function titleFor(raw: NapCatRawMessage, elements: MediaElement[]) {
  const firstMedia = elements.find((element) => "id" in element && element.type !== "text");
  const time = dateFromUnixSecond(raw.msgTime).toISOString().slice(0, 19).replace("T", " ");
  return firstMedia ? `${raw.sendNickName ?? raw.sendMemberName ?? raw.senderUid ?? "NapCat"} ${time}` : undefined;
}

async function upsertContent(
  tx: Prisma.TransactionClient,
  raw: NapCatRawMessage,
  elements: MediaElement[],
  files: SourceFile[],
  tags: string[],
  exportData: NapCatExport,
) {
  const sign = contentSign(elements);
  const createdAt = dateFromUnixSecond(raw.msgTime);
  for (const file of files) {
    await tx.mediaFile.upsert({
      where: { md5: file.md5 },
      create: {
        md5: file.md5,
        storageKey: file.storageKey,
        mimeType: mimeByExt(file.ext),
        format: formatFromExt(file.ext),
        sizeBytes: BigInt(file.buffer.length),
        metadata: {
          importedFrom: "napcat-export",
          exportAssetKey: file.asset.key,
          exportRelativePath: file.asset.relativePath,
          sourcePath: file.asset.sourcePath,
        } as Prisma.InputJsonObject,
      },
      update: {
        storageKey: file.storageKey,
        mimeType: mimeByExt(file.ext),
        format: formatFromExt(file.ext),
        sizeBytes: BigInt(file.buffer.length),
      },
    });
  }

  const existing = await tx.mediaContent.findUnique({ where: { sign } });
  const content = existing
    ? await tx.mediaContent.update({
        where: { id: existing.id },
        data: { tags: Array.from(new Set([...existing.tags, ...tags])) },
      })
    : await tx.mediaContent.create({
        data: {
          type: inferContentType(elements),
          title: titleFor(raw, elements),
          tags,
          elements: elements as unknown as Prisma.InputJsonValue,
          sign,
          auditState: "approved",
          metadata: {
            importedFrom: "napcat-export",
            groupId: exportData.peer?.peerUid,
            msgSeq: raw.msgSeq,
          } as Prisma.InputJsonObject,
          createdAt,
          updatedAt: createdAt,
        },
      });

  if (tags.length > 0) {
    await tx.contentTag.createMany({
      data: tags.map((tag) => ({ contentId: content.id, tag })),
      skipDuplicates: true,
    });
  }

  await tx.sourceBinding.upsert({
    where: {
      platform_platformMessageId: {
        platform: "napcat",
        platformMessageId: raw.msgId,
      },
    },
    create: {
      contentId: content.id,
      platform: "napcat",
      platformMessageId: raw.msgId,
      platformGroupId: exportData.peer?.peerUid,
      platformUserId: raw.senderUid,
      raw: sanitizeJsonValue(raw) as unknown as Prisma.InputJsonValue,
    },
    update: {
      contentId: content.id,
      platformGroupId: exportData.peer?.peerUid,
      platformUserId: raw.senderUid,
      raw: sanitizeJsonValue(raw) as unknown as Prisma.InputJsonValue,
    },
  });

  return existing ? "existing" : "imported";
}

async function main() {
  await loadEnv();
  const args = parseArgs();
  const indexPath = path.join(args.sourceDir, "index.json");
  const filesDir = path.resolve(process.env.FILES_DIR ?? "./data/files");
  const exportData = JSON.parse(await fs.readFile(indexPath, "utf8")) as NapCatExport;
  const stats: ImportStats = {
    scannedMessages: Object.keys(exportData.messages ?? {}).length,
    scannedAssets: Object.keys(exportData.assets ?? {}).length,
    candidates: 0,
    imported: 0,
    existing: 0,
    files: 0,
    sourceBindings: 0,
    skippedTextOnly: 0,
    skippedNoUsableElement: 0,
    missingAssets: 0,
    failedAssets: Object.values(exportData.assets ?? {}).filter((asset) => asset.status !== "ok").length,
    importFailed: 0,
  };
  const failures: ImportFailure[] = Object.values(exportData.assets ?? {})
    .filter((asset) => asset.status !== "ok")
    .map((asset) => ({
      stage: "export-asset",
      assetKey: asset.key,
      relativePath: asset.relativePath,
      sourcePath: asset.sourcePath,
      reason: asset.error || `导出资产状态为 ${asset.status ?? "unknown"}`,
    }));

  const queues = buildAssetQueues(exportData);
  const rows = flattenMessages(exportData);
  const planned: Array<{ raw: NapCatRawMessage; elements: MediaElement[]; files: SourceFile[] }> = [];

  for (const raw of rows) {
    const built = await buildElements(raw, args.sourceDir, filesDir, queues, stats, failures);
    const hasMedia = built.elements.some((element) => element.type !== "text");
    if (!hasMedia) {
      if (built.elements.length > 0) stats.skippedTextOnly++;
      else stats.skippedNoUsableElement++;
      continue;
    }
    stats.candidates++;
    stats.files += built.files.length;
    planned.push({ raw, ...built });
  }

  if (args.commit) {
    const prisma = new PrismaClient();
    try {
      for (const [index, item] of planned.entries()) {
        try {
          for (const file of item.files) await copyFileIfNeeded(file, filesDir);
        } catch (error) {
          stats.importFailed++;
          failures.push({
            stage: "copy-file",
            msgId: item.raw.msgId,
            msgSeq: item.raw.msgSeq,
            reason: errorMessage(error),
          });
          continue;
        }

        try {
          const result = await prisma.$transaction(async (tx) => {
            const result = await upsertContent(tx, item.raw, item.elements, item.files, args.tags, exportData);
            return result;
          });
          if (result === "existing") stats.existing++;
          else stats.imported++;
          stats.sourceBindings++;
        } catch (error) {
          stats.importFailed++;
          failures.push({
            stage: "database",
            msgId: item.raw.msgId,
            msgSeq: item.raw.msgSeq,
            reason: errorMessage(error),
          });
        }

        if ((index + 1) % 200 === 0) {
          console.log(`progress ${index + 1}/${planned.length}, imported=${stats.imported}, existing=${stats.existing}, failed=${stats.importFailed}`);
        }
      }

      await prisma.ingestEvent.create({
        data: {
          source: "napcat-export-import",
          status: failures.length > 0 ? "partial" : "success",
          platform: "napcat",
          platformEventId: `napcat-export:${exportData.peer?.peerUid ?? "unknown"}:${exportData.updatedAt ?? Date.now()}`,
          payload: { ...stats, failureReportPath: args.failureReportPath } as unknown as Prisma.InputJsonValue,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  if (failures.length > 0) {
    await fs.writeFile(
      args.failureReportPath,
      JSON.stringify(
        {
          mode: args.commit ? "commit" : "dry-run",
          sourceDir: args.sourceDir,
          filesDir,
          tags: args.tags,
          stats,
          failures,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: args.commit ? "commit" : "dry-run",
        sourceDir: args.sourceDir,
        filesDir,
        failureReportPath: failures.length > 0 ? args.failureReportPath : undefined,
        failureCount: failures.length,
        tags: args.tags,
        ...stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
