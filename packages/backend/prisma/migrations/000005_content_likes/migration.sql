-- CreateTable
CREATE TABLE "content_like" (
    "id" VARCHAR(16) NOT NULL,
    "content_id" VARCHAR(16) NOT NULL,
    "source" TEXT NOT NULL,
    "like_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_like_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_like_content_id_source_like_date_key" ON "content_like"("content_id", "source", "like_date");

-- CreateIndex
CREATE INDEX "content_like_content_id_like_date_idx" ON "content_like"("content_id", "like_date");

-- CreateIndex
CREATE INDEX "content_like_source_like_date_idx" ON "content_like"("source", "like_date");

-- CreateIndex
CREATE INDEX "media_content_audit_state_created_at_idx" ON "media_content"("audit_state", "created_at");

-- CreateIndex
CREATE INDEX "media_content_audit_state_like_count_created_at_idx" ON "media_content"("audit_state", "like_count", "created_at");

-- AddForeignKey
ALTER TABLE "content_like" ADD CONSTRAINT "content_like_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "media_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
