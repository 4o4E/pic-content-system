import crypto from "node:crypto";

export interface FileInspection {
  md5: string;
  sizeBytes: number;
  mimeType: string;
  format: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

function jpegSize(buffer: Buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    if (marker && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function webpSize(buffer: Buffer) {
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return undefined;
}

export function inspectFileBuffer(buffer: Buffer): FileInspection {
  const md5 = crypto.createHash("md5").update(buffer).digest("hex");
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buffer.length >= 24) {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "image/png",
      format: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.subarray(0, 3).toString("ascii") === "GIF" && buffer.length >= 10) {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "image/gif",
      format: "gif",
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "image/jpeg",
      format: "jpg",
      ...jpegSize(buffer),
    };
  }

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "image/webp",
      format: "webp",
      ...webpSize(buffer),
    };
  }

  return {
    md5,
    sizeBytes: buffer.length,
    mimeType: "application/octet-stream",
    format: "bin",
  };
}
