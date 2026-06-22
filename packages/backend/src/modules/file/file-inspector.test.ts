import { describe, expect, it } from "vitest";
import { inspectFileBuffer } from "./file-inspector.js";

function pngBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function gifBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(10);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function mp4Buffer() {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32BE(32, 0);
  buffer.write("ftyp", 4, "ascii");
  buffer.write("isom", 8, "ascii");
  buffer.write("mp41", 16, "ascii");
  return buffer;
}

describe("inspectFileBuffer", () => {
  it("识别 png 的格式和尺寸", () => {
    const result = inspectFileBuffer(pngBuffer(320, 180));

    expect(result.mimeType).toBe("image/png");
    expect(result.format).toBe("png");
    expect(result.width).toBe(320);
    expect(result.height).toBe(180);
    expect(result.md5).toMatch(/^[0-9a-f]{32}$/);
  });

  it("识别 gif 的格式和尺寸", () => {
    const result = inspectFileBuffer(gifBuffer(48, 32));

    expect(result.mimeType).toBe("image/gif");
    expect(result.format).toBe("gif");
    expect(result.width).toBe(48);
    expect(result.height).toBe(32);
  });

  it("识别 mp4 视频格式", () => {
    const result = inspectFileBuffer(mp4Buffer());

    expect(result.mimeType).toBe("video/mp4");
    expect(result.format).toBe("mp4");
  });

  it("识别 mp3 音频格式", () => {
    const result = inspectFileBuffer(Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000audio"));

    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.format).toBe("mp3");
  });

  it("识别 wav 音频格式", () => {
    const buffer = Buffer.alloc(16);
    buffer.write("RIFF", 0, "ascii");
    buffer.write("WAVE", 8, "ascii");
    const result = inspectFileBuffer(buffer);

    expect(result.mimeType).toBe("audio/wav");
    expect(result.format).toBe("wav");
  });

  it("未知格式走通用文件兜底", () => {
    const result = inspectFileBuffer(Buffer.from("not an image"));

    expect(result.mimeType).toBe("application/octet-stream");
    expect(result.format).toBe("bin");
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});
