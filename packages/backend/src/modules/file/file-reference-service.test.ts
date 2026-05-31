import { describe, expect, it, vi } from "vitest";
import { assetFileReferences, collectFileReferencesFromElements, deleteMediaFileReferences, replaceMediaFileReferences } from "./file-reference-service.js";

describe("file-reference-service", () => {
  it("递归提取聊天记录里的文件引用", () => {
    const imageMd5 = "a".repeat(32);
    const audioMd5 = "b".repeat(32);

    const references = collectFileReferencesFromElements([
      {
        type: "discuss",
        content: [
          {
            type: "speak",
            sender: { displayName: "用户 A" },
            time: "2026-01-01T00:00:00Z",
            message: [
              { type: "text", content: "hello" },
              { type: "image", id: imageMd5, format: "png", file: false, width: 1, height: 1 },
              { type: "audio", id: audioMd5, format: "mp3", file: false, durationSeconds: 1 },
            ],
          },
        ],
      },
    ]);

    expect(references).toEqual([
      { fileMd5: imageMd5, refPath: "$[0].content[0].message[1]", elementType: "image" },
      { fileMd5: audioMd5, refPath: "$[0].content[0].message[2]", elementType: "audio" },
    ]);
  });

  it("素材引用同时记录直接 fileMd5 和元素引用", () => {
    const fileMd5 = "c".repeat(32);

    expect(
      assetFileReferences({
        fileMd5,
        kind: "image",
        element: { type: "image", id: fileMd5, format: "png", file: false, width: 1, height: 1 },
      }),
    ).toEqual([
      { fileMd5, refPath: "element", elementType: "image" },
      { fileMd5, refPath: "fileMd5", elementType: "image" },
    ]);
  });

  it("替换 owner 引用时先删旧引用再批量写入新引用", async () => {
    const tx = {
      mediaFileReference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    await expect(
      replaceMediaFileReferences(tx, "media_content", "content-id", [
        { fileMd5: "d".repeat(32), refPath: "$[0]", elementType: "image" },
        { fileMd5: "d".repeat(32), refPath: "$[0]", elementType: "image" },
        { fileMd5: "e".repeat(32), refPath: "$[1]", elementType: "file" },
      ]),
    ).resolves.toBe(2);

    expect(tx.mediaFileReference.deleteMany).toHaveBeenCalledWith({ where: { ownerType: "media_content", ownerId: "content-id" } });
    expect(tx.mediaFileReference.createMany).toHaveBeenCalledWith({
      data: [
        { fileMd5: "d".repeat(32), ownerType: "media_content", ownerId: "content-id", refPath: "$[0]", elementType: "image" },
        { fileMd5: "e".repeat(32), ownerType: "media_content", ownerId: "content-id", refPath: "$[1]", elementType: "file" },
      ],
      skipDuplicates: true,
    });
  });

  it("批量删除 owner 引用时会去重空值", async () => {
    const tx = {
      mediaFileReference: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn(),
      },
    };

    await expect(deleteMediaFileReferences(tx, "media_asset", ["asset-id", "asset-id", " "])).resolves.toBe(1);

    expect(tx.mediaFileReference.deleteMany).toHaveBeenCalledWith({ where: { ownerType: "media_asset", ownerId: { in: ["asset-id"] } } });
  });
});
