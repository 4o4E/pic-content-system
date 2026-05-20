import type { MediaAssetDto, MediaContentDto, MediaElement, MediaFileDto } from "@pic/shared";
import type { MediaAsset, MediaContent, MediaFile, Prisma } from "@prisma/client";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asElements(value: Prisma.JsonValue): MediaElement[] {
  return Array.isArray(value) ? (value as unknown as MediaElement[]) : [];
}

export function toMediaContentDto(content: MediaContent): MediaContentDto {
  return {
    id: content.id,
    type: content.type,
    title: content.title ?? undefined,
    tags: asStringArray(content.tags),
    elements: asElements(content.elements),
    sign: content.sign,
    auditState: content.auditState,
    likeCount: Number(content.likeCount),
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
