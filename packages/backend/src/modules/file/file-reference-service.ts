import type { MediaElement, MediaType } from "@pic/shared";
import type { Prisma } from "@prisma/client";

export type MediaFileReferenceOwnerType = "media_content" | "media_asset" | "workspace_draft";

export interface MediaFileReferenceInput {
  fileMd5: string;
  refPath: string;
  elementType?: MediaType;
}

type MediaFileReferenceDelegate = Pick<Prisma.TransactionClient["mediaFileReference"], "createMany" | "deleteMany">;

interface MediaFileReferenceClient {
  mediaFileReference: MediaFileReferenceDelegate;
}

const FILE_MD5_RE = /^[0-9a-f]{32}$/;
const BINARY_ELEMENT_TYPES = new Set<MediaType>(["image", "video", "audio", "file"]);

function normalizeFileMd5(value: unknown) {
  if (typeof value !== "string") return undefined;
  const md5 = value.trim().toLowerCase();
  return FILE_MD5_RE.test(md5) ? md5 : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBinaryElementType(value: unknown): value is MediaType {
  return typeof value === "string" && BINARY_ELEMENT_TYPES.has(value as MediaType);
}

function pushReference(references: MediaFileReferenceInput[], fileMd5: unknown, refPath: string, elementType?: unknown) {
  const normalized = normalizeFileMd5(fileMd5);
  if (!normalized) return;
  references.push({
    fileMd5: normalized,
    refPath,
    elementType: isBinaryElementType(elementType) ? elementType : undefined,
  });
}

export function collectFileReferencesFromElements(elements: unknown, rootPath = "$"): MediaFileReferenceInput[] {
  const references: MediaFileReferenceInput[] = [];

  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;

    const type = value.type;
    if (isBinaryElementType(type)) {
      pushReference(references, value.id, path, type);
    }

    // 递归解析 speak/discuss 等嵌套结构，保证聊天记录里的图片也进入引用表。
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) || isRecord(child)) visit(child, `${path}.${key}`);
    }
  };

  visit(elements, rootPath);
  return uniqueReferences(references);
}

export function contentFileReferences(elements: MediaElement[]) {
  return collectFileReferencesFromElements(elements);
}

export function assetFileReferences(asset: { fileMd5?: string | null; element: unknown; kind?: MediaType }) {
  const references = collectFileReferencesFromElements(asset.element, "element");
  if (asset.fileMd5) pushReference(references, asset.fileMd5, "fileMd5", asset.kind);
  return uniqueReferences(references);
}

function uniqueReferences(references: MediaFileReferenceInput[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.fileMd5}\0${reference.refPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function replaceMediaFileReferences(
  tx: MediaFileReferenceClient,
  ownerType: MediaFileReferenceOwnerType,
  ownerId: string,
  references: MediaFileReferenceInput[],
) {
  await tx.mediaFileReference.deleteMany({ where: { ownerType, ownerId } });
  const data = uniqueReferences(references).map((reference) => ({
    fileMd5: reference.fileMd5,
    ownerType,
    ownerId,
    refPath: reference.refPath,
    elementType: reference.elementType,
  }));
  if (data.length === 0) return 0;
  const result = await tx.mediaFileReference.createMany({ data, skipDuplicates: true });
  return result.count;
}

export async function deleteMediaFileReferences(tx: MediaFileReferenceClient, ownerType: MediaFileReferenceOwnerType, ownerIds: string[]) {
  const ids = Array.from(new Set(ownerIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return 0;
  const result = await tx.mediaFileReference.deleteMany({ where: { ownerType, ownerId: { in: ids } } });
  return result.count;
}
