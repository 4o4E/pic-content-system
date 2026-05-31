-- 创建表
CREATE TABLE "media_file_reference" (
    "file_md5" CHAR(32) NOT NULL,
    "owner_type" VARCHAR(32) NOT NULL,
    "owner_id" VARCHAR(64) NOT NULL,
    "ref_path" VARCHAR(512) NOT NULL,
    "element_type" "MediaType",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_file_reference_pkey" PRIMARY KEY ("file_md5", "owner_type", "owner_id", "ref_path")
);

-- 创建索引
CREATE INDEX "media_file_reference_owner_type_owner_id_idx" ON "media_file_reference"("owner_type", "owner_id");

-- 创建索引
CREATE INDEX "media_file_reference_file_md5_idx" ON "media_file_reference"("file_md5");

-- 添加外键
ALTER TABLE "media_file_reference" ADD CONSTRAINT "media_file_reference_file_md5_fkey" FOREIGN KEY ("file_md5") REFERENCES "media_file"("md5") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 回填内容元素引用，包括 speak/discuss 聊天记录里的嵌套文件。
WITH RECURSIVE content_nodes AS (
    SELECT "id" AS "owner_id", "elements" AS "node", '$'::TEXT AS "path"
    FROM "media_content"
    UNION ALL
    SELECT content_nodes."owner_id", child."value", content_nodes."path" || child."path_suffix"
    FROM content_nodes
    CROSS JOIN LATERAL (
        SELECT item."value", '[' || (item."ordinality" - 1)::TEXT || ']' AS "path_suffix"
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(content_nodes."node") = 'array' THEN content_nodes."node" ELSE '[]'::jsonb END) WITH ORDINALITY AS item("value", "ordinality")
        UNION ALL
        SELECT item."value", '.' || item."key" AS "path_suffix"
        FROM jsonb_each(CASE WHEN jsonb_typeof(content_nodes."node") = 'object' THEN content_nodes."node" ELSE '{}'::jsonb END) AS item("key", "value")
    ) AS child
)
INSERT INTO "media_file_reference" ("file_md5", "owner_type", "owner_id", "ref_path", "element_type")
SELECT DISTINCT content_nodes."node" ->> 'id', 'media_content', content_nodes."owner_id", content_nodes."path", (content_nodes."node" ->> 'type')::"MediaType"
FROM content_nodes
JOIN "media_file" ON "media_file"."md5" = content_nodes."node" ->> 'id'
WHERE jsonb_typeof(content_nodes."node") = 'object'
  AND content_nodes."node" ->> 'type' IN ('image', 'video', 'audio', 'file')
  AND content_nodes."node" ->> 'id' ~ '^[0-9a-f]{32}$'
ON CONFLICT DO NOTHING;

-- 回填素材表的直接 file_md5 引用。
INSERT INTO "media_file_reference" ("file_md5", "owner_type", "owner_id", "ref_path", "element_type")
SELECT "media_asset"."file_md5", 'media_asset', "media_asset"."id", 'fileMd5', "media_asset"."kind"
FROM "media_asset"
JOIN "media_file" ON "media_file"."md5" = "media_asset"."file_md5"
WHERE "media_asset"."file_md5" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 回填素材元素里的嵌套文件引用。
WITH RECURSIVE asset_nodes AS (
    SELECT "id" AS "owner_id", "element" AS "node", 'element'::TEXT AS "path"
    FROM "media_asset"
    UNION ALL
    SELECT asset_nodes."owner_id", child."value", asset_nodes."path" || child."path_suffix"
    FROM asset_nodes
    CROSS JOIN LATERAL (
        SELECT item."value", '[' || (item."ordinality" - 1)::TEXT || ']' AS "path_suffix"
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(asset_nodes."node") = 'array' THEN asset_nodes."node" ELSE '[]'::jsonb END) WITH ORDINALITY AS item("value", "ordinality")
        UNION ALL
        SELECT item."value", '.' || item."key" AS "path_suffix"
        FROM jsonb_each(CASE WHEN jsonb_typeof(asset_nodes."node") = 'object' THEN asset_nodes."node" ELSE '{}'::jsonb END) AS item("key", "value")
    ) AS child
)
INSERT INTO "media_file_reference" ("file_md5", "owner_type", "owner_id", "ref_path", "element_type")
SELECT DISTINCT asset_nodes."node" ->> 'id', 'media_asset', asset_nodes."owner_id", asset_nodes."path", (asset_nodes."node" ->> 'type')::"MediaType"
FROM asset_nodes
JOIN "media_file" ON "media_file"."md5" = asset_nodes."node" ->> 'id'
WHERE jsonb_typeof(asset_nodes."node") = 'object'
  AND asset_nodes."node" ->> 'type' IN ('image', 'video', 'audio', 'file')
  AND asset_nodes."node" ->> 'id' ~ '^[0-9a-f]{32}$'
ON CONFLICT DO NOTHING;

-- 回填工作台草稿元素里的嵌套文件引用。
WITH RECURSIVE draft_nodes AS (
    SELECT "id" AS "owner_id", "elements" AS "node", '$'::TEXT AS "path"
    FROM "workspace_draft"
    UNION ALL
    SELECT draft_nodes."owner_id", child."value", draft_nodes."path" || child."path_suffix"
    FROM draft_nodes
    CROSS JOIN LATERAL (
        SELECT item."value", '[' || (item."ordinality" - 1)::TEXT || ']' AS "path_suffix"
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(draft_nodes."node") = 'array' THEN draft_nodes."node" ELSE '[]'::jsonb END) WITH ORDINALITY AS item("value", "ordinality")
        UNION ALL
        SELECT item."value", '.' || item."key" AS "path_suffix"
        FROM jsonb_each(CASE WHEN jsonb_typeof(draft_nodes."node") = 'object' THEN draft_nodes."node" ELSE '{}'::jsonb END) AS item("key", "value")
    ) AS child
)
INSERT INTO "media_file_reference" ("file_md5", "owner_type", "owner_id", "ref_path", "element_type")
SELECT DISTINCT draft_nodes."node" ->> 'id', 'workspace_draft', draft_nodes."owner_id", draft_nodes."path", (draft_nodes."node" ->> 'type')::"MediaType"
FROM draft_nodes
JOIN "media_file" ON "media_file"."md5" = draft_nodes."node" ->> 'id'
WHERE jsonb_typeof(draft_nodes."node") = 'object'
  AND draft_nodes."node" ->> 'type' IN ('image', 'video', 'audio', 'file')
  AND draft_nodes."node" ->> 'id' ~ '^[0-9a-f]{32}$'
ON CONFLICT DO NOTHING;
