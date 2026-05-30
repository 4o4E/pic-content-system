import type { MediaElement } from "@pic/shared";
import { describe, expect, it } from "vitest";
import { contentSign, fileMd5FromElement, firstFileMd5, flattenChatRecordElements, inferContentType, normalizeIds } from "./media-utils.js";

describe("media-utils", () => {
  it("相同元素生成稳定 sign", () => {
    const elements = [{ type: "text", content: "hello" }];

    expect(contentSign(elements)).toBe(contentSign(elements));
    expect(contentSign(elements)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("单元素返回元素类型，多元素返回 composite", () => {
    expect(inferContentType([{ type: "text", content: "hello" }])).toBe("text");
    expect(inferContentType([])).toBe("composite");
    expect(inferContentType([{ type: "text", content: "a" }, { type: "text", content: "b" }])).toBe("composite");
  });

  it("只从文件类元素提取 md5", () => {
    const image: MediaElement = { type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 };
    const text: MediaElement = { type: "text", content: "hello" };

    expect(fileMd5FromElement(image)).toBe("a".repeat(32));
    expect(fileMd5FromElement(text)).toBeUndefined();
    expect(firstFileMd5([text, image])).toBe("a".repeat(32));
  });

  it("id 列表 trim、去空、去重", () => {
    expect(normalizeIds([" a ", "", "a", "b"])).toEqual(["a", "b"]);
  });

  it("聊天记录转复合元素时丢弃发送人并保留消息顺序", () => {
    const image: MediaElement = { type: "image", id: "a".repeat(32), format: "png", file: false, width: 1, height: 1 };
    const result = flattenChatRecordElements([
      {
        type: "discuss",
        content: [
          {
            type: "speak",
            sender: { displayName: "用户 A" },
            time: "2026-01-01T00:00:00Z",
            message: [{ type: "text", content: "第一句" }, image],
          },
          {
            type: "speak",
            sender: { displayName: "用户 B" },
            time: "2026-01-01T00:00:01Z",
            message: [{ type: "text", content: "第二句" }],
          },
        ],
      },
    ]);

    expect(result).toEqual({
      hasChatRecord: true,
      elements: [{ type: "text", content: "第一句" }, image, { type: "text", content: "第二句" }],
      unsupportedReason: undefined,
    });
  });

  it("聊天记录包含视频或音频时不能转复合元素", () => {
    const result = flattenChatRecordElements([
      {
        type: "speak",
        sender: { displayName: "用户 A" },
        time: "2026-01-01T00:00:00Z",
        message: [{ type: "audio", id: "a".repeat(32), format: "mp3", file: false, durationSeconds: 1 }],
      },
    ]);

    expect(result.unsupportedReason).toBe("聊天记录中包含视频或音频，不能转为复合内容");
  });
});
