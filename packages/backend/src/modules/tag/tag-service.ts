import type { Prisma, PrismaClient, TagVisibility } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { nextSnowflakeId } from "../../lib/snowflake.js";

type PrismaLike = PrismaClient | Prisma.TransactionClient;
const tagScopePattern = /^[a-z][a-z0-9_-]*:[^\s:]+$/i;

export function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase();
}

export function normalizeTagScope(scope: string | null | undefined) {
  const normalized = scope?.trim();
  if (!normalized) return undefined;
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex < 0) return normalized;
  return `${normalized.slice(0, separatorIndex).toLowerCase()}:${normalized.slice(separatorIndex + 1)}`;
}

export function isValidTagScope(scope: string) {
  return tagScopePattern.test(scope);
}

export function normalizeTagScopes(scopes: Array<string | null | undefined> | undefined) {
  return Array.from(new Set((scopes ?? []).map(normalizeTagScope).filter((scope): scope is string => Boolean(scope))));
}

export function tagScopeData(visibility: TagVisibility, scopes: Array<string | null | undefined> | undefined) {
  const normalizedScopes = normalizeTagScopes(scopes);
  return {
    visibility,
    // public tag 对所有 scope 可见，持久化时清空 scopes 避免误读。
    scopes: visibility === "public" ? [] : normalizedScopes,
  };
}

export function normalizeTags(tags: string[] | undefined) {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

export async function resolveTagAliases(db: PrismaLike, tags: string[] | undefined) {
  const normalizedTags = normalizeTags(tags);
  const aliases = Array.from(new Set(normalizedTags.map(normalizeAlias)));
  if (aliases.length === 0) return [];

  const rows = await db.tagAlias.findMany({ where: { alias: { in: aliases } } });
  const aliasMap = new Map(rows.map((row) => [row.alias, row.tag]));
  return normalizeTags(normalizedTags.map((tag) => aliasMap.get(normalizeAlias(tag)) ?? tag));
}

export async function resolveTagsWithDefaultDb(tags: string[] | undefined) {
  return resolveTagAliases(prisma, tags);
}

export async function syncContentTags(tx: Prisma.TransactionClient, contentId: string, tags: string[]) {
  await tx.contentTag.deleteMany({ where: { contentId } });
  if (tags.length > 0) {
    await tx.tag.createMany({
      data: tags.map((name) => ({ name })),
      skipDuplicates: true,
    });
    await tx.contentTag.createMany({
      data: tags.map((tag) => ({ id: nextSnowflakeId(), contentId, tag })),
      skipDuplicates: true,
    });
  }
}
