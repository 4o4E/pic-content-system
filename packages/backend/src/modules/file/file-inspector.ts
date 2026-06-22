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

export const COMMON_IMAGE_FORMATS = ["png", "jpg", "gif", "webp"] as const;
export const COMMON_VIDEO_FORMATS = ["mp4", "webm", "mov"] as const;
export const COMMON_AUDIO_FORMATS = ["mp3", "wav", "ogg", "flac", "m4a"] as const;

const COMMON_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const COMMON_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const COMMON_AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4"]);

export function commonImageFormatText() {
  return COMMON_IMAGE_FORMATS.join("、");
}

export function isCommonImageInspection(inspection: FileInspection) {
  return COMMON_IMAGE_MIME_TYPES.has(inspection.mimeType) && COMMON_IMAGE_FORMATS.includes(inspection.format as (typeof COMMON_IMAGE_FORMATS)[number]);
}

export function isCommonVideoInspection(inspection: FileInspection) {
  return COMMON_VIDEO_MIME_TYPES.has(inspection.mimeType) && COMMON_VIDEO_FORMATS.includes(inspection.format as (typeof COMMON_VIDEO_FORMATS)[number]);
}

export function isCommonAudioInspection(inspection: FileInspection) {
  return COMMON_AUDIO_MIME_TYPES.has(inspection.mimeType) && COMMON_AUDIO_FORMATS.includes(inspection.format as (typeof COMMON_AUDIO_FORMATS)[number]);
}

function isoBaseMediaType(buffer: Buffer) {
  if (buffer.length < 12 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") return undefined;
  const majorBrand = buffer.subarray(8, 12).toString("ascii").trim();
  const compatibleBrands = buffer.subarray(16, Math.min(buffer.length, 128)).toString("ascii");
  const brands = `${majorBrand} ${compatibleBrands}`;
  if (majorBrand === "qt" || compatibleBrands.includes("qt  ")) return { mimeType: "video/quicktime", format: "mov" };
  if (/\b(M4A |mp4a)\b/.test(brands)) return { mimeType: "audio/mp4", format: "m4a" };
  return { mimeType: "video/mp4", format: "mp4" };
}

function ebmlMediaType(buffer: Buffer) {
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return undefined;
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("latin1").toLowerCase();
  if (head.includes("webm")) return { mimeType: "video/webm", format: "webm" };
  if (head.includes("matroska")) return { mimeType: "video/x-matroska", format: "mkv" };
  return undefined;
}

function isMp3FrameHeader(buffer: Buffer) {
  if (buffer.length < 2) return false;
  return buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0;
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

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE") {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "audio/wav",
      format: "wav",
    };
  }

  if (buffer.subarray(0, 3).toString("ascii") === "ID3" || isMp3FrameHeader(buffer)) {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "audio/mpeg",
      format: "mp3",
    };
  }

  if (buffer.subarray(0, 4).toString("ascii") === "OggS") {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "audio/ogg",
      format: "ogg",
    };
  }

  if (buffer.subarray(0, 4).toString("ascii") === "fLaC") {
    return {
      md5,
      sizeBytes: buffer.length,
      mimeType: "audio/flac",
      format: "flac",
    };
  }

  const isoMedia = isoBaseMediaType(buffer);
  if (isoMedia) {
    return {
      md5,
      sizeBytes: buffer.length,
      ...isoMedia,
    };
  }

  const ebmlMedia = ebmlMediaType(buffer);
  if (ebmlMedia) {
    return {
      md5,
      sizeBytes: buffer.length,
      ...ebmlMedia,
    };
  }

  return {
    md5,
    sizeBytes: buffer.length,
    mimeType: "application/octet-stream",
    format: "bin",
  };
}
