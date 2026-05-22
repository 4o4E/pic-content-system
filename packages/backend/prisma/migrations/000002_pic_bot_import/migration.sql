-- CreateTable
CREATE TABLE "tag_alias" (
    "alias" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tag_alias_pkey" PRIMARY KEY ("alias")
);

-- AlterTable
ALTER TABLE "source_binding" ADD COLUMN "source_key" TEXT;
ALTER TABLE "source_binding" ADD COLUMN "source_index" INTEGER;

-- DropIndex
DROP INDEX "source_binding_platform_platform_message_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "source_binding_platform_platform_message_id_source_key_key" ON "source_binding"("platform", "platform_message_id", "source_key");
