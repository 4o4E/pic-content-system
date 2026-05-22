import { describe, expect, it } from "vitest";
import { toMediaAssetDto, toMediaContentDto, toMediaFileDto } from "./mapper.js";

const time = new Date("2026-01-01T00:00:00Z");

describe("media mapper", () => {
  it("内容 DTO 会带上第一个来源", () => {
    const dto = toMediaContentDto({
      id: "content-id",
      type: "image",
      title: null,
      tags: ["弔图", 1] as never,
      elements: [{ type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 }],
      sign: "b".repeat(32),
      auditState: "approved",
      likeCount: BigInt(2),
      metadata: {},
      createdAt: time,
      updatedAt: time,
      sources: [
        {
          id: "source-id",
          contentId: "content-id",
          platform: "import",
          platformMessageId: "msg",
          platformGroupId: null,
          platformUserId: null,
          platformFileId: "file",
          sourceKey: "file",
          sourceIndex: null,
          raw: {},
          createdAt: time,
        },
      ],
    });

    expect(dto.title).toBeUndefined();
    expect(dto.tags).toEqual(["弔图"]);
    expect(dto.likeCount).toBe(2);
    expect(dto.source).toMatchObject({ id: "source-id", platform: "import", messageId: "msg" });
  });

  it("素材和文件 DTO 会把 null 转成 undefined", () => {
    expect(
      toMediaAssetDto({
        id: "asset-id",
        kind: "text",
        fileMd5: null,
        element: { type: "text", content: "hello" },
        sourceId: null,
        status: "pending",
        metadata: {},
        createdAt: time,
        updatedAt: time,
      }),
    ).toMatchObject({ id: "asset-id", fileMd5: undefined, sourceId: undefined });

    expect(
      toMediaFileDto({
        md5: "a".repeat(32),
        storageKey: "objects/a",
        mimeType: null,
        format: null,
        sizeBytes: BigInt(10),
        width: null,
        height: null,
        durationSeconds: null,
        metadata: {},
        createdAt: time,
      }),
    ).toMatchObject({ md5: "a".repeat(32), sizeBytes: 10, mimeType: undefined });
  });
});
