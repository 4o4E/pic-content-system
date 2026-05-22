import { describe, expect, it } from "vitest";
import { nextSnowflakeId } from "./snowflake.js";

describe("snowflake id", () => {
  it("生成 base62 雪花 ID", () => {
    const ids = Array.from({ length: 1000 }, () => nextSnowflakeId());

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9A-Za-z]{1,16}$/.test(id))).toBe(true);
  });
});
