# Pic Content System

媒体素材管理系统，面向 QQ 自动录入、人工整理、打 tag、排序和正式内容入库。

## 模块

- `@pic/shared`：前后端共享 TypeScript 类型和 DTO。
- `@pic/backend`：Fastify + Prisma 后端，提供 token 登录、素材、内容库、tag 和接入事件 REST API。
- `@pic/frontend`：React + Tailwind CSS 管理端。

## 当前实现状态

- 后端不设计用户系统，只使用环境变量 `ACCESS_TOKEN` 做访问 token 校验。
- 前端登录页输入 token，后续请求通过 `Authorization: Bearer <token>` 调后端接口。
- 前端 API 默认访问 `http://localhost:3000`，需要覆盖时配置 `VITE_API_BASE_URL`。
- PostgreSQL 默认本地连接见 `.env`，当前开发环境为 `postgresql://root:123456@localhost:5432/pic_content_system?schema=public`。
- 二进制文件存文件系统，文件 ID 使用 MD5，内容签名也使用 MD5。
- 已有旧数据导入脚本：`pnpm --filter @pic/backend import:old-pic`，来源目录按脚本内配置读取。

## 前端页面

- `/`：主页 dashboard。
- `/workspace`：工作台。左侧为组装结果，右侧为 QQ 主动推送或手动上传形成的素材列表；素材列表上方包含搜索、状态过滤和类型过滤。
- `/library`：内容库。展示已入库内容，支持搜索、常用 tag、输入筛选 tag、AND / OR 多 tag 过滤、卡片尺寸预设、分页和批量 tag 编辑。
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
- 内容库右侧分页是一个按钮宽度的竖列，只放上一页、前后页码、下一页和每页数量下拉，不重复显示总条数。

## 常用命令

```powershell
pnpm install
pnpm build
pnpm --filter @pic/frontend dev
pnpm --filter @pic/backend dev
```

常用验证：

```powershell
pnpm --filter @pic/frontend typecheck
pnpm build
```

## 继续开发入口

- 前端主界面目前集中在 `packages/frontend/src/App.tsx`。
- 前端请求封装在 `packages/frontend/src/api/client.ts`。
- 后端入口在 `packages/backend/src/app.ts` 和 `packages/backend/src/main.ts`。
- Prisma schema 在 `packages/backend/prisma/schema.prisma`。
- 共享类型从 `packages/shared/src/index.ts` 导出。
