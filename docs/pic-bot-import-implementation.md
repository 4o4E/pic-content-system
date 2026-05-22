# Pic Bot 与导入实施记录

本文记录当前实施决策，避免长对话压缩后丢失任务边界。

## 已确认边界

- 旧文件名不作为业务 ID，不新增 `legacy_id`，不提供按旧文件名定位接口。
- 旧文件名不写入 title，也不写入 metadata；导入时只使用旧文件名在本地定位文件。
- 导入来源统一记为 `import`，中文场景含义为“导入”，不区分旧 pic、NapCat 或具体文件名。
- 导入脚本不直连数据库，不写目标环境文件目录，只调用后端 API。
- 导入脚本不计算也不传 MD5、mime、format、width、height、duration。
- 后端统一完成文件哈希、文件类型识别、图片尺寸识别、存储路径生成、内容 upsert、tag alias 解析和 source binding 写入。

## 第一阶段目标

1. 补 `tag_alias` 模型与接口。
2. 统一后端 tag normalize 和 alias resolve。
3. 调整 `source_binding` 唯一键，支持一条消息多张图。
4. `POST /api/media` 写入来源绑定。
5. 新增 `POST /api/pic/images`，用于 bot 和本地导入脚本。
6. 新增 `GET /api/pic/random`，用于 bot 随机取图。
7. 新增 `GET /api/media/by-file/:md5` 和精确 tag 修改接口。
8. 改造旧导入脚本为调用后端接口。

## 导入请求契约

导入脚本只发送：

```json
{
  "contentBase64": "...",
  "tags": ["弔图"]
}
```

后端自动补来源：

```json
{
  "platform": "import"
}
```

## 暂不做

- 不做按旧文件名查询、删除、改 tag。
- 不做 multipart 上传，先复用 base64 JSON，后续单独增强。
- 不做视频/音频 duration 的强识别；第一阶段只保证图片尺寸由后端识别。

## 审批与 QQ 来源追踪实施记录

- `POST /api/pic/images` 支持 `tags`、`auditRequired`、`source`。
- 有 `tags` 时直接进入内容库；无 `tags` 时只生成工作台素材，便于人工补 tag。
- `auditRequired` 由调用方声明，后端只执行状态落库；平台管理员鉴权由 bot 侧完成。
- 未显式传 `auditRequired` 时，`import` 来源默认通过，QQ/NapCat 等平台来源默认待审。
- QQ 平台管理员新增内容时，bot 传 `auditRequired: false` 即可跳过审核。
- 普通 QQ 用户新增内容时，bot 传 `auditRequired: true` 或省略该字段，内容进入待审批。
- 审批接口统一使用 `/api/audits`：
  - `GET /api/audits` 查询待审批或按状态筛选。
  - `GET /api/audits/:contentId` 查询内容、来源画像和审批事件。
  - `POST /api/audits/:contentId/approve` 通过。
  - `POST /api/audits/:contentId/reject` 拒绝。
  - `POST /api/audits/:contentId/archive` 归档。
  - `POST /api/audits/:contentId/reset` 重置为待审批。
  - `DELETE /api/audits/:contentId` 删除内容。
- 审批操作请求体可带 `operator` 和 `reason`，用于记录 QQ 平台审批人和原因。
- 审批流水独立于内容行保存，删除内容时仍保留 `delete` 事件，便于后续追溯删除原因和操作人。
- 审批来源画像第一阶段解析 QQ/NapCat 的 `userId`、`groupId`、`messageId`、头像、昵称、群名；未来其他平台只需扩展来源解析函数。
- 前端新增 `/audits` 审批管理页，支持筛选、预览、查看 QQ 来源资料并执行审批动作。
- 标签管理页补充 tag alias 列表、创建/更新和删除入口。

## ID 与日志格式

- 新业务数据 ID 由后端应用层生成，不再依赖数据库 `gen_random_uuid()`。
- ID 使用雪花算法生成 64 位递增值，再编码为 base62 字符串，便于复制、展示和 URL 使用。
- 旧 UUID 数据不做迁移兼容；如已有数据表，先清空/重建后再重新导入。
- 服务运行日志使用 `pino-pretty` 单行时间格式输出。
- 审批流水 API 返回格式化字段：动作名称、状态流转、操作人和摘要，前端审批页可直接查看格式化日志。
