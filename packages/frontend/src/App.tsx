import type { IngestEventDto, MediaAssetDto, MediaAssetStatus, MediaContentDto, MediaElement, MediaType, TagDto, WorkspaceDraftDto } from "@pic/shared";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  FileAudio,
  FileText,
  Filter,
  FolderInput,
  Image,
  Layers3,
  ListChecks,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  clearStoredToken,
  createMedia,
  fileUrl,
  getStoredToken,
  ignoreAsset,
  listAssets,
  listIngestEvents,
  listMedia,
  listTags,
  loginWithToken,
} from "@/api/client";

type ThemeMode = "light" | "dark";
type PageKey = "workspace" | "library" | "events" | "tags";
type TagMode = "and" | "or";

interface MediaFilters {
  query: string;
  status: MediaAssetStatus | "all";
  kind: MediaType | "all";
}

const pageItems: Array<{ key: PageKey; label: string; icon: LucideIcon }> = [
  { key: "workspace", label: "工作台", icon: Layers3 },
  { key: "library", label: "内容库", icon: Database },
  { key: "events", label: "接入事件", icon: ListChecks },
  { key: "tags", label: "标签管理", icon: Tags },
];

const statusOptions: Array<{ label: string; value: MediaAssetStatus | "all" }> = [
  { label: "全部状态", value: "all" },
  { label: "待处理", value: "pending" },
  { label: "已选择", value: "selected" },
  { label: "已入库", value: "used" },
  { label: "已忽略", value: "ignored" },
  { label: "失败", value: "failed" },
];

const kindOptions: Array<{ label: string; value: MediaType | "all" }> = [
  { label: "全部类型", value: "all" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "音频", value: "audio" },
  { label: "文本", value: "text" },
  { label: "文件", value: "file" },
];

function now() {
  return new Date().toISOString();
}

function createEmptyDraft(): WorkspaceDraftDto {
  const time = now();
  return {
    id: `draft-${Date.now()}`,
    title: "",
    tags: [],
    elements: [],
    assetIds: [],
    status: "editing",
    createdAt: time,
    updatedAt: time,
  };
}

function elementSummary(element: MediaElement) {
  switch (element.type) {
    case "text":
      return element.content;
    case "image":
    case "video":
    case "audio":
    case "file":
      return element.id;
    case "speak":
      return element.sender.displayName;
    case "discuss":
      return `${element.content.length} 条发言`;
  }
}

function elementLabel(element: MediaElement) {
  switch (element.type) {
    case "text":
      return "文本";
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音频";
    case "file":
      return "文件";
    case "speak":
      return "发言";
    case "discuss":
      return "聊天记录";
  }
}

function StatusBadge({ status }: { status: MediaAssetStatus }) {
  const label = {
    pending: "待处理",
    selected: "已选择",
    used: "已入库",
    ignored: "已忽略",
    failed: "失败",
  }[status];

  return (
    <Badge
      className={cn(
        status === "selected" && "border-primary/40 bg-primary-muted text-primary-text",
        status === "used" && "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
        status === "ignored" && "opacity-70",
        status === "failed" && "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {label}
    </Badge>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Sidebar({ page, onPageChange }: { page: PageKey; onPageChange: (page: PageKey) => void }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-surface px-3 py-4 lg:block">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-[#062426]">
          <FolderInput className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold">素材管理系统</div>
          <div className="text-xs text-subtle-foreground">Media Workspace</div>
        </div>
      </div>
      <nav className="space-y-1">
        {pageItems.map((item) => (
          <button
            key={item.key}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
              page === item.key && "bg-primary-muted text-primary-text",
            )}
            onClick={() => onPageChange(item.key)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({
  filters,
  onFiltersChange,
  theme,
  onThemeChange,
}: {
  filters: MediaFilters;
  onFiltersChange: (filters: MediaFilters) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            className="h-9 w-80 rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-subtle-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="搜索素材、tag、来源或 MD5"
            value={filters.query}
            onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
          />
        </div>
        <Button variant="secondary">
          <Filter className="h-4 w-4" />
          筛选
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant={theme === "light" ? "secondary" : "ghost"} className="h-9 w-9 px-0" aria-label="浅色主题" onClick={() => onThemeChange("light")}>
          <Sun className="h-4 w-4" />
        </Button>
        <Button variant={theme === "dark" ? "secondary" : "ghost"} className="h-9 w-9 px-0" aria-label="深色主题" onClick={() => onThemeChange("dark")}>
          <Moon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" className="h-9 w-9 px-0" aria-label="设置">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function AssetPreview({ element }: { element: MediaElement }) {
  if (element.type === "text") {
    return (
      <div className="flex h-full flex-col justify-between p-3 text-sm text-muted-foreground">
        <FileText className="h-5 w-5 text-primary" />
        <p className="line-clamp-4">{element.content}</p>
      </div>
    );
  }

  if (element.type === "audio") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted">
        <FileAudio className="h-10 w-10 text-primary" />
        <div className="h-1 w-24 rounded-full bg-primary-muted">
          <div className="h-1 w-2/3 rounded-full bg-primary" />
        </div>
      </div>
    );
  }

  if (element.type === "image") {
    return <img className="h-full w-full object-cover" src={fileUrl(element.id)} alt="素材预览" loading="lazy" />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--surface-muted),var(--surface))]">
      <Image className="h-10 w-10 text-primary" />
    </div>
  );
}

function MaterialCard({
  asset,
  index,
  checked,
  onToggle,
}: {
  asset: MediaAssetDto;
  index: number;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const selectable = asset.status !== "used" && asset.status !== "ignored";

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    if (!selectable) return;
    event.dataTransfer.setData("text/plain", asset.id);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <Card
      draggable={selectable}
      onDragStart={handleDragStart}
      className={cn(
        "group overflow-hidden transition-colors hover:border-border-hover",
        checked && "border-primary bg-primary-muted",
        asset.status === "selected" && "border-primary/60",
        asset.status === "used" && "opacity-70",
      )}
    >
      <button className="block w-full text-left" disabled={!selectable} onClick={() => onToggle(asset.id)}>
        <div className="relative aspect-square bg-surface-muted">
          <AssetPreview element={asset.element} />
          <div className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-xs text-subtle-foreground">
            #{index + 1}
          </div>
          <div className="absolute right-2 top-2">
            <input className="h-4 w-4 accent-[var(--primary)]" checked={checked} disabled={!selectable} readOnly type="checkbox" />
          </div>
        </div>
      </button>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{elementLabel(asset.element)}素材</span>
          <StatusBadge status={asset.status} />
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-subtle-foreground">{asset.fileMd5 ?? asset.id}</p>
          <Button className="h-7 w-7 px-0" variant="ghost" aria-label="更多操作">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AssemblyItem({
  element,
  index,
  count,
  onMove,
  onDragStart,
  onDrop,
}: {
  element: MediaElement;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
      className="flex items-center gap-3 rounded-md border border-border bg-surface-muted p-2"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface">
        {element.type === "text" ? <FileText className="h-4 w-4 text-primary" /> : element.type === "audio" ? <FileAudio className="h-4 w-4 text-primary" /> : <Image className="h-4 w-4 text-primary" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-subtle-foreground">{index + 1}</span>
          <span className="text-sm font-medium">{elementLabel(element)}</span>
        </div>
        <div className="truncate text-xs text-subtle-foreground">{elementSummary(element)}</div>
      </div>
      <div className="flex gap-1">
        <Button className="h-7 w-7 px-0" disabled={index === 0} variant="ghost" aria-label="上移" onClick={() => onMove(index, index - 1)}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button className="h-7 w-7 px-0" disabled={index === count - 1} variant="ghost" aria-label="下移" onClick={() => onMove(index, index + 1)}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function WorkspacePage({
  assets,
  draft,
  filters,
  selectedIds,
  onFiltersChange,
  onToggleAsset,
  onAddSelected,
  onIgnoreSelected,
  onAddAssetByDrag,
  onDraftChange,
  onMoveElement,
  onSubmit,
}: {
  assets: MediaAssetDto[];
  draft: WorkspaceDraftDto;
  filters: MediaFilters;
  selectedIds: string[];
  onFiltersChange: (filters: MediaFilters) => void;
  onToggleAsset: (id: string) => void;
  onAddSelected: () => void;
  onIgnoreSelected: () => void;
  onAddAssetByDrag: (id: string) => void;
  onDraftChange: (draft: Pick<WorkspaceDraftDto, "title" | "tags">) => void;
  onMoveElement: (from: number, to: number) => void;
  onSubmit: () => void;
}) {
  const [draggedElementIndex, setDraggedElementIndex] = useState<number | null>(null);
  const tagText = draft.tags.join("，");

  function handleDropAsset(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("text/plain");
    if (assetId) onAddAssetByDrag(assetId);
  }

  function handleDropElement(to: number) {
    if (draggedElementIndex == null) return;
    onMoveElement(draggedElementIndex, to);
    setDraggedElementIndex(null);
  }

  return (
    <section className="min-h-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">左侧按顺序组装正式内容，右侧从 QQ 主动推送的素材中滚动选择。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Upload className="h-4 w-4" />
            上传素材
          </Button>
          <Button disabled={selectedIds.length === 0} variant="secondary" onClick={onIgnoreSelected}>
            <X className="h-4 w-4" />
            忽略
          </Button>
          <Button disabled={selectedIds.length === 0} variant="primary" onClick={onAddSelected}>
            <Plus className="h-4 w-4" />
            加入结果
          </Button>
        </div>
      </div>

      <div className="grid min-h-[640px] gap-4 xl:grid-cols-[minmax(420px,0.9fr)_minmax(520px,1.1fr)]">
        <Card className="flex min-h-0 flex-col p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">组装结果</h2>
              <p className="text-sm text-muted-foreground">拖动右侧素材到这里，或拖动结果项调整顺序。</p>
            </div>
            <Badge className="border-primary/40 bg-primary-muted text-primary-text">{draft.elements.length} 个元素</Badge>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">标题</span>
              <input
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={draft.title ?? ""}
                onChange={(event) => onDraftChange({ title: event.target.value, tags: draft.tags })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Tag，使用逗号分隔</span>
              <input
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={tagText}
                onChange={(event) =>
                  onDraftChange({
                    title: draft.title,
                    tags: event.target.value
                      .split(/[，,]/)
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropAsset}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-dashed border-border bg-surface-muted p-3"
          >
            {draft.elements.map((element, index) => (
              <AssemblyItem
                key={`${element.type}-${index}-${elementSummary(element)}`}
                count={draft.elements.length}
                element={element}
                index={index}
                onDragStart={setDraggedElementIndex}
                onDrop={handleDropElement}
                onMove={onMoveElement}
              />
            ))}
            {draft.elements.length === 0 && (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-dashed border-border bg-surface text-center text-sm text-muted-foreground">
                从右侧拖入素材，或勾选素材后点击“加入结果”。
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-subtle-foreground">提交后会生成正式内容，素材状态变为已入库。</div>
            <Button disabled={draft.elements.length === 0} variant="primary" onClick={onSubmit}>
              <CheckCircle2 className="h-4 w-4" />
              提交正式内容
            </Button>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">素材列表</h2>
              <p className="text-sm text-muted-foreground">QQ 主动推送和手动上传产生的候选素材。</p>
            </div>
            <Badge>{selectedIds.length} 个已选</Badge>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-muted p-3">
            <SelectField label="状态" value={filters.status} options={statusOptions} onChange={(status) => onFiltersChange({ ...filters, status })} />
            <SelectField label="类型" value={filters.kind} options={kindOptions} onChange={(kind) => onFiltersChange({ ...filters, kind })} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {assets.map((asset, index) => (
                <MaterialCard key={asset.id} asset={asset} checked={selectedIds.includes(asset.id)} index={index} onToggle={onToggleAsset} />
              ))}
            </div>
            {assets.length === 0 && <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">没有符合条件的素材。</div>}
          </div>
        </Card>
      </div>
    </section>
  );
}

function ContentLibraryPage() {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<TagMode>("and");
  const [tags, setTags] = useState<TagDto[]>([]);
  const [contents, setContents] = useState<MediaContentDto[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, []);

  useEffect(() => {
    listMedia({ q: query, tags: selectedTags, tagMode: mode, size: 80 })
      .then((page) => {
        setContents(page.data);
        setTotal(page.total);
        setError("");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载内容库失败"));
  }, [mode, query, selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">内容库</h1>
        <p className="mt-1 text-sm text-muted-foreground">展示已入库内容，支持 tag 多选筛选和 AND / OR 匹配。</p>
      </div>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="搜索标题、tag、签名或内容"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex rounded-md border border-border bg-surface p-1">
            <Button className="h-7 px-2" variant={mode === "and" ? "primary" : "ghost"} onClick={() => setMode("and")}>
              AND
            </Button>
            <Button className="h-7 px-2" variant={mode === "or" ? "primary" : "ghost"} onClick={() => setMode("or")}>
              OR
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.name}
              className={cn(
                "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                selectedTags.includes(tag.name)
                  ? "border-primary/40 bg-primary-muted text-primary-text"
                  : "border-border bg-surface-muted text-muted-foreground hover:border-border-hover",
              )}
              onClick={() => toggleTag(tag.name)}
            >
              {tag.name} · {tag.count}
            </button>
          ))}
        </div>
        <div className="text-xs text-subtle-foreground">当前条件匹配 {total} 条，展示前 {contents.length} 条。</div>
      </Card>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div className="grid gap-3 lg:grid-cols-2">
        {contents.map((content) => (
          <Card key={content.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{content.title ?? "未命名内容"}</h2>
                <p className="mt-1 font-mono text-xs text-subtle-foreground">{content.sign}</p>
              </div>
              <Badge className={content.auditState === "approved" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : ""}>
                {content.auditState}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {content.tags.map((tag) => (
                <Badge key={tag} className="border-primary/30 bg-primary-muted text-primary-text">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-3 rounded-md border border-border bg-surface-muted p-3 text-sm text-muted-foreground">
              {content.elements.map(elementSummary).join(" / ")}
            </div>
          </Card>
        ))}
      </div>
      {contents.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">没有符合当前 tag 条件的内容。</Card>}
    </section>
  );
}

function TagManagementPage() {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<TagDto[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listTags(query)
      .then((rows) => {
        setTags(rows);
        setError("");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, [query]);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">标签管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">查找 tag，查看 tag 使用次数，后续可扩展合并和重命名。</p>
      </div>
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="查找 tag"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Card>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tags.map((tag) => (
          <Card key={tag.name} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{tag.name}</div>
              <div className="mt-1 text-xs text-subtle-foreground">正式内容中使用 {tag.count} 次</div>
            </div>
            <Badge>{tag.count}</Badge>
          </Card>
        ))}
      </div>
      {tags.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">没有找到匹配的 tag。</Card>}
    </section>
  );
}

function EventsPage() {
  const [events, setEvents] = useState<IngestEventDto[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listIngestEvents()
      .then((page) => {
        setEvents(page.data);
        setError("");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载接入事件失败"));
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">接入事件</h1>
        <p className="mt-1 text-sm text-muted-foreground">QQ / NapCat 主动推送和手动上传事件记录。</p>
      </div>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <Card className="overflow-hidden">
        {events.map((event) => (
          <div key={event.id} className="grid grid-cols-[160px_120px_1fr_96px] items-center border-b border-border px-4 py-3 text-sm last:border-b-0 hover:bg-surface-muted">
            <span className="font-medium">{event.source}</span>
            <span className="text-muted-foreground">{event.status}</span>
            <span className="text-muted-foreground">{event.error ?? event.platformEventId ?? event.platform}</span>
            <Button className="h-8" variant="secondary">
              查看
            </Button>
          </div>
        ))}
        {events.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">暂无接入事件。</div>}
      </Card>
    </section>
  );
}

function DashboardPreview({ contents, events }: { contents: MediaContentDto[]; events: IngestEventDto[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">内容库概览</h2>
          <Badge>{contents.length} 条</Badge>
        </div>
        <div className="overflow-hidden rounded-md border border-border">
          {contents.slice(0, 3).map((content) => (
            <div key={content.id} className="grid grid-cols-[1fr_88px_92px_72px] items-center border-b border-border bg-surface px-3 py-2 text-sm last:border-b-0 hover:bg-surface-muted">
              <span className="font-medium">{content.title ?? "未命名内容"}</span>
              <span className="text-muted-foreground">{content.type}</span>
              <span className={cn("text-xs", content.auditState === "approved" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>{content.auditState}</span>
              <span className="text-right text-xs text-subtle-foreground">{content.tags.length} tags</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">接入事件</h2>
          <Badge>{events.length} 条</Badge>
        </div>
        <div className="grid gap-3">
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-3 text-sm">
              <Clock3 className={cn("mt-0.5 h-4 w-4", event.status === "success" ? "text-green-500" : event.status === "failed" ? "text-red-500" : "text-subtle-foreground")} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{event.source}</span>
                  <span className="text-xs text-muted-foreground">{event.status}</span>
                </div>
                <p className="mt-1 text-xs text-subtle-foreground">{event.error ?? event.platformEventId ?? event.platform}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && <div className="rounded-md border border-border bg-surface-muted p-3 text-sm text-muted-foreground">暂无接入事件。</div>}
        </div>
      </Card>
    </div>
  );
}

function LoginPage({ theme, onThemeChange, onLogin }: { theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void; onLogin: (token: string) => Promise<void> }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      await onLogin(token.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">素材管理系统</h1>
            <p className="mt-1 text-sm text-muted-foreground">输入环境变量 ACCESS_TOKEN 配置的访问 token。</p>
          </div>
          <Button variant={theme === "dark" ? "secondary" : "ghost"} className="h-9 w-9 px-0" aria-label="切换主题" onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">访问 token</span>
          <input
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
          />
        </label>
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <Button className="w-full" disabled={!token.trim() || loading} variant="primary" onClick={() => void submit()}>
          {loading ? "验证中" : "进入系统"}
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const [page, setPage] = useState<PageKey>("workspace");
  const [token, setToken] = useState(() => getStoredToken());
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [contents, setContents] = useState<MediaContentDto[]>([]);
  const [events, setEvents] = useState<IngestEventDto[]>([]);
  const [draft, setDraft] = useState<WorkspaceDraftDto>(() => createEmptyDraft());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<MediaFilters>({ query: "", status: "all", kind: "all" });
  const [pendingTotal, setPendingTotal] = useState(0);
  const [contentTotal, setContentTotal] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [error, setError] = useState("");

  const stats: Array<{ label: string; value: string; icon: LucideIcon }> = [
    { label: "待处理素材", value: String(pendingTotal), icon: Archive },
    { label: "组装元素", value: String(draft.elements.length), icon: Layers3 },
    { label: "正式内容", value: String(contentTotal), icon: CheckCircle2 },
    { label: "接入事件", value: String(eventTotal), icon: ListChecks },
  ];

  useEffect(() => {
    if (!token) return;
    void refreshOverview();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void refreshAssets();
  }, [filters, token]);

  function changeTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("pic-content-theme", nextTheme);
  }

  async function handleLogin(nextToken: string) {
    await loginWithToken(nextToken);
    setToken(nextToken);
  }

  function handleLogout() {
    clearStoredToken();
    setToken("");
    setAssets([]);
    setContents([]);
    setEvents([]);
    setSelectedIds([]);
    setDraft(createEmptyDraft());
  }

  async function refreshOverview() {
    try {
      const [pendingPage, contentPage, eventPage] = await Promise.all([
        listAssets({ status: "pending", size: 1 }),
        listMedia({ size: 3 }),
        listIngestEvents(1, 3),
      ]);
      setPendingTotal(pendingPage.total);
      setContentTotal(contentPage.total);
      setEventTotal(eventPage.total);
      setContents(contentPage.data);
      setEvents(eventPage.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载概览失败");
    }
  }

  async function refreshAssets() {
    try {
      const pageData = await listAssets({
        q: filters.query,
        status: filters.status,
        kind: filters.kind,
        size: 80,
      });
      setAssets(pageData.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载素材失败");
    }
  }

  function toggleAsset(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addSelectedToDraft() {
    addAssetsToDraft(selectedIds);
    setSelectedIds([]);
  }

  function addAssetByDrag(id: string) {
    addAssetsToDraft([id]);
  }

  function addAssetsToDraft(assetIds: string[]) {
    const existing = new Set(draft.assetIds);
    const addable = assets.filter((asset) => assetIds.includes(asset.id) && asset.status !== "used" && asset.status !== "ignored" && !existing.has(asset.id));
    if (addable.length === 0) return;
    setDraft((current) => ({
      ...current,
      assetIds: [...current.assetIds, ...addable.map((asset) => asset.id)],
      elements: [...current.elements, ...addable.map((asset) => asset.element)],
      updatedAt: now(),
    }));
    setAssets((current) => current.map((asset) => (addable.some((item) => item.id === asset.id) ? { ...asset, status: "selected", updatedAt: now() } : asset)));
  }

  async function ignoreSelected() {
    await Promise.all(selectedIds.map((id) => ignoreAsset(id)));
    setSelectedIds([]);
    await refreshAssets();
    await refreshOverview();
  }

  function updateDraftMeta(patch: Pick<WorkspaceDraftDto, "title" | "tags">) {
    setDraft((current) => ({ ...current, ...patch, updatedAt: now() }));
  }

  function moveDraftElement(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= draft.elements.length || to >= draft.elements.length) return;
    const elements = [...draft.elements];
    const assetIds = [...draft.assetIds];
    const [element] = elements.splice(from, 1);
    const [assetId] = assetIds.splice(from, 1);
    if (!element || !assetId) return;
    elements.splice(to, 0, element);
    assetIds.splice(to, 0, assetId);
    setDraft((current) => ({ ...current, elements, assetIds, updatedAt: now() }));
  }

  async function submitCurrentDraft() {
    if (draft.elements.length === 0) return;
    try {
      await createMedia({
        title: draft.title?.trim() || undefined,
        tags: draft.tags,
        elements: draft.elements,
        assetIds: draft.assetIds,
      });
      setDraft(createEmptyDraft());
      setSelectedIds([]);
      await refreshAssets();
      await refreshOverview();
      setPage("library");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交内容失败");
    }
  }

  if (!token) return <LoginPage theme={theme} onThemeChange={changeTheme} onLogin={handleLogin} />;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar page={page} onPageChange={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar filters={filters} onFiltersChange={setFilters} theme={theme} onThemeChange={changeTheme} />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleLogout}>
              退出
            </Button>
          </div>
          {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
          <div className="grid gap-4 md:grid-cols-4">
            {stats.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </Card>
            ))}
          </div>
          {page === "workspace" && (
            <>
              <WorkspacePage
                assets={assets}
                draft={draft}
                filters={filters}
                selectedIds={selectedIds}
                onAddAssetByDrag={addAssetByDrag}
                onAddSelected={addSelectedToDraft}
                onDraftChange={updateDraftMeta}
                onFiltersChange={setFilters}
                onIgnoreSelected={() => void ignoreSelected()}
                onMoveElement={moveDraftElement}
                onSubmit={() => void submitCurrentDraft()}
                onToggleAsset={toggleAsset}
              />
              <DashboardPreview contents={contents} events={events} />
            </>
          )}
          {page === "library" && <ContentLibraryPage />}
          {page === "events" && <EventsPage />}
          {page === "tags" && <TagManagementPage />}
        </main>
      </div>
    </div>
  );
}
