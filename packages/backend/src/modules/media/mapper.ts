import type { MediaAssetDto, MediaContentDto, MediaElement, MediaFileDto } from "@pic/shared";
import type { MediaAsset, MediaContent, MediaFile, Prisma, SourceBinding } from "@prisma/client";
import { toSourceBindingDto } from "../source/source-service.js";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asElements(value: Prisma.JsonValue): MediaElement[] {
  return Array.isArray(value) ? (value as unknown as MediaElement[]) : [];
}

type MediaContentWithSources = MediaContent & { sources?: SourceBinding[] };

export function toMediaContentDto(content: MediaContentWithSources): MediaContentDto {
  return {
    id: content.id,
    type: content.type,
    title: content.title ?? undefined,
    tags: asStringArray(content.tags),
    elements: asElements(content.elements),
    sign: content.sign,
    auditState: content.auditState,
    likeCount: Number(content.likeCount),
    source: content.sources?.[0] ? toSourceBindingDto(content.sources[0]) : undefined,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
  };
}

export function toMediaAssetDto(asset: MediaAsset): MediaAssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    fileMd5: asset.fileMd5 ?? undefined,
    element: asset.element as unknown as MediaElement,
    sourceId: asset.sourceId ?? undefined,
    status: asset.status,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function toMediaFileDto(file: MediaFile): MediaFileDto {
  return {
    md5: file.md5,
    storageKey: file.storageKey,
    mimeType: file.mimeType ?? undefined,
    format: file.format ?? undefined,
    sizeBytes: Number(file.sizeBytes),
    width: file.width ?? undefined,
    height: file.height ?? undefined,
    durationSeconds: file.durationSeconds == null ? undefined : Number(file.durationSeconds),
    createdAt: file.createdAt.toISOString(),
  };
}
