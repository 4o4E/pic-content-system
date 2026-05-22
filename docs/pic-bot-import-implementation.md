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
