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
- PostgreSQL 连接由 `DATABASE_URL` 指定，数据库账号、密码和库名直接写在连接串里。
- 二进制文件存文件系统，文件 ID 使用 MD5，内容签名也使用 MD5。
- 定时备份通过 `BACKUP_DIR` 和 `BACKUP_CRON` 启用，复用完整导出包格式。
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
- `Dockerfile`、`compose.yaml`、`.env.example`：基于 dist 产物的生产镜像和 Compose 部署文件。

Docker Compose 部署：

```powershell
Copy-Item .env.example .env
# 修改 .env 中的 ACCESS_TOKEN、DATABASE_URL 等配置
docker compose --env-file .env up -d --build
```

默认访问地址为 `http://localhost:3000`。首次启动时容器会执行 `prisma migrate deploy`，通过 `RUN_MIGRATIONS=false` 可以关闭自动迁移。媒体文件存储在 Compose volume `media_files`，数据库存储在 `postgres_data`。

### 定时备份

后端可以按 cron 表达式自动创建完整导出包，并复制到 `BACKUP_DIR` 指定目录。未配置 `BACKUP_DIR` 时不启用；配置 `BACKUP_DIR` 时必须同时配置 `BACKUP_CRON`。cron 支持 5 段或带秒的 6 段表达式，例如每天 03:00：

```env
BACKUP_DIR=/data/backups
BACKUP_CRON=0 3 * * *
```

备份文件名格式为 `pic-content-backup-YYYYMMDD-HHmmss-<导出ID>.zip`。备份任务不会自动删除历史文件，需要保留策略时在备份目录侧单独配置清理任务。

Docker Compose 默认把容器内 `/data/backups` 挂到 `backup_files` volume。需要复制到宿主机指定目录时，在 `.env` 中设置：

```env
BACKUP_DIR=/data/backups
BACKUP_CRON=0 3 * * *
HOST_BACKUP_DIR=F:/data/pic-content-system/backups
```

### 已有 PostgreSQL + 绝对路径部署

已有 PostgreSQL 实例时，不建议直接复用默认 `compose.yaml`，因为它会额外启动内置 `db` 服务，并把媒体文件放到 Docker 命名卷。可以单独创建一个只包含 `app` 服务的 Compose 文件，例如 `compose.external-pg.yaml`：

```yaml
services:
  app:
    image: ${APP_IMAGE:-pic-content-system:local}
    build:
      context: .
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL:?必须配置已有 PostgreSQL 的 DATABASE_URL}
      ACCESS_TOKEN: ${ACCESS_TOKEN:?必须配置 ACCESS_TOKEN}
      FILES_DIR: /data/files
      BACKUP_DIR: ${BACKUP_DIR:-}
      BACKUP_CRON: ${BACKUP_CRON:-}
      PORT: 3000
      RUN_MIGRATIONS: ${RUN_MIGRATIONS:-true}
    volumes:
      # 左侧必须替换为宿主机真实存在的绝对路径；右侧保持和 FILES_DIR 一致
      - ${HOST_FILES_DIR:?必须配置宿主机媒体文件绝对路径}:/data/files
      # 启用定时备份时把 BACKUP_DIR 指向右侧目录，左侧可改为宿主机备份目录
      - ${HOST_BACKUP_DIR:-./data/backups}:/data/backups
    ports:
      - "${APP_PORT:-3000}:3000"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 5
```

配套环境变量示例：

```env
APP_IMAGE=ghcr.io/<owner>/<repo>:vX.Y.Z
APP_PORT=3000
ACCESS_TOKEN=change-this-access-token
DATABASE_URL=postgresql://pic:change-this-password@postgres.example.com:5432/pic_content_system?schema=public
HOST_FILES_DIR=F:/data/pic-content-system/files
BACKUP_DIR=/data/backups
BACKUP_CRON=0 3 * * *
HOST_BACKUP_DIR=F:/data/pic-content-system/backups
RUN_MIGRATIONS=true
```

如果 PostgreSQL 在 Docker Desktop 宿主机上，容器内不能用 `localhost` 访问宿主机 PostgreSQL，通常把 `DATABASE_URL` 的主机名写成 `host.docker.internal`；如果 PostgreSQL 在同一个 Docker 网络内，主机名写对应服务名或容器名；如果 PostgreSQL 是远程数据库，主机名写数据库域名或 IP。

首次启动前需要确保数据库已存在、账号有建表和迁移权限，并提前创建 `HOST_FILES_DIR` 对应目录；启用定时备份时也需要提前创建 `HOST_BACKUP_DIR` 对应目录。启动命令：

```powershell
docker compose --env-file .env -f compose.external-pg.yaml up -d
```

使用本地构建镜像时保留 `build.context` 并执行：

```powershell
docker compose --env-file .env -f compose.external-pg.yaml up -d --build
```

迁移默认由容器启动时执行 `prisma migrate deploy`；如果数据库迁移由其他流程统一执行，把 `RUN_MIGRATIONS=false` 写入 `.env`。

使用 GitHub Release 镜像部署时，把 `.env` 中的 `APP_IMAGE` 改为：

```env
APP_IMAGE=ghcr.io/<owner>/<repo>:vX.Y.Z
```

然后执行：

```powershell
docker compose --env-file .env pull app
docker compose --env-file .env up -d
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
