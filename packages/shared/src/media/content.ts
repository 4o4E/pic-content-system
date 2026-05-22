import type { MediaElement, MediaType } from "./element";
import type { SourceBindingDto } from "../platform/source";

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
