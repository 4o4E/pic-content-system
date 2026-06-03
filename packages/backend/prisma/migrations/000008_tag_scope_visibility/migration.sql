CREATE TYPE "TagVisibility" AS ENUM ('public', 'private');

ALTER TABLE "tag"
ADD COLUMN "visibility" "TagVisibility" NOT NULL DEFAULT 'private',
ADD COLUMN "scope" VARCHAR(96);

CREATE INDEX "tag_visibility_scope_idx" ON "tag"("visibility", "scope");
