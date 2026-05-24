import type { MediaElement, MediaType } from "./element";
import type { SourceBindingDto, SourceProfileDto } from "../platform/source";

export type AuditState = "pending" | "approved" | "rejected" | "archived";

export interface MediaContentDto {
  id: string;
  type: MediaType;
  title?: string;
  tags: string[];
  elements: MediaElement[];
  sign: string;
  auditState: AuditState;
  likeCount: number;
  source?: SourceBindingDto;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPicImageDto {
  contentBase64: string;
  tags?: string[];
  auditRequired?: boolean;
  source?: SourceBindingDto;
}

export interface PicImageResultDto {
  content?: MediaContentDto;
  asset?: import("./asset").MediaAssetDto;
  file: MediaFileDto;
  existed: boolean;
}

export interface PicRandomResultDto extends MediaContentDto {
  fileMd5?: string;
  fileUrl?: string;
}

export interface PicRandomQueryDto {
  tags?: string[];
  tagMode?: "and" | "or";
  type?: MediaType;
}

export interface UpdateMediaTagsDto {
  tags: string[];
}

export interface PatchMediaTagsDto {
  addTags?: string[];
  removeTags?: string[];
}

export interface AuditOperatorDto {
  platform?: SourceBindingDto["platform"];
  userId?: string;
  raw?: unknown;
}

export interface AuditActionDto {
  operator?: AuditOperatorDto;
  reason?: string;
}

export interface AuditEventDto {
  id: string;
  contentId: string;
  action: "submit" | "approve" | "reject" | "archive" | "reset" | "delete";
  actionLabel: string;
  fromState?: AuditState;
  toState?: AuditState;
  stateChange?: string;
  operator?: AuditOperatorDto;
  operatorLabel: string;
  reason?: string;
  summary: string;
  createdAt: string;
}

export interface AuditListItemDto extends MediaContentDto {
  sourceProfile?: SourceProfileDto;
}

export interface AuditDetailDto {
  content: AuditListItemDto;
  events: AuditEventDto[];
}

export interface CreateMediaContentDto {
  title?: string;
  tags: string[];
  elements: MediaElement[];
  assetIds?: string[];
  source?: SourceBindingDto;
}

export interface BatchUpdateMediaTagsDto {
  ids: string[];
  addTags?: string[];
  removeTags?: string[];
}

export interface BatchDeleteMediaContentsDto {
  ids: string[];
}

export interface BatchRestoreMediaContentsToWorkspaceDto {
  ids: string[];
}

export interface BatchRestoreMediaContentsToWorkspaceResultDto {
  created: number;
  moved: number;
}

export interface BatchMergeMediaContentsDto {
  ids: string[];
}

export interface MediaFileDto {
  md5: string;
  storageKey: string;
  mimeType?: string;
  format?: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  createdAt: string;
}

export interface CreateMediaFileDto {
  contentBase64: string;
  storageKey?: string;
  mimeType?: string;
  format?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}
