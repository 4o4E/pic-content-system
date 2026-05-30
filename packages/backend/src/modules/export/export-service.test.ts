import archiver from "archiver";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteDataExport,
  isSafeZipEntryName,
  listDataExports,
  saveUploadedDataExport,
  updateDataExport,
} from "./export-service.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pic-export-test-"));
  tempDirs.push(dir);
  return dir;
}

async function createZip(file: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(file);
    const zip = archiver("zip");
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.pipe(output);
    zip.append(
      JSON.stringify({
        schemaVersion: 1,
        id: "source-export",
        name: "测试导出",
        createdAt: "2026-05-30T00:00:00.000Z",
        databaseRows: 0,
        objectCount: 0,
        objectSizeBytes: 0,
        tables: [{ table: "media_file", rows: 0 }],
      }),
      { name: "manifest.json" },
    );
    void zip.finalize().catch(reject);
  });
}

describe("export-service", () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("校验 zip 条目路径", () => {
    expect(isSafeZipEntryName("objects/aa/bb/file.png")).toBe(true);
    expect(isSafeZipEntryName("../objects/file.png")).toBe(false);
    expect(isSafeZipEntryName("objects\\aa\\file.png")).toBe(false);
    expect(isSafeZipEntryName("C:/objects/file.png")).toBe(false);
  });

  it("上传导出包后可以列表、修改和删除", async () => {
    const filesDir = await makeTempDir();
    const sourceZip = path.join(await makeTempDir(), "source.zip");
    await createZip(sourceZip);
    const config = {
      port: 0,
      filesDir,
      accessToken: "token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    };

    const uploaded = await saveUploadedDataExport(config, { filename: "source.zip", stream: fs.createReadStream(sourceZip) });
    expect(uploaded.name).toBe("测试导出");
    expect(uploaded.status).toBe("ready");
    expect(uploaded.manifest?.objectCount).toBe(0);
    expect(uploaded.progressPercent).toBe(100);
    expect(uploaded.durationSeconds).toBe(0);
    await expect(fs.promises.readFile(path.join(filesDir, "exports", `${uploaded.id}.json`), "utf8").then((text) => JSON.parse(text).manifest)).resolves.toBeUndefined();

    await expect(listDataExports(config)).resolves.toMatchObject([{ id: uploaded.id, name: "测试导出", progressPercent: 100 }]);

    const updated = await updateDataExport(config, uploaded.id, { name: "改名导出", note: "备注" });
    expect(updated).toMatchObject({ id: uploaded.id, name: "改名导出", note: "备注" });

    await fs.promises.writeFile(path.join(filesDir, "exports", `${uploaded.id}.zip.tmp`), "partial");
    await deleteDataExport(config, uploaded.id);
    await expect(fs.promises.access(path.join(filesDir, "exports", `${uploaded.id}.zip.tmp`))).rejects.toThrow();
    await expect(listDataExports(config)).resolves.toEqual([]);
  });

  it("上传截断 zip 时返回可读错误", async () => {
    const filesDir = await makeTempDir();
    const brokenZip = path.join(await makeTempDir(), "broken.zip");
    await fs.promises.writeFile(brokenZip, "partial");
    const config = {
      port: 0,
      filesDir,
      accessToken: "token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    };

    await expect(saveUploadedDataExport(config, { filename: "broken.zip", stream: fs.createReadStream(brokenZip) })).rejects.toThrow("导出 zip 文件不完整或已被截断");
  });
});
