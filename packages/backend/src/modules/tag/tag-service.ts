import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { nextSnowflakeId } from "../../lib/snowflake.js";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase();
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
    await tx.contentTag.createMany({
      data: tags.map((tag) => ({ id: nextSnowflakeId(), contentId, tag })),
      skipDuplicates: true,
    });
  }
}
