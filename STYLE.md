# 前端设计风格

## 设计目标

本系统是媒体素材管理后台，核心场景是 QQ 自动录入素材、人工筛选、排序、打 tag、组合入库和后续检索。界面应当克制、清晰、专业，优先保证长时间整理素材时的效率和可读性。

设计目标：

- 支持浅色主题、深色主题和跟随系统设置。
- 默认浅色主题，深色主题需要完整适配，不是简单反色。
- 强调素材状态、同步状态、审核状态和人工整理流程。
- 避免营销页、消费级应用和过度装饰感。
- 保持高信息密度，适合工作台、内容库和接入事件的重复操作。

## 主题切换

- 主题切换入口放在 `Settings -> Appearance`。
- 主题选项：`light`、`dark`、`system`。
- 用户选择持久化在本机偏好中，例如 `localStorage`。
- 应通过 `html[data-theme="light"]` / `html[data-theme="dark"]` 或等价方案驱动 CSS variables。
- Tailwind 颜色应引用 CSS variables，不在业务组件里硬编码主题色。

## 色彩系统

### 浅色主题

```text
background:       #F7F9FB   页面主背景
surface:          #FFFFFF   面板、卡片、弹窗、下拉菜单
surfaceMuted:     #F1F5F8   次级背景、hover 弱背景
surfaceElevated:  #FFFFFF   浮层、抽屉、菜单
foreground:       #17212B   主文本
mutedForeground:  #657382   次级文本、说明文字
subtleForeground: #8A97A5   弱提示、元信息
border:           #DBE3EA   默认边框
borderHover:      #C4D0DA   hover 边框
primary:          #00C2C7   cyan 主强调色
primaryText:      #007B80   深 cyan 文字
primaryMuted:     #E9FBFB   浅 cyan 背景
```

### 深色主题

```text
background:       #10161D   页面主背景
surface:          #151D26   面板、卡片、弹窗、下拉菜单
surfaceMuted:     #1D2732   次级背景、hover 弱背景
surfaceElevated:  #202C38   浮层、抽屉、菜单
foreground:       #F4F7FA   主文本
mutedForeground:  #A8B3BE   次级文本、说明文字
subtleForeground: #7C8A98   弱提示、元信息
border:           #2C3A47   默认边框
borderHover:      #3B4C5C   hover 边框
primary:          #00C2C7   cyan 主强调色
primaryText:      #8EF4F6   深色主题中的 cyan 文字
primaryMuted:     rgba(0, 194, 199, 0.14)
```

### 状态色

状态色只用于表达状态，不应大面积铺满页面。

```text
success: #22C55E   已入库、成功、已通过
warning: #F59E0B   待处理、运行中、需要人工确认
danger:  #EF4444   失败、拒绝、删除
info:    #38BDF8   同步中、系统信息
neutral: #94A3B8   已忽略、已归档、无状态
```

### Tailwind 命名建议

不要反向使用 `surface-950` 表示浅色背景。建议使用语义 token：

```text
bg-background
bg-surface
bg-surface-muted
bg-surface-elevated
text-foreground
text-muted-foreground
text-subtle-foreground
border-border
bg-primary
text-primary
bg-primary-muted
```

## 字体

- 中文优先字体栈：`PingFang SC`、`Hiragino Sans GB`、`Microsoft YaHei UI`、`Microsoft YaHei`、`Noto Sans CJK SC`、`Source Han Sans SC`。
- 英文和数字使用 `Inter`、`SF Pro Text`、系统 UI 字体。
- MD5、内容签名、平台消息 ID 使用 `JetBrains Mono` 或系统等宽字体。
- 字重以 `400`、`500`、`600`、`700` 为主。
- 不使用负字距。
- 不随视口宽度动态缩放字号。

## 基础布局

### 应用框架

```text
┌────────────────────────────────────────────┐
│ Top Bar                                    │
├──────────────┬─────────────────────────────┤
│ Sidebar      │ Page Content                │
│              │                             │
└──────────────┴─────────────────────────────┘
```

尺寸建议：

```text
sidebarWidth: 240px
topBarHeight: 56px
pagePadding: 24px
panelGap: 16px
defaultRadius: 8px
```

### 页面密度

- 管理页面默认占满可用宽度，不设置营销页式 `max-width`。
- 工作台使用双栏布局：左侧组装结果，右侧素材列表。
- 内容库支持表格视图和网格视图。
- 接入事件以表格和详情抽屉为主。

## 核心页面

### 工作台

用途：承接 QQ 主动推送和手动上传产生的候选素材，并在同一个页面里完成正式内容组装。

布局：

- 左侧为组装结果，按最终内容顺序展示元素链。
- 右侧为素材列表，滚动展示候选素材。
- 顶部筛选栏作用于右侧素材列表：来源、类型、状态、时间、关键词、tag。
- 右侧素材支持多选、忽略、拖动到左侧。
- 左侧组装结果支持拖动排序、按钮上移/下移、编辑标题和 tag。
- 素材详情使用侧边抽屉，不离开当前工作台。

素材状态：

```text
pending   待处理
selected  已加入工作台
used      已入库
ignored   已忽略
failed    录入失败
```

素材卡片：

- 圆角 8px。
- 默认细边框。
- hover 只增强边框和显示快捷操作。
- 选中态使用 cyan 边框和浅 cyan 背景。
- 已使用素材降低视觉权重，并显示“已入库”标记。

能力：

- 多选素材加入草稿。
- 从右侧素材列表拖入左侧组装结果。
- 拖拽排序。
- 图片、文本、视频、音频混排。
- 编辑标题和 tag。
- 预览最终 `MediaElement[]`。
- 提交前检测重复内容签名。

视觉：

- 当前草稿区域使用 `surface`。
- 拖拽目标使用 cyan 虚线边框。
- 元素顺序使用编号、缩略图和类型 icon 表达。
- 提交按钮固定在右侧面板底部或页面底部操作栏。

### 内容库

用途：展示正式入库的 `MediaContent`。

布局：

- 顶部筛选：类型、tag、来源、时间、审核状态。
- 支持网格视图和表格视图。
- 详情使用抽屉或弹窗。
- 来源、MD5、内容签名提供复制按钮。

内容状态：

```text
approved  已通过
pending   待审核
rejected  已拒绝
archived  已归档
```

### 接入事件

用途：查看 QQ / NapCat 主动推送进入系统的事件，以及手动上传事件。

布局：

- 表格展示接入事件。
- 行内显示来源、状态、解析数量、最近错误、更新时间。
- 详情使用抽屉。
- 支持重试、忽略、重新拉取。

接入状态：

```text
received  已接收
parsed    已解析
failed    解析失败
ignored   已忽略
```

## 组件风格

### 卡片和面板

- 默认圆角 8px。
- 使用细边框表达层级。
- 阴影轻，不使用重阴影和发光。
- 不做卡片套卡片。如果已有外层面板，内层内容用留白、分隔线或弱背景区分。

### 按钮

按钮变体控制在有限集合：

```text
primary
secondary
ghost
danger
success
warning
```

主按钮：

- 使用 cyan 强调色。
- 文本必须有足够对比度。
- hover 使用亮度变化或弱背景，不使用强发光。

普通按钮：

- 浅色主题使用白底、深色文字、浅边框。
- 深色主题使用 `surface` 背景、浅色文字、深色边框。
- hover 使用 `surfaceMuted`。

图标按钮：

- 优先使用 lucide-react 图标。
- 默认 32px 或 36px。
- 必须有 tooltip 或 `aria-label`。
- 顶部栏、侧边栏、工具栏中的 icon button 默认不加独立块背景，只在 hover、active、selected 时显示弱背景。

### 输入框

- 圆角 8px。
- 使用细边框。
- focus 使用 cyan 描边或 ring。
- placeholder 使用弱文本色。
- 高度 36px 或 40px。

搜索框：

- 工作台和内容库顶部搜索需要支持键盘聚焦。
- 搜索框左侧使用搜索图标。
- 清空按钮使用 icon button。

### 下拉框和菜单

- 使用 shadcn/ui 自绘组件，不使用浏览器原生 `<select>`。
- 下拉触发器使用 `surface` 背景、细边框、8px 圆角。
- 菜单使用 `surfaceElevated` 背景、细边框、轻阴影。
- 选中项使用 `primaryMuted` 背景和 `primaryText`。
- hover 使用 `surfaceMuted`。

### Tag

默认 tag：

- 背景使用 `surfaceMuted`。
- 文字使用 `mutedForeground`。
- 圆角使用 `full`。
- 高度 24px 或 28px。

选中 tag：

- 背景使用 `primaryMuted`。
- 边框使用 cyan。
- 文字使用 `primaryText`。

tag 编辑：

- 支持键盘输入。
- 支持批量添加。
- 支持常用 tag 建议。

### 表格

- 行高 44px。
- 表头背景使用弱背景。
- 行 hover 使用 `surfaceMuted`。
- 边框浅、少，只保留必要分隔线。
- 状态使用 badge，不使用大面积背景色。
- MD5、内容签名、平台消息 ID 使用等宽字体。

### 抽屉和弹窗

抽屉用于：

- 素材详情。
- 内容详情。
- 接入事件详情。
- 来源信息。

弹窗用于：

- 删除确认。
- 重复内容确认。
- 大图、视频和音频预览。

规则：

- 圆角 8px。
- 面板使用 `surfaceElevated`。
- 遮罩克制，不使用强模糊、强渐变或发光。
- 弹窗内避免卡片套卡片。

## 媒体预览

图片：

- 默认使用 object-fit cover。
- 详情预览使用 contain。
- 支持复制 MD5、查看来源、加入工作台。

视频：

- 工作台素材列表展示封面和时长。
- 详情页提供播放器。

音频：

- 工作台素材列表使用波形占位或紧凑播放器。
- 不要求第一阶段实现复杂波形分析。

文本：

- 工作台素材列表显示前几行。
- 工作台中可编辑。

聊天记录：

- 使用消息流样式展示。
- 发言者、时间和内容层级清晰。
- 不做 QQ 原生样式复刻，只保留平台无关的可读结构。

## 动效

- 动效服务于反馈，不制造干扰。
- 常规 transition 控制在 120ms 到 220ms。
- 不使用弹跳动画。
- 不使用大范围位移动画。
- 拖拽排序需要有明确占位和落点反馈。
- 主题切换不需要复杂动画，避免闪烁即可。

## 响应式

- 大屏使用多栏工作台布局。
- 中屏工作台可以收敛为两栏。
- 小屏优先保证查看、搜索、简单打 tag 可用。
- 复杂排序和批量整理在移动端可以降级。
- 所有触控按钮高度不小于 44px。
- 固定格式组件需要明确尺寸约束，避免 hover、按钮、文本导致布局跳动。

## 可访问性

- 所有交互元素必须有可见 focus 状态。
- 图标按钮必须有 `aria-label` 或 tooltip。
- 状态不能只依赖颜色表达，必须配合文字、图标或 tooltip。
- 错误信息需要明确显示。
- 拖拽排序需要提供按钮式上移、下移作为替代操作。
- 图片素材应支持 alt 或描述字段。

## Tailwind / shadcn/ui 落地规则

- 使用 shadcn/ui 作为基础组件来源。
- 组件源码放在 `packages/frontend/src/components/ui`。
- 业务组件放在 `packages/frontend/src/components/media`。
- 颜色通过 CSS variables 定义。
- Tailwind class 用于布局和状态，重复组合沉淀为组件。
- 优先通过 `cn()` 合并 class。
- 不引入 Element Plus、Ant Design 等重型组件库。

## 成功标准

实现后的界面应当像：

- 一个专业、克制、可长时间使用的媒体素材管理系统。
- 可以在工作台右侧快速扫描大量 QQ 主动推送素材。
- 可以在工作台左侧高效把分散图片整理成正式内容。
- 状态、来源、tag、内容签名都清晰可查。
- 浅色和深色主题都完整、稳定、可读。

不应当像：

- 通用模板简单换色。
- 营销官网。
- 聊天客户端或数据分析看板。
- 过度装饰的消费级图库。
- 每个区域都被卡片包起来的低密度后台。
