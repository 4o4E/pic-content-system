import archiver from "archiver";
import type {
  CreateDataExportDto,
  DataExportDetailDto,
  DataExportListItemDto,
  DataExportManifestDto,
  DataImportConflictPolicy,
  DataImportResultDto,
  DataImportTableResultDto,
  ImportDataExportDto,
  UpdateDataExportDto,
} from "@pic/shared";
import type { MediaAssetStatus, MediaType, TagVisibility } from "@prisma/client";
import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import type { AppConfig } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { nextSnowflakeId } from "../../lib/snowflake.js";
import { assetFileReferences, collectFileReferencesFromElements, replaceMediaFileReferences } from "../file/file-reference-service.js";
import { tagScopeData } from "../tag/tag-service.js";

const SCHEMA_VERSION = 1;
const MANIFEST_ENTRY = "manifest.json";
const METADATA_ENTRY = "metadata.json";
const ZIP_COMMENT_MAX_BYTES = 0xffff;
const DB_ENTRY_PREFIX = "db/";
const OBJECT_ENTRY_PREFIX = "objects/";
const BACKUP_COPY_NAME = /^pic-content-backup-(\d{8}-\d{6})-([0-9A-Za-z_-]{1,64})\.zip$/;
const pendingBackupCopies = new Set<string>();
const tableNames = [
  "media_file",
  "media_content",
  "content_like",
  "source_binding",
  "media_asset",
  "workspace_draft",
  "tag",
  "content_tag",
  "tag_alias",
  "audit_event",
  "ingest_event",
] as const;
const activeExportJobs = new Map<string, ExportSidecar>();
const archiveMutations = new Map<string, Promise<unknown>>();

type TableName = (typeof tableNames)[number];
type ExportRecords = Record<TableName, unknown[]>;
type ExportSidecar = DataExportDetailDto;
type ExportZipMetadata = Omit<DataExportListItemDto, "zipFileName" | "zipSizeBytes" | "zipTempSizeBytes" | "progressPercent" | "durationSeconds" | "backupCopy">;

interface ObjectEntry {
  storageKey: string;
  absolutePath: string;
  sizeBytes: number;
}

interface LoadedBundle {
  manifest: DataExportManifestDto;
  records: ExportRecords;
  files: DataImportResultDto["files"];
  conflicts: string[];
}

interface ParsedManifest {
  schemaVersion?: number;
  id?: string;
  name?: string;
  createdAt?: string;
  databaseRows?: number;
  objectCount?: number;
  objectSizeBytes?: number;
  tables?: Array<{ table?: string; rows?: number }>;
  objects?: Array<{ sizeBytes?: number }>;
}

interface ExportMediaFile {
  md5: string;
  storageKey: string;
  mimeType: string | null;
  format: string | null;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  durationSeconds: string | null;
  metadata: unknown;
  createdAt: string;
}

interface ExportMediaContent {
  id: string;
  type: MediaType;
  title: string | null;
  tags: string[];
  elements: unknown;
  sign: string;
  auditState: "pending" | "approved" | "rejected" | "archived";
  likeCount: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ExportContentLike {
  id: string;
  contentId: string;
  source: string;
  likeDate: string;
  createdAt: string;
}

interface ExportSourceBinding {
  id: string;
  contentId: string | null;
  platform: string;
  platformMessageId: string | null;
  platformGroupId: string | null;
  platformUserId: string | null;
  platformFileId: string | null;
  sourceKey: string | null;
  sourceIndex: number | null;
  raw: unknown;
  createdAt: string;
}

interface ExportMediaAsset {
  id: string;
  kind: MediaType;
  fileMd5: string | null;
  element: unknown;
  sourceId: string | null;
  status: MediaAssetStatus;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ExportWorkspaceDraft {
  id: string;
  title: string | null;
  tags: string[];
  elements: unknown;
  assetIds: string[];
  status: "editing" | "submitted" | "discarded";
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ExportTag {
  name: string;
  visibility?: TagVisibility;
  scopes?: string[];
  scope?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExportContentTag {
  id: string;
  contentId: string;
  tag: string;
  createdAt: string;
}

interface ExportTagAlias {
  alias: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportAuditEvent {
  id: string;
  contentId: string;
  action: "submit" | "approve" | "reject" | "archive" | "reset" | "delete";
  fromState: "pending" | "approved" | "rejected" | "archived" | null;
  toState: "pending" | "approved" | "rejected" | "archived" | null;
  operatorPlatform: string | null;
  operatorUserId: string | null;
  reason: string | null;
  raw: unknown;
  createdAt: string;
}

interface ExportIngestEvent {
  id: string;
  source: string;
  status: string;
  platform: string;
  platformEventId: string | null;
  payload: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function jsonInput(value: unknown) {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function jsonArrayInput(value: unknown) {
  return (Array.isArray(value) ? value : []) as Prisma.InputJsonValue;
}

function tableResult(): DataImportTableResultDto {
  return { created: 0, updated: 0, skipped: 0, conflicted: 0 };
}

function initRecords(): ExportRecords {
  return Object.fromEntries(tableNames.map((name) => [name, []])) as unknown as ExportRecords;
}

function initImportTables() {
  return Object.fromEntries(tableNames.map((name) => [name, tableResult()])) as Record<TableName, DataImportTableResultDto>;
}

function rows<T>(records: ExportRecords, table: TableName): T[] {
  return records[table] as T[];
}

function normalizeName(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function dateMs(value: string | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : undefined;
}

function exportsRoot(config: AppConfig) {
  return path.resolve(process.cwd(), config.filesDir, "exports");
}

export function dataExportZipPath(config: AppConfig, id: string) {
  assertSafeExportId(id);
  return path.join(exportsRoot(config), `${id}.zip`);
}

function legacySidecarPath(config: AppConfig, id: string) {
  assertSafeExportId(id);
  return path.join(exportsRoot(config), `${id}.json`);
}

async function readLegacyExportIndex(config: AppConfig, id: string): Promise<ExportSidecar | undefined> {
  try {
    const item = JSON.parse(await fs.promises.readFile(legacySidecarPath(config, id), "utf8")) as ExportSidecar | null;
    return item?.id === id ? item : undefined;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

async function ensureExportsRoot(config: AppConfig) {
  await fs.promises.mkdir(exportsRoot(config), { recursive: true });
}

function assertSafeExportId(id: string) {
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(id)) throw new Error("导出记录 ID 格式错误");
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileSize(file: string) {
  try {
    const stat = await fs.promises.stat(file);
    return stat.isFile() ? stat.size : 0;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw cause;
  }
}

async function withRuntimeStats(config: AppConfig, sidecar: ExportSidecar): Promise<ExportSidecar> {
  const startedAt = dateMs(sidecar.createdAt);
  const endedAt = dateMs(sidecar.finishedAt) ?? (sidecar.status === "running" ? Date.now() : dateMs(sidecar.updatedAt));
  const durationSeconds = startedAt !== undefined && endedAt !== undefined ? Math.max(0, Math.floor((endedAt - startedAt) / 1000)) : undefined;
  const zipTempSizeBytes = sidecar.status === "running" ? await fileSize(`${dataExportZipPath(config, sidecar.id)}.tmp`) : undefined;
  const writtenSizeBytes = sidecar.status === "running" ? zipTempSizeBytes ?? 0 : sidecar.zipSizeBytes;
  const estimatedTotalBytes = sidecar.status === "running" ? sidecar.objectSizeBytes : sidecar.zipSizeBytes;
  const progressPercent =
    sidecar.status === "ready"
      ? 100
      : estimatedTotalBytes > 0
        ? Math.max(0, Math.min(99, Math.floor((writtenSizeBytes / estimatedTotalBytes) * 100)))
        : sidecar.status === "running"
          ? 0
          : undefined;
  return {
    ...sidecar,
    ...(zipTempSizeBytes === undefined ? {} : { zipTempSizeBytes }),
    ...(progressPercent === undefined ? {} : { progressPercent }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}

async function withPackageManifest(config: AppConfig, sidecar: ExportSidecar): Promise<DataExportDetailDto> {
  const item = await withRuntimeStats(config, sidecar);
  if (item.status !== "ready") return item;
  const manifest = await readManifestFromZip(dataExportZipPath(config, item.id)).catch(() => sidecar.manifest);
  return manifest ? { ...item, manifest } : item;
}

function toListItem(item: ExportSidecar): DataExportListItemDto {
  const { manifest: _manifest, ...listItem } = item;
  return listItem;
}

function exportMetadata(item: ExportSidecar): ExportZipMetadata {
  const {
    manifest: _manifest,
    zipFileName: _zipFileName,
    zipSizeBytes: _zipSizeBytes,
    zipTempSizeBytes: _zipTempSizeBytes,
    progressPercent: _progressPercent,
    durationSeconds: _durationSeconds,
    backupCopy: _backupCopy,
    ...metadata
  } = item;
  return metadata;
}

function zipMetadataLayout(metadata: ExportZipMetadata) {
  const json = JSON.stringify(metadata);
  if (json.length > ZIP_COMMENT_MAX_BYTES) return { entry: json };
  const comment = json.replace(/[^\x20-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  // ZIP 注释只能存 65535 字节。旧版元数据不受这个限制，超限时保存在同一包内。
  return comment.length <= ZIP_COMMENT_MAX_BYTES ? { comment } : { entry: json };
}

function parseZipComment(comment: string): ExportZipMetadata | undefined {
  const trimmed = comment.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as ExportZipMetadata;
  } catch {
    return undefined;
  }
}

function zipFileName(id: string) {
  return `${id}.zip`;
}

function sidecarFromMetadata(id: string, metadata: ExportZipMetadata, stat: fs.Stats): ExportSidecar {
  const finishedAt = metadata.finishedAt ?? stat.mtime.toISOString();
  return {
    id,
    name: normalizeName(metadata.name, `导出 ${metadata.createdAt.slice(0, 19).replace("T", " ")}`),
    note: metadata.note,
    status: metadata.status,
    source: metadata.source,
    schemaVersion: metadata.schemaVersion,
    zipFileName: zipFileName(id),
    zipSizeBytes: stat.size,
    databaseRows: metadata.databaseRows,
    objectCount: metadata.objectCount,
    objectSizeBytes: metadata.objectSizeBytes,
    createdAt: metadata.createdAt,
    updatedAt: metadata.finishedAt ? metadata.updatedAt : finishedAt,
    finishedAt,
    error: metadata.error,
  };
}

function sidecarFromManifest(id: string, manifest: DataExportManifestDto, stat: fs.Stats): ExportSidecar {
  const timestamp = stat.mtime.toISOString();
  return {
    id,
    name: normalizeName(manifest.name, `导出 ${manifest.createdAt.slice(0, 19).replace("T", " ")}`),
    status: "ready",
    schemaVersion: manifest.schemaVersion,
    zipFileName: zipFileName(id),
    zipSizeBytes: stat.size,
    databaseRows: databaseRows(manifest),
    objectCount: manifest.objectCount,
    objectSizeBytes: objectSizeBytes(manifest),
    createdAt: manifest.createdAt,
    updatedAt: timestamp,
    finishedAt: timestamp,
  };
}

async function readDatabaseRecords(): Promise<ExportRecords> {
  const [
    mediaFiles,
    mediaContents,
    contentLikes,
    sourceBindings,
    mediaAssets,
    workspaceDrafts,
    tags,
    contentTags,
    tagAliases,
    auditEvents,
    ingestEvents,
  ] = await Promise.all([
    prisma.mediaFile.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mediaContent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.contentLike.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.sourceBinding.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mediaAsset.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.workspaceDraft.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.tag.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.contentTag.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.tagAlias.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.auditEvent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.ingestEvent.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return {
    media_file: mediaFiles.map((row): ExportMediaFile => ({
      md5: row.md5,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      format: row.format,
      sizeBytes: row.sizeBytes.toString(),
      width: row.width,
      height: row.height,
      durationSeconds: row.durationSeconds?.toString() ?? null,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    media_content: mediaContents.map((row): ExportMediaContent => ({
      id: row.id,
      type: row.type,
      title: row.title,
      tags: row.tags,
      elements: row.elements,
      sign: row.sign,
      auditState: row.auditState,
      likeCount: row.likeCount.toString(),
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    content_like: contentLikes.map((row): ExportContentLike => ({
      id: row.id,
      contentId: row.contentId,
      source: row.source,
      likeDate: row.likeDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    source_binding: sourceBindings.map((row): ExportSourceBinding => ({
      id: row.id,
      contentId: row.contentId,
      platform: row.platform,
      platformMessageId: row.platformMessageId,
      platformGroupId: row.platformGroupId,
      platformUserId: row.platformUserId,
      platformFileId: row.platformFileId,
      sourceKey: row.sourceKey,
      sourceIndex: row.sourceIndex,
      raw: row.raw,
      createdAt: row.createdAt.toISOString(),
    })),
    media_asset: mediaAssets.map((row): ExportMediaAsset => ({
      id: row.id,
      kind: row.kind,
      fileMd5: row.fileMd5,
      element: row.element,
      sourceId: row.sourceId,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    workspace_draft: workspaceDrafts.map((row): ExportWorkspaceDraft => ({
      id: row.id,
      title: row.title,
      tags: row.tags,
      elements: row.elements,
      assetIds: row.assetIds,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    tag: tags.map((row): ExportTag => ({
      name: row.name,
      visibility: row.visibility,
      scopes: row.scopes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    content_tag: contentTags.map((row): ExportContentTag => ({
      id: row.id,
      contentId: row.contentId,
      tag: row.tag,
      createdAt: row.createdAt.toISOString(),
    })),
    tag_alias: tagAliases.map((row): ExportTagAlias => ({
      alias: row.alias,
      tag: row.tag,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    audit_event: auditEvents.map((row): ExportAuditEvent => ({
      id: row.id,
      contentId: row.contentId,
      action: row.action,
      fromState: row.fromState,
      toState: row.toState,
      operatorPlatform: row.operatorPlatform,
      operatorUserId: row.operatorUserId,
      reason: row.reason,
      raw: row.raw,
      createdAt: row.createdAt.toISOString(),
    })),
    ingest_event: ingestEvents.map((row): ExportIngestEvent => ({
      id: row.id,
      source: row.source,
      status: row.status,
      platform: row.platform,
      platformEventId: row.platformEventId,
      payload: row.payload,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

async function collectObjectFiles(config: AppConfig): Promise<ObjectEntry[]> {
  const objectRoot = path.resolve(process.cwd(), config.filesDir, OBJECT_ENTRY_PREFIX);
  if (!fs.existsSync(objectRoot)) return [];
  const objects: ObjectEntry[] = [];

  async function walk(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.promises.stat(absolutePath);
      const relative = path.relative(path.resolve(process.cwd(), config.filesDir), absolutePath).replaceAll(path.sep, "/");
      objects.push({ storageKey: relative, absolutePath, sizeBytes: stat.size });
    }
  }

  await walk(objectRoot);
  return objects.sort((left, right) => left.storageKey.localeCompare(right.storageKey));
}

function tableSummaries(records: ExportRecords) {
  return tableNames.map((table) => ({ table, rows: records[table].length }));
}

function databaseRows(manifest: DataExportManifestDto) {
  return manifest.databaseRows;
}

function objectSizeBytes(manifest: DataExportManifestDto) {
  return manifest.objectSizeBytes;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeManifest(raw: unknown): DataExportManifestDto {
  const manifest = raw as ParsedManifest;
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new Error(`不支持的导出包版本：${manifest.schemaVersion ?? "未知"}`);
  const tables = (Array.isArray(manifest.tables) ? manifest.tables : []).map((table) => ({
    table: String(table.table ?? ""),
    rows: nonNegativeNumber(table.rows) ?? 0,
  }));
  const legacyObjects = Array.isArray(manifest.objects) ? manifest.objects : [];
  const databaseRows = nonNegativeNumber(manifest.databaseRows) ?? tables.reduce((sum, table) => sum + table.rows, 0);
  const objectCount = nonNegativeNumber(manifest.objectCount) ?? legacyObjects.length;
  const objectSizeBytes = nonNegativeNumber(manifest.objectSizeBytes) ?? legacyObjects.reduce((sum, object) => sum + (nonNegativeNumber(object.sizeBytes) ?? 0), 0);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(manifest.id ?? ""),
    name: String(manifest.name ?? "未命名导出"),
    createdAt: String(manifest.createdAt ?? nowIso()),
    databaseRows,
    objectCount,
    objectSizeBytes,
    tables,
  };
}

function jsonl(records: unknown[]) {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length > 0 ? "\n" : "");
}

async function writeZip(zipPath: string, records: ExportRecords, objects: ObjectEntry[], manifest: DataExportManifestDto, metadata: ExportZipMetadata) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    // 媒体文件通常已压缩，zip 只负责打包，避免二次压缩拖慢全量导出。
    const { comment, entry } = zipMetadataLayout(metadata);
    const archive = archiver("zip", { zlib: { level: 0 }, comment });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("warning", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: MANIFEST_ENTRY });
    if (entry) archive.append(entry, { name: METADATA_ENTRY });
    for (const table of tableNames) {
      archive.append(jsonl(records[table]), { name: `${DB_ENTRY_PREFIX}${table}.jsonl` });
    }
    for (const object of objects) {
      archive.file(object.absolutePath, { name: object.storageKey });
    }
    void archive.finalize().catch(reject);
  });
}

async function readDataExports(config: AppConfig): Promise<DataExportListItemDto[]> {
  await ensureExportsRoot(config);
  const files = await fs.promises.readdir(exportsRoot(config));
  const items: DataExportListItemDto[] = [];
  for (const file of files) {
    if (!file.endsWith(".zip")) continue;
    const id = file.slice(0, -".zip".length);
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(id)) continue;
    const sidecar = await readSidecarFromZip(config, id)
      .then((item) => (item ? withRuntimeStats(config, item) : undefined))
      .catch(() => undefined);
    if (sidecar) items.push(toListItem(sidecar));
  }
  for (const sidecar of activeExportJobs.values()) {
    items.push(toListItem(await withRuntimeStats(config, sidecar)));
  }
  return items;
}

async function readBackupCopies(directory: string, onlyId?: string) {
  const root = path.resolve(process.cwd(), directory);
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch((cause: unknown) => {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  });
  const copies = new Map<string, Array<{ file: string; createdAt: number }>>();
  const unchecked = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const [, timestamp, id] = BACKUP_COPY_NAME.exec(entry.name) ?? [];
    if (!timestamp || !id || (onlyId && onlyId !== id)) continue;
    const file = path.join(root, entry.name);
    const createdAt = await backupCopyCreatedAt(file, id, timestamp);
    if (createdAt === "unchecked") {
      unchecked.add(id);
      continue;
    }
    if (createdAt === undefined) continue;
    const existing = copies.get(id);
    const copy = { file, createdAt };
    if (existing) existing.push(copy);
    else copies.set(id, [copy]);
  }
  return { copies, unchecked };
}

async function readBackupCopyStatus(config: AppConfig, id?: string) {
  const copying = new Set(pendingBackupCopies);
  const scanned = await (config.scheduledBackup && readBackupCopies(config.scheduledBackup.directory, id).catch(() => undefined));
  return <T extends DataExportListItemDto>(item: T): T => {
    const present = scanned?.copies.has(item.id);
    if (item.source !== "scheduled" && (item.source || !present)) return item;
    const backupCopy = present ? "present" : copying.has(item.id) ? "copying" : !scanned || scanned.unchecked.has(item.id) ? "unknown" : "missing";
    return { ...item, source: "scheduled", backupCopy };
  };
}

export async function listDataExports(config: AppConfig): Promise<DataExportListItemDto[]> {
  const rows = await readDataExports(config);
  const items = rows.map(await readBackupCopyStatus(config));
  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getDataExport(config: AppConfig, id: string): Promise<DataExportDetailDto | undefined> {
  const sidecar = activeExportJobs.get(id) ?? (await readSidecarFromZip(config, id));
  if (!sidecar) return undefined;
  const withCopyStatus = await readBackupCopyStatus(config, id);
  return withPackageManifest(config, withCopyStatus(sidecar));
}

async function createDataExportSidecar(config: AppConfig, input: CreateDataExportDto, source: "manual" | "scheduled"): Promise<ExportSidecar> {
  await ensureExportsRoot(config);
  const id = nextSnowflakeId();
  const createdAt = nowIso();
  const name = normalizeName(input.name, `手动备份 ${createdAt.slice(0, 19).replace("T", " ")}`);
  const sidecar: ExportSidecar = {
    id,
    name,
    note: input.note,
    status: "running",
    source,
    schemaVersion: SCHEMA_VERSION,
    zipFileName: zipFileName(id),
    zipSizeBytes: 0,
    databaseRows: 0,
    objectCount: 0,
    objectSizeBytes: 0,
    createdAt,
    updatedAt: createdAt,
  };
  return sidecar;
}

export async function createDataExport(config: AppConfig, input: CreateDataExportDto): Promise<DataExportDetailDto> {
  const sidecar = await createDataExportSidecar(config, input, "manual");
  activeExportJobs.set(sidecar.id, sidecar);
  void runDataExportJob(config, sidecar);
  return withRuntimeStats(config, sidecar);
}

export async function createScheduledDataExport<T>(
  config: AppConfig,
  input: CreateDataExportDto,
  publish: (item: DataExportDetailDto) => Promise<T>,
): Promise<T> {
  const sidecar = await createDataExportSidecar(config, input, "scheduled");
  activeExportJobs.set(sidecar.id, sidecar);
  pendingBackupCopies.add(sidecar.id);
  try {
    const result = await runDataExportJob(config, sidecar);
    if (result.status === "failed") throw new Error(result.error ?? "导出失败");
    return await publish(result);
  } finally {
    pendingBackupCopies.delete(sidecar.id);
  }
}

async function runDataExportJob(config: AppConfig, sidecar: ExportSidecar): Promise<ExportSidecar> {
  const zip = dataExportZipPath(config, sidecar.id);
  const tempZip = `${zip}.tmp`;
  try {
    const [records, objects] = await Promise.all([readDatabaseRecords(), collectObjectFiles(config)]);
    const tables = tableSummaries(records);
    const manifest: DataExportManifestDto = {
      schemaVersion: SCHEMA_VERSION,
      id: sidecar.id,
      name: sidecar.name,
      createdAt: sidecar.createdAt,
      databaseRows: tables.reduce((sum, table) => sum + table.rows, 0),
      objectCount: objects.length,
      objectSizeBytes: objects.reduce((sum, object) => sum + object.sizeBytes, 0),
      tables,
    };
    const prepared: ExportSidecar = {
      ...sidecar,
      databaseRows: databaseRows(manifest),
      objectCount: manifest.objectCount,
      objectSizeBytes: objectSizeBytes(manifest),
      updatedAt: nowIso(),
    };
    activeExportJobs.set(sidecar.id, prepared);
    const metadata: ExportZipMetadata = { ...exportMetadata(prepared), status: "ready" };
    await writeZip(tempZip, records, objects, manifest, metadata);
    await fs.promises.rename(tempZip, zip);
    const stat = await fs.promises.stat(zip);
    const finishedAt = stat.mtime.toISOString();
    const ready: ExportSidecar = {
      ...sidecar,
      status: "ready",
      zipSizeBytes: stat.size,
      databaseRows: databaseRows(manifest),
      objectCount: manifest.objectCount,
      objectSizeBytes: objectSizeBytes(manifest),
      updatedAt: finishedAt,
      finishedAt,
    };
    activeExportJobs.delete(sidecar.id);
    return ready;
  } catch (cause) {
    await fs.promises.rm(tempZip, { force: true }).catch(() => undefined);
    const failedAt = nowIso();
    const failed: ExportSidecar = {
      ...sidecar,
      status: "failed",
      updatedAt: failedAt,
      finishedAt: failedAt,
      error: cause instanceof Error ? cause.message : "导出失败",
    };
    activeExportJobs.set(sidecar.id, failed);
    return failed;
  }
}

async function withArchiveMutation<T>(config: AppConfig, id: string, work: (zip: string) => Promise<T>): Promise<T> {
  const zip = dataExportZipPath(config, id);
  const previous = archiveMutations.get(zip);
  const task = (async () => {
    if (previous) await previous.catch(() => undefined);
    return work(zip);
  })();
  archiveMutations.set(zip, task);
  try {
    return await task;
  } finally {
    if (archiveMutations.get(zip) === task) archiveMutations.delete(zip);
  }
}

function isExportBusy(id: string) {
  return activeExportJobs.get(id)?.status === "running" || pendingBackupCopies.has(id);
}

function assertExportIdle(id: string) {
  if (isExportBusy(id)) throw Object.assign(new Error("备份正在生成或复制，请完成后再操作"), { statusCode: 409 });
}

async function persistArchiveMetadata(config: AppConfig, zip: string, item: ExportSidecar, legacy: ExportSidecar | undefined) {
  await rewriteZipMetadata(zip, exportMetadata(item));
  if (legacy) await fs.promises.rm(legacySidecarPath(config, item.id), { force: true });
}

export async function updateDataExport(config: AppConfig, id: string, input: UpdateDataExportDto): Promise<DataExportDetailDto | undefined> {
  return withArchiveMutation(config, id, async (zip) => {
    assertExportIdle(id);
    const legacy = await readLegacyExportIndex(config, id);
    const sidecar = await readSidecarFromZip(config, id, legacy ?? null);
    if (!sidecar) return undefined;
    const updated: ExportSidecar = {
      ...sidecar,
      name: normalizeName(input.name, sidecar.name),
      note: input.note === undefined ? sidecar.note : input.note,
      updatedAt: nowIso(),
    };
    await persistArchiveMetadata(config, zip, updated, legacy);
    const withBackupStatus = await readBackupCopyStatus(config, id);
    return withPackageManifest(config, withBackupStatus(updated));
  });
}

async function removeDataExport(config: AppConfig, id: string, zip: string) {
  activeExportJobs.delete(id);
  await Promise.all([
    fs.promises.rm(zip, { force: true }),
    fs.promises.rm(`${zip}.tmp`, { force: true }),
    fs.promises.rm(`${zip}.upload.tmp`, { force: true }),
    fs.promises.rm(legacySidecarPath(config, id), { force: true }),
  ]);
}

export async function deleteDataExport(config: AppConfig, id: string) {
  await withArchiveMutation(config, id, async (zip) => {
    assertExportIdle(id);
    await removeDataExport(config, id, zip);
  });
}

export async function openDataExportDownload(config: AppConfig, id: string) {
  return withArchiveMutation(config, id, async (zip) => {
    const active = activeExportJobs.get(id);
    if (active && active.status !== "ready") return { status: "not-ready" } as const;
    const legacy = await readLegacyExportIndex(config, id);
    const sidecar = await readSidecarFromZip(config, id, legacy ?? null);
    if (!sidecar) return { status: "missing" } as const;
    if (sidecar.status !== "ready") return { status: "not-ready" } as const;
    // 旧版备注只存在于旁置索引。下载前先把它写进 ZIP，迁移时只需要这一个文件。
    if (legacy) await persistArchiveMetadata(config, zip, sidecar, legacy);
    const file = await fs.promises.open(zip, "r");
    try {
      const { size } = await file.stat();
      return { status: "ready", size, fileName: sidecar.zipFileName, stream: file.createReadStream() } as const;
    } catch (cause) {
      await file.close();
      throw cause;
    }
  });
}

async function backupCopyCreatedAt(file: string, id: string, timestamp: string) {
  try {
    const metadata = await readMetadataFromZip(file);
    if (metadata?.source) {
      if (metadata.source === "scheduled" && metadata.id === id) return dateMs(metadata.createdAt) ?? "unchecked";
      return undefined;
    }
    // 旧调度器在包内留下固定名称；单凭目录文件名和 ID 无法区分旧手动导出。
    const manifest = await readManifestFromZip(file);
    if (manifest.id === id && manifest.name === `定时备份 ${timestamp}`) return dateMs(manifest.createdAt) ?? "unchecked";
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") return "unchecked";
  }
}

export async function pruneScheduledDataExports(config: AppConfig, directory: string, keepId: string, cutoff: number) {
  const { copies, unchecked } = await readBackupCopies(directory);
  const items = await readDataExports(config);
  const failures: unknown[] = [];

  for (const item of items) {
    const candidates = copies.get(item.id);
    copies.delete(item.id);
    if (item.id === keepId || isExportBusy(item.id) || unchecked.has(item.id)) continue;
    if (!(Date.parse(item.createdAt) < cutoff) || (item.source && item.source !== "scheduled")) continue;
    const targets = candidates?.filter((copy) => copy.createdAt < cutoff) ?? [];
    if (item.source !== "scheduled" && !targets.length) continue;
    try {
      await withArchiveMutation(config, item.id, async (zip) => {
        if (isExportBusy(item.id)) return;
        const current = await readSidecarFromZip(config, item.id);
        if (current && (!(Date.parse(current.createdAt) < cutoff) || (current.source && current.source !== "scheduled"))) return;
        await removeDataExport(config, item.id, zip);
        for (const { file } of targets) await removeCopy(file);
      });
    } catch (cause) {
      failures.push(cause);
    }
  }
  for (const [id, files] of copies) {
    if (id === keepId || unchecked.has(id)) continue;
    for (const { file, createdAt } of files) if (createdAt < cutoff) await removeCopy(file);
  }

  async function removeCopy(file: string) {
    try {
      await fs.promises.rm(file, { force: true });
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length) throw new AggregateError(failures, "清理过期自动备份失败");
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function openZip(zipPath: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error) reject(normalizeZipError(error));
      else if (!zipFile) reject(new Error("无法打开 zip 文件"));
      else resolve(zipFile);
    });
  });
}

function normalizeZipError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes("End of central directory record signature not found")) {
    return new Error("导出 zip 文件不完整或已被截断，请重新下载或重新上传完整文件");
  }
  return cause instanceof Error ? cause : new Error(message);
}

function openEntryStream(zipFile: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Readable>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else if (!stream) reject(new Error("无法读取 zip 条目"));
      else resolve(stream);
    });
  });
}

async function readZipEntryBuffer(zipPath: string, entryName: string): Promise<Buffer | undefined> {
  const zipFile = await openZip(zipPath);
  return new Promise<Buffer | undefined>((resolve, reject) => {
    let settled = false;
    function finish(value: Buffer | undefined) {
      if (settled) return;
      settled = true;
      zipFile.close();
      resolve(value);
    }
    function fail(cause: unknown) {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(cause);
    }

    zipFile.readEntry();
    zipFile.on("entry", (entry) => {
      if (entry.fileName !== entryName) {
        zipFile.readEntry();
        return;
      }
      openEntryStream(zipFile, entry)
        .then(streamToBuffer)
        .then((buffer) => finish(buffer))
        .catch(fail);
    });
    zipFile.on("end", () => finish(undefined));
    zipFile.on("error", (cause) => fail(normalizeZipError(cause)));
  });
}

async function readZipComment(zipPath: string): Promise<string> {
  const zipFile = await openZip(zipPath);
  const comment = zipFile.comment;
  zipFile.close();
  return comment;
}

export async function readManifestFromZip(zipPath: string): Promise<DataExportManifestDto> {
  const buffer = await readZipEntryBuffer(zipPath, MANIFEST_ENTRY);
  if (!buffer) throw new Error("导出包缺少 manifest.json");
  return normalizeManifest(JSON.parse(buffer.toString("utf8")));
}

async function readMetadataFromZip(zipPath: string): Promise<ExportZipMetadata | undefined> {
  const metadata = parseZipComment(await readZipComment(zipPath));
  if (metadata) return metadata;
  const buffer = await readZipEntryBuffer(zipPath, METADATA_ENTRY);
  return buffer ? parseZipComment(buffer.toString("utf8")) : undefined;
}

async function readSidecarFromZip(config: AppConfig, id: string, checkedLegacy?: ExportSidecar | null): Promise<ExportSidecar | undefined> {
  assertSafeExportId(id);
  const zip = dataExportZipPath(config, id);
  const stat = await fs.promises.stat(zip).catch((cause) => {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  });
  if (!stat?.isFile()) return undefined;
  const metadata = await readMetadataFromZip(zip);
  if (metadata?.id === id) return sidecarFromMetadata(id, metadata, stat);
  const manifest = await readManifestFromZip(zip);
  const fallback = sidecarFromManifest(id, manifest, stat);
  const legacy = checkedLegacy === undefined ? await readLegacyExportIndex(config, id) : checkedLegacy;
  const uploaded = manifest.id !== id;
  return {
    ...fallback,
    source: uploaded ? "upload" : undefined,
    name: normalizeName(legacy?.name, fallback.name),
    note: legacy?.note ?? (typeof metadata?.note === "string" ? metadata.note : undefined),
    createdAt: legacy?.createdAt ?? (uploaded ? fallback.updatedAt : fallback.createdAt),
    updatedAt: legacy?.updatedAt ?? fallback.updatedAt,
    finishedAt: legacy?.finishedAt ?? fallback.finishedAt,
  };
}

async function rewriteZipEntries(sourceZipPath: string, targetZipPath: string, metadata: ExportZipMetadata, manifest?: DataExportManifestDto) {
  const { comment, entry: metadataEntry } = zipMetadataLayout(metadata);
  const zipFile = await openZip(sourceZipPath);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(targetZipPath);
    const archive = archiver("zip", { zlib: { level: 0 }, comment });
    let settled = false;

    function fail(cause: unknown) {
      if (settled) return;
      settled = true;
      zipFile.close();
      output.destroy();
      reject(normalizeZipError(cause));
    }

    output.on("close", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    output.on("error", fail);
    archive.on("warning", fail);
    archive.on("error", fail);
    archive.pipe(output);
    if (manifest) archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: MANIFEST_ENTRY });
    if (metadataEntry) archive.append(metadataEntry, { name: METADATA_ENTRY });

    zipFile.readEntry();
    zipFile.on("entry", (entry) => {
      if (entry.fileName.endsWith("/") || entry.fileName === METADATA_ENTRY || (manifest && entry.fileName === MANIFEST_ENTRY)) {
        zipFile.readEntry();
        return;
      }
      openEntryStream(zipFile, entry)
        .then((stream) => {
          stream.on("end", () => zipFile.readEntry());
          stream.on("error", fail);
          archive.append(stream, { name: entry.fileName });
        })
        .catch(fail);
    });
    zipFile.on("end", () => { void archive.finalize().catch(fail); });
    zipFile.on("error", fail);
  });
}

async function rewriteZipMetadata(zipPath: string, metadata: ExportZipMetadata) {
  const tempZip = `${zipPath}.rewrite-${process.pid}-${Date.now()}.tmp`;
  try {
    await rewriteZipEntries(zipPath, tempZip, metadata);
    await fs.promises.rename(tempZip, zipPath);
  } catch (cause) {
    await fs.promises.rm(tempZip, { force: true }).catch(() => undefined);
    throw cause;
  }
}

export async function saveUploadedDataExport(
  config: AppConfig,
  input: { filename?: string; stream: NodeJS.ReadableStream },
): Promise<DataExportDetailDto> {
  await ensureExportsRoot(config);
  const id = nextSnowflakeId();
  const zip = dataExportZipPath(config, id);
  const tempZip = `${zip}.upload.tmp`;
  const normalizedZip = `${zip}.normalized.tmp`;

  try {
    await pipeline(input.stream, fs.createWriteStream(tempZip));
    if ((input.stream as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      throw new Error("上传 zip 超过限制或传输被截断，请重新上传完整文件");
    }
    const sourceManifest = await readManifestFromZip(tempZip);
    const sourceMetadata = await readMetadataFromZip(tempZip);
    const createdAt = nowIso();
    const name = normalizeName(
      typeof sourceMetadata?.name === "string" ? sourceMetadata.name : sourceManifest.name,
      sourceManifest.name || input.filename || `上传导出 ${createdAt.slice(0, 19).replace("T", " ")}`,
    );
    const manifest: DataExportManifestDto = {
      ...sourceManifest,
      id,
      name,
    };
    const metadata: ExportZipMetadata = {
      id,
      name,
      note: typeof sourceMetadata?.note === "string" ? sourceMetadata.note : undefined,
      source: "upload",
      status: "ready",
      schemaVersion: manifest.schemaVersion,
      databaseRows: databaseRows(manifest),
      objectCount: manifest.objectCount,
      objectSizeBytes: objectSizeBytes(manifest),
      createdAt,
      updatedAt: createdAt,
      finishedAt: createdAt,
    };
    await rewriteZipEntries(tempZip, normalizedZip, metadata, manifest);
    await fs.promises.rename(normalizedZip, zip);
    await fs.promises.rm(tempZip, { force: true }).catch(() => undefined);
    const stat = await fs.promises.stat(zip);
    return withPackageManifest(config, sidecarFromMetadata(id, metadata, stat));
  } catch (cause) {
    await fs.promises.rm(tempZip, { force: true }).catch(() => undefined);
    await fs.promises.rm(normalizedZip, { force: true }).catch(() => undefined);
    throw normalizeZipError(cause);
  }
}

export function isSafeZipEntryName(name: string) {
  return (
    !!name &&
    !name.includes("\\") &&
    !name.startsWith("/") &&
    !name.match(/^[A-Za-z]:/) &&
    !name.split("/").some((part) => part === ".." || part === "")
  );
}

function objectMd5FromStorageKey(storageKey: string) {
  const basename = storageKey.split("/").at(-1) ?? "";
  return basename.match(/^([0-9a-f]{32})(?:\.[A-Za-z0-9]+)?$/)?.[1];
}

async function hashFileMd5(file: string) {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function copyObjectEntry(config: AppConfig, zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<DataImportResultDto["files"] & { conflicts: string[] }> {
  const empty = { copied: 0, skipped: 0, conflicted: 0, conflicts: [] as string[] };
  if (!isSafeZipEntryName(entry.fileName) || !entry.fileName.startsWith(OBJECT_ENTRY_PREFIX)) {
    return { ...empty, conflicted: 1, conflicts: [`非法对象路径：${entry.fileName}`] };
  }

  const filesDir = path.resolve(process.cwd(), config.filesDir);
  const target = path.resolve(filesDir, entry.fileName);
  if (!isInside(filesDir, target)) return { ...empty, conflicted: 1, conflicts: [`对象路径越界：${entry.fileName}`] };

  const expectedMd5 = objectMd5FromStorageKey(entry.fileName);
  if (fs.existsSync(target)) {
    if (expectedMd5) {
      const actualMd5 = await hashFileMd5(target);
      if (actualMd5 !== expectedMd5) return { ...empty, conflicted: 1, conflicts: [`本地对象文件校验失败：${entry.fileName}`] };
    }
    return { ...empty, skipped: 1 };
  }

  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const tempTarget = `${target}.import-${Date.now()}.tmp`;
  const hash = expectedMd5 ? crypto.createHash("md5") : undefined;
  const stream = await openEntryStream(zipFile, entry);
  stream.on("data", (chunk: Buffer) => hash?.update(chunk));
  await pipeline(stream, fs.createWriteStream(tempTarget));
  const actualMd5 = hash?.digest("hex");
  if (expectedMd5 && actualMd5 !== expectedMd5) {
    await fs.promises.rm(tempTarget, { force: true }).catch(() => undefined);
    return { ...empty, conflicted: 1, conflicts: [`导入对象文件校验失败：${entry.fileName}`] };
  }
  await fs.promises.rename(tempTarget, target);
  return { ...empty, copied: 1 };
}

async function loadBundleAndCopyObjects(config: AppConfig, zipPath: string): Promise<LoadedBundle> {
  const records = initRecords();
  let manifest: DataExportManifestDto | undefined;
  const files = { copied: 0, skipped: 0, conflicted: 0 };
  const conflicts: string[] = [];
  const zipFile = await openZip(zipPath);

  await new Promise<void>((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on("entry", (entry) => {
      const run = async () => {
        if (entry.fileName.endsWith("/")) return;
        if (entry.fileName === MANIFEST_ENTRY) {
          const buffer = await streamToBuffer(await openEntryStream(zipFile, entry));
          manifest = normalizeManifest(JSON.parse(buffer.toString("utf8")));
          return;
        }
        if (entry.fileName.startsWith(DB_ENTRY_PREFIX)) {
          if (!isSafeZipEntryName(entry.fileName)) throw new Error(`非法数据库条目路径：${entry.fileName}`);
          if (!entry.fileName.endsWith(".jsonl")) return;
          const table = entry.fileName.slice(DB_ENTRY_PREFIX.length, -".jsonl".length) as TableName;
          if (!tableNames.includes(table)) return;
          const buffer = await streamToBuffer(await openEntryStream(zipFile, entry));
          records[table] = buffer
            .toString("utf8")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line) as unknown);
          return;
        }
        if (entry.fileName.startsWith(OBJECT_ENTRY_PREFIX)) {
          const result = await copyObjectEntry(config, zipFile, entry);
          files.copied += result.copied;
          files.skipped += result.skipped;
          files.conflicted += result.conflicted;
          conflicts.push(...result.conflicts);
        }
      };

      run()
        .then(() => zipFile.readEntry())
        .catch((cause) => {
          zipFile.close();
          reject(cause);
        });
    });
    zipFile.on("end", resolve);
    zipFile.on("error", (cause) => reject(normalizeZipError(cause)));
  });
  zipFile.close();
  if (!manifest) throw new Error("导出包缺少 manifest.json");
  return { manifest, records, files, conflicts };
}

function resolveMappedId(map: Map<string, string>, id: string | null | undefined) {
  if (!id) return null;
  return map.get(id) ?? null;
}

function importConflictPolicy(input: ImportDataExportDto | undefined): DataImportConflictPolicy {
  return input?.conflictPolicy === "overwrite" ? "overwrite" : "keep_local";
}

async function importDatabaseRecords(bundle: LoadedBundle, conflictPolicy: DataImportConflictPolicy) {
  const tables = initImportTables();
  const conflicts = [...bundle.conflicts];
  const contentIdMap = new Map<string, string>();
  const sourceIdMap = new Map<string, string>();
  const affectedContentIds = new Set<string>();

  for (const row of rows<ExportMediaFile>(bundle.records, "media_file")) {
    const existing = await prisma.mediaFile.findUnique({ where: { md5: row.md5 } });
    if (existing && conflictPolicy === "keep_local") {
      tables.media_file.skipped++;
      continue;
    }
    const data = {
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      format: row.format,
      sizeBytes: BigInt(row.sizeBytes),
      width: row.width,
      height: row.height,
      durationSeconds: row.durationSeconds == null ? null : new Prisma.Decimal(row.durationSeconds),
      metadata: jsonInput(row.metadata),
      createdAt: new Date(row.createdAt),
    };
    if (existing) {
      await prisma.mediaFile.update({ where: { md5: row.md5 }, data });
      tables.media_file.updated++;
    } else {
      await prisma.mediaFile.create({ data: { md5: row.md5, ...data } });
      tables.media_file.created++;
    }
  }

  for (const row of rows<ExportTag>(bundle.records, "tag")) {
    const existing = await prisma.tag.findUnique({ where: { name: row.name } });
    if (existing && conflictPolicy === "keep_local") {
      tables.tag.skipped++;
      continue;
    }
    const data = {
      ...tagScopeData(row.visibility === "public" ? "public" : "private", row.scopes ?? (row.scope ? [row.scope] : undefined)),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
    if (existing) {
      await prisma.tag.update({ where: { name: row.name }, data });
      tables.tag.updated++;
    } else {
      await prisma.tag.create({ data: { name: row.name, ...data } });
      tables.tag.created++;
    }
  }

  for (const row of rows<ExportTagAlias>(bundle.records, "tag_alias")) {
    const existing = await prisma.tagAlias.findUnique({ where: { alias: row.alias } });
    if (existing && existing.tag !== row.tag && conflictPolicy === "keep_local") {
      tables.tag_alias.conflicted++;
      conflicts.push(`tag_alias 冲突：${row.alias} 本地=${existing.tag} 导入=${row.tag}`);
      continue;
    }
    const data = { tag: row.tag, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
    if (existing) {
      if (existing.tag === row.tag && conflictPolicy === "keep_local") {
        tables.tag_alias.skipped++;
      } else {
        await prisma.tagAlias.update({ where: { alias: row.alias }, data });
        tables.tag_alias.updated++;
      }
    } else {
      await prisma.tagAlias.create({ data: { alias: row.alias, ...data } });
      tables.tag_alias.created++;
    }
  }

  for (const row of rows<ExportMediaContent>(bundle.records, "media_content")) {
    const existingById = await prisma.mediaContent.findUnique({ where: { id: row.id } });
    const existingBySign = await prisma.mediaContent.findUnique({ where: { sign: row.sign } });
    const existing = existingById ?? existingBySign;
    const elements = jsonArrayInput(row.elements);
    const data = {
      type: row.type,
      title: row.title,
      tags: row.tags,
      elements,
      sign: row.sign,
      auditState: row.auditState,
      likeCount: BigInt(row.likeCount),
      metadata: jsonInput(row.metadata),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };

    if (existing) {
      contentIdMap.set(row.id, existing.id);
      affectedContentIds.add(existing.id);
      if (conflictPolicy === "overwrite" && existing.sign === row.sign) {
        await prisma.mediaContent.update({ where: { id: existing.id }, data });
        await replaceMediaFileReferences(prisma, "media_content", existing.id, collectFileReferencesFromElements(elements));
        tables.media_content.updated++;
      } else {
        if (existingById && existingById.sign !== row.sign && !existingBySign) {
          tables.media_content.conflicted++;
          conflicts.push(`media_content ID 冲突：${row.id}`);
        } else {
          tables.media_content.skipped++;
        }
      }
      continue;
    }

    await prisma.mediaContent.create({ data: { id: row.id, ...data } });
    await replaceMediaFileReferences(prisma, "media_content", row.id, collectFileReferencesFromElements(elements));
    contentIdMap.set(row.id, row.id);
    affectedContentIds.add(row.id);
    tables.media_content.created++;
  }

  for (const row of rows<ExportSourceBinding>(bundle.records, "source_binding")) {
    const contentId = resolveMappedId(contentIdMap, row.contentId);
    if (row.contentId && !contentId) {
      tables.source_binding.conflicted++;
      conflicts.push(`source_binding 缺少内容映射：${row.id}`);
      continue;
    }
    const existingByUnique = await prisma.sourceBinding.findFirst({
      where: { platform: row.platform, platformMessageId: row.platformMessageId, sourceKey: row.sourceKey },
    });
    const existingById = await prisma.sourceBinding.findUnique({ where: { id: row.id } });
    const existing = existingByUnique ?? existingById;
    const data = {
      contentId,
      platform: row.platform,
      platformMessageId: row.platformMessageId,
      platformGroupId: row.platformGroupId,
      platformUserId: row.platformUserId,
      platformFileId: row.platformFileId,
      sourceKey: row.sourceKey,
      sourceIndex: row.sourceIndex,
      raw: jsonInput(row.raw),
      createdAt: new Date(row.createdAt),
    };
    if (existing) {
      sourceIdMap.set(row.id, existing.id);
      if (conflictPolicy === "overwrite" || (!existing.contentId && contentId)) {
        await prisma.sourceBinding.update({ where: { id: existing.id }, data });
        tables.source_binding.updated++;
      } else {
        tables.source_binding.skipped++;
      }
    } else {
      await prisma.sourceBinding.create({ data: { id: row.id, ...data } });
      sourceIdMap.set(row.id, row.id);
      tables.source_binding.created++;
    }
  }

  for (const row of rows<ExportMediaAsset>(bundle.records, "media_asset")) {
    const existing = await prisma.mediaAsset.findUnique({ where: { id: row.id } });
    const fileMd5 = row.fileMd5 && (await prisma.mediaFile.findUnique({ where: { md5: row.fileMd5 } })) ? row.fileMd5 : null;
    const sourceId = resolveMappedId(sourceIdMap, row.sourceId);
    const element = jsonInput(row.element);
    const data = {
      kind: row.kind,
      fileMd5,
      element,
      sourceId,
      status: row.status,
      metadata: jsonInput(row.metadata),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
    if (existing) {
      if (conflictPolicy === "overwrite") {
        await prisma.mediaAsset.update({ where: { id: row.id }, data });
        await replaceMediaFileReferences(prisma, "media_asset", row.id, assetFileReferences({ fileMd5, element, kind: row.kind }));
        tables.media_asset.updated++;
      } else {
        tables.media_asset.skipped++;
      }
    } else {
      await prisma.mediaAsset.create({ data: { id: row.id, ...data } });
      await replaceMediaFileReferences(prisma, "media_asset", row.id, assetFileReferences({ fileMd5, element, kind: row.kind }));
      tables.media_asset.created++;
    }
  }

  for (const row of rows<ExportWorkspaceDraft>(bundle.records, "workspace_draft")) {
    const existing = await prisma.workspaceDraft.findUnique({ where: { id: row.id } });
    const elements = jsonArrayInput(row.elements);
    const data = {
      title: row.title,
      tags: row.tags,
      elements,
      assetIds: row.assetIds,
      status: row.status,
      metadata: jsonInput(row.metadata),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
    if (existing) {
      if (conflictPolicy === "overwrite") {
        await prisma.workspaceDraft.update({ where: { id: row.id }, data });
        await replaceMediaFileReferences(prisma, "workspace_draft", row.id, collectFileReferencesFromElements(elements));
        tables.workspace_draft.updated++;
      } else {
        tables.workspace_draft.skipped++;
      }
    } else {
      await prisma.workspaceDraft.create({ data: { id: row.id, ...data } });
      await replaceMediaFileReferences(prisma, "workspace_draft", row.id, collectFileReferencesFromElements(elements));
      tables.workspace_draft.created++;
    }
  }

  for (const row of rows<ExportContentTag>(bundle.records, "content_tag")) {
    const contentId = resolveMappedId(contentIdMap, row.contentId);
    if (!contentId) {
      tables.content_tag.conflicted++;
      conflicts.push(`content_tag 缺少内容映射：${row.id}`);
      continue;
    }
    const existing = await prisma.contentTag.findFirst({ where: { contentId, tag: row.tag } });
    if (existing) {
      tables.content_tag.skipped++;
      continue;
    }
    const existingId = await prisma.contentTag.findUnique({ where: { id: row.id } });
    await prisma.contentTag.create({
      data: { id: existingId ? nextSnowflakeId() : row.id, contentId, tag: row.tag, createdAt: new Date(row.createdAt) },
    });
    tables.content_tag.created++;
  }

  for (const row of rows<ExportAuditEvent>(bundle.records, "audit_event")) {
    const contentId = resolveMappedId(contentIdMap, row.contentId);
    if (!contentId) {
      tables.audit_event.conflicted++;
      conflicts.push(`audit_event 缺少内容映射：${row.id}`);
      continue;
    }
    const existing = await prisma.auditEvent.findUnique({ where: { id: row.id } });
    if (existing) {
      tables.audit_event.skipped++;
      continue;
    }
    await prisma.auditEvent.create({
      data: {
        id: row.id,
        contentId,
        action: row.action,
        fromState: row.fromState,
        toState: row.toState,
        operatorPlatform: row.operatorPlatform,
        operatorUserId: row.operatorUserId,
        reason: row.reason,
        raw: jsonInput(row.raw),
        createdAt: new Date(row.createdAt),
      },
    });
    tables.audit_event.created++;
  }

  for (const row of rows<ExportContentLike>(bundle.records, "content_like")) {
    const contentId = resolveMappedId(contentIdMap, row.contentId);
    if (!contentId) {
      tables.content_like.conflicted++;
      conflicts.push(`content_like 缺少内容映射：${row.id}`);
      continue;
    }
    const likeDate = new Date(row.likeDate);
    const existing = await prisma.contentLike.findFirst({ where: { contentId, source: row.source, likeDate } });
    if (existing) {
      tables.content_like.skipped++;
      affectedContentIds.add(contentId);
      continue;
    }
    const existingId = await prisma.contentLike.findUnique({ where: { id: row.id } });
    await prisma.contentLike.create({
      data: { id: existingId ? nextSnowflakeId() : row.id, contentId, source: row.source, likeDate, createdAt: new Date(row.createdAt) },
    });
    affectedContentIds.add(contentId);
    tables.content_like.created++;
  }

  for (const row of rows<ExportIngestEvent>(bundle.records, "ingest_event")) {
    const existing = await prisma.ingestEvent.findUnique({ where: { id: row.id } });
    const data = {
      source: row.source,
      status: row.status,
      platform: row.platform,
      platformEventId: row.platformEventId,
      payload: jsonInput(row.payload),
      error: row.error,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
    if (existing) {
      if (conflictPolicy === "overwrite") {
        await prisma.ingestEvent.update({ where: { id: row.id }, data });
        tables.ingest_event.updated++;
      } else {
        tables.ingest_event.skipped++;
      }
    } else {
      await prisma.ingestEvent.create({ data: { id: row.id, ...data } });
      tables.ingest_event.created++;
    }
  }

  for (const contentId of affectedContentIds) {
    const likeCount = await prisma.contentLike.count({ where: { contentId } });
    await prisma.mediaContent.update({ where: { id: contentId }, data: { likeCount: BigInt(likeCount) } }).catch(() => undefined);
  }

  return { tables, conflicts };
}

export async function importDataExport(config: AppConfig, id: string, input?: ImportDataExportDto): Promise<DataImportResultDto> {
  const sidecar = await getDataExport(config, id);
  if (!sidecar) throw new Error("导出记录不存在");
  if (sidecar.status !== "ready") throw new Error("只能导入已完成的导出包");
  const conflictPolicy = importConflictPolicy(input);
  const zipPath = dataExportZipPath(config, id);
  if ((await fileSize(zipPath)) <= 0) throw new Error("导出 zip 文件不存在或为空，无法导入");
  const bundle = await loadBundleAndCopyObjects(config, zipPath);
  const database = await importDatabaseRecords(bundle, conflictPolicy);
  return {
    exportId: id,
    conflictPolicy,
    files: bundle.files,
    tables: database.tables,
    conflicts: database.conflicts,
  };
}
