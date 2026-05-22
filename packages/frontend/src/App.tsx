import type { IngestEventDto, MediaAssetDto, MediaAssetStatus, MediaContentDto, MediaElement, MediaType, TagDto, WorkspaceDraftDto } from "@pic/shared";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Database,
  FileAudio,
  FileText,
  FileVideo,
  FolderInput,
  Image,
  LayoutDashboard,
  Layers3,
  ListChecks,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sun,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createImagePreviewState, emptyImagePreviewState, ImagePreviewViewer, type ImagePreviewItem } from "@/components/media/image-preview";
import { cn } from "@/lib/utils";
import {
  batchUpdateMediaTags,
  clearStoredToken,
  createMedia,
  deleteAssets,
  deleteMediaContents,
  fileUrl,
  getStoredToken,
  ignoreAsset,
  listAssets,
  listIngestEvents,
  listMedia,
  listTags,
  loginWithToken,
  restoreMediaContentsToWorkspace,
} from "@/api/client";

type ThemeMode = "light" | "dark";
type PageKey = "home" | "workspace" | "library" | "events" | "tags";
type TagMode = "and" | "or";
type ContentCardSize = "small" | "medium" | "large";
type LibrarySort = "time_desc" | "time_asc";
type LibraryRouteState = {
  query: string;
  selectedTags: string[];
  tagQuery: string;
  mode: TagMode;
  cardSize: ContentCardSize;
  sort: LibrarySort;
  page: number;
  size: number;
};

interface MediaFilters {
  query: string;
  status: MediaAssetStatus | "all";
  kind: MediaType | "all";
}

const pageItems: Array<{ key: PageKey; label: string; icon: LucideIcon }> = [
  { key: "home", label: "主页", icon: LayoutDashboard },
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

const contentCardSizeOptions: Array<{ label: string; value: ContentCardSize; minWidth: string }> = [
  { label: "小", value: "small", minWidth: "200px" },
  { label: "中", value: "medium", minWidth: "260px" },
  { label: "大", value: "large", minWidth: "340px" },
];

const librarySortOptions: Array<{ label: string; value: LibrarySort }> = [
  { label: "入库时间倒序", value: "time_desc" },
  { label: "入库时间正序", value: "time_asc" },
];

const defaultLibraryPage = 1;
const defaultLibraryPageSize = 100;
const defaultLibrarySort: LibrarySort = "time_desc";
const libraryPageSizeOptions = [50, 100, 200];

const pagePaths: Record<PageKey, string> = {
  home: "/",
  workspace: "/workspace",
  library: "/library",
  events: "/events",
  tags: "/tags",
};

const defaultMediaFilters: MediaFilters = {
  query: "",
  status: "all",
  kind: "all",
};

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

function alignDraftAssetIds(elements: MediaElement[], assetIds: string[]) {
  return elements.map((_, index) => assetIds[index] ?? "");
}

function collectImagePreviewItems(elements: MediaElement[]): ImagePreviewItem[] {
  return elements.flatMap((element) => {
    if (element.type === "image") {
      const src = fileUrl(element.id);
      return [{ src, alt: "图片预览", downloadUrl: src }];
    }
    if (element.type === "speak") return collectImagePreviewItems(element.message);
    if (element.type === "discuss") return collectImagePreviewItems(element.content);
    return [];
  });
}

function imagePreviewSrc(element: MediaElement) {
  return element.type === "image" ? fileUrl(element.id) : "";
}

function isContentCardSize(value: string | null): value is ContentCardSize {
  return contentCardSizeOptions.some((option) => option.value === value);
}

function isLibrarySort(value: string | null): value is LibrarySort {
  return librarySortOptions.some((option) => option.value === value);
}

function isMediaAssetStatusFilter(value: string | null): value is MediaAssetStatus | "all" {
  return statusOptions.some((option) => option.value === value);
}

function isMediaKindFilter(value: string | null): value is MediaType | "all" {
  return kindOptions.some((option) => option.value === value);
}

function tagMatchesKeyword(tag: TagDto, keyword: string) {
  return tag.name.toLowerCase().includes(keyword.toLowerCase());
}

function parseTagInput(value: string) {
  return Array.from(new Set(value.split(/[,\s\uFF0C]+/).map((tag) => tag.trim()).filter(Boolean)));
}

function pageFromPath(pathname: string): PageKey {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return (Object.entries(pagePaths).find(([, path]) => path === normalized)?.[0] as PageKey | undefined) ?? "home";
}

function tagsFromParam(value: string | null) {
  return value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
}

function numberFromParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function libraryPageSizeFromParam(value: string | null) {
  const parsed = numberFromParam(value, defaultLibraryPageSize);
  return libraryPageSizeOptions.includes(parsed) ? parsed : defaultLibraryPageSize;
}

function setSearchParam(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function replaceRouteQuery(pathname: string, entries: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) setSearchParam(params, key, value);
  const query = params.toString();
  window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
}

function readWorkspaceFiltersFromUrl(): MediaFilters {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const kind = params.get("kind");
  return {
    query: params.get("q") ?? "",
    status: isMediaAssetStatusFilter(status) ? status : defaultMediaFilters.status,
    kind: isMediaKindFilter(kind) ? kind : defaultMediaFilters.kind,
  };
}

function updateWorkspaceQuery(filters: MediaFilters) {
  replaceRouteQuery(pagePaths.workspace, {
    q: filters.query.trim() || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    kind: filters.kind === "all" ? undefined : filters.kind,
  });
}

function readLibraryStateFromUrl(): LibraryRouteState {
  const params = new URLSearchParams(window.location.search);
  const tagMode = params.get("tagMode");
  const card = params.get("card");
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    selectedTags: tagsFromParam(params.get("tags")),
    tagQuery: params.get("tagInput") ?? "",
    mode: tagMode === "or" ? "or" : "and",
    cardSize: isContentCardSize(card) ? card : "medium",
    sort: isLibrarySort(sort) ? sort : defaultLibrarySort,
    page: numberFromParam(params.get("page"), defaultLibraryPage),
    size: libraryPageSizeFromParam(params.get("size")),
  };
}

function updateLibraryQuery(state: LibraryRouteState) {
  replaceRouteQuery(pagePaths.library, {
    q: state.query.trim() || undefined,
    tags: state.selectedTags.length > 0 ? state.selectedTags.join(",") : undefined,
    tagInput: state.tagQuery.trim() || undefined,
    tagMode: state.mode === "and" ? undefined : state.mode,
    card: state.cardSize === "medium" ? undefined : state.cardSize,
    sort: state.sort === defaultLibrarySort ? undefined : state.sort,
    page: String(state.page),
    size: String(state.size),
  });
}

function readTagSearchFromUrl() {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function updateTagSearchQuery(query: string) {
  replaceRouteQuery(pagePaths.tags, {
    q: query.trim() || undefined,
  });
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

function textPreview(content: string) {
  const firstPart = content
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstPart) return "空文本";
  return firstPart.length > 160 ? `${firstPart.slice(0, 160)}...` : firstPart;
}

function elementToken(element: MediaElement) {
  return `[${elementLabel(element)}]`;
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

function TagSelectInput({
  label,
  selectedTags,
  onChange,
  placeholder,
  helperText,
  className,
}: {
  label: string;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  helperText?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagDto[]>([]);
  const normalizedQuery = query.trim();
  const visibleSuggestions = suggestions.filter((tag) => !selectedTags.includes(tag.name)).slice(0, 8);
  const canCreate = parseTagInput(query).some((tag) => !selectedTags.includes(tag));

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      return;
    }

    let ignore = false;
    listTags(normalizedQuery || undefined)
      .then((rows) => {
        if (ignore) return;
        setSuggestions(normalizedQuery ? rows.filter((tag) => tagMatchesKeyword(tag, normalizedQuery)) : rows);
      })
      .catch(() => {
        if (!ignore) setSuggestions([]);
      });
    return () => {
      ignore = true;
    };
  }, [normalizedQuery, open]);

  function addTags(tags: string[]) {
    const next = Array.from(new Set([...selectedTags, ...tags.map((tag) => tag.trim()).filter(Boolean)]));
    onChange(next);
    setQuery("");
    setOpen(true);
  }

  function removeTag(tag: string) {
    onChange(selectedTags.filter((item) => item !== tag));
  }

  function commitQuery() {
    const tags = parseTagInput(query);
    if (tags.length > 0) addTags(tags);
    else setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitQuery();
    }
    if (event.key === "Backspace" && query.length === 0 && selectedTags.length > 0) {
      onChange(selectedTags.slice(0, -1));
    }
  }

  return (
    <div className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/30 bg-primary-muted px-2 text-xs text-primary-text"
              onClick={() => removeTag(tag)}
            >
              {tag}
              <X className="h-3 w-3" />
            </button>
          ))}
          <input
            className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-subtle-foreground"
            placeholder={selectedTags.length === 0 ? placeholder : "继续输入 tag"}
            value={query}
            onBlur={() => {
              commitQuery();
              setOpen(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {open && (visibleSuggestions.length > 0 || canCreate) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
            {visibleSuggestions.map((tag) => (
              <button
                key={tag.name}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTags([tag.name]);
                }}
              >
                <span>{tag.name}</span>
                <span className="text-xs text-subtle-foreground">{tag.count}</span>
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm text-primary-text hover:bg-primary-muted"
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitQuery();
                }}
              >
                添加输入的 tag
              </button>
            )}
          </div>
        )}
      </div>
      {helperText && <div className="mt-1 text-xs text-muted-foreground">{helperText}</div>}
    </div>
  );
}

function Sidebar({ page, onPageChange }: { page: PageKey; onPageChange: (page: PageKey) => void }) {
  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, nextPage: PageKey) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onPageChange(nextPage);
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 overflow-y-auto border-r border-border bg-surface px-3 py-4 lg:block">
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
          <a
            key={item.key}
            href={pagePaths[item.key]}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
              page === item.key && "bg-primary-muted text-primary-text",
            )}
            onClick={(event) => handleNavigate(event, item.key)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({
  page,
  theme,
  onThemeChange,
  onLogout,
}: {
  page: PageKey;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onLogout: () => void;
}) {
  const pageTitle = pageItems.find((item) => item.key === page)?.label ?? "主页";

  return (
    <header className="fixed left-0 right-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:left-60">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground">{pageTitle}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant={theme === "light" ? "secondary" : "ghost"} className="h-9 w-9 px-0" aria-label="浅色主题" onClick={() => onThemeChange("light")}>
          <Sun className="h-4 w-4" />
        </Button>
        <Button variant={theme === "dark" ? "secondary" : "ghost"} className="h-9 w-9 px-0" aria-label="深色主题" onClick={() => onThemeChange("dark")}>
          <Moon className="h-4 w-4" />
        </Button>
        <Button variant="ghost" className="h-9 w-9 px-0" aria-label="设置">
          <Settings className="h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={onLogout}>
          退出
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

  if (element.type === "video") {
    return (
      <div className="flex h-full items-center justify-center bg-surface-muted">
        <FileVideo className="h-10 w-10 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,var(--surface-muted),var(--surface))]">
      <Image className="h-10 w-10 text-primary" />
    </div>
  );
}

function DraftElementPreview({ element, onOpenImage }: { element: MediaElement; onOpenImage?: (element: MediaElement) => void }) {
  if (element.type === "image") {
    return (
      <button
        className="block w-full overflow-hidden rounded-md border border-border bg-surface outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
        onClick={() => onOpenImage?.(element)}
      >
        <img className="max-h-80 w-full object-contain" src={fileUrl(element.id)} alt="草稿图片预览" loading="lazy" />
      </button>
    );
  }

  if (element.type === "video") {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-black">
        <video className="max-h-80 w-full" src={fileUrl(element.id)} controls preload="metadata" playsInline />
      </div>
    );
  }

  if (element.type === "audio") {
    return (
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <FileAudio className="h-4 w-4 text-primary" />
          音频预览
        </div>
        <audio className="w-full" src={fileUrl(element.id)} controls preload="metadata" />
      </div>
    );
  }

  if (element.type === "file") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">文件</div>
            <div className="truncate font-mono text-xs text-subtle-foreground">{element.id}</div>
          </div>
        </div>
        <a className="shrink-0 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/40" href={fileUrl(element.id)} target="_blank" rel="noreferrer">
          打开文件
        </a>
      </div>
    );
  }

  if (element.type === "text") {
    return <div className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm leading-6 text-foreground">{element.content}</div>;
  }

  if (element.type === "speak") {
    return (
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="mb-2 text-xs text-muted-foreground">{element.sender.displayName}</div>
        <div className="space-y-2">
          {element.message.map((item, index) => (
            <DraftElementPreview key={`${item.type}-${index}-${elementSummary(item)}`} element={item} onOpenImage={onOpenImage} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
      {element.content.map((item, index) => (
        <DraftElementPreview key={`${item.type}-${index}-${item.time}`} element={item} onOpenImage={onOpenImage} />
      ))}
    </div>
  );
}

function SingleContentPreview({ element, onOpen }: { element: MediaElement; onOpen?: (element: MediaElement) => void }) {
  if (element.type === "image") {
    return (
      <button
        className="block h-full w-full overflow-hidden rounded-md border border-border bg-surface-muted text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onOpen?.(element)}
        type="button"
      >
        <img className="h-full w-full object-contain" src={fileUrl(element.id)} alt="图片内容预览" loading="lazy" />
      </button>
    );
  }

  if (element.type === "video") {
    return (
      <button
        className="block h-full w-full overflow-hidden rounded-md border border-border bg-black outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onOpen?.(element)}
        type="button"
      >
        <video className="h-full w-full object-contain" src={fileUrl(element.id)} autoPlay muted loop playsInline />
      </button>
    );
  }

  if (element.type === "audio") {
    return (
      <button
        className="flex h-full min-h-0 w-full items-center gap-3 rounded-md border border-border bg-surface-muted p-4 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onOpen?.(element)}
        type="button"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface">
          <FileAudio className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">音频内容</div>
          <div className="mt-1 truncate font-mono text-xs text-subtle-foreground">{element.id}</div>
        </div>
      </button>
    );
  }

  if (element.type === "text") {
    return <div className="h-full overflow-hidden rounded-md border border-border bg-surface-muted p-3 text-sm leading-6 text-muted-foreground">{textPreview(element.content)}</div>;
  }

  if (element.type === "file") {
    return (
      <div className="flex h-full min-h-0 items-center gap-3 rounded-md border border-border bg-surface-muted p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">文件内容</div>
          <div className="mt-1 truncate font-mono text-xs text-subtle-foreground">{element.id}</div>
        </div>
      </div>
    );
  }

  return <CompositeContentPreview elements={[element]} />;
}

function CompositeContentPreview({ elements, onOpen }: { elements: MediaElement[]; onOpen?: () => void }) {
  const body = (
    <div className="h-full overflow-hidden rounded-md border border-border bg-surface-muted p-3">
      <div className="mb-2 flex max-h-14 flex-wrap gap-2 overflow-hidden">
        {elements.map((element, index) => (
          <Badge key={`${element.type}-${index}-${elementSummary(element)}`} className="border-primary/30 bg-primary-muted text-primary-text">
            {elementToken(element)}
          </Badge>
        ))}
      </div>
      <div className="overflow-hidden text-sm leading-6 text-muted-foreground">
        {elements
          .filter((element): element is Extract<MediaElement, { type: "text" }> => element.type === "text")
          .map((element) => textPreview(element.content))
          .join(" / ") || "复合内容中的媒体文件已用类型标记展示。"}
      </div>
    </div>
  );
  if (!onOpen) return body;
  return (
    <button
      className="block h-full w-full text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onOpen}
      type="button"
    >
      {body}
    </button>
  );
}

function ContentPreview({
  content,
  onOpenContent,
  onOpenElement,
}: {
  content: MediaContentDto;
  onOpenContent?: (content: MediaContentDto) => void;
  onOpenElement?: (element: MediaElement) => void;
}) {
  if (content.elements.length === 1 && content.type !== "composite") {
    const [element] = content.elements;
    if (element) return <SingleContentPreview element={element} onOpen={onOpenElement} />;
  }
  return <CompositeContentPreview elements={content.elements} onOpen={onOpenContent ? () => onOpenContent(content) : undefined} />;
}

function Modal({
  title,
  subtitle,
  closeLabel,
  zIndex = "z-50",
  maxWidth = "max-w-5xl",
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  closeLabel: string;
  zIndex?: string;
  maxWidth?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className={cn("fixed inset-0 flex items-center justify-center bg-black/70 p-4", zIndex)} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl", maxWidth)} onClick={(event) => event.stopPropagation()}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="truncate font-mono text-xs text-subtle-foreground">{subtitle}</div>}
          </div>
          <Button className="h-8 w-8 px-0" variant="ghost" aria-label={closeLabel} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function MediaElementModal({ element, onClose }: { element: MediaElement; onClose: () => void }) {
  if (element.type === "image") return null;
  const subtitle = "id" in element ? element.id : undefined;
  return (
    <Modal title={`${elementToken(element)}预览`} subtitle={subtitle} closeLabel="关闭预览" onClose={onClose}>
      <div className="min-h-0 bg-black">
        {element.type === "video" && <video className="max-h-[calc(92vh-3rem)] w-full" src={fileUrl(element.id)} controls autoPlay playsInline />}
        {element.type === "audio" && (
          <div className="flex min-h-80 items-center justify-center bg-surface p-8">
            <div className="w-full max-w-xl rounded-md border border-border bg-surface-muted p-6">
              <div className="mb-4 flex items-center gap-3">
                <FileAudio className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-sm font-medium">音频内容</div>
                  <div className="font-mono text-xs text-subtle-foreground">{element.id}</div>
                </div>
              </div>
              <audio className="w-full" src={fileUrl(element.id)} controls autoPlay />
            </div>
          </div>
        )}
        {element.type === "file" && (
          <div className="flex min-h-80 items-center justify-center bg-surface p-8">
            <a className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm hover:border-primary/40" href={fileUrl(element.id)} target="_blank" rel="noreferrer">
              打开文件
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ContentDetailModal({
  content,
  onClose,
  onOpenElement,
}: {
  content: MediaContentDto;
  onClose: () => void;
  onOpenElement: (element: MediaElement) => void;
}) {
  return (
    <Modal title={content.title ?? "复合内容"} subtitle={content.sign} closeLabel="关闭详情" zIndex="z-40" onClose={onClose}>
        <div className="max-h-[calc(92vh-3rem)] overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap gap-1">
            {content.tags.map((tag) => (
              <Badge key={tag} className="border-primary/30 bg-primary-muted text-primary-text">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {content.elements.map((element, index) => (
              <div key={`${element.type}-${index}-${elementSummary(element)}`} className="rounded-md border border-border bg-surface-muted p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  #{index + 1} {elementToken(element)}
                </div>
                {element.type === "text" && <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{element.content}</div>}
                {element.type === "image" && (
                  <button className="block aspect-video w-full overflow-hidden rounded-md bg-surface" type="button" onClick={() => onOpenElement(element)}>
                    <img className="h-full w-full object-contain" src={fileUrl(element.id)} alt="复合内容图片" loading="lazy" />
                  </button>
                )}
                {element.type === "video" && (
                  <button className="flex aspect-video w-full items-center justify-center rounded-md bg-black text-white" type="button" onClick={() => onOpenElement(element)}>
                    <FileVideo className="h-10 w-10" />
                  </button>
                )}
                {element.type === "audio" && (
                  <button className="flex min-h-28 w-full items-center gap-3 rounded-md bg-surface p-4 text-left" type="button" onClick={() => onOpenElement(element)}>
                    <FileAudio className="h-8 w-8 text-primary" />
                    <span className="min-w-0 truncate font-mono text-xs text-subtle-foreground">{element.id}</span>
                  </button>
                )}
                {element.type === "file" && (
                  <button className="flex min-h-28 w-full items-center gap-3 rounded-md bg-surface p-4 text-left" type="button" onClick={() => onOpenElement(element)}>
                    <FileText className="h-8 w-8 text-primary" />
                    <span className="min-w-0 truncate font-mono text-xs text-subtle-foreground">{element.id}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
    </Modal>
  );
}

function MaterialCard({
  asset,
  index,
  checked,
  onToggle,
  onOpenImage,
}: {
  asset: MediaAssetDto;
  index: number;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpenImage: (element: MediaElement) => void;
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
          <Button
            className="h-7 w-7 px-0"
            disabled={asset.element.type !== "image"}
            variant="ghost"
            aria-label={asset.element.type === "image" ? "预览图片" : "暂无预览操作"}
            onClick={() => onOpenImage(asset.element)}
          >
            {asset.element.type === "image" ? <Search className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
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
  onRemove,
  onOpenImage,
  onDragStart,
  onDrop,
}: {
  element: MediaElement;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onOpenImage: (element: MediaElement) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
      className="rounded-md border border-border bg-surface-muted p-3"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface">
          {element.type === "text" ? <FileText className="h-4 w-4 text-primary" /> : element.type === "audio" ? <FileAudio className="h-4 w-4 text-primary" /> : element.type === "video" ? <FileVideo className="h-4 w-4 text-primary" /> : <Image className="h-4 w-4 text-primary" />}
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
          <Button className="h-7 w-7 px-0" variant="ghost" aria-label="移除" onClick={() => onRemove(index)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <DraftElementPreview element={element} onOpenImage={onOpenImage} />
    </div>
  );
}

function WorkspacePage({
  assets,
  draft,
  filters,
  selectedIds,
  pendingDeleteConfirm,
  onFiltersChange,
  onToggleAsset,
  onAddSelected,
  onIgnoreSelected,
  onDeleteSelected,
  onAddAssetByDrag,
  onAddTextElement,
  onDraftChange,
  onMoveElement,
  onRemoveElement,
  onOpenImagePreview,
  onSubmit,
}: {
  assets: MediaAssetDto[];
  draft: WorkspaceDraftDto;
  filters: MediaFilters;
  selectedIds: string[];
  pendingDeleteConfirm: boolean;
  onFiltersChange: (filters: MediaFilters) => void;
  onToggleAsset: (id: string) => void;
  onAddSelected: () => void;
  onIgnoreSelected: () => void;
  onDeleteSelected: () => void;
  onAddAssetByDrag: (id: string) => void;
  onAddTextElement: (content: string) => void;
  onDraftChange: (draft: Pick<WorkspaceDraftDto, "title" | "tags">) => void;
  onMoveElement: (from: number, to: number) => void;
  onRemoveElement: (index: number) => void;
  onOpenImagePreview: (elements: MediaElement[], activeElement: MediaElement) => void;
  onSubmit: () => void;
}) {
  const [draggedElementIndex, setDraggedElementIndex] = useState<number | null>(null);
  const [manualText, setManualText] = useState("");

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

  function submitManualText() {
    const content = manualText.trim();
    if (!content) return;
    onAddTextElement(content);
    setManualText("");
  }

  return (
    <section className="min-h-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary">
          <Upload className="h-4 w-4" />
          上传素材
        </Button>
        <Button disabled={selectedIds.length === 0} variant="secondary" onClick={onIgnoreSelected}>
          <X className="h-4 w-4" />
          忽略
        </Button>
        <Button disabled={selectedIds.length === 0} variant={pendingDeleteConfirm ? "danger" : "secondary"} onClick={onDeleteSelected}>
          <Trash2 className="h-4 w-4" />
          {pendingDeleteConfirm ? "确认删除" : "删除已选"}
        </Button>
        <Button disabled={selectedIds.length === 0} variant="primary" onClick={onAddSelected}>
          <Plus className="h-4 w-4" />
          加入结果
        </Button>
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
            <TagSelectInput
              label="Tag"
              selectedTags={draft.tags}
              placeholder="输入 tag 名称筛选或新建"
              onChange={(tags) => onDraftChange({ title: draft.title, tags })}
            />
          </div>

          <div className="mb-4 rounded-md border border-border bg-surface-muted p-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">手动文本块</span>
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-subtle-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="输入需要加入草稿的文本"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
              />
            </label>
            <div className="mt-2 flex justify-end">
              <Button disabled={!manualText.trim()} variant="secondary" onClick={submitManualText}>
                <Plus className="h-4 w-4" />
                添加文本块
              </Button>
            </div>
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
                onRemove={onRemoveElement}
                onOpenImage={(element) => onOpenImagePreview(draft.elements, element)}
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
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
              <input
                className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-subtle-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="搜索素材、tag、来源或 MD5"
                value={filters.query}
                onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })}
              />
            </div>
            <SelectField label="状态" value={filters.status} options={statusOptions} onChange={(status) => onFiltersChange({ ...filters, status })} />
            <SelectField label="类型" value={filters.kind} options={kindOptions} onChange={(kind) => onFiltersChange({ ...filters, kind })} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {assets.map((asset, index) => (
                <MaterialCard
                  key={asset.id}
                  asset={asset}
                  checked={selectedIds.includes(asset.id)}
                  index={index}
                  onOpenImage={(element) => onOpenImagePreview(assets.map((item) => item.element), element)}
                  onToggle={onToggleAsset}
                />
              ))}
            </div>
            {assets.length === 0 && <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">没有符合条件的素材。</div>}
          </div>
        </Card>
      </div>
    </section>
  );
}

function ContentLibraryPage({ onOpenImagePreview }: { onOpenImagePreview: (elements: MediaElement[], activeElement: MediaElement) => void }) {
  const initialRouteState = readLibraryStateFromUrl();
  const [query, setQuery] = useState(initialRouteState.query);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialRouteState.selectedTags);
  const [tagQuery, setTagQuery] = useState(initialRouteState.tagQuery);
  const [tagSuggestions, setTagSuggestions] = useState<TagDto[]>([]);
  const [mode, setMode] = useState<TagMode>(initialRouteState.mode);
  const [cardSize, setCardSize] = useState<ContentCardSize>(initialRouteState.cardSize);
  const [sort, setSort] = useState<LibrarySort>(initialRouteState.sort);
  const [currentPage, setCurrentPage] = useState(initialRouteState.page);
  const [pageSize, setPageSize] = useState(initialRouteState.size);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [contents, setContents] = useState<MediaContentDto[]>([]);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [previewContent, setPreviewContent] = useState<MediaContentDto | null>(null);
  const [previewElement, setPreviewElement] = useState<MediaElement | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [batchAddTags, setBatchAddTags] = useState("");
  const [batchRemoveTags, setBatchRemoveTags] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const cardMinWidth = contentCardSizeOptions.find((option) => option.value === cardSize)?.minWidth ?? "260px";
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardMinWidth}), 1fr))`,
  };
  const commonTags = tags.slice(0, 10);
  const visibleTagSuggestions = tagQuery.trim()
    ? tagSuggestions.filter((tag) => !selectedTags.includes(tag.name)).slice(0, 8)
    : [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    const start = Math.min(Math.max(currentPage - 2, 1), Math.max(totalPages - 4, 1));
    return start + index;
  });

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, []);

  async function refreshContents() {
    const page = await listMedia({ q: query, tags: selectedTags, tagMode: mode, sort, page: currentPage, size: pageSize });
    const nextTotalPages = Math.max(1, Math.ceil(page.total / pageSize));
    if (currentPage > nextTotalPages) {
      setCurrentPage(nextTotalPages);
      return;
    }
    setContents(page.data);
    setTotal(page.total);
    setSelectedContentIds((current) => {
      const visibleIds = new Set(page.data.map((content) => content.id));
      return current.filter((id) => visibleIds.has(id));
    });
    setError("");
  }

  useEffect(() => {
    function syncRouteState() {
      const next = readLibraryStateFromUrl();
      setQuery(next.query);
      setSelectedTags(next.selectedTags);
      setTagQuery(next.tagQuery);
      setMode(next.mode);
      setCardSize(next.cardSize);
      setSort(next.sort);
      setCurrentPage(next.page);
      setPageSize(next.size);
    }

    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  useEffect(() => {
    updateLibraryQuery({ query, selectedTags, tagQuery, mode, cardSize, sort, page: currentPage, size: pageSize });
  }, [cardSize, currentPage, mode, pageSize, query, selectedTags, sort, tagQuery]);

  useEffect(() => {
    const keyword = tagQuery.trim();
    if (!keyword) {
      setTagSuggestions([]);
      return;
    }

    let ignore = false;
    listTags(keyword)
      .then((rows) => {
        if (!ignore) setTagSuggestions(rows.filter((tag) => tagMatchesKeyword(tag, keyword)));
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "搜索 tag 失败"));
    return () => {
      ignore = true;
    };
  }, [tagQuery]);

  useEffect(() => {
    refreshContents()
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载内容库失败"));
  }, [currentPage, mode, pageSize, query, selectedTags, sort]);

  useEffect(() => {
    setPendingDeleteConfirm(false);
  }, [selectedContentIds]);

  function resetLibraryPage() {
    setCurrentPage(defaultLibraryPage);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setCurrentPage(defaultLibraryPage);
  }

  function changeSort(nextSort: LibrarySort) {
    setSort(nextSort);
    setCurrentPage(defaultLibraryPage);
  }

  function addTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current : [...current, tag]));
    setTagQuery("");
    setTagSuggestions([]);
    resetLibraryPage();
  }

  function removeTag(tag: string) {
    setSelectedTags((current) => current.filter((item) => item !== tag));
    resetLibraryPage();
  }

  function toggleCommonTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
    resetLibraryPage();
  }

  function toggleContentSelection(id: string) {
    setSelectedContentIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function openElementPreview(element: MediaElement, elements: MediaElement[]) {
    if (element.type === "image") {
      onOpenImagePreview(elements, element);
      return;
    }
    setPreviewElement(element);
  }

  async function submitBatchDelete() {
    if (selectedContentIds.length === 0) return;
    if (!pendingDeleteConfirm) {
      setPendingDeleteConfirm(true);
      return;
    }

    try {
      await deleteMediaContents({ ids: selectedContentIds });
      setSelectedContentIds([]);
      setPendingDeleteConfirm(false);
      await refreshContents();
      setTags(await listTags());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除内容失败");
    }
  }

  async function restoreSelectedToWorkspace() {
    if (selectedContentIds.length === 0) return;
    try {
      await restoreMediaContentsToWorkspace({ ids: selectedContentIds });
      setSelectedContentIds([]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "放回工作台失败");
    }
  }

  async function submitBatchTagUpdate() {
    const addTags = parseTagInput(batchAddTags);
    const removeTags = parseTagInput(batchRemoveTags);
    if (selectedContentIds.length === 0 || (addTags.length === 0 && removeTags.length === 0)) return;

    try {
      await batchUpdateMediaTags({
        ids: selectedContentIds,
        addTags,
        removeTags,
      });
      setBatchAddTags("");
      setBatchRemoveTags("");
      await refreshContents();
      setTags(await listTags());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "批量更新 tag 失败");
    }
  }

  return (
    <section className="space-y-4 xl:pr-16">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="搜索标题、tag、签名或内容"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetLibraryPage();
              }}
            />
          </div>
          <div className="flex rounded-md border border-border bg-surface p-1">
            <Button
              className="h-7 px-2"
              variant={mode === "and" ? "primary" : "ghost"}
              onClick={() => {
                setMode("and");
                resetLibraryPage();
              }}
            >
              AND
            </Button>
            <Button
              className="h-7 px-2"
              variant={mode === "or" ? "primary" : "ghost"}
              onClick={() => {
                setMode("or");
                resetLibraryPage();
              }}
            >
              OR
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">卡片</span>
            <div className="flex rounded-md border border-border bg-surface p-1">
              {contentCardSizeOptions.map((option) => (
                <Button
                  key={option.value}
                  className="h-7 px-2"
                  variant={cardSize === option.value ? "primary" : "ghost"}
                  onClick={() => setCardSize(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <SelectField label="排序" value={sort} options={librarySortOptions} onChange={changeSort} />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="flex h-7 items-center text-xs text-muted-foreground">常用 tag</span>
          {commonTags.map((tag) => (
            <button
              key={tag.name}
              className={cn(
                "h-7 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                selectedTags.includes(tag.name)
                  ? "border-primary/40 bg-primary-muted text-primary-text"
                  : "border-border bg-surface-muted text-muted-foreground hover:border-border-hover",
              )}
              onClick={() => toggleCommonTag(tag.name)}
            >
              {tag.name} · {tag.count}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            {selectedTags.map((tag) => (
              <button
                key={tag}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/40 bg-primary-muted px-2 text-xs font-medium text-primary-text"
                onClick={() => removeTag(tag)}
                type="button"
              >
                {tag}
                <X className="h-3 w-3" />
              </button>
            ))}
            <input
              className="h-7 min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
              placeholder={selectedTags.length === 0 ? "输入 tag 名称搜索并选择" : "继续输入 tag"}
              value={tagQuery}
              onChange={(event) => setTagQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace" && tagQuery.length === 0) {
                  setSelectedTags((current) => current.slice(0, -1));
                  resetLibraryPage();
                }
              }}
            />
          </div>
          {visibleTagSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-md border border-border bg-surface-muted p-2">
              {visibleTagSuggestions.map((tag) => (
                <button
                  key={tag.name}
                  className="h-7 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary-text"
                  onClick={() => addTag(tag.name)}
                  type="button"
                >
                  {tag.name} · {tag.count}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-xs text-subtle-foreground">当前条件匹配 {total} 条，本页展示 {contents.length} 条。</div>
      </Card>
      {selectedContentIds.length > 0 && (
        <Card aria-label="已选内容操作" className="sticky top-[4.75rem] z-20 space-y-3 border-primary/30 bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">已选择 {selectedContentIds.length} 条内容</div>
              <div className="mt-1 text-xs text-muted-foreground">批量添加或移除 tag，多个 tag 可用逗号、空格分隔。</div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelectedContentIds(contents.map((content) => content.id))}>
                选择本页
              </Button>
              <Button variant="ghost" onClick={() => setSelectedContentIds([])}>
                清空选择
              </Button>
              <Button variant="secondary" onClick={() => void restoreSelectedToWorkspace()}>
                <FolderInput className="h-4 w-4" />
                放回工作台
              </Button>
              <Button variant={pendingDeleteConfirm ? "danger" : "secondary"} onClick={() => void submitBatchDelete()}>
                <Trash2 className="h-4 w-4" />
                {pendingDeleteConfirm ? "确认删除" : "删除已选"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <TagSelectInput
              label="添加 tag"
              selectedTags={parseTagInput(batchAddTags)}
              placeholder="输入 tag 名称筛选或新建"
              onChange={(tags) => setBatchAddTags(tags.join(","))}
            />
            <TagSelectInput
              label="移除 tag"
              selectedTags={parseTagInput(batchRemoveTags)}
              placeholder="输入 tag 名称筛选"
              onChange={(tags) => setBatchRemoveTags(tags.join(","))}
            />
            <div className="flex items-end">
              <Button
                className="w-full lg:w-auto"
                disabled={parseTagInput(batchAddTags).length === 0 && parseTagInput(batchRemoveTags).length === 0}
                variant="primary"
                onClick={() => void submitBatchTagUpdate()}
              >
                应用到已选
              </Button>
            </div>
          </div>
        </Card>
      )}
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div aria-label="内容库分页" className="flex justify-center xl:fixed xl:right-4 xl:top-[4.75rem] xl:z-10 xl:block xl:w-14">
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-md border border-border bg-surface p-1 shadow-sm xl:flex-col">
          <Button
            className="h-8 w-8 px-0"
            disabled={currentPage <= 1}
            variant="secondary"
            aria-label="上一页"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronUp className="h-4 w-4 hidden xl:block" />
            <ChevronLeft className="h-4 w-4 xl:hidden" />
          </Button>
          {visiblePages.map((page) => (
            <Button
              key={page}
              className="h-8 w-8 px-0 text-xs"
              variant={page === currentPage ? "primary" : "secondary"}
              aria-label={`第 ${page} 页`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </Button>
          ))}
          <Button
            className="h-8 w-8 px-0"
            disabled={currentPage >= totalPages}
            variant="secondary"
            aria-label="下一页"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            <ChevronDown className="h-4 w-4 hidden xl:block" />
            <ChevronRight className="h-4 w-4 xl:hidden" />
          </Button>
          <div className="relative h-8 w-12">
            <select
              className="h-8 w-12 appearance-none rounded-md border border-border bg-surface pl-2 pr-5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              title="每页数量"
              value={pageSize}
              onChange={(event) => changePageSize(Number(event.target.value))}
            >
              {libraryPageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-subtle-foreground" />
          </div>
        </div>
      </div>
      <div className="grid gap-3" style={gridStyle}>
        {contents.map((content) => (
          <Card
            key={content.id}
            className={cn(
              "flex aspect-square min-h-0 flex-col overflow-hidden p-3",
              selectedContentIds.includes(content.id) && "border-primary bg-primary-muted/40",
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{content.title ?? "未命名内容"}</h2>
                <p className="mt-1 font-mono text-xs text-subtle-foreground">{content.sign}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className={content.auditState === "approved" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : ""}>
                  {content.auditState}
                </Badge>
                <button
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-subtle-foreground transition-colors hover:border-primary/40 hover:text-primary-text",
                    selectedContentIds.includes(content.id) && "border-primary/40 bg-primary text-[#062426]",
                  )}
                  onClick={() => toggleContentSelection(content.id)}
                  type="button"
                  aria-label={selectedContentIds.includes(content.id) ? "取消选择内容" : "选择内容"}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex max-h-14 shrink-0 flex-wrap gap-1 overflow-hidden">
              {content.tags.map((tag) => (
                <Badge key={tag} className="border-primary/30 bg-primary-muted text-primary-text">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-2 min-h-0 flex-1">
              <ContentPreview content={content} onOpenContent={setPreviewContent} onOpenElement={(element) => openElementPreview(element, content.elements)} />
            </div>
          </Card>
        ))}
      </div>
      {contents.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">没有符合当前 tag 条件的内容。</Card>}
      {previewContent && <ContentDetailModal content={previewContent} onClose={() => setPreviewContent(null)} onOpenElement={(element) => openElementPreview(element, previewContent.elements)} />}
      {previewElement && <MediaElementModal element={previewElement} onClose={() => setPreviewElement(null)} />}
    </section>
  );
}

function TagManagementPage() {
  const [query, setQuery] = useState(readTagSearchFromUrl);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    function syncRouteState() {
      setQuery(readTagSearchFromUrl());
    }

    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  useEffect(() => {
    updateTagSearchQuery(query);
  }, [query]);

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

function HomePage({
  stats,
  contents,
  events,
}: {
  stats: Array<{ label: string; value: string; icon: LucideIcon }>;
  contents: MediaContentDto[];
  events: IngestEventDto[];
}) {
  return (
    <section className="space-y-4">
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
      <DashboardPreview contents={contents} events={events} />
    </section>
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
  const [page, setPage] = useState<PageKey>(() => pageFromPath(window.location.pathname));
  const [token, setToken] = useState(() => getStoredToken());
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [contents, setContents] = useState<MediaContentDto[]>([]);
  const [events, setEvents] = useState<IngestEventDto[]>([]);
  const [draft, setDraft] = useState<WorkspaceDraftDto>(() => createEmptyDraft());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<MediaFilters>(() => (pageFromPath(window.location.pathname) === "workspace" ? readWorkspaceFiltersFromUrl() : defaultMediaFilters));
  const [pendingAssetDeleteConfirm, setPendingAssetDeleteConfirm] = useState(false);
  const [imagePreview, setImagePreview] = useState(emptyImagePreviewState);
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
    function syncRouteState() {
      const nextPage = pageFromPath(window.location.pathname);
      setPage(nextPage);
      if (nextPage === "workspace") setFilters(readWorkspaceFiltersFromUrl());
    }

    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  useEffect(() => {
    if (page === "workspace") updateWorkspaceQuery(filters);
  }, [filters, page]);

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
    setPendingAssetDeleteConfirm(false);
    setDraft(createEmptyDraft());
  }

  function changePage(nextPage: PageKey) {
    const nextPath = pagePaths[nextPage];
    if (window.location.pathname !== nextPath || window.location.search) {
      window.history.pushState(null, "", nextPath);
    }
    setPage(nextPage);
    if (nextPage === "workspace") setFilters(defaultMediaFilters);
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
    setPendingAssetDeleteConfirm(false);
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addSelectedToDraft() {
    addAssetsToDraft(selectedIds);
    setSelectedIds([]);
    setPendingAssetDeleteConfirm(false);
  }

  function addAssetByDrag(id: string) {
    addAssetsToDraft([id]);
  }

  function openImagePreview(elements: MediaElement[], activeElement: MediaElement) {
    const images = collectImagePreviewItems(elements);
    const activeSrc = imagePreviewSrc(activeElement);
    const activeIndex = Math.max(
      0,
      images.findIndex((image) => image.src === activeSrc),
    );
    setImagePreview(createImagePreviewState(images.length > 0 ? images : collectImagePreviewItems([activeElement]), activeIndex));
  }

  function addAssetsToDraft(assetIds: string[]) {
    const existing = new Set(draft.assetIds);
    const addable = assets.filter((asset) => assetIds.includes(asset.id) && asset.status !== "used" && asset.status !== "ignored" && !existing.has(asset.id));
    if (addable.length === 0) return;
    setDraft((current) => ({
      ...current,
      assetIds: [...alignDraftAssetIds(current.elements, current.assetIds), ...addable.map((asset) => asset.id)],
      elements: [...current.elements, ...addable.map((asset) => asset.element)],
      updatedAt: now(),
    }));
    setAssets((current) => current.map((asset) => (addable.some((item) => item.id === asset.id) ? { ...asset, status: "selected", updatedAt: now() } : asset)));
  }

  function addTextElementToDraft(content: string) {
    const text = content.trim();
    if (!text) return;
    setDraft((current) => ({
      ...current,
      // 手动文本块没有素材来源，用空字符串占位保持 elements 和 assetIds 顺序对齐。
      assetIds: [...alignDraftAssetIds(current.elements, current.assetIds), ""],
      elements: [...current.elements, { type: "text", content: text }],
      updatedAt: now(),
    }));
  }

  async function ignoreSelected() {
    await Promise.all(selectedIds.map((id) => ignoreAsset(id)));
    setSelectedIds([]);
    setPendingAssetDeleteConfirm(false);
    await refreshAssets();
    await refreshOverview();
  }

  async function deleteSelectedAssets() {
    if (selectedIds.length === 0) return;
    if (!pendingAssetDeleteConfirm) {
      setPendingAssetDeleteConfirm(true);
      return;
    }

    const deletingIds = new Set(selectedIds);
    try {
      await deleteAssets({ ids: selectedIds });
      setSelectedIds([]);
      setPendingAssetDeleteConfirm(false);
      setAssets((current) => current.filter((asset) => !deletingIds.has(asset.id)));
      setDraft((current) => {
        const alignedAssetIds = alignDraftAssetIds(current.elements, current.assetIds);
        const elements: MediaElement[] = [];
        const assetIds: string[] = [];
        current.elements.forEach((element, index) => {
          const assetId = alignedAssetIds[index] ?? "";
          if (assetId && deletingIds.has(assetId)) return;
          elements.push(element);
          assetIds.push(assetId);
        });
        return { ...current, elements, assetIds, updatedAt: now() };
      });
      await refreshAssets();
      await refreshOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除素材失败");
    }
  }

  function updateDraftMeta(patch: Pick<WorkspaceDraftDto, "title" | "tags">) {
    setDraft((current) => ({ ...current, ...patch, updatedAt: now() }));
  }

  function moveDraftElement(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= draft.elements.length || to >= draft.elements.length) return;
    const elements = [...draft.elements];
    const assetIds = alignDraftAssetIds(draft.elements, draft.assetIds);
    const [element] = elements.splice(from, 1);
    const [assetId] = assetIds.splice(from, 1);
    if (!element) return;
    elements.splice(to, 0, element);
    assetIds.splice(to, 0, assetId ?? "");
    setDraft((current) => ({ ...current, elements, assetIds, updatedAt: now() }));
  }

  function removeDraftElement(index: number) {
    if (index < 0 || index >= draft.elements.length) return;
    const elements = [...draft.elements];
    const assetIds = alignDraftAssetIds(draft.elements, draft.assetIds);
    const [removedElement] = elements.splice(index, 1);
    const [removedAssetId] = assetIds.splice(index, 1);
    if (!removedElement) return;

    setDraft((current) => ({ ...current, elements, assetIds, updatedAt: now() }));
    if (removedAssetId) {
      setAssets((current) =>
        current.map((asset) => (asset.id === removedAssetId && asset.status === "selected" ? { ...asset, status: "pending", updatedAt: now() } : asset)),
      );
    }
  }

  async function submitCurrentDraft() {
    if (draft.elements.length === 0) return;
    try {
      await createMedia({
        title: draft.title?.trim() || undefined,
        tags: draft.tags,
        elements: draft.elements,
        assetIds: alignDraftAssetIds(draft.elements, draft.assetIds).filter(Boolean),
      });
      setDraft(createEmptyDraft());
      setSelectedIds([]);
      await refreshAssets();
      await refreshOverview();
      changePage("library");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "提交内容失败");
    }
  }

  if (!token) return <LoginPage theme={theme} onThemeChange={changeTheme} onLogin={handleLogin} />;

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <Sidebar page={page} onPageChange={changePage} />
      <div className="min-w-0 lg:pl-60">
        <TopBar page={page} theme={theme} onThemeChange={changeTheme} onLogout={handleLogout} />
        <main className="flex min-h-screen flex-col gap-4 px-4 pb-4 pt-[4.5rem] lg:px-6 lg:pb-6">
          {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
          {page === "home" && <HomePage stats={stats} contents={contents} events={events} />}
          {page === "workspace" && (
            <WorkspacePage
              assets={assets}
              draft={draft}
              filters={filters}
              pendingDeleteConfirm={pendingAssetDeleteConfirm}
              selectedIds={selectedIds}
              onAddAssetByDrag={addAssetByDrag}
              onAddSelected={addSelectedToDraft}
              onAddTextElement={addTextElementToDraft}
              onDeleteSelected={() => void deleteSelectedAssets()}
              onDraftChange={updateDraftMeta}
              onFiltersChange={setFilters}
              onIgnoreSelected={() => void ignoreSelected()}
              onMoveElement={moveDraftElement}
              onOpenImagePreview={openImagePreview}
              onRemoveElement={removeDraftElement}
              onSubmit={() => void submitCurrentDraft()}
              onToggleAsset={toggleAsset}
            />
          )}
          {page === "library" && <ContentLibraryPage onOpenImagePreview={openImagePreview} />}
          {page === "events" && <EventsPage />}
          {page === "tags" && <TagManagementPage />}
        </main>
      </div>
      <ImagePreviewViewer state={imagePreview} onClose={() => setImagePreview(emptyImagePreviewState)} />
    </div>
  );
}
