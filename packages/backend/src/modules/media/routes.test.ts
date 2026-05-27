import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  tagAlias: {
    findMany: vi.fn(),
  },
  mediaContent: {
    count: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  contentTag: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));

const time = new Date("2026-01-01T00:00:00Z");

function contentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type: "image",
    title: null,
    tags: ["弔图"],
    elements: [{ type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 }],
    sign: "b".repeat(32),
    auditState: "approved",
    likeCount: BigInt(0),
    metadata: {},
    createdAt: time,
    updatedAt: time,
    sources: [],
    ...overrides,
  };
}

async function createMediaApp() {
  const app = Fastify({ logger: false });
  const { registerMediaRoutes } = await import("./routes.js");
  await registerMediaRoutes(app);
  return app;
}

describe("media routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("列表查询支持 alias、类型、审核状态和来源过滤", async () => {
    mockPrisma.tagAlias.findMany.mockResolvedValue([{ alias: "dt", tag: "弔图" }]);
    mockPrisma.mediaContent.count.mockResolvedValue(1);
    mockPrisma.mediaContent.findMany.mockResolvedValue([contentRow()]);
    const app = await createMediaApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/media?tags=DT&type=image&auditState=approved&sourcePlatform=import&sourceGroupId=g&sourceUserId=u",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { total: 1 } });
    expect(mockPrisma.mediaContent.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        type: "image",
        auditState: "approved",
        tags: { hasEvery: ["弔图"] },
        sources: { some: { platform: "import", platformGroupId: "g", platformUserId: "u" } },
      }),
    });
  });

  it("列表查询支持按点赞数排序", async () => {
    mockPrisma.tagAlias.findMany.mockResolvedValue([]);
    mockPrisma.mediaContent.count.mockResolvedValue(1);
    mockPrisma.mediaContent.findMany.mockResolvedValue([contentRow({ likeCount: BigInt(9) })]);
    const app = await createMediaApp();

    const response = await app.inject({ method: "GET", url: "/api/media?sort=like_desc&auditState=approved" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { data: [{ likeCount: 9 }] } });
    expect(mockPrisma.mediaContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("按文件反查会校验 md5 格式", async () => {
    const app = await createMediaApp();

    const response = await app.inject({ method: "GET", url: "/api/media/by-file/not-md5" });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, message: "文件 MD5 格式错误" });
  });

  it("按文件反查返回匹配内容", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "content-id" }]);
    mockPrisma.mediaContent.findMany.mockResolvedValue([contentRow({ id: "content-id" })]);
    const app = await createMediaApp();

    const response = await app.inject({ method: "GET", url: `/api/media/by-file/${"a".repeat(32)}` });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: [{ id: "content-id" }] });
  });

  it("创建正式内容时必须至少包含一个 tag", async () => {
    const app = await createMediaApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/media",
      payload: {
        tags: [],
        elements: [{ type: "text", content: "测试内容" }],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, message: "请至少添加一个 tag 后再提交" });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("PUT tags 替换完整 tag 集合", async () => {
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([{ alias: "dt", tag: "弔图" }]) },
      mediaContent: { update: vi.fn().mockResolvedValue(contentRow({ tags: ["弔图"] })) },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ tags: ["弔图"] }));
    const app = await createMediaApp();

    const response = await app.inject({ method: "PUT", url: "/api/media/content-id/tags", payload: { tags: ["DT"] } });
    await app.close();

    expect(response.json()).toMatchObject({ success: true, data: { tags: ["弔图"] } });
    expect(tx.mediaContent.update).toHaveBeenCalledWith({ where: { id: "content-id" }, data: { tags: ["弔图"] } });
  });

  it("PATCH tags 增删部分 tag", async () => {
    const row = contentRow({ id: "content-id", tags: ["旧tag", "保留"] });
    const tx = {
      tagAlias: { findMany: vi.fn().mockResolvedValue([]) },
      mediaContent: {
        findUnique: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockResolvedValue(contentRow({ id: "content-id", tags: ["保留", "新tag"] })),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ id: "content-id", tags: ["保留", "新tag"] }));
    const app = await createMediaApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/media/content-id/tags",
      payload: { addTags: ["新tag"], removeTags: ["旧tag"] },
    });
    await app.close();

    expect(response.json()).toMatchObject({ success: true, data: { tags: ["保留", "新tag"] } });
  });

  it("按请求顺序合并内容并删除原内容", async () => {
    const imageA = { type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 };
    const imageB = { type: "image", id: "b".repeat(32), format: "png", file: false, width: 1, height: 1 };
    const rowA = contentRow({ id: "content-a", tags: ["A"], elements: [imageA], sign: "1".repeat(32) });
    const rowB = contentRow({ id: "content-b", tags: ["B"], elements: [imageB], sign: "2".repeat(32) });
    const merged = contentRow({
      id: "content-merged",
      type: "composite",
      title: "合并内容（2 条）",
      tags: ["B", "A"],
      elements: [imageB, imageA],
      sign: "3".repeat(32),
    });
    const tx = {
      mediaContent: {
        findMany: vi.fn().mockResolvedValue([rowA, rowB]),
        findUnique: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(merged),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      sourceBinding: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.mediaContent.findUnique.mockResolvedValue(merged);
    const app = await createMediaApp();

    const response = await app.inject({ method: "POST", url: "/api/media/merge", payload: { ids: ["content-b", "content-a"] } });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { id: "content-merged", type: "composite", tags: ["B", "A"] } });
    expect(tx.mediaContent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "composite",
        tags: ["B", "A"],
        elements: [imageB, imageA],
      }),
    });
    expect(tx.mediaContent.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["content-b", "content-a"] } } });
  });
});
