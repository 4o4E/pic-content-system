-- DropForeignKey
ALTER TABLE "source_binding" DROP CONSTRAINT IF EXISTS "source_binding_content_id_fkey";
ALTER TABLE "media_asset" DROP CONSTRAINT IF EXISTS "media_asset_source_id_fkey";

-- DropDefault
ALTER TABLE "media_content" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "source_binding" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "media_asset" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "workspace_draft" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "content_tag" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "audit_event" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "ingest_event" ALTER COLUMN "id" DROP DEFAULT;

-- AlterColumn
ALTER TABLE "media_content" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "source_binding" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "source_binding" ALTER COLUMN "content_id" TYPE VARCHAR(16) USING "content_id"::TEXT::VARCHAR(16);
ALTER TABLE "media_asset" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "media_asset" ALTER COLUMN "source_id" TYPE VARCHAR(16) USING "source_id"::TEXT::VARCHAR(16);
ALTER TABLE "workspace_draft" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "workspace_draft" ALTER COLUMN "asset_ids" TYPE VARCHAR(16)[] USING "asset_ids"::TEXT[]::VARCHAR(16)[];
ALTER TABLE "content_tag" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "content_tag" ALTER COLUMN "content_id" TYPE VARCHAR(16) USING "content_id"::TEXT::VARCHAR(16);
ALTER TABLE "audit_event" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);
ALTER TABLE "audit_event" ALTER COLUMN "content_id" TYPE VARCHAR(16) USING "content_id"::TEXT::VARCHAR(16);
ALTER TABLE "ingest_event" ALTER COLUMN "id" TYPE VARCHAR(16) USING "id"::TEXT::VARCHAR(16);

-- AddForeignKey
ALTER TABLE "source_binding" ADD CONSTRAINT "source_binding_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "media_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_binding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
