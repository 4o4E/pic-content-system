import cron, { type ScheduledTask } from "node-cron";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../../config/env.js";
import { createScheduledDataExport, dataExportZipPath, pruneScheduledDataExports } from "../export/export-service.js";

const BACKUP_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

interface RunScheduledBackupOptions {
  now?: Date;
  createExport?: typeof createScheduledDataExport;
}

export interface ScheduledBackupResult {
  exportId: string;
  sourceFile: string;
  targetFile: string;
  sizeBytes: number;
  cleanupError?: unknown;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

export function formatScheduledBackupTimestamp(date: Date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

async function ensureBackupDirectory(directory: string) {
  const targetDir = path.resolve(process.cwd(), directory);
  try {
    await fs.promises.mkdir(targetDir, { recursive: true });
    const stat = await fs.promises.stat(targetDir);
    if (!stat.isDirectory()) throw new Error("目标不是目录");
    await fs.promises.access(targetDir, fs.constants.W_OK);
    return targetDir;
  } catch (cause) {
    throw new Error(`备份目录不可用：${errorMessage(cause)}`);
  }
}

export async function runScheduledBackup(config: AppConfig, options: RunScheduledBackupOptions = {}): Promise<ScheduledBackupResult | undefined> {
  if (!config.scheduledBackup) return undefined;
  const targetDir = await ensureBackupDirectory(config.scheduledBackup.directory);
  const startedAt = options.now ?? new Date();
  const createExport = options.createExport ?? createScheduledDataExport;
  const timestamp = formatScheduledBackupTimestamp(startedAt);
  const result = await createExport(
    config,
    { name: `定时备份 ${timestamp}`, note: "定时备份任务自动创建" },
    async (item) => {
      const sourceFile = dataExportZipPath(config, item.id);
      const targetFile = path.join(targetDir, `pic-content-backup-${timestamp}-${item.id}.zip`);
      const tempTargetFile = `${targetFile}.tmp-${process.pid}-${Date.now()}`;

      try {
        await fs.promises.copyFile(sourceFile, tempTargetFile);
        await fs.promises.rename(tempTargetFile, targetFile);
      } catch (cause) {
        await fs.promises.rm(tempTargetFile, { force: true }).catch(() => undefined);
        throw new Error(`备份文件复制失败：${errorMessage(cause)}`);
      }

      return { exportId: item.id, sourceFile, targetFile, sizeBytes: item.zipSizeBytes };
    },
  );

  try {
    await pruneScheduledDataExports(config, targetDir, result.exportId, (options.now?.getTime() ?? Date.now()) - BACKUP_RETENTION_MS);
    return result;
  } catch (cleanupError) {
    return { ...result, cleanupError };
  }
}

export function registerScheduledBackup(app: FastifyInstance, config: AppConfig): ScheduledTask | undefined {
  if (!config.scheduledBackup) return undefined;
  if (!cron.validate(config.scheduledBackup.cron)) throw new Error("BACKUP_CRON cron 表达式格式错误");

  let running = false;
  const task = cron.schedule(
    config.scheduledBackup.cron,
    async () => {
      if (running) {
        app.log.warn("上一次定时备份仍在运行，本次触发已跳过");
        return;
      }
      running = true;
      try {
        const result = await runScheduledBackup(config);
        if (result) {
          app.log.info({ exportId: result.exportId, targetFile: result.targetFile, sizeBytes: result.sizeBytes }, "定时备份完成");
          if (result.cleanupError) app.log.error({ err: result.cleanupError }, "清理过期自动备份失败");
        }
      } catch (cause) {
        app.log.error({ err: cause }, "定时备份失败");
      } finally {
        running = false;
      }
    },
    {
      name: "pic-content-scheduled-backup",
      noOverlap: true,
    },
  );

  app.addHook("onClose", async () => {
    await task.stop();
    await task.destroy();
  });
  app.log.info({ cron: config.scheduledBackup.cron, directory: config.scheduledBackup.directory }, "定时备份已启用");
  return task;
}
