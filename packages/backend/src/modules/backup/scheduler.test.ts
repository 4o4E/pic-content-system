import archiver from "archiver";
import type { DataExportDetailDto } from "@pic/shared";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../config/env.js";
import { dataExportZipPath, listDataExports } from "../export/export-service.js";
import { formatScheduledBackupTimestamp, registerScheduledBackup, runScheduledBackup } from "./scheduler.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pic-backup-test-"));
  tempDirs.push(dir);
  return dir;
}

function baseConfig(filesDir: string, backupDir?: string): AppConfig {
  return {
    port: 0,
    filesDir,
    accessToken: "token",
    frontendDistDir: "not-exists",
    maxRequestBodyBytes: 1024 * 1024,
    ...(backupDir ? { scheduledBackup: { directory: backupDir, cron: "0 3 * * *" } } : {}),
  };
}

async function writeArchive(config: AppConfig, id: string, date: Date, source?: DataExportDetailDto["source"], backupDir?: string, name = id) {
  const createdAt = date.toISOString();
  const manifest = { id, name, schemaVersion: 1, databaseRows: 0, objectCount: 0, objectSizeBytes: 0, tables: [], createdAt };
  const metadata = { ...manifest, source, status: "ready" as const, updatedAt: createdAt, finishedAt: createdAt };
  const file = dataExportZipPath(config, id);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const zip = archiver("zip", { comment: JSON.stringify(metadata) });
  const written = pipeline(zip, fs.createWriteStream(file));
  zip.append(JSON.stringify(manifest), { name: "manifest.json" });
  await Promise.all([zip.finalize(), written]);
  if (backupDir) {
    const target = path.join(backupDir, `pic-content-backup-${formatScheduledBackupTimestamp(date)}-${id}.zip`);
    await fs.promises.copyFile(file, target);
    await fs.promises.utimes(target, date, date);
  }
  const stat = await fs.promises.stat(file);
  return { ...metadata, zipFileName: `${id}.zip`, zipSizeBytes: stat.size };
}

describe("scheduled backup", () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("格式化本地备份时间戳", () => {
    expect(formatScheduledBackupTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("20260102-030405");
  });

  it("未启用时不执行备份", async () => {
    await expect(runScheduledBackup(baseConfig(await makeTempDir()))).resolves.toBeUndefined();
  });

  it("cron 表达式无效时拒绝启动", async () => {
    const config = baseConfig(await makeTempDir(), await makeTempDir());
    config.scheduledBackup = { directory: config.scheduledBackup?.directory ?? "", cron: "bad cron" };

    expect(() => registerScheduledBackup({} as FastifyInstance, config)).toThrow("BACKUP_CRON");
  });

  it("落盘成功后清理超期自动备份，保留边界、手动归档和外来文件", async () => {
    const backupDir = await makeTempDir();
    const config = baseConfig(await makeTempDir(), backupDir);
    const now = new Date(2026, 0, 22, 3, 4, 5);
    const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const expired = new Date(cutoff.getTime() - 60_000);
    await writeArchive(config, "expired-auto", expired, "scheduled", backupDir);
    await writeArchive(config, "expired-legacy", expired, undefined, backupDir, `定时备份 ${formatScheduledBackupTimestamp(expired)}`);
    await writeArchive(config, "not-copied", expired, "scheduled");
    await writeArchive(config, "at-cutoff", cutoff, "scheduled", backupDir);
    await writeArchive(config, "unchecked", expired, "scheduled");
    const unchecked = `pic-content-backup-${formatScheduledBackupTimestamp(expired)}-unchecked.zip`;
    await fs.promises.writeFile(path.join(backupDir, unchecked), "unreadable archive");
    await writeArchive(config, "manual", expired, "manual");
    await writeArchive(config, "upload", expired, "upload");
    await writeArchive(config, "legacy-manual", expired);
    const oldManual = await writeArchive(config, "legacy-matching-id", expired, undefined, backupDir);
    const localUploadId = "legacy-local-upload";
    const foreign = await writeArchive(config, "remote-auto", expired, "scheduled");
    await fs.promises.rename(dataExportZipPath(config, foreign.id), dataExportZipPath(config, localUploadId));
    await fs.promises.writeFile(path.join(config.filesDir, "exports", `${localUploadId}.json`), JSON.stringify({
      ...foreign, source: undefined, id: localUploadId, name: "从别的实例上传", createdAt: now.toISOString(),
    }));
    await writeArchive(config, "external-only", expired, "scheduled", backupDir);
    await fs.promises.unlink(dataExportZipPath(config, "external-only"));
    await fs.promises.writeFile(path.join(backupDir, "other.zip"), "manual file");
    const foreignPath = `pic-content-backup-${formatScheduledBackupTimestamp(expired)}-legacy-manual.zip`;
    await fs.promises.copyFile(dataExportZipPath(config, "manual"), path.join(backupDir, foreignPath));
    const renamedManual = `pic-content-backup-${formatScheduledBackupTimestamp(expired)}-manual.zip`;
    await fs.promises.rename(
      dataExportZipPath(config, "manual"),
      path.join(backupDir, renamedManual),
    );
    await writeArchive(config, "another-manual", expired, "manual");

    const result = await runScheduledBackup(config, {
      now,
      createExport: async (_config, _input, publish) => publish(await writeArchive(config, "latest", now, "scheduled")),
    });

    expect(result?.cleanupError).toBeUndefined();
    expect(path.basename(result!.targetFile)).toBe("pic-content-backup-20260122-030405-latest.zip");
    const [source, target] = await Promise.all([fs.promises.readFile(result!.sourceFile), fs.promises.readFile(result!.targetFile)]);
    expect(target.equals(source)).toBe(true);
    expect((await fs.promises.readdir(backupDir)).sort()).toEqual([
      "other.zip",
      foreignPath,
      `pic-content-backup-${formatScheduledBackupTimestamp(expired)}-${oldManual.id}.zip`,
      renamedManual,
      unchecked,
      `pic-content-backup-${formatScheduledBackupTimestamp(cutoff)}-at-cutoff.zip`,
      "pic-content-backup-20260122-030405-latest.zip",
    ]);
    const items = await listDataExports(config);
    expect(items.map((item) => item.id).sort()).toEqual([
      "another-manual", "at-cutoff", "latest", "legacy-local-upload", "legacy-manual", "legacy-matching-id", "unchecked", "upload",
    ]);
    expect(items.find((item) => item.id === localUploadId)).toMatchObject({
      source: "upload", name: "从别的实例上传", createdAt: now.toISOString(),
    });
    for (const id of ["legacy-manual", oldManual.id]) expect(items.find((item) => item.id === id)?.backupCopy).toBeUndefined();
    expect(items.find((item) => item.id === "unchecked")).toMatchObject({ backupCopy: "unknown" });
    expect(items.find((item) => item.id === "latest")).toMatchObject({ status: "ready", source: "scheduled", backupCopy: "present" });
  });

  it("新副本写入失败时保留旧备份，并且新 ZIP 不会显示成已落盘", async () => {
    const backupDir = await makeTempDir();
    const config = baseConfig(await makeTempDir(), backupDir);
    const now = new Date(2026, 0, 22, 3, 4, 5);
    const older = new Date(2026, 0, 1, 3, 4, 5);
    await writeArchive(config, "existing", older, "scheduled", backupDir);
    const blocked = "pic-content-backup-20260122-030405-blocked.zip";
    await fs.promises.mkdir(path.join(backupDir, blocked));

    await expect(runScheduledBackup(config, {
      now,
      createExport: async (_config, _input, publish) => publish(await writeArchive(config, "blocked", now, "scheduled")),
    })).rejects.toThrow("备份文件复制失败");

    expect((await fs.promises.readdir(backupDir)).sort()).toEqual(["pic-content-backup-20260101-030405-existing.zip", blocked]);
    expect(await listDataExports(config)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "existing", backupCopy: "present" }),
      expect.objectContaining({ id: "blocked", status: "ready", backupCopy: "missing" }),
    ]));
  });

  it("单个旧包清理失败不影响新备份和其余过期副本", async () => {
    const backupDir = await makeTempDir();
    const config = baseConfig(await makeTempDir(), backupDir);
    const now = new Date(2026, 0, 22, 3, 4, 5);
    const older = new Date(2026, 0, 1, 3, 4, 5);
    await writeArchive(config, "blocked", older, "scheduled", backupDir);
    await writeArchive(config, "expired", older, "scheduled", backupDir);
    await fs.promises.mkdir(`${dataExportZipPath(config, "blocked")}.tmp`);

    const result = await runScheduledBackup(config, {
      now,
      createExport: async (_config, _input, publish) => publish(await writeArchive(config, "latest", now, "scheduled")),
    });

    expect(result?.cleanupError).toBeInstanceOf(AggregateError);
    expect((await fs.promises.readdir(backupDir)).sort()).toEqual([
      "pic-content-backup-20260101-030405-blocked.zip",
      "pic-content-backup-20260122-030405-latest.zip",
    ]);
  });
});
