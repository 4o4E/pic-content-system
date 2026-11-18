import archiver from "archiver";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yauzl from "yauzl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dataExportZipPath,
  deleteDataExport,
  isSafeZipEntryName,
  listDataExports,
  readManifestFromZip,
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

async function openTestZip(file: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zipFile) => {
      if (error) reject(error);
      else if (!zipFile) reject(new Error("无法打开 zip 文件"));
      else resolve(zipFile);
    });
  });
}

async function readZipCommentJson(file: string) {
  const zip = await openTestZip(file);
  const comment = zip.comment;
  zip.close();
  return JSON.parse(comment) as unknown;
}

async function listZipEntries(file: string) {
  const zip = await openTestZip(file);
  const entries: string[] = [];
  return new Promise<string[]>((resolve, reject) => {
    zip.readEntry();
    zip.on("entry", (entry) => {
      entries.push(entry.fileName);
      zip.readEntry();
    });
    zip.on("end", () => {
      zip.close();
      resolve(entries);
    });
    zip.on("error", (cause) => {
      zip.close();
      reject(cause);
    });
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
    await expect(fs.promises.access(path.join(filesDir, "exports", `${uploaded.id}.json`))).rejects.toThrow();
    await expect(readManifestFromZip(path.join(filesDir, "exports", `${uploaded.id}.zip`))).resolves.toMatchObject({ id: uploaded.id, name: "测试导出" });
    await expect(readZipCommentJson(path.join(filesDir, "exports", `${uploaded.id}.zip`))).resolves.toMatchObject({ id: uploaded.id, name: "测试导出" });
    await expect(listZipEntries(path.join(filesDir, "exports", `${uploaded.id}.zip`))).resolves.not.toContain("metadata.json");

    await expect(listDataExports(config)).resolves.toMatchObject([{ id: uploaded.id, name: "测试导出", progressPercent: 100 }]);

    const updated = await updateDataExport(config, uploaded.id, { name: "改名导出", note: "备注" });
    expect(updated).toMatchObject({ id: uploaded.id, name: "改名导出", note: "备注" });
    await expect(readZipCommentJson(path.join(filesDir, "exports", `${uploaded.id}.zip`))).resolves.toMatchObject({ id: uploaded.id, name: "改名导出", note: "备注" });
    await expect(listZipEntries(path.join(filesDir, "exports", `${uploaded.id}.zip`))).resolves.not.toContain("metadata.json");

    const downloaded = dataExportZipPath(config, uploaded.id);
    const reuploaded = await saveUploadedDataExport(config, { stream: fs.createReadStream(downloaded) });
    expect(reuploaded).toMatchObject({ name: "改名导出", note: "备注", source: "upload" });
    await expect(readZipCommentJson(dataExportZipPath(config, reuploaded.id))).resolves.toMatchObject({ name: "改名导出", note: "备注" });
    await deleteDataExport(config, reuploaded.id);

    await fs.promises.writeFile(path.join(filesDir, "exports", `${uploaded.id}.zip.tmp`), "partial");
    await fs.promises.writeFile(path.join(filesDir, "exports", `${uploaded.id}.json`), "{}");
    await deleteDataExport(config, uploaded.id);
    await expect(fs.promises.access(path.join(filesDir, "exports", `${uploaded.id}.zip.tmp`))).rejects.toThrow();
    await expect(fs.promises.access(path.join(filesDir, "exports", `${uploaded.id}.json`))).rejects.toThrow();
    await expect(listDataExports(config)).resolves.toEqual([]);
  });

  it("保存备注和删除同时到达时，删除完成后归档不会重新出现", async () => {
    const filesDir = await makeTempDir();
    const sourceZip = path.join(filesDir, "source.zip");
    await createZip(sourceZip);
    const config = { port: 0, filesDir, accessToken: "token", frontendDistDir: "not-exists", maxRequestBodyBytes: 1024 };
    const { id } = await saveUploadedDataExport(config, { stream: fs.createReadStream(sourceZip) });
    const zip = dataExportZipPath(config, id);
    const gate = new EventEmitter();
    const rewriting = once(gate, "rewriting");
    const rename = fs.promises.rename;
    const rm = fs.promises.rm;
    const order: string[] = [];
    const rmSpy = vi.spyOn(fs.promises, "rm").mockImplementation(async (file, options) => {
      if (file === zip) order.push("delete");
      await rm(file, options);
    });
    const renameSpy = vi.spyOn(fs.promises, "rename").mockImplementationOnce(async (from, to) => {
      const resume = once(gate, "resume");
      gate.emit("rewriting");
      await resume;
      order.push("publish");
      await rename(from, to);
    });
    const mkdirSpy = vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined);
    try {
      const updating = updateDataExport(config, id, { note: "正在保存的备注" });
      await rewriting;
      const removing = deleteDataExport(config, id);
      await Promise.resolve();
      await Promise.resolve();
      gate.emit("resume");
      await Promise.all([updating, removing]);
      expect(order).toEqual(["publish", "delete"]);
      await expect(fs.promises.stat(zip)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(listDataExports(config)).resolves.toEqual([]);
    } finally {
      gate.emit("resume");
      renameSpy.mockRestore();
      mkdirSpy.mockRestore();
      rmSpy.mockRestore();
    }
  });

  it("无法读取旧备注时拒绝改名，并保留 ZIP 和原备注文件", async () => {
    const filesDir = await makeTempDir();
    const id = "source-export";
    const config = { port: 0, filesDir, accessToken: "token", frontendDistDir: "not-exists", maxRequestBodyBytes: 1024 };
    const zip = dataExportZipPath(config, id);
    const legacy = path.join(path.dirname(zip), `${id}.json`);
    await fs.promises.mkdir(path.dirname(zip), { recursive: true });
    await createZip(zip);
    const originalZip = await fs.promises.readFile(zip);
    const originalLegacy = JSON.stringify({ id, name: "旧名称", note: "不能丢失的备注" });
    await fs.promises.writeFile(legacy, originalLegacy);
    const inaccessible = Object.assign(new Error("无法读取旧备注"), { code: "EACCES" });
    const readFile = vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce(inaccessible);
    try {
      await expect(updateDataExport(config, id, { name: "新名称" })).rejects.toMatchObject({ code: "EACCES" });
    } finally {
      readFile.mockRestore();
    }
    expect((await fs.promises.readFile(zip)).equals(originalZip)).toBe(true);
    await expect(fs.promises.readFile(legacy, "utf8")).resolves.toBe(originalLegacy);
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
