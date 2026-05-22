import type { MediaElement } from "@pic/shared";
import { describe, expect, it } from "vitest";
import { contentSign, fileMd5FromElement, firstFileMd5, inferContentType, normalizeIds } from "./media-utils.js";

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
});
