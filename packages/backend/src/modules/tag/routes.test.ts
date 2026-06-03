import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  tag: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  contentTag: {
    groupBy: vi.fn(),
  },
  tagAlias: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  mediaContent: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));

async function createTagApp() {
  const app = Fastify({ logger: false });
  const { registerTagRoutes } = await import("./routes.js");
  await registerTagRoutes(app);
  return app;
}

describe("tag routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("列出 tag 聚合结果", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    mockPrisma.tag.findMany.mockResolvedValue([{ name: "弔图", createdAt, updatedAt: createdAt }]);
    mockPrisma.tagAlias.findMany
      .mockResolvedValueOnce([{ alias: "dt", tag: "弔图", createdAt, updatedAt: createdAt }])
      .mockResolvedValueOnce([{ alias: "dt", tag: "弔图", createdAt, updatedAt: createdAt }]);
    mockPrisma.contentTag.groupBy.mockResolvedValue([{ tag: "弔图", _count: { tag: 2 }, _min: { createdAt } }]);
    const app = await createTagApp();

    const response = await app.inject({ method: "GET", url: "/api/tags?q=dt&sort=time_asc" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: [{ name: "弔图", count: 2, aliases: ["dt"], createdAt: createdAt.toISOString() }] });
  });

  it("alias CRUD 会统一小写 alias", async () => {
    const row = { alias: "dt", tag: "弔图", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z") };
    const tx = {
      tag: { upsert: vi.fn().mockResolvedValue({ name: "弔图" }) },
      tagAlias: { upsert: vi.fn().mockResolvedValue(row) },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    mockPrisma.tagAlias.deleteMany.mockResolvedValue({ count: 1 });
    const app = await createTagApp();

    const post = await app.inject({ method: "POST", url: "/api/tag-aliases", payload: { alias: " DT ", tag: "弔图" } });
    const del = await app.inject({ method: "DELETE", url: "/api/tag-aliases/DT" });
    await app.close();

    expect(post.statusCode).toBe(200);
    expect(post.json()).toMatchObject({ data: { alias: "dt", tag: "弔图" } });
    expect(tx.tag.upsert).toHaveBeenCalledWith({ where: { name: "弔图" }, create: { name: "弔图" }, update: {} });
    expect(tx.tagAlias.upsert).toHaveBeenCalledWith({
      where: { alias: "dt" },
      create: { alias: "dt", tag: "弔图" },
      update: { tag: "弔图" },
    });
    expect(del.json()).toMatchObject({ data: { deleted: 1 } });
  });

  it("更新 tag 可见性时校验并保存多个 scope", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    mockPrisma.tag.update.mockResolvedValue({ name: "弔图", visibility: "private", scopes: ["qq:123456", "qq:654321"], createdAt, updatedAt: createdAt });
    const app = await createTagApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/tags/%E5%BC%94%E5%9B%BE",
      payload: { visibility: "private", scopes: [" qq:123456 ", "qq:654321", "qq:123456"] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { name: "弔图", visibility: "private", scopes: ["qq:123456", "qq:654321"] } });
    expect(mockPrisma.tag.update).toHaveBeenCalledWith({
      where: { name: "弔图" },
      data: { visibility: "private", scopes: ["qq:123456", "qq:654321"] },
    });
  });

  it("resolve 接口返回解析后的 tag", async () => {
    mockPrisma.tagAlias.findMany.mockResolvedValue([{ alias: "dt", tag: "弔图" }]);
    const app = await createTagApp();

    const response = await app.inject({ method: "POST", url: "/api/tags/resolve", payload: { tags: ["DT", "弔图"] } });
    await app.close();

    expect(response.json()).toMatchObject({ success: true, data: { tags: ["弔图"] } });
  });

  it("rename 会同步内容 tag 和 alias 目标", async () => {
    const content = {
      id: "content-id",
      tags: ["旧tag", "其他"],
    };
    const tx = {
      mediaContent: {
        findMany: vi.fn().mockResolvedValue([content]),
        update: vi.fn().mockResolvedValue(content),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      tag: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ name: "旧tag", createdAt: new Date("2026-01-01T00:00:00Z") }),
        upsert: vi.fn().mockResolvedValue({ name: "新tag" }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      tagAlias: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createTagApp();

    const response = await app.inject({ method: "POST", url: "/api/tags/rename", payload: { from: "旧tag", to: "新tag" } });
    await app.close();

    expect(response.json()).toMatchObject({ success: true, data: { updated: 1 } });
    expect(tx.mediaContent.update).toHaveBeenCalledWith({ where: { id: "content-id" }, data: { tags: ["新tag", "其他"] } });
  });

  it("merge 会替换 tag 并去重", async () => {
    const content = {
      id: "content-id",
      tags: ["旧tag", "新tag", "其他"],
    };
    const tx = {
      tag: {
        findUnique: vi.fn().mockResolvedValue({ name: "旧tag", createdAt: new Date("2026-01-01T00:00:00Z") }),
        upsert: vi.fn().mockResolvedValue({ name: "新tag" }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      mediaContent: {
        findMany: vi.fn().mockResolvedValue([content]),
        update: vi.fn().mockResolvedValue(content),
      },
      contentTag: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      tagAlias: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createTagApp();

    const response = await app.inject({ method: "POST", url: "/api/tags/merge", payload: { from: "旧tag", to: "新tag" } });
    await app.close();

    expect(response.json()).toMatchObject({ success: true, data: { updated: 1 } });
    expect(tx.mediaContent.update).toHaveBeenCalledWith({ where: { id: "content-id" }, data: { tags: ["新tag", "其他"] } });
  });
});
