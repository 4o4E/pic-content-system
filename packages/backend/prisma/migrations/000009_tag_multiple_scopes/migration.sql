ALTER TABLE "tag"
ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "tag"
SET "scopes" = CASE
    WHEN "scope" IS NULL OR BTRIM("scope") = '' THEN ARRAY[]::TEXT[]
    ELSE ARRAY["scope"]::TEXT[]
END;

DROP INDEX IF EXISTS "tag_visibility_scope_idx";

ALTER TABLE "tag"
DROP COLUMN "scope";

CREATE INDEX "tag_visibility_idx" ON "tag"("visibility");
CREATE INDEX "tag_scopes_gin_idx" ON "tag" USING GIN ("scopes");
