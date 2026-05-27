CREATE TABLE "tag" (
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("name")
);

INSERT INTO "tag" ("name", "created_at", "updated_at")
SELECT "tag", MIN("created_at"), MAX("created_at")
FROM "content_tag"
GROUP BY "tag"
ON CONFLICT ("name") DO UPDATE SET
    "created_at" = LEAST("tag"."created_at", EXCLUDED."created_at"),
    "updated_at" = GREATEST("tag"."updated_at", EXCLUDED."updated_at");

INSERT INTO "tag" ("name", "created_at", "updated_at")
SELECT "tag", MIN("created_at"), MAX("updated_at")
FROM "tag_alias"
GROUP BY "tag"
ON CONFLICT ("name") DO UPDATE SET
    "created_at" = LEAST("tag"."created_at", EXCLUDED."created_at"),
    "updated_at" = GREATEST("tag"."updated_at", EXCLUDED."updated_at");
