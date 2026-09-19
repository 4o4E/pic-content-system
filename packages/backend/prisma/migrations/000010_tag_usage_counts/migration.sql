ALTER TABLE "tag"
ADD COLUMN "add_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "search_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "tag" AS t
SET "add_count" = usage.count
FROM (
    SELECT "tag", COUNT(*)::INTEGER AS count
    FROM "content_tag"
    GROUP BY "tag"
) AS usage
WHERE t."name" = usage."tag";
