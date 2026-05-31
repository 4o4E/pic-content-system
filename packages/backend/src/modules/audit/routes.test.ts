import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  mediaContent: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  auditEvent: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  contentTag: {
    deleteMany: vi.fn(),
  },
  mediaFileReference: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("../../db/prisma.js", () => ({ prisma: mockPrisma }));

async function createAuditOnlyApp() {
  const app = Fastify({ logger: false });
  const { registerAuditRoutes } = await import("./routes.js");
  await registerAuditRoutes(app);
  return app;
}

function contentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "content-id",
    type: "image",
    title: null,
    tags: ["弔图"],
    elements: [{ type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 }],
    sign: "sign",
    auditState: "pending",
    likeCount: BigInt(0),
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    sources: [],
    ...overrides,
  };
}

function qqSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "source-id",
    contentId: "content-id",
    platform: "qq",
    platformGroupId: "group-id",
    platformUserId: "user-id",
    platformMessageId: "message-id",
    platformFileId: "file-id",
    sourceKey: "source-key",
    sourceIndex: null,
    raw: { senderName: "Alice", groupName: "群聊", avatarUrl: "https://example.com/a.png" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("audit routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("GET /api/audits 默认查询 pending 列表并补充来源画像", async () => {
    const row = contentRow({ sources: [qqSource()] });
    mockPrisma.mediaContent.count.mockResolvedValue(1);
    mockPrisma.mediaContent.findMany.mockResolvedValue([row]);
    const app = await createAuditOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/audits?page=2&size=5&type=image" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        total: 1,
        data: [
          {
            id: "content-id",
            auditState: "pending",
            sourceProfile: {
              platform: "qq",
              userId: "user-id",
              groupId: "group-id",
              messageId: "message-id",
              fileId: "file-id",
              displayName: "Alice",
              groupName: "群聊",
            },
          },
        ],
      },
    });
    expect(mockPrisma.mediaContent.count).toHaveBeenCalledWith({ where: { auditState: "pending", type: "image" } });
    expect(mockPrisma.mediaContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { auditState: "pending", type: "image" },
        include: { sources: true },
        skip: 5,
        take: 5,
      }),
    );
  });

  it("GET /api/audits 会兜底非法分页参数", async () => {
    mockPrisma.mediaContent.count.mockResolvedValue(0);
    mockPrisma.mediaContent.findMany.mockResolvedValue([]);
    const app = await createAuditOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/audits?page=abc&size=9999" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.mediaContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      }),
    );
  });

  it("GET /api/audits?state=all 不追加审批状态过滤", async () => {
    mockPrisma.mediaContent.count.mockResolvedValue(0);
    mockPrisma.mediaContent.findMany.mockResolvedValue([]);
    const app = await createAuditOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/audits?state=all&type=all" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.mediaContent.count).toHaveBeenCalledWith({ where: {} });
    expect(mockPrisma.mediaContent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("GET /api/audits/:contentId 返回详情和审核事件", async () => {
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ sources: [qqSource()] }));
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      {
        id: "event-id",
        contentId: "content-id",
        action: "submit",
        fromState: null,
        toState: "pending",
        operatorPlatform: "qq",
        operatorUserId: "user-id",
        reason: "提交审核",
        raw: { foo: "bar" },
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    const app = await createAuditOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/audits/content-id" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        content: { id: "content-id", sourceProfile: { platform: "qq", userId: "user-id" } },
        events: [
          {
            id: "event-id",
            action: "submit",
            actionLabel: "提交",
            toState: "pending",
            stateChange: "待审批",
            operatorLabel: "qq:user-id",
            reason: "提交审核",
            summary: "qq:user-id / 提交 / 待审批 / 提交审核",
          },
        ],
      },
    });
    expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith({ where: { contentId: "content-id" }, orderBy: { createdAt: "desc" } });
  });

  it("GET /api/audits/:contentId 返回只有 userId 的操作人时不输出 null platform", async () => {
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow());
    mockPrisma.auditEvent.findMany.mockResolvedValue([
      {
        id: "event-id",
        contentId: "content-id",
        action: "approve",
        fromState: "pending",
        toState: "approved",
        operatorPlatform: null,
        operatorUserId: "admin",
        reason: null,
        raw: {},
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    const app = await createAuditOnlyApp();

    const response = await app.inject({ method: "GET", url: "/api/audits/content-id" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.events[0].operator).toEqual({ userId: "admin", raw: {} });
  });

  it("approve 和 reject 会更新状态并写审核事件", async () => {
    const tx = {
      mediaContent: {
        findUnique: vi.fn().mockResolvedValue(contentRow({ auditState: "pending" })),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve(contentRow({ auditState: data.auditState, sources: [] }))),
      },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-id" }),
      },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createAuditOnlyApp();

    const approve = await app.inject({
      method: "POST",
      url: "/api/audits/content-id/approve",
      payload: { operator: { platform: "web", userId: "admin" }, reason: "通过" },
    });
    const reject = await app.inject({
      method: "POST",
      url: "/api/audits/content-id/reject",
      payload: { operator: { platform: "web", userId: "admin" }, reason: "拒绝" },
    });
    await app.close();

    expect(approve.statusCode).toBe(200);
    expect(reject.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ success: true, data: { auditState: "approved" } });
    expect(reject.json()).toMatchObject({ success: true, data: { auditState: "rejected" } });
    expect(tx.mediaContent.update).toHaveBeenNthCalledWith(1, {
      where: { id: "content-id" },
      data: { auditState: "approved" },
      include: { sources: true },
    });
    expect(tx.mediaContent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "content-id" },
      data: { auditState: "rejected" },
      include: { sources: true },
    });
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ contentId: "content-id", action: "approve", fromState: "pending", toState: "approved", reason: "通过" }),
    });
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ contentId: "content-id", action: "reject", fromState: "pending", toState: "rejected", reason: "拒绝" }),
    });
  });

  it("DELETE /api/audits/:contentId 写删除事件并删除内容", async () => {
    mockPrisma.mediaContent.findUnique.mockResolvedValue(contentRow({ auditState: "rejected" }));
    const tx = {
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "event-id" }) },
      contentTag: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mediaFileReference: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      mediaContent: { delete: vi.fn().mockResolvedValue(contentRow()) },
    };
    mockPrisma.$transaction.mockImplementation((callback) => callback(tx));
    const app = await createAuditOnlyApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/audits/content-id",
      payload: { operator: { platform: "web", userId: "admin" }, reason: "删除" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { deleted: 1 } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contentId: "content-id", action: "delete", fromState: "rejected", reason: "删除" }),
    });
    expect(tx.contentTag.deleteMany).toHaveBeenCalledWith({ where: { contentId: "content-id" } });
    expect(tx.mediaFileReference.deleteMany).toHaveBeenCalledWith({ where: { ownerType: "media_content", ownerId: { in: ["content-id"] } } });
    expect(tx.mediaContent.delete).toHaveBeenCalledWith({ where: { id: "content-id" } });
  });
});
