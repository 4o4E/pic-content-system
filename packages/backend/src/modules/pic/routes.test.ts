import type { MediaContentDto } from "@pic/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  tagAlias: {
    findMany: vi.fn(),
  },
  mediaContent: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mediaAsset: {
    create: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
  },
  contentTag: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  sourceBinding: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

const mockStoreMediaFile = vi.hoisted(() => vi.fn());

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../file/file-storage.js", () => ({ storeMediaFile: mockStoreMediaFile }));

async function createPicOnlyApp() {
  const app = Fastify({ logger: false });
  const { registerPicRoutes } = await import("./routes.js");
  await registerPicRoutes(app, {
    port: 0,
    filesDir: "./data/test-files",
    accessToken: "test-token",
    frontendDistDir: "not-exists",
    maxRequestBodyBytes: 1024 * 1024,
  });
  return app;
}

function mediaFile(overrides: Record<string, unknown> = {}) {
  return {
    md5: "b".repeat(32),
    storageKey: "objects/bb/bb/file.png",
    mimeType: "image/png",
    format: "png",
    sizeBytes: BigInt(24),
    width: 12,
    height: 8,
    durationSeconds: null,
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function pngBase64(width = 1, height = 1) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer.toString("base64");
}

function contentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "image",
    title: null,
    tags: ["弔图"],
    elements: [{ type: "image", id: "0123456789abcdef0123456789abcdef", format: "png", file: false, width: 1, height: 1 }],
    sign: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    auditState: "approved",
    likeCount: BigInt(0),
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    sources: [],
    ...overrides,
  };
}

describe("pic routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("随机取图会解析 tag alias 并返回文件 MD5", async () => {
    mockPrisma.tagAlias.findMany.mockResolvedValue([{ alias: "dt", tag: "弔图" }]);
    mockPrisma.mediaContent.count.mockResolvedValue(1);
    mockPrisma.mediaContent.findMany.mockResolvedValue([contentRow()]);
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/pic/random?tags=DT",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json<{ success: boolean; data: MediaContentDto & { fileMd5?: string } }>();
    expect(payload.success).toBe(true);
    expect(payload.data.fileMd5).toBe("0123456789abcdef0123456789abcdef");
    expect(mockPrisma.mediaContent.count).toHaveBeenCalledWith({
      where: {
        type: "image",
        auditState: "approved",
        tags: { hasEvery: ["弔图"] },
      },
    });
  });

  it("随机取图找不到内容时返回 404", async () => {
    mockPrisma.tagAlias.findMany.mockResolvedValue([]);
    mockPrisma.mediaContent.count.mockResolvedValue(0);
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/pic/random?tags=missing",
    });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ success: false });
  });

  it("导入带 tags 且 auditRequired=true 的图片会创建 pending 内容", async () => {
    const file = mediaFile();
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 24, mimeType: "image/png", format: "png", width: 12, height: 8 },
    });
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([{ alias: "dt", tag: "弔图" }]) },
      mediaContent: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(
          contentRow({
            id: "new-content",
            tags: ["弔图"],
            auditState: "pending",
            elements: [{ type: "image", id: file.md5, format: "png", file: false, width: 12, height: 8 }],
          }),
        ),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: "source-id" }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-event-id" }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ id: "new-content", tags: ["弔图"], auditState: "pending", sources: [] }));
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      payload: { contentBase64: pngBase64(12, 8), tags: ["DT"], auditRequired: true },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { existed: false, content: { auditState: "pending" }, file: { md5: file.md5 } } });
    expect(tx.mediaContent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "image",
        tags: ["弔图"],
        auditState: "pending",
      }),
    });
    expect(tx.sourceBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: "import",
        platformFileId: file.md5,
        sourceKey: file.md5,
      }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentId: "new-content",
        action: "submit",
        toState: "pending",
      }),
    });
  });

  it("导入无 tags 图片时只创建工作台 asset", async () => {
    const file = mediaFile({ md5: "d".repeat(32), storageKey: "objects/dd/dd/file.png" });
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 24, mimeType: "image/png", format: "png", width: 12, height: 8 },
    });
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([]) },
      mediaAsset: {
        create: vi.fn().mockResolvedValue({
          id: "asset-id",
          kind: "image",
          fileMd5: file.md5,
          element: { type: "image", id: file.md5, format: "png", file: false, width: 12, height: 8 },
          sourceId: "source-id",
          status: "pending",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        }),
      },
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: "source-id" }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      payload: { contentBase64: pngBase64(12, 8) },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        existed: false,
        asset: { id: "asset-id", fileMd5: file.md5, sourceId: "source-id", status: "pending" },
        file: { md5: file.md5 },
      },
    });
    expect(tx.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "image",
        fileMd5: file.md5,
        sourceId: "source-id",
        status: "pending",
      }),
    });
    expect(tx.sourceBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: "import",
        platformFileId: file.md5,
        sourceKey: file.md5,
      }),
    });
  });

  it("导入带 qq source 的图片时写入来源和审核操作人", async () => {
    const file = mediaFile({ md5: "e".repeat(32), storageKey: "objects/ee/ee/file.png" });
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 24, mimeType: "image/png", format: "png", width: 12, height: 8 },
    });
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([]) },
      mediaContent: {
        findUnique: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(contentRow({ id: "qq-content", tags: ["表情"], auditState: "pending" })),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue({ id: "source-id" }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-event-id" }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ id: "qq-content", tags: ["表情"], auditState: "pending", sources: [] }));
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      payload: {
        contentBase64: pngBase64(12, 8),
        tags: ["表情"],
        source: {
          platform: "qq",
          groupId: "group-id",
          userId: "user-id",
          messageId: "message-id",
          fileId: "file-id",
          sourceKey: "qq-source-key",
          sourceIndex: 2,
          raw: { senderName: "Alice" },
        },
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { existed: false, content: { id: "qq-content", auditState: "pending" } } });
    expect(tx.sourceBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentId: "qq-content",
        platform: "qq",
        platformGroupId: "group-id",
        platformUserId: "user-id",
        platformMessageId: "message-id",
        platformFileId: "file-id",
        sourceKey: "qq-source-key",
        sourceIndex: 2,
        raw: { senderName: "Alice" },
      }),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentId: "qq-content",
        action: "submit",
        operatorPlatform: "qq",
        operatorUserId: "user-id",
        raw: { senderName: "Alice" },
      }),
    });
  });

  it("导入非图片内容时返回 400 且不落库", async () => {
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      payload: {
        contentBase64: Buffer.from('{"retcode":-5503007,"retmsg":"download url has expired"}').toString("base64"),
        tags: ["弔图"],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, message: "上传内容不是可识别的图片文件" });
    expect(mockStoreMediaFile).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("导入重复图片时合并 tag 并返回 existed", async () => {
    const file = mediaFile({ md5: "c".repeat(32), storageKey: "objects/cc/cc/file.png", width: 1, height: 1 });
    mockStoreMediaFile.mockResolvedValue({
      file,
      inspection: { md5: file.md5, sizeBytes: 24, mimeType: "image/png", format: "png", width: 1, height: 1 },
    });
    const existing = contentRow({ id: "existing-content", tags: ["旧tag"] });
    const updated = contentRow({ id: "existing-content", tags: ["旧tag", "弔图"], auditState: "approved" });
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([]) },
      mediaContent: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      sourceBinding: {
        findFirst: vi.fn().mockResolvedValue({ id: "source-id" }),
        update: vi.fn().mockResolvedValue({ id: "source-id" }),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-event-id" }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue({ ...updated, sources: [] });
    const app = await createPicOnlyApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      payload: { contentBase64: pngBase64(1, 1), tags: ["弔图"] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { existed: true } });
    expect(tx.mediaContent.update).toHaveBeenCalledWith({
      where: { id: "existing-content" },
      data: { tags: ["旧tag", "弔图"], auditState: "approved" },
    });
  });
});
