# Pic Content System

媒体素材管理系统，面向 QQ 自动录入、人工整理、打 tag、排序和正式内容入库。

## 模块

- `@pic/shared`：前后端共享 TypeScript 类型和 DTO。
- `@pic/backend`：Fastify + Prisma 后端，提供 token 登录、素材、内容库、tag 和接入事件 REST API。
- `@pic/frontend`：React + Tailwind CSS 管理端。

## 当前实现状态

- 后端不设计用户系统，只使用环境变量 `ACCESS_TOKEN` 做访问 token 校验。
- 前端登录页输入 token，后续请求通过 `Authorization: Bearer <token>` 调后端接口。
- 前端开发环境默认走 Vite `/api` 代理到后端，生产环境由后端托管前端 dist；需要覆盖外部 API 时配置 `VITE_API_BASE_URL`。
- PostgreSQL 默认本地连接见 `.env`，当前开发环境为 `postgresql://root:123456@localhost:5432/pic_content_system?schema=public`。
- 二进制文件存文件系统，文件 ID 使用 MD5，内容签名也使用 MD5。
- 已有旧数据导入脚本：`pnpm --filter @pic/backend import:old-pic`，来源目录按脚本内配置读取。
- NapCat 群媒体导入脚本：`pnpm --filter @pic/backend import:napcat-export -- <导出目录>` 默认 dry-run；正式写入需要加 `--commit`，默认给内容加 `弔图` tag，可用 `--tag=xxx` 追加 tag。

## 前端页面

- `/`：主页 dashboard。
- `/workspace`：工作台。左侧为组装结果，右侧为 QQ 主动推送或手动上传形成的素材列表；素材列表上方包含搜索、状态过滤和类型过滤。
- `/library`：内容库。展示已入库内容，支持搜索、常用 tag、输入筛选 tag、AND / OR 多 tag 过滤、排序、卡片尺寸预设、分页、批量 tag 编辑、批量删除和放回工作台。
- `/tags`：标签管理。用于查找 tag 和查看使用次数。
- `/events`：接入事件记录。

路由状态写入 URL 查询参数，刷新后不依赖 localStorage 恢复页面筛选状态。localStorage 只用于 token 和主题。

## 重要交互约定

- 顶栏只显示当前路由名，不放页面描述。
- 左侧导航和顶栏固定显示。
- 工作台搜索放在素材列表过滤区，不放顶栏。
- 所有 tag 输入都应支持输入筛选、下拉选择和直接输入新 tag。
- 内容库卡片预览真实内容：图片显示图片，视频自动播放，音频显示图标，文本显示前一段文本，复合内容用 `[图片]`、`[视频]` 等类型标记。
- 内容库卡片接近正方形，宽度通过“小 / 中 / 大”预设控制并写入 URL。
- 内容库多选后显示批量操作栏；滚动后该操作栏应贴在顶栏下方。
- 内容库右侧分页是窄竖列，只放上一页、前后页码、下一页和每页数量下拉，不重复显示总条数；每页数量需要容纳 3 位数字和下拉图标。
- 删除等危险操作统一使用原按钮二次确认：第一次点击把按钮切到确认态，第二次点击同一按钮才执行，不弹确认窗。

## 常用命令

```powershell
pnpm install
pnpm build
pnpm ci:test
pnpm release:package
pnpm --filter @pic/frontend dev
pnpm --filter @pic/backend dev
pnpm --filter @pic/backend dev:watch
```

后端开发服务的 `dev` 已指向 `dev:watch`，使用 `tsx watch src/main.ts` 支持源码变更后热重载。

常用验证：

```powershell
pnpm --filter @pic/frontend typecheck
pnpm build
```

## 生产打包和部署

生产环境使用单应用镜像：后端 Fastify 负责 `/api` 和 `/health`，并在存在 `packages/backend/public/index.html` 时托管前端 SPA。数据库使用 PostgreSQL，文件落盘目录通过 `FILES_DIR` 挂载持久化。

本地打包 release dist：

```powershell
pnpm install
pnpm ci:test
pnpm release:dist
```

产物目录为 `dist/release/pic-content-system`，其中包含：

- `packages/backend/dist`：后端编译产物。
- `packages/backend/public`：前端编译产物。
- `packages/backend/prisma`：Prisma schema 和生产迁移。
- `Dockerfile`、`compose.yaml`、`.env.production.example`：基于 dist 产物的生产镜像和 Compose 部署文件。

Docker Compose 部署：

```powershell
Copy-Item .env.production.example .env.production
# 修改 .env.production 中的 ACCESS_TOKEN、POSTGRES_PASSWORD 等密钥
docker compose --env-file .env.production up -d --build
```

默认访问地址为 `http://localhost:3000`。首次启动时容器会执行 `prisma migrate deploy`，通过 `RUN_MIGRATIONS=false` 可以关闭自动迁移。媒体文件存储在 Compose volume `media_files`，数据库存储在 `postgres_data`。

使用 GitHub Release 镜像部署时，把 `.env.production` 中的 `APP_IMAGE` 改为：

```env
APP_IMAGE=ghcr.io/<owner>/<repo>:vX.Y.Z
```

然后执行：

```powershell
docker compose --env-file .env.production pull app
docker compose --env-file .env.production up -d
```

## GitHub CI / Release

- 任意分支 push 和 PR 会触发 `.github/workflows/ci.yml`，执行 `pnpm ci:test`，包含 Prisma 生成和校验、TypeScript 检查、完整构建。
- 推送 `v*` tag 会触发 `.github/workflows/release.yml`，先执行同一套测试门禁，再打包 `dist/release/pic-content-system` 为 `.tar.gz` 和 `.zip`，创建 GitHub Release，并推送 Docker 镜像到 GHCR。
- tag 示例：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

## 继续开发入口

- 前端主界面目前集中在 `packages/frontend/src/App.tsx`。
- 前端请求封装在 `packages/frontend/src/api/client.ts`。
- 后端入口在 `packages/backend/src/app.ts` 和 `packages/backend/src/main.ts`。
- Prisma schema 在 `packages/backend/prisma/schema.prisma`。
- 共享类型从 `packages/shared/src/index.ts` 导出。
