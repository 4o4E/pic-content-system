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
  await prisma.contentLike.deleteMany();
  await prisma.contentTag.deleteMany();
  await prisma.mediaContent.deleteMany();
  await prisma.mediaFile.deleteMany();
  await prisma.tagAlias.deleteMany();
  await prisma.tag.deleteMany();
}

describe("pic routes db", () => {
  let filesDir: string;

  beforeAll(async () => {
    filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "pic-content-db-test-"));
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
    await fs.rm(filesDir, { recursive: true, force: true });
  });

  it("tag alias 在真实数据库中保持唯一", async () => {
    await prisma.tagAlias.create({ data: { alias: "dt", tag: "弔图" } });

    await expect(prisma.tagAlias.create({ data: { alias: "dt", tag: "表情" } })).rejects.toThrow();
  });

  it("导入接口真实写入文件、内容、tag 索引和导入来源", async () => {
    await prisma.tagAlias.create({ data: { alias: "dt", tag: "弔图" } });
    const app = await createApp({
      port: 0,
      filesDir,
      accessToken: "test-token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      headers: { authorization: "Bearer test-token" },
      payload: {
        contentBase64: pngBuffer(32, 16).toString("base64"),
        tags: ["DT"],
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.data).toMatchObject({
      existed: false,
      content: { type: "image", tags: ["弔图"] },
      file: { mimeType: "image/png", format: "png", width: 32, height: 16 },
    });

    const contentId = payload.data.content.id;
    const fileMd5 = payload.data.file.md5;
    const contentCount = await prisma.mediaContent.count({ where: { id: contentId } });
    const tagCount = await prisma.contentTag.count({ where: { tag: "弔图" } });
    const source = await prisma.sourceBinding.findFirstOrThrow({ where: { contentId } });
    const file = await prisma.mediaFile.findUniqueOrThrow({ where: { md5: fileMd5 } });
    const filePath = path.join(filesDir, file.storageKey);

    expect(contentCount).toBe(1);
    expect(tagCount).toBe(1);
    expect(source).toMatchObject({
      platform: "import",
      platformFileId: file.md5,
      sourceKey: file.md5,
    });
    await expect(fs.stat(filePath)).resolves.toMatchObject({ size: 24 });
  });

  it("重复导入同一文件时合并 tag，且不重复创建来源", async () => {
    const app = await createApp({
      port: 0,
      filesDir,
      accessToken: "test-token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    });
    const body = {
      contentBase64: pngBuffer(10, 10).toString("base64"),
      tags: ["旧tag"],
    };

    await app.inject({ method: "POST", url: "/api/pic/images", headers: { authorization: "Bearer test-token" }, payload: body });
    const second = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      headers: { authorization: "Bearer test-token" },
      payload: { ...body, tags: ["新tag"] },
    });
    await app.close();

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ data: { existed: true } });

    const [content] = await prisma.mediaContent.findMany();
    expect(content?.tags.sort()).toEqual(["新tag", "旧tag"]);
    await expect(prisma.mediaContent.count()).resolves.toBe(1);
    await expect(prisma.mediaFile.count()).resolves.toBe(1);
    await expect(prisma.sourceBinding.count()).resolves.toBe(1);
    await expect(prisma.contentTag.count()).resolves.toBe(2);
  });

  it("点赞会按来源和日期去重，并让最热接口按累计点赞排序", async () => {
    const app = await createApp({
      port: 0,
      filesDir,
      accessToken: "test-token",
      frontendDistDir: "not-exists",
      maxRequestBodyBytes: 1024 * 1024,
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      headers: { authorization: "Bearer test-token" },
      payload: {
        contentBase64: pngBuffer(30, 10).toString("base64"),
        tags: ["热图"],
        auditRequired: false,
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/pic/images",
      headers: { authorization: "Bearer test-token" },
      payload: {
        contentBase64: pngBuffer(31, 10).toString("base64"),
        tags: ["热图"],
        auditRequired: false,
      },
    });
    const firstContentId = first.json().data.content.id;
    const secondContentId = second.json().data.content.id;

    const likeA = await app.inject({
      method: "POST",
      url: `/api/pic/contents/${firstContentId}/likes`,
      headers: { authorization: "Bearer test-token" },
      payload: { source: "qq:group:user", date: "2026-05-26" },
    });
    const duplicateLike = await app.inject({
      method: "POST",
      url: `/api/pic/contents/${firstContentId}/likes`,
      headers: { authorization: "Bearer test-token" },
      payload: { source: "qq:group:user", date: "2026-05-26" },
    });
    await app.inject({
      method: "POST",
      url: `/api/pic/contents/${secondContentId}/likes`,
      headers: { authorization: "Bearer test-token" },
      payload: { source: "qq:group:user", date: "2026-05-26" },
    });
    await app.inject({
      method: "POST",
      url: `/api/pic/contents/${secondContentId}/likes`,
      headers: { authorization: "Bearer test-token" },
      payload: { source: "qq:group:user", date: "2026-05-27" },
    });

    const hot = await app.inject({
      method: "GET",
      url: "/api/pic/hot?tags=热图",
      headers: { authorization: "Bearer test-token" },
    });
    await app.close();

    expect(likeA.statusCode).toBe(200);
    expect(likeA.json()).toMatchObject({ data: { liked: true, likeCount: 1 } });
    expect(duplicateLike.statusCode).toBe(200);
    expect(duplicateLike.json()).toMatchObject({ data: { liked: false, likeCount: 1 } });
    await expect(prisma.contentLike.count({ where: { contentId: firstContentId } })).resolves.toBe(1);
    expect(hot.statusCode).toBe(200);
    expect(hot.json().data.data.map((item: { id: string; likeCount: number }) => [item.id, item.likeCount])).toEqual([
      [secondContentId, 2],
      [firstContentId, 1],
    ]);
  });
});
