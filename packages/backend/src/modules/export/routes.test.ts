import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import { afterEach, describe, expect, it } from "vitest";
import { dataExportZipPath, saveUploadedDataExport } from "./export-service.js";
import { registerDataExportRoutes } from "./routes.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pic-export-routes-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("export routes", () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it.each([
    ["常规备注", "后来修改的名称", "从旧版迁移的备注"],
    ["超长备注", "后来修改的名称", "备".repeat(11_000)],
    ["超长名称", "名".repeat(11_000), "从旧版迁移的备注"],
  ])("旧归档第一次下载和重新上传保留%s，不再需要旁置 JSON", async (_case, name, note) => {
    const dir = await makeTempDir();
    const config = { port: 0, filesDir: dir, accessToken: "token", frontendDistDir: "not-exists", maxRequestBodyBytes: 1024 };
    const id = "legacy-export";
    const file = dataExportZipPath(config, id);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const createdAt = "2026-06-11T00:00:00.000Z";
    const manifest = { id, name: "打包时的名称", schemaVersion: 1, createdAt, databaseRows: 0, objectCount: 0, objectSizeBytes: 0, tables: [] };
    const zip = archiver("zip");
    const written = pipeline(zip, fs.createWriteStream(file));
    zip.append(JSON.stringify(manifest), { name: "manifest.json" });
    await Promise.all([zip.finalize(), written]);
    const sidecar = path.join(path.dirname(file), `${id}.json`);
    await fs.promises.writeFile(sidecar, JSON.stringify({
      ...manifest, name, note, status: "ready", updatedAt: createdAt, finishedAt: createdAt,
    }));
    const app = Fastify();
    try {
      await registerDataExportRoutes(app, config);
      const response = await app.inject({ method: "GET", url: `/api/exports/${id}/download` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-length"]).toBe(String(response.rawPayload.length));
      const downloaded = path.join(dir, "download.zip");
      await fs.promises.writeFile(downloaded, response.rawPayload);
      await expect(saveUploadedDataExport(config, { filename: "download.zip", stream: fs.createReadStream(downloaded) })).resolves.toMatchObject({
        source: "upload", name, note,
      });
      await expect(fs.promises.stat(sidecar)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await app.close();
    }
  });
});
