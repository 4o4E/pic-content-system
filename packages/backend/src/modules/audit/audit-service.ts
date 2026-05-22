import type { AuditActionDto, AuditEventDto } from "@pic/shared";
import type { AuditAction, AuditState, Prisma } from "@prisma/client";

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
    fromState: event.fromState ?? undefined,
    toState: event.toState ?? undefined,
    operator,
    reason: event.reason ?? undefined,
    createdAt: event.createdAt.toISOString(),
  };
}
