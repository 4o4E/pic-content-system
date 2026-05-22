-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('submit', 'approve', 'reject', 'archive', 'reset', 'delete');

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "from_state" "AuditState",
    "to_state" "AuditState",
    "operator_platform" TEXT,
    "operator_user_id" TEXT,
    "reason" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_event_content_id_created_at_idx" ON "audit_event"("content_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_event_to_state_created_at_idx" ON "audit_event"("to_state", "created_at");
