import { afterEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  tagAlias: { findMany: vi.fn() },
  mediaContent: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock("./db/prisma.js", () => ({ prisma: mockPrisma }));

describe("createApp", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("health 不需要 token", async () => {
    const { createApp } = await import("./app.js");
    const app = await createApp({
      port: 0,
      filesDir: "./data/test-files",
      accessToken: "token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { status: "ready" } });
  });

  it("API 请求 token 无效时返回 401", async () => {
    const { createApp } = await import("./app.js");
    const app = await createApp({
      port: 0,
      filesDir: "./data/test-files",
      accessToken: "token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024,
    });

    const response = await app.inject({ method: "GET", url: "/api/tags" });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ success: false, message: "访问 token 无效" });
  });
});
