# 内容资产系统设计

## 背景

当前 bot 内的 pic 功能需要从 QQ 场景中抽离，形成一个独立系统。新系统不再直接绑定 QQ 消息类型，而是以平台无关的内容资产为核心，支持图片、视频、音频、文本、聊天记录等多种内容，并为未来跨平台同步和复用预留接口。

已有的 `media-manager-backend` 和 `media-manager-frontend` 已经实现过一版媒体管理系统，里面的媒体元素模型、文件去重、标签、点赞、审核和前端上传预览流程可以作为参考。新系统不直接复刻旧项目的 Kotlin/Spring 实现，而是保留有效领域设计，用 Node.js + PostgreSQL 重新实现服务边界，并补齐平台来源绑定、接入事件和跨平台适配能力。

## 目标

- 使用 Node.js + PostgreSQL 实现独立内容服务。
- 支持图片、视频、音频、文本、文件和聊天记录等内容类型。
- 内容模型脱离 QQ、NapCat、Mirai 等平台类型。
- 支持聊天记录、合并转发等嵌套内容的结构化同步。
- 支持内容去重、来源绑定、标签、搜索和基础权限扩展。
- 支持未来接入 QQ、Telegram、Discord、网页端等多个平台。
- bot 通过标准 API 或 SDK 调用该系统，不直接操作底层存储。
- 支持 QQ / NapCat 主动推送素材到系统，在工作台中完成右侧素材选择、左侧结果组装、排序、打 tag 和正式入库。

## 非目标

- 第一阶段不实现完整跨平台发送。
- 第一阶段不实现复杂视频转码、音频转码和图像识别。
- 第一阶段不把 PostgreSQL 当作大文件存储。
- 第一阶段不替代 bot 的命令系统、权限系统和平台登录逻辑。

## 技术选型

推荐技术栈：

- Runtime：Node.js 22+
- 语言：TypeScript
- 包管理：pnpm workspace
- Web 框架：Fastify
- 数据库：PostgreSQL
- ORM：Prisma
- 数据库迁移：Prisma Migrate
- 文件存储：本地目录起步，后续支持 MinIO/S3
- 任务队列：第一阶段使用 PostgreSQL 表驱动任务，后续按压力引入 Redis/BullMQ
- 前端框架：React + TypeScript
- 前端样式：Tailwind CSS
- 前端组件：shadcn/ui + Radix UI
- 前端构建：Vite

选择 Fastify + Prisma 的原因：

- 服务边界清晰，启动和部署成本低。
- Prisma schema 可以直接沉淀数据模型，迁移、类型生成和基础 CRUD 成本低。
- 复杂 JSONB 查询、递归关系查询或批量导入可以保留少量 `$queryRaw`，避免为了极少数复杂 SQL 放弃整体开发效率。
- 不过度依赖大型框架，适合做基础设施服务。

已有 media-manager 的技术栈是 Kotlin/Spring + MyBatis-Plus + PostgreSQL + Vue。新系统选择 Node.js + React 的原因不是旧实现不可用，而是希望让内容服务更像一个独立轻量的基础设施组件，前端也使用更成熟的 shadcn/ui 生态，便于后续自定义媒体管理界面。

选择 shadcn/ui 的原因：

- 组件以源码形式进入项目，不是只能通过主题变量间接覆盖的黑盒组件库。
- 基于 Tailwind CSS，和项目样式系统一致，适合长期自定义。
- 底层使用 Radix UI，保留无障碍、键盘交互、弹层和选择器等基础能力。
- React 原版 shadcn/ui 生态、示例、文档和组件覆盖更成熟。
- 适合媒体管理后台这类需要自定义卡片、消息流、上传预览和筛选面板的界面。

不优先选择 Element Plus 作为新系统主组件库。旧 media-manager 前端已经使用过 Element Plus，但它更适合快速后台表单；这次的媒体内容卡片、消息流和嵌套内容预览需要更细粒度的样式控制，React + shadcn/ui 更合适。

## 现有 media-manager 可复用设计

已有后端项目路径：

```text
F:\Desktop\project\media-manager-backend
```

已有前端项目路径：

```text
F:\Desktop\project\media-manager-frontend
```

重点参考内容：

- `MediaContent`：媒体内容聚合根，包含标题、标签、内容元素链、内容签名、点赞数和审核状态。
- `MediaElement`：平台无关的内容元素接口。
- `TextElement`：文本元素。
- `ImageElement`：图片元素，包含 MD5 文件 ID、格式、是否按文件发送、宽高。
- `VideoElement`：视频元素，包含 MD5 文件 ID、格式、是否按文件发送、宽高和时长。
- `AudioElement`：音频元素，包含 MD5 文件 ID、格式、是否按文件发送和时长。
- `BinaryElement`：通用二进制文件元素。
- `SpeakElement`：一次发言，包含发送者名称、头像、时间和消息内容。
- `DiscussElement`：聊天记录，由多个 `SpeakElement` 组成。
- `MediaType.byMessage`：根据内容元素链推导内容类型，单元素使用具体类型，多元素使用 `composite`。
- `MediaElementVisitor/sign`：遍历内容元素生成 MD5 内容签名，用于内容去重。
- `FileService`：文件按内容哈希存储到分片路径。

这些设计应保留：

- 文件 ID 使用 MD5，二进制文件存文件系统，数据库记录 MD5 和文件元数据。
- 内容由元素链表达，不把图片、文本、视频拆成完全割裂的业务表。
- 聊天记录用 `Discuss -> Speak -> Message` 表达嵌套。
- 单条内容计算稳定 MD5 签名，避免重复导入。
- 前端上传流程保持“先上传文件，后提交内容元素”的模式。

这些设计需要调整：

- 旧 `MediaElement` 没有平台来源绑定，新系统增加 `source_binding`。
- 旧聊天记录的 `SpeakElement.message` 只允许一个 `MediaElement`，新系统建议允许 `MediaElement[]`，避免一条发言同时包含文本和图片时被迫包装。
- 旧 `media_content.content` 是整段 JSON 文本，新系统第一阶段可以继续使用 JSONB 保存元素链，同时增加关系表或递归索引表用于后续复杂查询。
- 旧系统的用户、角色、审核、点赞可以参考，但 bot 接入第一阶段不强依赖完整后台权限。

MD5 的使用边界：

- `media_file.md5` 只用于二进制文件寻址和文件级去重。
- `media_content.sign` 是标准化 `MediaElement` 链的 MD5，用于整条内容去重。
- 文件 MD5 不等于内容签名。同一个图片文件在不同文本说明、不同聊天记录上下文里可以组成不同内容。
- 如果未来需要更强完整性校验，可以在 `media_file.metadata` 里额外保存 sha256，但主键和业务文件 ID 仍使用 MD5。

## 总体架构

```text
QQ / NapCat / 其他平台 Adapter
        |
        | 平台消息标准化
        v
Bot 或同步 Worker
        |
        | HTTP API / SDK
        v
Content Service
        |
        | 元数据、关系、索引、同步状态
        v
PostgreSQL
        |
        | 原始文件、缩略图、派生文件
        v
Local Storage / MinIO / S3
```

系统分层：

- Adapter：平台适配层，负责把 QQ、Telegram 等平台消息转换成平台无关内容模型。
- API：内容写入、查询、标签、接入事件、导出渲染。
- Domain：内容资产、来源绑定、嵌套关系、去重、权限。
- Storage：文件保存、读取、URL 生成。
- Worker：远程文件下载、缩略图生成、元数据探测、后续转码任务。

## Monorepo 模块划分

项目使用 pnpm workspace 管理多个 TypeScript 模块。

推荐目录：

```text
pic-content-system
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages
│  ├─ shared        # 通用类型、DTO、枚举、校验 schema
│  ├─ backend       # Fastify + Prisma 服务
│  └─ frontend      # React + Tailwind CSS + shadcn/ui 管理端
└─ docs
   └─ DESIGN.md
```

模块职责：

- `@pic/shared`：只放通用 TypeScript 类型、API DTO、媒体元素定义、平台来源类型、分页类型、错误码和可复用校验 schema。
- `@pic/backend`：依赖 `@pic/shared`，实现 API、Prisma、文件存储、接入事件和平台 Adapter。
- `@pic/frontend`：依赖 `@pic/shared`，实现管理界面、上传预览、查询筛选和内容详情。

依赖方向：

```text
@pic/shared
   ↑       ↑
backend  frontend
```

规则：

- `@pic/shared` 不依赖 backend、frontend、Prisma Client、React、Fastify。
- `@pic/shared` 可以依赖轻量校验库，例如 Zod；如果使用 Zod，类型从 schema 推导，避免 DTO 和校验规则分裂。
- backend 和 frontend 必须复用 `@pic/shared` 的 `MediaElement`、`MediaContentDto`、`SourceBindingDto` 等类型。
- Prisma schema 仍放在 backend，数据库模型不要反向污染 shared；shared 表达 API 合同，不表达数据库内部实现。

根目录脚本建议：

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - "packages/*"
```

`@pic/shared` 初始导出：

```text
packages/shared/src
├─ media
│  ├─ element.ts       # MediaElement、TextElement、ImageElement 等
│  ├─ content.ts       # MediaContentDto、MediaType、AuditState
│  └─ file.ts          # MediaFileDto、UploadFileResp
├─ platform
│  └─ source.ts        # PlatformSource、PlatformUserSnapshot
├─ api
│  ├─ page.ts          # PageReq、PageResp
│  └─ response.ts      # ApiResp、ApiErrorCode
└─ index.ts
```

## 前端设计原则

前端作为内容管理和人工整理入口，不直接承担平台同步逻辑。

推荐结构：

```text
packages/frontend
├─ src/api              # OpenAPI 或手写 API client
├─ src/components/ui    # shadcn/ui 生成的基础组件
├─ src/components/media # 媒体卡片、消息流、元素预览、上传器
├─ src/pages            # 工作台、内容库、接入事件、标签、设置
├─ src/hooks            # 登录态、标签缓存、筛选条件等 hooks
├─ src/lib              # 工具函数、API client、格式化逻辑
└─ src/styles           # Tailwind 入口和少量全局样式
```

组件库使用规则：

- 基础交互组件优先使用 shadcn/ui，例如 Button、Dialog、Dropdown、Select、Tabs、Popover、Command、Toast。
- 业务组件自己封装，例如 `MediaCard`、`MediaElementView`、`DiscussPreview`、`UploadDropzone`、`TagEditor`。
- 样式优先使用 Tailwind 工具类和 CSS 变量，不引入新的重型样式系统。
- 需要深度定制时直接修改本地 shadcn/ui 组件源码。
- 不把 Element Plus 作为新页面依赖，避免组件风格和定制方式分裂。
- 前端 API 参数和响应类型从 `@pic/shared` 引入，不在前端重复声明一份。

核心页面：

- 工作台：唯一的人工整理页面。左侧为组装结果，右侧为素材列表；支持从右侧拖入左侧、左侧拖动排序、批量选择、忽略、填写标题、打 tag、预览最终内容链并提交入库。
- 内容库：展示已经正式入库的 `MediaContent`，支持搜索、随机、收藏、编辑 tag 和查看来源。
- 接入事件：查看 QQ / NapCat 主动推送事件、解析状态、失败原因、重试解析和忽略。

工作台页面结构：

- 左侧：组装结果，代表最终要提交的 `MediaElement[]` 顺序。
- 右侧：素材列表，展示 QQ 主动推送、手动上传和其他平台接入产生的候选素材。
- 两侧都支持拖动操作：右侧素材可拖到左侧组装结果；左侧结果项可拖动排序。
- 正式内容库只保存工作台提交后的内容，不直接暴露所有自动录入的原始素材。

典型人工流程：

```text
QQ / NapCat 主动推送图片
  -> 记录接入事件
  -> 生成右侧素材列表候选项
  -> 人工拖入左侧组装结果
  -> 调整顺序
  -> 添加标题和 tag
  -> 预览组合效果
  -> 提交为 MediaContent
```

## 后端模块结构

推荐结构：

```text
packages/backend
├─ prisma
│  ├─ schema.prisma
│  └─ migrations
├─ src
│  ├─ app.ts            # Fastify 应用创建
│  ├─ main.ts           # 启动入口
│  ├─ config            # 环境变量和配置解析
│  ├─ db                # Prisma Client 封装
│  ├─ modules
│  │  ├─ media          # 内容、标签、查询
│  │  ├─ file           # 文件上传、MD5、文件系统存储
│  │  ├─ source         # 平台来源绑定
│  │  └─ ingest         # QQ / NapCat 主动推送接入事件
│  ├─ storage           # LocalStorageProvider / S3StorageProvider
│  └─ adapters          # QQ / NapCat / 未来其他平台标准化
└─ package.json
```

后端规则：

- API 入参和出参类型从 `@pic/shared` 引入。
- Prisma model 可以和 API DTO 不完全一致，转换逻辑放在各模块 service。
- 文件上传时后端负责计算 MD5、落文件系统、写入 `media_file`。
- 内容保存时后端负责标准化元素链、计算 MD5 内容签名、写入 `media_content` 和 `source_binding`。
- 平台 Adapter 只负责把平台消息转换成 shared 中定义的标准结构，不直接写数据库。

## 核心领域模型

### MediaContent

`MediaContent` 是对外可管理、可检索、可收藏的一条内容记录，接近旧项目的 `MediaContent`。

建议字段：

- `id`：内容 ID。
- `type`：内容类型，由元素链推导或显式指定。
- `title`：标题。
- `tags`：标签。
- `elements`：内容元素链。
- `sign`：标准化元素链的 MD5 内容签名，用于整条内容去重。
- `audit_state`：审核状态，第一阶段可默认为通过或待审。
- `like_count`：点赞数，第一阶段可选。
- `metadata`：扩展字段。

### MediaElement

`MediaElement` 是内容元素，保留旧项目的平台无关元素思路。

```ts
type MediaElement =
  | TextElement
  | ImageElement
  | VideoElement
  | AudioElement
  | BinaryElement
  | SpeakElement
  | DiscussElement;
```

内容类型建议保留旧项目的语义：

```ts
type MediaType =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "file"
  | "speak"
  | "discuss"
  | "composite";
```

字段含义：

- `image`：图片。
- `video`：视频。
- `audio`：音频。
- `text`：文本内容。
- `file`：普通二进制文件。
- `speak`：一条发言。
- `discuss`：聊天记录。
- `composite`：多个元素组合成的一条内容。

元素结构：

```ts
interface TextElement {
  type: "text"
  content: string
}

interface BinaryElement {
  type: "file"
  id: string
  format: string
  file: true
  mimeType?: string
  sizeBytes?: number
}

interface ImageElement {
  type: "image"
  id: string
  format: string
  file: boolean
  width: number
  height: number
}

interface VideoElement {
  type: "video"
  id: string
  format: string
  file: boolean
  width: number
  height: number
  durationSeconds: number
}

interface AudioElement {
  type: "audio"
  id: string
  format: string
  file: boolean
  durationSeconds: number
}

interface SpeakElement {
  type: "speak"
  sender: PlatformUserSnapshot
  time: string
  message: MediaElement[]
}

interface DiscussElement {
  type: "discuss"
  content: SpeakElement[]
}
```

`id` 字段为文件 MD5。`file` 字段沿用旧设计，表示该元素在目标平台上应按普通文件发送，而不是按图片、视频、音频等专门消息类型发送。

### PlatformUserSnapshot

`PlatformUserSnapshot` 是发言时刻的平台用户快照，不等同于系统用户。

```ts
interface PlatformUserSnapshot {
  platform?: string
  platformUserId?: string
  displayName: string
  avatarUrl?: string
}
```

### MediaAsset

`MediaAsset` 是工作台右侧素材列表里的候选素材。它可以来自 QQ / NapCat 主动推送、手动上传或其他平台接入，但还不是正式内容库里的 `MediaContent`。

建议字段：

- `id`：素材 ID。
- `kind`：素材类型，例如 `image`、`video`、`audio`、`text`、`file`。
- `file_md5`：二进制文件素材对应的 MD5。
- `element`：可直接放入工作台的标准 `MediaElement`。
- `source_id`：来源绑定 ID。
- `status`：`pending`、`selected`、`used`、`ignored`。
- `metadata`：宽高、时长、QQ 消息摘要等扩展信息。

素材状态说明：

- `pending`：新录入，等待人工处理。
- `selected`：已加入工作台左侧组装结果，但尚未正式提交。
- `used`：已经被提交到正式内容。
- `ignored`：人工忽略，不再默认展示。

### WorkspaceDraft

`WorkspaceDraft` 是工作台左侧组装结果的草稿，用于把分散素材组合成一条正式内容。

建议字段：

- `id`：草稿 ID。
- `title`：临时标题。
- `tags`：待提交 tag。
- `elements`：已排序的 `MediaElement[]`。
- `asset_ids`：本草稿引用的素材 ID。
- `status`：`editing`、`submitted`、`discarded`。
- `metadata`：编辑器状态、备注等扩展信息。

提交工作台草稿时，系统根据左侧 `elements` 顺序计算 `media_content.sign`，写入正式 `media_content`，并把引用的素材标记为 `used`。

### ContentRelation

`ContentRelation` 表示内容之间的结构关系。

典型关系：

- `contains`：消息包含文本、图片、视频等内容。
- `reply_to`：消息回复另一条消息。
- `forwarded_from`：转发来源。
- `derived_from`：缩略图、压缩图、转码文件来源于原始文件。

第一阶段可以不强制把每个元素拆成数据库行，因为旧项目已经证明 JSON 元素链足够支撑上传、查看和基础查询。`content_relation` 作为第二阶段能力，用于对嵌套聊天记录、派生文件、跨平台引用做更强查询。

聊天记录的逻辑结构是 `DiscussElement -> SpeakElement -> MediaElement[]`，保留顺序和嵌套层级。

### SourceBinding

`SourceBinding` 记录内容来自哪个平台，但不污染核心内容模型。

示例：

- 平台：`qq`
- 群号：`groupId`
- 用户：`userId`
- 消息 ID：`messageId`
- 文件 ID：`fileId`
- 原始平台消息：`raw`

业务查询优先使用标准字段，平台特殊字段放入 `raw jsonb` 兜底。

## 数据库设计草案

### media_content

```sql
create table media_content (
  id uuid primary key,
  type text not null,
  title text,
  elements jsonb not null,
  sign char(32) not null,
  audit_state text not null default 'pass',
  like_count bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

索引：

```sql
create unique index idx_media_content_sign on media_content(sign);
create index idx_media_content_type on media_content(type);
create index idx_media_content_elements_gin on media_content using gin(elements);
create index idx_media_content_metadata_gin on media_content using gin(metadata);
```

### media_file

`media_file` 对应旧项目的 `FileService`，把二进制文件和内容记录解耦。

```sql
create table media_file (
  md5 char(32) primary key,
  storage_key text not null,
  mime_type text,
  format text,
  size_bytes bigint not null,
  width int,
  height int,
  duration_seconds numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

### content_relation

```sql
create table content_relation (
  id uuid primary key,
  parent_id uuid not null references media_content(id) on delete cascade,
  child_id uuid not null references media_content(id) on delete cascade,
  relation_type text not null,
  position int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

索引：

```sql
create index idx_content_relation_parent on content_relation(parent_id, position);
create index idx_content_relation_child on content_relation(child_id);
```

### source_binding

```sql
create table source_binding (
  id uuid primary key,
  content_id uuid not null references media_content(id) on delete cascade,
  platform text not null,
  platform_message_id text,
  platform_group_id text,
  platform_user_id text,
  platform_file_id text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

索引：

```sql
create unique index idx_source_binding_message
  on source_binding(platform, platform_message_id)
  where platform_message_id is not null;

create index idx_source_binding_group on source_binding(platform, platform_group_id);
create index idx_source_binding_user on source_binding(platform, platform_user_id);
```

### media_asset

```sql
create table media_asset (
  id uuid primary key,
  kind text not null,
  file_md5 char(32) references media_file(md5),
  element jsonb not null,
  source_id uuid references source_binding(id) on delete set null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

索引：

```sql
create index idx_media_asset_kind on media_asset(kind);
create index idx_media_asset_status on media_asset(status, created_at);
create index idx_media_asset_file_md5 on media_asset(file_md5);
create index idx_media_asset_metadata_gin on media_asset using gin(metadata);
```

### workspace_draft

```sql
create table workspace_draft (
  id uuid primary key,
  title text,
  tags text[] not null default '{}',
  elements jsonb not null default '[]'::jsonb,
  asset_ids uuid[] not null default '{}',
  status text not null default 'editing',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

索引：

```sql
create index idx_workspace_draft_status on workspace_draft(status, updated_at);
```

### content_tag

```sql
create table content_tag (
  id uuid primary key,
  content_id uuid not null references media_content(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now()
);
```

索引：

```sql
create unique index idx_content_tag_unique on content_tag(content_id, tag);
create index idx_content_tag_tag on content_tag(tag);
```

### ingest_event

```sql
create table ingest_event (
  id uuid primary key,
  source text not null,
  status text not null,
  platform text not null,
  platform_event_id text,
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 文件存储设计

二进制文件不直接存入 PostgreSQL，统一存到文件系统。数据库只保存：

- `md5`
- `size_bytes`
- `mime_type`
- `storage_key`
- 文件元数据

存储抽象：

```ts
interface StorageProvider {
  put(input: PutObjectInput): Promise<StoredObject>
  get(key: string): Promise<NodeJS.ReadableStream>
  getUrl(key: string): Promise<string>
  delete(key: string): Promise<void>
}
```

第一阶段实现：

- `LocalStorageProvider`：保存到本地目录。

后续实现：

- `S3StorageProvider`：兼容 MinIO/S3。

文件路径建议：

```text
objects/ab/cd/<md5>
derived/<contentId>/<variant>
```

这和旧 `FileService` 的分片路径思路一致，区别是新系统使用 MD5 作为文件 ID，并把 `storage_key` 显式写入 `media_file`，方便未来调整目录结构或迁移到 MinIO/S3。

## API 设计草案

### 上传文件

沿用旧系统“先上传文件，再提交内容”的模式。

```http
PUT /files
```

返回：

```json
{
  "md5": "..."
}
```

检查文件是否存在：

```http
HEAD /files/:md5
GET /files/:md5
```

### 创建内容

```http
POST /media
```

```json
{
  "title": "示例图片",
  "tags": ["表情包"],
  "elements": [
    {
      "type": "image",
      "id": "32位md5",
      "format": "png",
      "file": false,
      "width": 800,
      "height": 600
    }
  ],
  "source": {
    "platform": "qq",
    "groupId": "123",
    "userId": "456",
    "messageId": "789"
  }
}
```

### 创建聊天记录集合

```http
POST /media
```

```json
{
  "title": "聊天记录",
  "tags": ["聊天记录"],
  "elements": [
    {
      "type": "discuss",
      "content": [
        {
          "type": "speak",
          "sender": {
            "platform": "qq",
            "platformUserId": "10001",
            "displayName": "用户A"
          },
          "time": "2026-05-20T23:00:00+08:00",
          "message": [
            {
              "type": "text",
              "content": "这是一条消息"
            },
            {
              "type": "image",
              "id": "32位md5",
              "format": "png",
              "file": false,
              "width": 800,
              "height": 600
            }
          ]
        }
      ]
    }
  ],
  "source": {
    "platform": "qq",
    "messageId": "forward-001"
  }
}
```

### 查询内容

```http
GET /media?type=image&q=关键词&tag=表情包
GET /media/:id
GET /media/:id/tree
```

### 工作台素材列表

查询素材：

```http
GET /assets?kind=image&status=pending&source=qq
```

忽略素材：

```http
POST /assets/:id/ignore
```

把素材加入工作台左侧组装结果：

```http
POST /workspace-drafts/:id/assets
```

```json
{
  "assetIds": ["..."]
}
```

### 工作台组装结果

创建草稿：

```http
POST /workspace-drafts
```

更新草稿元素顺序、标题和 tag：

```http
PUT /workspace-drafts/:id
```

```json
{
  "title": "一组相关图片",
  "tags": ["表情包", "猫"],
  "elements": [
    {
      "type": "image",
      "id": "32位md5",
      "format": "png",
      "file": false,
      "width": 800,
      "height": 600
    }
  ],
  "assetIds": ["..."]
}
```

提交草稿为正式内容：

```http
POST /workspace-drafts/:id/submit
```

提交后：

- 创建正式 `media_content`。
- 写入或更新 tag。
- 写入来源绑定。
- 将草稿引用的 `media_asset.status` 改为 `used`。
- 将 `workspace_draft.status` 改为 `submitted`。

### 标签

```http
POST /media/:id/tags
DELETE /media/:id/tags/:tag
```

### 接入事件

```http
POST /ingest/events
GET /ingest/events/:id
POST /ingest/events/:id/replay
```

### 渲染为目标平台结构

```http
POST /media/:id/render
```

```json
{
  "targetPlatform": "qq"
}
```

返回平台适配器可消费的发送结构，不由内容系统直接发送消息。

## 接入流程

```text
QQ / NapCat 主动推送消息
  -> 写入 ingest_event
  -> Adapter 标准化
  -> 生成 MediaElement 链
  -> 下载或引用远程文件
  -> MD5 去重
  -> 写入 media_file
  -> 写入 source_binding
  -> 写入 media_asset，显示在工作台右侧素材列表
  -> 等待人工在工作台左侧组装结果中整理
  -> 提交后计算 content MD5 sign
  -> 写入 media_content
  -> 按需写入 content_relation
  -> 更新 ingest_event 状态
```

幂等规则：

- 同一平台消息通过 `source_binding(platform, platform_message_id)` 去重。
- 同一文件通过 `media_file.md5` 去重。
- 素材暂存阶段不要求合并成正式内容。
- 工作台提交时，同一内容通过 `media_content.sign` 去重。
- 接入或解析失败时保留 `ingest_event.error`，支持从接入事件重新解析。

## Bot 接入方式

bot 不直接访问数据库和文件目录，只通过 HTTP API 或 SDK 调用。

示例：

```ts
await contentClient.createFromPlatformMessage({
  platform: "qq",
  groupId,
  userId,
  messageId,
  segments,
})
```

bot 侧职责：

- 解析命令。
- 判断权限。
- 调用内容系统。
- 把内容系统返回结果交给平台 Adapter 发送。

内容系统职责：

- 保存内容。
- 维护结构关系。
- 处理去重、查询、同步和导出。

## 第一阶段最小可用版本

第一阶段只做必要闭环：

- Fastify 服务骨架。
- PostgreSQL migration。
- 本地文件存储。
- `image`、`video`、`audio`、`text`、`file`、`speak`、`discuss`、`composite` 元素模型。
- 文件下载和 MD5 去重。
- 内容元素链 MD5 签名去重。
- 来源绑定。
- QQ / NapCat 主动推送写入 `ingest_event`，解析后生成 `media_asset`。
- 工作台右侧素材列表筛选、忽略、拖入左侧组装结果。
- 工作台左侧组装结果拖动排序、打 tag、提交正式内容。
- 标签。
- 简单查询。
- QQ/NapCat 输入标准化接口。
- bot 通过 HTTP 调用。

暂缓：

- 视频转码。
- 音频转码。
- 跨平台发送。
- 图片相似搜索。
- 复杂权限模型。
- Web 管理后台。

## 后续阶段

第二阶段：

- 完善 `video`、`audio`、`file` 的媒体探测和展示能力。
- 增加缩略图、媒体元数据探测。
- 支持 MinIO/S3。
- 增加后台 worker。

第三阶段：

- 增加跨平台 render。
- 增加 Telegram/Discord Adapter。
- 增加全文搜索和高级筛选。
- 增加内容导出和批量迁移。

第四阶段：

- 图片相似搜索。
- 音视频转码。
- Web 管理后台。
- 更完整的权限和审计。

## 迁移策略

1. 梳理现有 bot pic 功能和旧 media-manager 数据结构。
2. 以旧 `MediaElement` 为基础定义新 TypeScript 类型。
3. 建立 `media_file`、`media_content`、`content_tag`、`source_binding`。
4. 编写旧 media-manager 导入脚本，迁移 `media_content.content`、`media_tag`，并为旧文件计算或映射 MD5。
5. 编写 bot pic 数据导入脚本，补充 `source_binding`。
6. bot 新增内容系统客户端，优先让新增内容写入新系统。
7. 老数据只读一段时间。
8. 验证稳定后关闭旧 pic 写入。
9. 完成历史数据补齐和旧逻辑删除。

## 关键设计原则

- 核心内容模型不依赖 QQ。
- 平台字段只进入 Adapter 和 SourceBinding。
- 聊天记录必须结构化保存，不能压成纯文本。
- 文件和元数据分离存储。
- 所有写入接口都要支持幂等。
- 优先保证数据模型稳定，再扩展媒体处理能力。
