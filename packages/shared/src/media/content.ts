import type { MediaElement, MediaType } from "./element";
import type { SourceBindingDto, SourceProfileDto } from "../platform/source";
import type { PageResp } from "../api/page";

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

export interface PicContentItemDto extends MediaContentDto {
  fileMd5?: string;
  fileUrl?: string;
}

export interface PicRandomResultDto extends PicContentItemDto {}

export interface PicRandomQueryDto {
  tags?: string[];
  tagMode?: "and" | "or";
  type?: MediaType;
}

export interface PicContentListQueryDto {
  tags?: string[];
  tagMode?: "and" | "or";
  type?: MediaType | "all";
  page?: number;
  size?: number;
}

export interface LikeMediaContentDto {
  source: string;
  date?: string;
}

export interface LikeMediaContentResultDto {
  contentId: string;
  source: string;
  likeDate: string;
  liked: boolean;
  likeCount: number;
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
  auditRequired?: boolean;
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

export type MediaFileReferenceOwnerType = "media_content" | "media_asset" | "workspace_draft";

export type MediaFileReferenceMode = "all" | "multiple" | "unreferenced";

export interface MediaFileReferenceDto {
  ownerType: MediaFileReferenceOwnerType;
  ownerId: string;
  refPath: string;
  elementType?: MediaType;
  createdAt: string;
}

export interface MediaFileReferenceItemDto extends MediaFileDto {
  referenceCount: number;
  ownerCount: number;
  references: MediaFileReferenceDto[];
}

export interface MediaFileReferenceStatsDto {
  fileCount: number;
  referencedFileCount: number;
  unreferencedFileCount: number;
  multiReferencedFileCount: number;
  referenceCount: number;
}

export interface MediaFileReferenceListDto {
  stats: MediaFileReferenceStatsDto;
  files: PageResp<MediaFileReferenceItemDto>;
}

export interface BatchDeleteMediaFilesDto {
  md5s: string[];
}

export interface BatchDeleteMediaFilesResultDto {
  deleted: number;
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
