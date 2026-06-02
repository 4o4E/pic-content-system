import { describe, expect, it } from "vitest";
import { loadScheduledBackupConfig } from "./env.js";

describe("loadScheduledBackupConfig", () => {
  it("未配置备份目录时不启用定时备份", () => {
    expect(loadScheduledBackupConfig({})).toBeUndefined();
    expect(loadScheduledBackupConfig({ BACKUP_CRON: "0 3 * * *" })).toBeUndefined();
  });

  it("配置备份目录时必须同时配置 cron 表达式", () => {
    expect(() => loadScheduledBackupConfig({ BACKUP_DIR: "/data/backups" })).toThrow("BACKUP_CRON");
  });

  it("读取并修剪定时备份配置", () => {
    expect(loadScheduledBackupConfig({ BACKUP_DIR: " /data/backups ", BACKUP_CRON: " 0 3 * * * " })).toEqual({
      directory: "/data/backups",
      cron: "0 3 * * *",
    });
  });
});
