import crypto from "node:crypto";
import type { MediaElement, MediaType } from "@pic/shared";

export function contentSign(elements: unknown) {
  return crypto.createHash("md5").update(JSON.stringify(elements)).digest("hex");
}

export function inferContentType(elements: MediaElement[]): MediaType {
  if (elements.length !== 1) return "composite";
  return elements[0]?.type ?? "composite";
}

export function fileMd5FromElement(element: MediaElement) {
  switch (element.type) {
    case "image":
    case "video":
    case "audio":
    case "file":
      return element.id;
    default:
      return undefined;
  }
}

export function firstFileMd5(elements: MediaElement[]) {
  for (const element of elements) {
    const md5 = fileMd5FromElement(element);
    if (md5) return md5;
  }
  return undefined;
}

export function normalizeIds(ids: string[] | undefined) {
  return Array.from(new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)));
}
