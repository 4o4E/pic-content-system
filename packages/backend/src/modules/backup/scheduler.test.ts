import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../../config/env.js";
import { dataExportZipPath } from "../export/export-service.js";
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

  it("等待导出完成后复制 zip 到备份目录", async () => {
    const filesDir = await makeTempDir();
    const backupDir = path.join(await makeTempDir(), "nested");
    const config = baseConfig(filesDir, backupDir);
    const exportId = "export-test";
    const sourceZip = dataExportZipPath(config, exportId);
    await fs.promises.mkdir(path.dirname(sourceZip), { recursive: true });
    await fs.promises.writeFile(sourceZip, "zip-body");

    const result = await runScheduledBackup(config, {
      now: new Date(2026, 0, 2, 3, 4, 5),
      createExport: async (_config, input) => {
        expect(input).toEqual({
          name: "定时备份 20260102-030405",
          note: "定时备份任务自动创建",
        });
        return {
          id: exportId,
          name: input.name ?? "定时备份",
          note: input.note,
          status: "ready",
          schemaVersion: 1,
          zipFileName: `${exportId}.zip`,
          zipSizeBytes: 8,
          databaseRows: 0,
          objectCount: 0,
          objectSizeBytes: 0,
          createdAt: "2026-01-02T03:04:05.000Z",
          updatedAt: "2026-01-02T03:04:05.000Z",
          finishedAt: "2026-01-02T03:04:05.000Z",
        };
      },
    });

    expect(result?.exportId).toBe(exportId);
    expect(path.basename(result?.targetFile ?? "")).toBe("pic-content-backup-20260102-030405-export-test.zip");
    await expect(fs.promises.readFile(result?.targetFile ?? "", "utf8")).resolves.toBe("zip-body");
    await expect(fs.promises.readdir(backupDir)).resolves.toEqual(["pic-content-backup-20260102-030405-export-test.zip"]);
  });
});
