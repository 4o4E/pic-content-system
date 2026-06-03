import { describe, expect, it } from "vitest";
import { isValidTagScope, normalizeAlias, normalizeTagScope, normalizeTagScopes, normalizeTags, resolveTagAliases, tagScopeData } from "./tag-service.js";

describe("tag-service", () => {
  it("alias key 统一 trim 后小写", () => {
    expect(normalizeAlias(" DT ")).toBe("dt");
  });

  it("tag 只 trim、去空、去重，保留原始显示文本", () => {
    expect(normalizeTags([" 弔图 ", "", "弔图", "DT"])).toEqual(["弔图", "DT"]);
  });

  it("scope 需要按 platform:id 格式保存", () => {
    expect(normalizeTagScope(" qq:123456 ")).toBe("qq:123456");
    expect(normalizeTagScope(" QQ:123456 ")).toBe("qq:123456");
    expect(normalizeTagScopes([" qq:123456 ", "qq:654321", "qq:123456"])).toEqual(["qq:123456", "qq:654321"]);
    expect(isValidTagScope("qq:123456")).toBe(true);
    expect(isValidTagScope("qq 123456")).toBe(false);
    expect(tagScopeData("public", ["qq:123456"])).toEqual({ visibility: "public", scopes: [] });
    expect(tagScopeData("private", ["qq:123456", "qq:654321"])).toEqual({ visibility: "private", scopes: ["qq:123456", "qq:654321"] });
    expect(tagScopeData("private", [""])).toEqual({ visibility: "private", scopes: [] });
  });

  it("解析 alias 后去重", async () => {
    const db = {
      tagAlias: {
        findMany: async () => [{ alias: "dt", tag: "弔图" }],
      },
    };

    const result = await resolveTagAliases(db as never, ["DT", "弔图"]);

    expect(result).toEqual(["弔图"]);
  });
});
