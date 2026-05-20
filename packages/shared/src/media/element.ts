export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "file"
  | "speak"
  | "discuss"
  | "composite";

export interface TextElement {
  type: "text";
  content: string;
}

export interface BinaryElement {
  type: "file";
  id: string;
  format: string;
  file: true;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ImageElement {
  type: "image";
  id: string;
  format: string;
  file: boolean;
  width: number;
  height: number;
}

export interface VideoElement {
  type: "video";
  id: string;
  format: string;
  file: boolean;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface AudioElement {
  type: "audio";
  id: string;
  format: string;
  file: boolean;
  durationSeconds: number;
}

export interface PlatformUserSnapshot {
  platform?: string;
  platformUserId?: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SpeakElement {
  type: "speak";
  sender: PlatformUserSnapshot;
  time: string;
  message: MediaElement[];
}

export interface DiscussElement {
  type: "discuss";
  content: SpeakElement[];
}

export type MediaElement =
  | TextElement
  | BinaryElement
  | ImageElement
  | VideoElement
  | AudioElement
  | SpeakElement
  | DiscussElement;

export function inferMediaType(elements: MediaElement[]): MediaType {
  if (elements.length !== 1) return "composite";
  return elements[0]?.type ?? "composite";
}
