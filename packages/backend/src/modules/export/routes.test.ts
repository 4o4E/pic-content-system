import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockService = vi.hoisted(() => ({
  createDataExport: vi.fn(),
  dataExportZipPath: vi.fn(),
  deleteDataExport: vi.fn(),
  getDataExport: vi.fn(),
  importDataExport: vi.fn(),
  listDataExports: vi.fn(),
  saveUploadedDataExport: vi.fn(),
  updateDataExport: vi.fn(),
}));

vi.mock("./export-service.js", () => mockService);

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pic-export-routes-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("export routes", () => {
  afterEach(async () => {
    vi.clearAllMocks();
    for (const dir of tempDirs.splice(0)) await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("下载导出 zip 时返回真实 Content-Length", async () => {
    const dir = await makeTempDir();
    const zip = path.join(dir, "export.zip");
    const content = Buffer.from("zip-content");
    await fs.promises.writeFile(zip, content);
    mockService.getDataExport.mockResolvedValue({
      id: "export-id",
      name: "测试导出",
      status: "ready",
      schemaVersion: 1,
      zipFileName: "export-id.zip",
      zipSizeBytes: content.length,
      databaseRows: 0,
      objectCount: 0,
      objectSizeBytes: 0,
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
    });
    mockService.dataExportZipPath.mockReturnValue(zip);

    const { registerDataExportRoutes } = await import("./routes.js");
    const app = Fastify();
    await registerDataExportRoutes(app, {
      port: 0,
      filesDir: dir,
      accessToken: "token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024,
    });

    const response = await app.inject({ method: "GET", url: "/api/exports/export-id/download" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-length"]).toBe(String(content.length));
    expect(response.body).toBe("zip-content");
  });
});
