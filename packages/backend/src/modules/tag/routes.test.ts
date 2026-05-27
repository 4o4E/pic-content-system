import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
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
    mockPrisma.tagAlias.upsert.mockResolvedValue(row);
    mockPrisma.tagAlias.deleteMany.mockResolvedValue({ count: 1 });
    const app = await createTagApp();

    const post = await app.inject({ method: "POST", url: "/api/tag-aliases", payload: { alias: " DT ", tag: "弔图" } });
    const del = await app.inject({ method: "DELETE", url: "/api/tag-aliases/DT" });
    await app.close();

    expect(post.statusCode).toBe(200);
    expect(post.json()).toMatchObject({ data: { alias: "dt", tag: "弔图" } });
    expect(mockPrisma.tagAlias.upsert).toHaveBeenCalledWith({
      where: { alias: "dt" },
      create: { alias: "dt", tag: "弔图" },
      update: { tag: "弔图" },
    });
    expect(del.json()).toMatchObject({ data: { deleted: 1 } });
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
});
