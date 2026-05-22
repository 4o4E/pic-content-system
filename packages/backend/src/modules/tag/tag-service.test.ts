import { describe, expect, it } from "vitest";
import { normalizeAlias, normalizeTags, resolveTagAliases } from "./tag-service.js";

describe("tag-service", () => {
  it("alias key 统一 trim 后小写", () => {
    expect(normalizeAlias(" DT ")).toBe("dt");
  });

  it("tag 只 trim、去空、去重，保留原始显示文本", () => {
    expect(normalizeTags([" 弔图 ", "", "弔图", "DT"])).toEqual(["弔图", "DT"]);
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
