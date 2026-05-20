export type Platform = "qq" | "napcat" | "telegram" | "discord" | "web" | "manual";

export interface PlatformSource {
  platform: Platform;
  groupId?: string;
  userId?: string;
  messageId?: string;
  fileId?: string;
}

export interface SourceBindingDto extends PlatformSource {
  id?: string;
  raw?: unknown;
}
