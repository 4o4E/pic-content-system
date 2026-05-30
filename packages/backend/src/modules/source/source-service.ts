import type { MediaElement, SourceBindingDto, SourceProfileDto } from "@pic/shared";
import type { Prisma, SourceBinding } from "@prisma/client";
import { nextSnowflakeId } from "../../lib/snowflake.js";
import { firstFileMd5 } from "../media/media-utils.js";

export function toSourceBindingDto(source: SourceBinding): SourceBindingDto {
  return {
    id: source.id,
    platform: source.platform as SourceBindingDto["platform"],
    groupId: source.platformGroupId ?? undefined,
    userId: source.platformUserId ?? undefined,
    messageId: source.platformMessageId ?? undefined,
    fileId: source.platformFileId ?? undefined,
    sourceKey: source.sourceKey ?? undefined,
    sourceIndex: source.sourceIndex ?? undefined,
    raw: source.raw,
  };
}

export async function writeSourceBinding(
  tx: Prisma.TransactionClient,
  contentId: string | undefined,
  elements: MediaElement[],
  source: SourceBindingDto | undefined,
) {
  if (!source?.platform) return undefined;

  const sourceKey = source.sourceKey?.trim() || source.fileId?.trim() || firstFileMd5(elements) || (contentId ? `content:${contentId}` : undefined);
  if (!sourceKey) return undefined;
  const platformMessageId = source.messageId?.trim() || (source.platform === "import" ? `import:${sourceKey}` : undefined);
  const platformFileId = source.fileId?.trim() || (source.platform === "import" ? sourceKey : undefined);
  const raw = (source.raw ?? {}) as Prisma.InputJsonValue;

  // 同一平台消息内多文件用 sourceKey 区分，避免多图消息互相覆盖。
  const existing = await tx.sourceBinding.findFirst({
    where: {
      platform: source.platform,
      platformMessageId,
      sourceKey,
    },
  });

  if (existing) {
    return tx.sourceBinding.update({
      where: { id: existing.id },
      data: {
        contentId,
        platformGroupId: source.groupId,
        platformUserId: source.userId,
        platformFileId,
        sourceIndex: source.sourceIndex,
        raw,
      },
    });
  }

  return tx.sourceBinding.create({
    data: {
      id: nextSnowflakeId(),
      contentId,
      platform: source.platform,
      platformMessageId,
      platformGroupId: source.groupId,
      platformUserId: source.userId,
      platformFileId,
      sourceKey,
      sourceIndex: source.sourceIndex,
      raw,
    },
  });
}

function rawObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromRaw(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function resolveSourceProfile(source: SourceBindingDto | undefined): SourceProfileDto | undefined {
  if (!source) return undefined;
  const raw = rawObject(source.raw);
  if (source.platform === "qq" || source.platform === "napcat") {
    return {
      platform: source.platform,
      userId: source.userId,
      groupId: source.groupId,
      messageId: source.messageId,
      fileId: source.fileId,
      displayName: stringFromRaw(raw, ["displayName", "nickname", "nick", "senderName", "sendNickName", "sendMemberName"]),
      groupName: stringFromRaw(raw, ["groupName", "peerName"]),
    };
  }
  return {
    platform: source.platform,
    userId: source.userId,
    groupId: source.groupId,
    messageId: source.messageId,
    fileId: source.fileId,
  };
}
