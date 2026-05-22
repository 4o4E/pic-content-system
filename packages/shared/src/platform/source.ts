export type Platform = "qq" | "napcat" | "telegram" | "discord" | "web" | "manual" | "import";

export interface PlatformSource {
  platform: Platform;
  groupId?: string;
  userId?: string;
  messageId?: string;
  fileId?: string;
}

export interface SourceBindingDto extends PlatformSource {
  id?: string;
  sourceKey?: string;
  sourceIndex?: number;
  raw?: unknown;
}

export interface SourceProfileDto {
  platform: Platform;
  userId?: string;
  groupId?: string;
  messageId?: string;
  fileId?: string;
  displayName?: string;
  avatarUrl?: string;
  groupName?: string;
}
