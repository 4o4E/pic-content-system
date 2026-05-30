import crypto from "node:crypto";
import type { MediaElement, MediaType } from "@pic/shared";

export interface FlattenChatRecordResult {
  elements: MediaElement[];
  hasChatRecord: boolean;
  unsupportedReason?: string;
}

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

export function flattenChatRecordElements(elements: MediaElement[]): FlattenChatRecordResult {
  const flattened: MediaElement[] = [];
  let hasChatRecord = false;
  let unsupportedReason: string | undefined;

  const visit = (element: MediaElement, insideChatRecord: boolean) => {
    if (element.type === "discuss") {
      hasChatRecord = true;
      for (const item of element.content) visit(item, true);
      return;
    }

    if (element.type === "speak") {
      hasChatRecord = true;
      for (const item of element.message) visit(item, true);
      return;
    }

    if (insideChatRecord && (element.type === "video" || element.type === "audio")) {
      unsupportedReason = "聊天记录中包含视频或音频，不能转为复合内容";
      return;
    }

    // 聊天记录转复合内容时只保留真实消息元素，不保留发送人和时间等上下文。
    flattened.push(element);
  };

  for (const element of elements) visit(element, false);

  return { elements: flattened, hasChatRecord, unsupportedReason };
}
