import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  mediaFile: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const mockStoreMediaFile = vi.hoisted(() => vi.fn());

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("./file-storage.js", () => ({ storeMediaFile: mockStoreMediaFile }));

async function createFileOnlyApp() {
  const app = Fastify({ logger: false });
  const { registerFileRoutes } = await import("./routes.js");
  await registerFileRoutes(app, {
    port: 0,
    filesDir: "./data/test-files",
    accessToken: "test-token",
    frontendDistDir: "not-exists",
    maxRequestBodyBytes: 1024 * 1024,
  });
  return app;
}

function pngBase64(width = 1, height = 1) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer.toString("base64");
}

function mediaFile(overrides: Record<string, unknown> = {}) {
  return {
    md5: "a".repeat(32),
    storageKey: "objects/aa/aa/file.png",
    mimeType: "image/png",
    format: "png",
    sizeBytes: BigInt(24),
    width: 1,
    height: 1,
    durationSeconds: null,
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("file routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("引用管理接口返回文件统计和引用明细", async () => {
    const file = mediaFile({ md5: "b".repeat(32), sizeBytes: BigInt(2048) });
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          fileCount: 3,
          referencedFileCount: 2,
          unreferencedFileCount: 1,
          multiReferencedFileCount: 1,
          referenceCount: 4,
        },
      ])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ md5: file.md5, referenceCount: 2, ownerCount: 2 }]);
    mockPrisma.mediaFile.findMany.mockResolvedValue([
      {
        ...file,
        references: [
          {
            fileMd5: file.md5,
            ownerType: "media_content",
            ownerId: "content-id",
            refPath: "$[0]",
            elementType: "image",
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
          {
            fileMd5: file.md5,
            ownerType: "media_asset",
            ownerId: "asset-id",
            refPath: "element",
            elementType: "image",
            createdAt: new Date("2026-01-01T00:00:01Z"),
          },
        ],
      },
    ]);
    const app = await createFileOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/files/references?mode=multiple&page=1&size=100" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        stats: { fileCount: 3, referencedFileCount: 2, unreferencedFileCount: 1, multiReferencedFileCount: 1, referenceCount: 4 },
        files: {
          total: 1,
          data: [
            {
              md5: file.md5,
              sizeBytes: 2048,
              referenceCount: 2,
              ownerCount: 2,
              references: [
                { ownerType: "media_content", ownerId: "content-id", refPath: "$[0]", elementType: "image" },
                { ownerType: "media_asset", ownerId: "asset-id", refPath: "element", elementType: "image" },
              ],
            },
          ],
        },
      },
    });
    expect(mockPrisma.mediaFile.findMany).toHaveBeenCalledWith({
      where: { md5: { in: [file.md5] } },
      include: { references: { orderBy: [{ ownerType: "asc" }, { ownerId: "asc" }, { refPath: "asc" }] } },
    });
  });

  it("无引用文件删除接口会在服务端重新校验引用", async () => {
    const file = mediaFile({ md5: "c".repeat(32), storageKey: "objects/cc/cc/missing.png" });
    const tx = {
      mediaFile: {
        findMany: vi.fn().mockResolvedValue([{ ...file, references: [] }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createFileOnlyApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/files/unreferenced",
      payload: { md5s: [file.md5, "bad-md5", file.md5.toUpperCase()] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { deleted: 1 } });
    expect(tx.mediaFile.findMany).toHaveBeenCalledWith({
      where: { md5: { in: [file.md5] } },
      include: { references: { select: { fileMd5: true } } },
    });
    expect(tx.mediaFile.deleteMany).toHaveBeenCalledWith({ where: { md5: { in: [file.md5] } } });
  });

  it("无引用文件删除接口遇到仍被引用的文件会拒绝整批删除", async () => {
    const file = mediaFile({ md5: "d".repeat(32) });
    const tx = {
      mediaFile: {
        findMany: vi.fn().mockResolvedValue([{ ...file, references: [{ fileMd5: file.md5 }] }]),
        deleteMany: vi.fn(),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createFileOnlyApp();

    const response = await app.inject({ method: "DELETE", url: "/api/files/unreferenced", payload: { md5s: [file.md5] } });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ success: false, message: "有 1 个文件仍存在引用，已取消删除" });
    expect(tx.mediaFile.deleteMany).not.toHaveBeenCalled();
  });

  it("声明为图片的上传只接受常见图片格式", async () => {
    const app = await createFileOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/files",
      payload: {
        contentBase64: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>").toString("base64"),
        mimeType: "image/svg+xml",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, message: "上传图片仅支持 png、jpg、gif、webp 常见图片格式" });
    expect(mockStoreMediaFile).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("常见图片格式通过真实文件内容入库", async () => {
    const file = mediaFile();
    mockPrisma.$transaction.mockImplementation((callback) => callback({}));
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 24, mimeType: "image/png", format: "png", width: 1, height: 1 },
    });
    const app = await createFileOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/files",
      payload: { contentBase64: pngBase64(), mimeType: "image/png" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { md5: file.md5, mimeType: "image/png", format: "png" } });
    expect(mockStoreMediaFile).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(Buffer), expect.objectContaining({ format: "png" }));
  });

  it("未声明为图片的未知二进制仍按普通文件处理", async () => {
    const file = mediaFile({
      storageKey: "objects/bb/bb/file",
      mimeType: "application/octet-stream",
      format: "bin",
      sizeBytes: BigInt(8),
      width: null,
      height: null,
    });
    mockPrisma.$transaction.mockImplementation((callback) => callback({}));
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 8, mimeType: "application/octet-stream", format: "bin" },
    });
    const app = await createFileOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/files",
      payload: { contentBase64: Buffer.from("not file").toString("base64") },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { mimeType: "application/octet-stream", format: "bin" } });
    expect(mockStoreMediaFile).toHaveBeenCalled();
  });
});
