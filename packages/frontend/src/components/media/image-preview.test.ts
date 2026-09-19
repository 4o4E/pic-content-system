import { describe, expect, it } from "vitest";
import { createInitialTransform } from "./image-preview";

describe("预览图片的初始显示", () => {
  const viewport = { width: 1000, height: 700 };

  it("普通竖图完整显示", () => {
    expect(createInitialTransform({ width: 1000, height: 2000 }, viewport)).toMatchObject({ x: 0, y: 0, scale: 0.27 });
  });

  it("比例恰好为 1:4 时仍完整显示", () => {
    expect(createInitialTransform({ width: 1000, height: 4000 }, viewport)).toMatchObject({ x: 0, y: 0, scale: 0.135 });
  });

  it("比例超过 1:4 时按宽度显示并从顶部开始", () => {
    expect(createInitialTransform({ width: 1000, height: 4001 }, viewport)).toMatchObject({ x: 0, y: 1570.5, scale: 1 });
  });
});
