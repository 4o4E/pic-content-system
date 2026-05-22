import type { AuditActionDto, AuditEventDto } from "@pic/shared";
import type { AuditAction, AuditState, Prisma } from "@prisma/client";
import { nextSnowflakeId } from "../../lib/snowflake.js";

const actionLabels: Record<AuditAction, string> = {
  submit: "提交",
  approve: "通过",
  reject: "拒绝",
  archive: "归档",
  reset: "重置",
  delete: "删除",
};

const stateLabels: Record<AuditState, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  archived: "已归档",
};

function operatorLabel(event: { operatorPlatform: string | null; operatorUserId: string | null }) {
  if (event.operatorPlatform && event.operatorUserId) return `${event.operatorPlatform}:${event.operatorUserId}`;
  return event.operatorUserId ?? event.operatorPlatform ?? "系统";
}

function stateChangeLabel(fromState: AuditState | null, toState: AuditState | null) {
  if (fromState && toState) return `${stateLabels[fromState]} -> ${stateLabels[toState]}`;
  if (toState) return stateLabels[toState];
  if (fromState) return `原状态 ${stateLabels[fromState]}`;
  return undefined;
}

export async function writeAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    contentId: string;
    action: AuditAction;
    fromState?: AuditState;
    toState?: AuditState;
    body?: AuditActionDto;
  },
) {
  return tx.auditEvent.create({
    data: {
      id: nextSnowflakeId(),
      contentId: input.contentId,
      action: input.action,
      fromState: input.fromState,
      toState: input.toState,
      operatorPlatform: input.body?.operator?.platform,
      operatorUserId: input.body?.operator?.userId,
      reason: input.body?.reason,
      raw: (input.body?.operator?.raw ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export function toAuditEventDto(event: {
  id: string;
  contentId: string;
  action: AuditAction;
  fromState: AuditState | null;
  toState: AuditState | null;
  operatorPlatform: string | null;
  operatorUserId: string | null;
  reason: string | null;
  raw: unknown;
  createdAt: Date;
}): AuditEventDto {
  const actionLabel = actionLabels[event.action];
  const operatorText = operatorLabel(event);
  const stateChange = stateChangeLabel(event.fromState, event.toState);
  const operator =
    event.operatorPlatform || event.operatorUserId
      ? {
          platform: event.operatorPlatform ? (event.operatorPlatform as NonNullable<AuditEventDto["operator"]>["platform"]) : undefined,
          userId: event.operatorUserId ?? undefined,
          raw: event.raw,
        }
      : undefined;

  return {
    id: event.id,
    contentId: event.contentId,
    action: event.action,
    actionLabel,
    fromState: event.fromState ?? undefined,
    toState: event.toState ?? undefined,
    stateChange,
    operator,
    operatorLabel: operatorText,
    reason: event.reason ?? undefined,
    summary: [operatorText, actionLabel, stateChange, event.reason].filter(Boolean).join(" / "),
    createdAt: event.createdAt.toISOString(),
  };
}
