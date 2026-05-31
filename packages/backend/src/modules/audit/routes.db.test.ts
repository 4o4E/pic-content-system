import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../db/prisma.js";

function pngBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function cleanDatabase() {
  await prisma.auditEvent.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.sourceBinding.deleteMany();
  await prisma.contentTag.deleteMany();
  await prisma.mediaContent.deleteMany();
  await prisma.mediaFileReference.deleteMany();
  await prisma.mediaFile.deleteMany();
  await prisma.tagAlias.deleteMany();
  await prisma.tag.deleteMany();
}

describe("audit routes db", () => {
  let filesDir: string;

  beforeAll(async () => {
    filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "pic-audit-db-test-"));
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
    await fs.rm(filesDir, { recursive: true, force: true });
  });

  it("删除内容后保留删除审批事件", async () => {
    const app = await createApp({
      port: 0,
      filesDir,
      accessToken: "test-token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      headers: { authorization: "Bearer test-token" },
      payload: {
        contentBase64: pngBuffer(16, 16).toString("base64"),
        tags: ["待审"],
        source: {
          platform: "qq",
          userId: "user-id",
          raw: { senderName: "Alice" },
        },
      },
    });
    const contentId = created.json().data.content.id;

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/audits/${contentId}`,
      headers: { authorization: "Bearer test-token" },
      payload: {
        operator: { platform: "web", userId: "admin" },
        reason: "违规删除",
      },
    });
    await app.close();

    expect(deleted.statusCode).toBe(200);
    await expect(prisma.mediaContent.count({ where: { id: contentId } })).resolves.toBe(0);
    await expect(prisma.auditEvent.findMany({ where: { contentId }, orderBy: { createdAt: "asc" } })).resolves.toMatchObject([
      { action: "submit", toState: "pending", operatorPlatform: "qq", operatorUserId: "user-id" },
      { action: "delete", fromState: "pending", toState: null, operatorPlatform: "web", operatorUserId: "admin", reason: "违规删除" },
    ]);
  });
});
