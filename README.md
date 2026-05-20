# Pic Content System

媒体素材管理系统，面向 QQ 自动录入、人工整理、打 tag、排序和正式内容入库。

## 模块

- `@pic/shared`：前后端共享 TypeScript 类型。
- `@pic/backend`：Fastify + Prisma 后端骨架。
- `@pic/frontend`：React + Tailwind CSS 前端静态界面。

## 常用命令

```powershell
pnpm install
pnpm build
pnpm --filter @pic/frontend dev
pnpm --filter @pic/backend dev
```
