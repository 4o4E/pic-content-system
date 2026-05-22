-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video', 'audio', 'text', 'file', 'speak', 'discuss', 'composite');

-- CreateEnum
CREATE TYPE "AuditState" AS ENUM ('pending', 'approved', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('pending', 'selected', 'used', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "WorkspaceDraftStatus" AS ENUM ('editing', 'submitted', 'discarded');

-- CreateTable
CREATE TABLE "media_file" (
    "md5" CHAR(32) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT,
    "format" TEXT,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" DECIMAL(65,30),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_file_pkey" PRIMARY KEY ("md5")
);

-- CreateTable
CREATE TABLE "media_content" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "MediaType" NOT NULL,
    "title" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "elements" JSONB NOT NULL,
    "sign" CHAR(32) NOT NULL,
    "audit_state" "AuditState" NOT NULL DEFAULT 'approved',
    "like_count" BIGINT NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_binding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_id" UUID,
    "platform" TEXT NOT NULL,
    "platform_message_id" TEXT,
    "platform_group_id" TEXT,
    "platform_user_id" TEXT,
    "platform_file_id" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "MediaType" NOT NULL,
    "file_md5" CHAR(32),
    "element" JSONB NOT NULL,
    "source_id" UUID,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_draft" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "elements" JSONB NOT NULL DEFAULT '[]',
    "asset_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "WorkspaceDraftStatus" NOT NULL DEFAULT 'editing',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_event_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingest_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_content_sign_key" ON "media_content"("sign");

-- CreateIndex
CREATE INDEX "media_content_type_idx" ON "media_content"("type");

-- CreateIndex
CREATE INDEX "media_content_audit_state_idx" ON "media_content"("audit_state");

-- CreateIndex
CREATE INDEX "source_binding_platform_platform_group_id_idx" ON "source_binding"("platform", "platform_group_id");

-- CreateIndex
CREATE INDEX "source_binding_platform_platform_user_id_idx" ON "source_binding"("platform", "platform_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_binding_platform_platform_message_id_key" ON "source_binding"("platform", "platform_message_id");

-- CreateIndex
CREATE INDEX "media_asset_kind_idx" ON "media_asset"("kind");

-- CreateIndex
CREATE INDEX "media_asset_status_created_at_idx" ON "media_asset"("status", "created_at");

-- CreateIndex
CREATE INDEX "media_asset_file_md5_idx" ON "media_asset"("file_md5");

-- CreateIndex
CREATE INDEX "workspace_draft_status_updated_at_idx" ON "workspace_draft"("status", "updated_at");

-- CreateIndex
CREATE INDEX "content_tag_tag_idx" ON "content_tag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "content_tag_content_id_tag_key" ON "content_tag"("content_id", "tag");

-- CreateIndex
CREATE INDEX "ingest_event_source_status_idx" ON "ingest_event"("source", "status");

-- CreateIndex
CREATE INDEX "ingest_event_platform_platform_event_id_idx" ON "ingest_event"("platform", "platform_event_id");

-- AddForeignKey
ALTER TABLE "source_binding" ADD CONSTRAINT "source_binding_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "media_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_file_md5_fkey" FOREIGN KEY ("file_md5") REFERENCES "media_file"("md5") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_binding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
