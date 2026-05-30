import type {
  AuditDetailDto,
  AuditListItemDto,
  AuditState,
  DataExportDetailDto,
  DataExportListItemDto,
  DataImportResultDto,
  IngestEventDto,
  MediaAssetDto,
  MediaAssetStatus,
  MediaContentDto,
  MediaElement,
  MediaType,
  PicContentItemDto,
  SourceProfileDto,
  TagDto,
  WorkspaceDraftDto,
} from "@pic/shared";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Combine,
  Database,
  Download,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  FolderInput,
  Flame,
  Heart,
  Image,
  LayoutDashboard,
  Layers3,
  ListChecks,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
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
import { Pagination } from "@/components/ui/pagination";
import { createImagePreviewState, emptyImagePreviewState, ImagePreviewViewer, type ImagePreviewGroup, type ImagePreviewItem } from "@/components/media/image-preview";
import { cn } from "@/lib/utils";
import {
  approveAudit,
  archiveAudit,
  batchUpdateMediaTags,
  clearStoredToken,
  createTag,
  createTagAlias,
  createDataExport,
  dataExportDownloadUrl,
  createMedia,
  deleteAssets,
  deleteAudit,
  deleteDataExport,
  deleteMediaContents,
  deleteTag,
  deleteTagAlias,
  fileUrl,
  getDataExport,
  getAuditDetail,
  getStoredToken,
  importDataExport,
  ignoreAsset,
  listAssets,
  listAudits,
  listDataExports,
  listIngestEvents,
  listMedia,
  listPicHot,
  listPicLatest,
  listTags,
  likePicContent,
  loginWithToken,
  mergeTag,
  mergeMediaContents,
  rejectAudit,
  renameTag,
  restoreMediaContentsToWorkspace,
  resetAudit,
  updateDataExport,
  uploadDataExport,
  type TagSort,
} from "@/api/client";

type ThemeMode = "light" | "dark";
type PageKey = "home" | "workspace" | "library" | "pic" | "audits" | "events" | "tags" | "exports";
type TagMode = "and" | "or";
type ContentCardSize = "small" | "medium" | "large";
type LibrarySort = "time_desc" | "time_asc" | "like_desc" | "like_asc";
type PicPreviewMode = "latest" | "hot";
type PicViewMode = "display" | "raw";
type LibraryPaginationPlacement = "top" | "side" | "bottom";
type TagRouteState = {
  query: string;
  sort: TagSort;
  page: number;
  size: number;
};
type ImagePreviewOpener = (elements: MediaElement[], activeElement: MediaElement, groups?: ImagePreviewGroup[], groupIndex?: number) => void;
type ChatRecordElement = Extract<MediaElement, { type: "discuss" | "speak" }>;
type ChatSpeakElement = Extract<MediaElement, { type: "speak" }>;
type ChatStackItem = {
  element: ChatRecordElement;
  sourceKey: string;
};
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
  { key: "pic", label: "取图接口", icon: Flame },
  { key: "audits", label: "审批管理", icon: CheckCircle2 },
  { key: "events", label: "接入事件", icon: ListChecks },
  { key: "tags", label: "标签管理", icon: Tags },
  { key: "exports", label: "导入导出", icon: FileArchive },
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

const auditStateOptions: Array<{ label: string; value: AuditState | "all" }> = [
  { label: "待审批", value: "pending" },
  { label: "已通过", value: "approved" },
  { label: "已拒绝", value: "rejected" },
  { label: "已归档", value: "archived" },
  { label: "全部", value: "all" },
];

const contentCardSizeOptions: Array<{ label: string; value: ContentCardSize; minWidth: string }> = [
  { label: "小", value: "small", minWidth: "200px" },
  { label: "中", value: "medium", minWidth: "260px" },
  { label: "大", value: "large", minWidth: "340px" },
];

const librarySortOptions: Array<{ label: string; value: LibrarySort }> = [
  { label: "入库时间倒序", value: "time_desc" },
  { label: "入库时间正序", value: "time_asc" },
  { label: "点赞数倒序", value: "like_desc" },
  { label: "点赞数正序", value: "like_asc" },
];

const tagSortOptions: Array<{ label: string; value: TagSort }> = [
  { label: "数量倒序", value: "count_desc" },
  { label: "数量正序", value: "count_asc" },
  { label: "创建时间倒序", value: "time_desc" },
  { label: "创建时间正序", value: "time_asc" },
];

const defaultLibraryPage = 1;
const defaultLibraryPageSize = 100;
const defaultLibrarySort: LibrarySort = "time_desc";
const defaultTagSort: TagSort = "count_desc";
const defaultTagPage = 1;
const defaultTagPageSize = 100;
const libraryPageSizeOptions = [50, 100, 200];

const pagePaths: Record<PageKey, string> = {
  home: "/",
  workspace: "/workspace",
  library: "/library",
  pic: "/pic",
  audits: "/audits",
  events: "/events",
  tags: "/tags",
  exports: "/exports",
};

const defaultMediaFilters: MediaFilters = {
  query: "",
  status: "pending",
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

function collectContentImagePreviewGroups(contents: MediaContentDto[]): ImagePreviewGroup[] {
  return contents
    .map((content, index) => ({
      label: content.title ?? `第 ${index + 1} 条记录`,
      images: collectImagePreviewItems(content.elements),
    }))
    .filter((group) => group.images.length > 0);
}

function collectImageElements(elements: MediaElement[]): Array<Extract<MediaElement, { type: "image" }>> {
  return elements.flatMap((element) => {
    if (element.type === "image") return [element];
    if (element.type === "speak") return collectImageElements(element.message);
    if (element.type === "discuss") return collectImageElements(element.content);
    return [];
  });
}

function hasChatRecordElement(elements: MediaElement[]): boolean {
  return elements.some((element) => {
    if (element.type === "speak" || element.type === "discuss") return true;
    return false;
  });
}

function isChatRecordElement(element: MediaElement): element is ChatRecordElement {
  return element.type === "speak" || element.type === "discuss";
}

function chatRecordSpeaks(element: ChatRecordElement): ChatSpeakElement[] {
  return element.type === "discuss" ? element.content : [element];
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
  const lowerKeyword = keyword.toLowerCase();
  return tag.name.toLowerCase().includes(lowerKeyword) || (tag.aliases ?? []).some((alias) => alias.toLowerCase().includes(lowerKeyword));
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

function tagPageSizeFromParam(value: string | null) {
  const parsed = numberFromParam(value, defaultTagPageSize);
  return libraryPageSizeOptions.includes(parsed) ? parsed : defaultTagPageSize;
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

function readTagStateFromUrl(): TagRouteState {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    sort: tagSortOptions.some((option) => option.value === sort) ? (sort as TagSort) : defaultTagSort,
    page: numberFromParam(params.get("page"), defaultTagPage),
    size: tagPageSizeFromParam(params.get("size")),
  };
}

function updateTagSearchQuery(state: TagRouteState) {
  replaceRouteQuery(pagePaths.tags, {
    q: state.query.trim() || undefined,
    sort: state.sort === defaultTagSort ? undefined : state.sort,
    page: state.page === defaultTagPage ? undefined : String(state.page),
    size: state.size === defaultTagPageSize ? undefined : String(state.size),
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex] ?? "B"}`;
}

function formatDuration(seconds?: number) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const restSeconds = total % 60;
  if (hours > 0) return `${hours}时${minutes.toString().padStart(2, "0")}分`;
  if (minutes > 0) return `${minutes}分${restSeconds.toString().padStart(2, "0")}秒`;
  return `${restSeconds}秒`;
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
  suggestions: staticSuggestions,
  excludeTags = [],
  allowCreate = true,
  maxTags,
}: {
  label: string;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  helperText?: string;
  className?: string;
  suggestions?: TagDto[];
  excludeTags?: string[];
  allowCreate?: boolean;
  maxTags?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<TagDto[]>([]);
  const normalizedQuery = query.trim();
  const excludedTagSet = new Set(excludeTags);
  const effectiveSuggestions = staticSuggestions ?? suggestions;
  const visibleSuggestions = effectiveSuggestions
    .filter((tag) => !selectedTags.includes(tag.name) && !excludedTagSet.has(tag.name))
    .filter((tag) => !normalizedQuery || tagMatchesKeyword(tag, normalizedQuery))
    .slice(0, 8);
  const canCreate = allowCreate && parseTagInput(query).some((tag) => !selectedTags.includes(tag) && !excludedTagSet.has(tag));

  useEffect(() => {
    if (staticSuggestions) {
      setSuggestions([]);
      return;
    }
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
  }, [normalizedQuery, open, staticSuggestions]);

  function addTags(tags: string[]) {
    const suggestionNameSet = allowCreate ? undefined : new Set(effectiveSuggestions.map((tag) => tag.name));
    const normalizedTags = tags
      .map((tag) => tag.trim())
      .filter((tag) => tag && !excludedTagSet.has(tag))
      .filter((tag) => !suggestionNameSet || suggestionNameSet.has(tag));
    const mergedTags = Array.from(new Set([...selectedTags, ...normalizedTags]));
    const next = maxTags ? mergedTags.slice(-maxTags) : mergedTags;
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

  if (isChatRecordElement(element)) {
    const speaks = chatRecordSpeaks(element);
    return (
      <button
        className="flex h-full min-h-0 w-full flex-col justify-between rounded-md border border-border bg-surface-muted p-4 text-left outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onOpen?.(element)}
        type="button"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface">
            <ListChecks className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">聊天记录</div>
            <div className="mt-1 text-xs text-subtle-foreground">{speaks.length} 条发言</div>
          </div>
        </div>
        <div className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {speaks.map((speak) => speak.sender.displayName).filter(Boolean).slice(0, 4).join("、") || "未记录发送人"}
        </div>
      </button>
    );
  }

  return <CompositeContentPreview elements={[element]} />;
}

function CompositeContentPreview({
  elements,
  onOpen,
  onOpenImage,
}: {
  elements: MediaElement[];
  onOpen?: () => void;
  onOpenImage?: (element: Extract<MediaElement, { type: "image" }>) => void;
}) {
  const imageElements = collectImageElements(elements);
  const previewImages = imageElements.slice(0, 4);
  const text = elements
    .filter((element): element is Extract<MediaElement, { type: "text" }> => element.type === "text")
    .map((element) => textPreview(element.content))
    .join(" / ");
  const body = (
    <div
      className={cn(
        "h-full overflow-hidden rounded-md border border-border bg-surface-muted p-3 text-left outline-none transition-colors",
        onOpen && "cursor-pointer hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary",
      )}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {previewImages.length > 0 && (
        <div className={cn("mb-2 grid h-[58%] min-h-24 gap-1 overflow-hidden", previewImages.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {previewImages.map((element, index) => {
            const imageNode = (
              <>
                <img className="h-full w-full object-cover" src={fileUrl(element.id)} alt={`复合内容第 ${index + 1} 张图片`} loading="lazy" />
                {index === previewImages.length - 1 && imageElements.length > previewImages.length && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">+{imageElements.length - previewImages.length}</span>
                )}
              </>
            );
            if (!onOpenImage) {
              return (
                <div key={`${element.id}-${index}`} className="relative min-h-0 overflow-hidden rounded-md border border-border bg-surface">
                  {imageNode}
                </div>
              );
            }
            return (
              <button
                key={`${element.id}-${index}`}
                className="relative min-h-0 overflow-hidden rounded-md border border-border bg-surface outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
                type="button"
                aria-label={`打开第 ${index + 1} 张图片预览`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenImage(element);
                }}
              >
                {imageNode}
              </button>
            );
          })}
        </div>
      )}
      <div className="mb-2 flex max-h-14 flex-wrap gap-2 overflow-hidden">
        {elements.map((element, index) => (
          <Badge key={`${element.type}-${index}-${elementSummary(element)}`} className="border-primary/30 bg-primary-muted text-primary-text">
            {elementToken(element)}
          </Badge>
        ))}
      </div>
      <div className="overflow-hidden text-sm leading-6 text-muted-foreground">
        {text || (imageElements.length > 0 ? `${imageElements.length} 张图片，点击缩略图可预览。` : "复合内容中的媒体文件已用类型标记展示。")}
      </div>
    </div>
  );
  return body;
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
  return <CompositeContentPreview elements={content.elements} onOpen={onOpenContent ? () => onOpenContent(content) : undefined} onOpenImage={onOpenElement} />;
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
  return createPortal(
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
    </div>,
    document.body,
  );
}

function ChatRecordMediaItem({
  element,
  active,
  onOpenMedia,
  onOpenChatRecord,
}: {
  element: MediaElement;
  active?: boolean;
  onOpenMedia: (element: MediaElement) => void;
  onOpenChatRecord: (element: ChatRecordElement) => void;
}) {
  if (element.type === "text") {
    return <div className="max-w-64 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-sm leading-6 text-[#111827] shadow-sm">{element.content}</div>;
  }

  if (element.type === "image") {
    return (
      <button className="block max-w-56 overflow-hidden rounded-md bg-white" type="button" onClick={() => onOpenMedia(element)}>
        <img className="max-h-60 w-full object-contain" src={fileUrl(element.id)} alt="聊天图片" loading="lazy" />
      </button>
    );
  }

  if (element.type === "video") {
    return (
      <button className="flex aspect-video w-56 items-center justify-center rounded-md bg-black text-white" type="button" onClick={() => onOpenMedia(element)}>
        <FileVideo className="h-9 w-9" />
      </button>
    );
  }

  if (element.type === "audio") {
    return (
      <button className="flex min-h-12 w-52 items-center gap-2 rounded-md bg-white px-3 text-left text-[#111827]" type="button" onClick={() => onOpenMedia(element)}>
        <FileAudio className="h-5 w-5 text-primary" />
        <span className="truncate text-sm">语音消息</span>
      </button>
    );
  }

  if (element.type === "file") {
    return (
      <button className="flex min-h-12 w-56 items-center gap-2 rounded-md bg-white px-3 text-left text-[#111827]" type="button" onClick={() => onOpenMedia(element)}>
        <FileText className="h-5 w-5 text-primary" />
        <span className="truncate text-sm">文件</span>
      </button>
    );
  }

  return (
    <button
      className={cn(
        "flex w-60 items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 text-left text-[#111827] shadow-sm transition-colors",
        active ? "border-primary ring-2 ring-primary/30" : "border-[#d7dbe2] hover:border-primary/40",
      )}
      type="button"
      onClick={() => onOpenChatRecord(element)}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">聊天记录</span>
        <span className="mt-1 block truncate text-xs text-[#6b7280]">{chatRecordSpeaks(element).length} 条发言</span>
      </span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 -rotate-90", active && "text-primary")} />
    </button>
  );
}

function ChatRecordPanel({
  item,
  index,
  nextItem,
  onOpenMedia,
  onOpenChatRecord,
}: {
  item: ChatStackItem;
  index: number;
  nextItem?: ChatStackItem;
  onOpenMedia: (element: MediaElement) => void;
  onOpenChatRecord: (panelIndex: number, sourceKey: string, element: ChatRecordElement) => void;
}) {
  const speaks = chatRecordSpeaks(item.element);
  return (
    <section className="flex h-full w-[22rem] shrink-0 flex-col overflow-hidden rounded-md border border-[#c9d0da] bg-[#f2f3f5] shadow-sm">
      <div className="flex h-12 shrink-0 items-center justify-center border-b border-[#d5dbe3] bg-[#eef0f3] px-4">
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold text-[#111827]">{index === 0 ? "聊天记录" : `嵌套记录 ${index}`}</div>
          <div className="text-xs text-[#6b7280]">{speaks.length} 条发言</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-4">
          {speaks.map((speak, speakIndex) => {
            const displayName = speak.sender.displayName || "未知用户";
            return (
              <div key={`${speak.time}-${speakIndex}-${displayName}`} className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#dfe5ec] text-xs font-semibold text-[#475569]">
                  {displayName.slice(0, 1) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-[#6b7280]">
                    <span className="max-w-36 truncate">{displayName}</span>
                    <span>{formatDateTime(speak.time)}</span>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {speak.message.map((message, messageIndex) => {
                      const sourceKey = `${speakIndex}-${messageIndex}-${elementSummary(message)}`;
                      return (
                        <div key={sourceKey} className="max-w-full">
                          <ChatRecordMediaItem
                            element={message}
                            active={nextItem?.sourceKey === sourceKey}
                            onOpenMedia={onOpenMedia}
                            onOpenChatRecord={(nestedElement) => onOpenChatRecord(index, sourceKey, nestedElement)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
          {speaks.length === 0 && <div className="rounded-md bg-white p-4 text-center text-sm text-[#6b7280]">这条聊天记录没有发言。</div>}
        </div>
      </div>
    </section>
  );
}

function ChatRecordModal({
  element,
  onClose,
  onOpenElement,
}: {
  element: ChatRecordElement;
  onClose: () => void;
  onOpenElement?: (element: MediaElement) => void;
}) {
  const [stack, setStack] = useState<ChatStackItem[]>([{ element, sourceKey: "root" }]);
  const [localPreviewElement, setLocalPreviewElement] = useState<MediaElement | null>(null);

  useEffect(() => {
    setStack([{ element, sourceKey: "root" }]);
    setLocalPreviewElement(null);
  }, [element]);

  function openMedia(mediaElement: MediaElement) {
    if (mediaElement.type === "image") {
      onOpenElement?.(mediaElement);
      return;
    }
    setLocalPreviewElement(mediaElement);
  }

  function openChatRecord(panelIndex: number, sourceKey: string, chatElement: ChatRecordElement) {
    setStack((current) => [...current.slice(0, panelIndex + 1), { element: chatElement, sourceKey }]);
  }

  return (
    <Modal title="聊天记录" subtitle={`${chatRecordSpeaks(element).length} 条发言`} closeLabel="关闭聊天记录" zIndex="z-[1000]" maxWidth="max-w-[96vw]" onClose={onClose}>
      <div className="min-h-0 overflow-x-auto bg-surface-muted p-4">
        <div className="mx-auto flex h-[calc(92vh-5rem)] w-max gap-4">
          {stack.map((item, index) => (
            <ChatRecordPanel
              key={`${index}-${item.sourceKey}`}
              item={item}
              index={index}
              nextItem={stack[index + 1]}
              onOpenMedia={openMedia}
              onOpenChatRecord={openChatRecord}
            />
          ))}
        </div>
      </div>
      {localPreviewElement && !isChatRecordElement(localPreviewElement) && (
        <MediaElementModal element={localPreviewElement} onClose={() => setLocalPreviewElement(null)} onOpenElement={onOpenElement} />
      )}
    </Modal>
  );
}

function MediaElementModal({ element, onClose, onOpenElement }: { element: MediaElement; onClose: () => void; onOpenElement?: (element: MediaElement) => void }) {
  if (element.type === "image") return null;
  if (isChatRecordElement(element)) return <ChatRecordModal element={element} onClose={onClose} onOpenElement={onOpenElement} />;
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
          <div className="mb-3 inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5" />
            点赞 {content.likeCount}
          </div>
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
                {isChatRecordElement(element) && (
                  <button className="flex min-h-28 w-full items-center gap-3 rounded-md bg-surface p-4 text-left" type="button" onClick={() => onOpenElement(element)}>
                    <ListChecks className="h-8 w-8 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">聊天记录</span>
                      <span className="mt-1 block text-xs text-subtle-foreground">{chatRecordSpeaks(element).length} 条发言</span>
                    </span>
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
  onAddToDraft,
  onOpenImage,
}: {
  asset: MediaAssetDto;
  index: number;
  checked: boolean;
  onToggle: (id: string) => void;
  onAddToDraft: (id: string) => void;
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
      <div className="relative aspect-square bg-surface-muted">
        <button className="block h-full w-full text-left" disabled={!selectable} type="button" title="双击加入结果" onDoubleClick={() => onAddToDraft(asset.id)}>
          <AssetPreview element={asset.element} />
          <div className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 font-mono text-xs text-subtle-foreground">
            #{index + 1}
          </div>
        </button>
        <button
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-surface/90"
          disabled={!selectable}
          type="button"
          aria-label={checked ? "取消选择素材" : "选择素材"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(asset.id);
          }}
        >
          <input className="h-4 w-4 accent-[var(--primary)]" checked={checked} disabled={!selectable} readOnly type="checkbox" />
        </button>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{elementLabel(asset.element)}素材</span>
          <StatusBadge status={asset.status} />
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-xs text-subtle-foreground">{asset.fileMd5 ?? asset.id}</p>
          <Button
            className="h-7 w-7 px-0"
            disabled={!selectable}
            variant="ghost"
            aria-label="加入结果"
            onClick={() => onAddToDraft(asset.id)}
          >
            <Plus className="h-4 w-4" />
          </Button>
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
  onUpdateText,
  onOpenImage,
  onDragStart,
  onDrop,
}: {
  element: MediaElement;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onUpdateText: (index: number, content: string) => void;
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
      {element.type === "text" ? (
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-subtle-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="输入文本内容"
          value={element.content}
          onChange={(event) => onUpdateText(index, event.target.value)}
        />
      ) : (
        <DraftElementPreview element={element} onOpenImage={onOpenImage} />
      )}
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
  onIgnoreSelected,
  onDeleteSelected,
  onClearSelected,
  onAddAssetByDrag,
  onAddTextElement,
  onDraftChange,
  onMoveElement,
  onUpdateTextElement,
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
  onIgnoreSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelected: () => void;
  onAddAssetByDrag: (id: string) => void;
  onAddTextElement: (content: string) => void;
  onDraftChange: (draft: Pick<WorkspaceDraftDto, "title" | "tags">) => void;
  onMoveElement: (from: number, to: number) => void;
  onUpdateTextElement: (index: number, content: string) => void;
  onRemoveElement: (index: number) => void;
  onOpenImagePreview: ImagePreviewOpener;
  onSubmit: () => void;
}) {
  const [draggedElementIndex, setDraggedElementIndex] = useState<number | null>(null);
  const canSubmitDraft = draft.elements.length > 0 && draft.tags.some((tag) => tag.trim());

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

          <div className="mb-4 grid items-end gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(220px,1fr)_auto]">
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
            <Button className="h-9" disabled={!canSubmitDraft} variant="primary" onClick={onSubmit}>
              提交
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap justify-end gap-2 rounded-md border border-border bg-surface-muted p-3">
            <Button disabled={selectedIds.length === 0} variant="secondary" onClick={onClearSelected}>
              <X className="h-4 w-4" />
              清空选择
            </Button>
            <Button variant="secondary" onClick={() => onAddTextElement("")}>
              <Plus className="h-4 w-4" />
              添加文本块
            </Button>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropAsset}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-dashed border-border bg-surface-muted p-3"
          >
            {draft.elements.map((element, index) => (
              <AssemblyItem
                key={`${element.type}-${index}`}
                count={draft.elements.length}
                element={element}
                index={index}
                onDragStart={setDraggedElementIndex}
                onDrop={handleDropElement}
                onMove={onMoveElement}
                onRemove={onRemoveElement}
                onUpdateText={onUpdateTextElement}
                onOpenImage={(element) => onOpenImagePreview(draft.elements, element)}
              />
            ))}
            {draft.elements.length === 0 && (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-dashed border-border bg-surface text-center text-sm text-muted-foreground">
                从右侧拖入素材，或点击素材卡片上的“加入结果”。
              </div>
            )}
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
                  onAddToDraft={onAddAssetByDrag}
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

function ContentLibraryPage({
  onOpenImagePreview,
  onOpenWorkspace,
}: {
  onOpenImagePreview: ImagePreviewOpener;
  onOpenWorkspace: () => void;
}) {
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
  const [busyLikeId, setBusyLikeId] = useState("");
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState(false);
  const [showSidePagination, setShowSidePagination] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [batchAddTags, setBatchAddTags] = useState("");
  const [batchRemoveTags, setBatchRemoveTags] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const topPaginationRef = useRef<HTMLDivElement | null>(null);
  const bottomPaginationRef = useRef<HTMLDivElement | null>(null);
  const topPaginationVisibleRef = useRef(true);
  const bottomPaginationVisibleRef = useRef(false);
  const cardMinWidth = contentCardSizeOptions.find((option) => option.value === cardSize)?.minWidth ?? "260px";
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardMinWidth}), 1fr))`,
  };
  const commonTags = tags.slice(0, 10);
  const contentById = new Map(contents.map((content) => [content.id, content]));
  const selectedContents = selectedContentIds.map((id) => contentById.get(id)).filter((content): content is MediaContentDto => Boolean(content));
  const selectedContentTagCounts = selectedContents.reduce((counts, content) => {
    for (const tag of content.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const selectedContentTags = Array.from(selectedContentTagCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([name, count]) => ({ name, count }));
  const tagsPresentOnEverySelectedContent = selectedContentTags.filter((tag) => tag.count === selectedContents.length).map((tag) => tag.name);
  const addableTags = tags.filter((tag) => !tagsPresentOnEverySelectedContent.includes(tag.name));
  const canMergeSelectedContents = selectedContentIds.length >= 2 || (selectedContentIds.length === 1 && selectedContents.some((content) => hasChatRecordElement(content.elements)));
  const visibleTagSuggestions = tagQuery.trim()
    ? tagSuggestions.filter((tag) => !selectedTags.includes(tag.name)).slice(0, 8)
    : [];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, []);

  async function refreshContents() {
    const page = await listMedia({ q: query, tags: selectedTags, tagMode: mode, sort, auditState: "approved", page: currentPage, size: pageSize });
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

  function updateContentLikeCount(contentId: string, likeCount: number) {
    setContents((current) => current.map((content) => (content.id === contentId ? { ...content, likeCount } : content)));
    setPreviewContent((current) => (current?.id === contentId ? { ...current, likeCount } : current));
  }

  async function submitLike(contentId: string) {
    setBusyLikeId(contentId);
    try {
      const result = await likePicContent(contentId);
      updateContentLikeCount(contentId, result.likeCount);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "点赞失败");
    } finally {
      setBusyLikeId("");
    }
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

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>("[data-app-scroll-container]");
    if (!scrollContainer) return;
    const container = scrollContainer;
    const topPagination = topPaginationRef.current;
    const bottomPagination = bottomPaginationRef.current;
    if (!topPagination || !bottomPagination) return;

    function updateSidePagination() {
      setShowSidePagination(!topPaginationVisibleRef.current && !bottomPaginationVisibleRef.current);
    }

    function updateScrollTopButton() {
      setShowScrollTop(container.scrollTop > 80);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === topPagination) topPaginationVisibleRef.current = entry.isIntersecting;
          if (entry.target === bottomPagination) bottomPaginationVisibleRef.current = entry.isIntersecting;
        }
        updateSidePagination();
      },
      {
        root: container,
        threshold: 0.01,
      },
    );

    observer.observe(topPagination);
    observer.observe(bottomPagination);
    updateScrollTopButton();
    updateSidePagination();
    container.addEventListener("scroll", updateScrollTopButton, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", updateScrollTopButton);
    };
  }, [contents.length, currentPage, pageSize]);

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

  function scrollLibraryToTop() {
    document.querySelector<HTMLElement>("[data-app-scroll-container]")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitLibrarySearch() {
    if (currentPage === defaultLibraryPage) {
      refreshContents().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载内容库失败"));
      return;
    }
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
      const groups = collectContentImagePreviewGroups(contents);
      const activeSrc = imagePreviewSrc(element);
      const groupIndex = Math.max(
        0,
        groups.findIndex((group) => group.images.some((image) => image.src === activeSrc)),
      );
      onOpenImagePreview(elements, element, groups, groupIndex);
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
      onOpenWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "放回工作台失败");
    }
  }

  async function mergeSelectedContents() {
    if (!canMergeSelectedContents) return;
    try {
      await mergeMediaContents({ ids: selectedContentIds });
      setSelectedContentIds([]);
      setError("");
      await refreshContents();
      setTags(await listTags());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "合并内容失败");
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

  function renderPagination(placement: LibraryPaginationPlacement) {
    return (
      <Pagination
        ariaLabel="内容库分页"
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        pageSizeOptions={libraryPageSizeOptions}
        variant={placement === "side" ? "side" : "horizontal"}
        totalItems={total}
        itemLabel="条内容"
        onPageChange={setCurrentPage}
        onPageSizeChange={changePageSize}
      />
    );
  }

  return (
    <section className="space-y-4">
      <Card className="space-y-3 p-4 xl:mx-20">
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
              onKeyDown={(event) => {
                if (event.key === "Enter") submitLibrarySearch();
              }}
            />
          </div>
          <Button variant="primary" onClick={submitLibrarySearch}>
            <Search className="h-4 w-4" />
            搜索
          </Button>
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
        <Card aria-label="已选内容操作" className="sticky top-[4.75rem] z-20 space-y-3 border-primary/30 bg-surface p-4 shadow-sm xl:mx-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">已选择 {selectedContentIds.length} 条内容</div>
              <div className="mt-1 text-xs text-muted-foreground">按选择顺序处理；批量 tag 可用逗号、空格分隔。</div>
            </div>
            <div className="flex flex-wrap gap-2">
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
              <Button variant="secondary" disabled={!canMergeSelectedContents} onClick={() => void mergeSelectedContents()}>
                <Combine className="h-4 w-4" />
                {selectedContentIds.length === 1 ? "转复合" : "合并"}
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
              suggestions={addableTags}
              excludeTags={tagsPresentOnEverySelectedContent}
              onChange={(tags) => setBatchAddTags(tags.join(","))}
            />
            <TagSelectInput
              label="移除 tag"
              selectedTags={parseTagInput(batchRemoveTags)}
              placeholder="输入 tag 名称筛选"
              suggestions={selectedContentTags}
              allowCreate={false}
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
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400 xl:mx-20">{error}</Card>}
      <div ref={topPaginationRef} className="xl:mx-20">{renderPagination("top")}</div>
      {showSidePagination && renderPagination("side")}
      <div className="grid gap-3 xl:px-20" style={gridStyle}>
        {contents.map((content) => {
          const selectedOrder = selectedContentIds.indexOf(content.id) + 1;
          const selected = selectedOrder > 0;
          return (
          <Card
            key={content.id}
            className={cn(
              "flex aspect-square min-h-0 flex-col overflow-hidden p-3",
              selected && "border-primary bg-primary-muted/40",
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{content.title ?? "未命名内容"}</h2>
                <p className="mt-1 font-mono text-xs text-subtle-foreground">{content.sign}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(content.createdAt)}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Heart className="h-3.5 w-3.5" />
                  点赞 {content.likeCount}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="flex h-7 min-w-10 items-center justify-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-subtle-foreground transition-colors hover:border-primary/40 hover:text-primary-text disabled:opacity-60"
                  disabled={busyLikeId === content.id}
                  onClick={() => void submitLike(content.id)}
                  type="button"
                  aria-label="点赞内容"
                >
                  <Heart className="h-4 w-4" />
                  {content.likeCount}
                </button>
                <button
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-surface px-1 text-xs font-semibold text-subtle-foreground transition-colors hover:border-primary/40 hover:text-primary-text",
                    selected && "border-primary/40 bg-primary text-[#062426]",
                  )}
                  onClick={() => toggleContentSelection(content.id)}
                  type="button"
                  aria-label={selected ? `取消选择第 ${selectedOrder} 个内容` : "选择内容"}
                >
                  {selected ? selectedOrder : <CheckCircle2 className="h-4 w-4" />}
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
          );
        })}
      </div>
      {contents.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground xl:mx-20">没有符合当前 tag 条件的内容。</Card>}
      <div ref={bottomPaginationRef} className="xl:mx-20">{renderPagination("bottom")}</div>
      {showScrollTop && (
        <Button className="fixed bottom-4 right-4 z-30 h-10 w-10 px-0 shadow-lg" variant="secondary" aria-label="滚动到顶部" onClick={scrollLibraryToTop}>
          <ChevronUp className="h-5 w-5" />
        </Button>
      )}
      {previewContent && <ContentDetailModal content={previewContent} onClose={() => setPreviewContent(null)} onOpenElement={(element) => openElementPreview(element, previewContent.elements)} />}
      {previewElement && <MediaElementModal element={previewElement} onClose={() => setPreviewElement(null)} onOpenElement={(element) => openElementPreview(element, previewContent?.elements ?? [previewElement])} />}
    </section>
  );
}

function auditStateLabel(state: AuditState) {
  return auditStateOptions.find((option) => option.value === state)?.label ?? state;
}

function PicApiPreviewPage({ onOpenImagePreview }: { onOpenImagePreview: ImagePreviewOpener }) {
  const [mode, setMode] = useState<PicPreviewMode>("latest");
  const [viewMode, setViewMode] = useState<PicViewMode>("display");
  const [tagMode, setTagMode] = useState<TagMode>("and");
  const [contentType, setContentType] = useState<MediaType | "all">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [items, setItems] = useState<PicContentItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [rawResponse, setRawResponse] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [busyLikeId, setBusyLikeId] = useState("");
  const [previewContent, setPreviewContent] = useState<PicContentItemDto | null>(null);
  const [previewElement, setPreviewElement] = useState<MediaElement | null>(null);
  const [error, setError] = useState("");

  async function refreshItems() {
    setLoading(true);
    try {
      const loader = mode === "hot" ? listPicHot : listPicLatest;
      const page = await loader({ tags: selectedTags, tagMode, type: contentType, page: 1, size: 24 });
      setItems(page.data);
      setTotal(page.total);
      setRawResponse({ success: true, message: "ok", data: page });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载取图接口失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    listTags()
      .then(setTags)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, []);

  useEffect(() => {
    void refreshItems();
  }, [contentType, mode, selectedTags, tagMode]);

  function openElementPreview(element: MediaElement, elements: MediaElement[]) {
    if (element.type === "image") {
      const groups = collectContentImagePreviewGroups(items);
      const activeSrc = imagePreviewSrc(element);
      const groupIndex = Math.max(
        0,
        groups.findIndex((group) => group.images.some((image) => image.src === activeSrc)),
      );
      onOpenImagePreview(elements, element, groups, groupIndex);
      return;
    }
    setPreviewElement(element);
  }

  async function submitLike(contentId: string) {
    setBusyLikeId(contentId);
    try {
      const result = await likePicContent(contentId);
      setItems((current) => current.map((content) => (content.id === contentId ? { ...content, likeCount: result.likeCount } : content)));
      setPreviewContent((current) => (current?.id === contentId ? { ...current, likeCount: result.likeCount } : current));
      setRawResponse((current: unknown) => {
        if (!current || typeof current !== "object" || !("data" in current)) return current;
        const response = current as { data?: { total: number; data: PicContentItemDto[] } };
        if (!response.data?.data) return current;
        return {
          ...response,
          data: {
            ...response.data,
            data: response.data.data.map((content) => (content.id === contentId ? { ...content, likeCount: result.likeCount } : content)),
          },
        };
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "点赞失败");
    } finally {
      setBusyLikeId("");
    }
  }

  return (
    <section className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">取图接口</h1>
            <p className="mt-1 text-xs text-muted-foreground">按当前条件调用最新或最热图片接口，点赞会写入来源和日期。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{total} 条</Badge>
            <div className="flex rounded-md border border-border bg-surface p-1">
              <Button className="h-8 px-3" variant={mode === "latest" ? "primary" : "ghost"} onClick={() => setMode("latest")}>
                <Clock3 className="h-4 w-4" />
                最新
              </Button>
              <Button className="h-8 px-3" variant={mode === "hot" ? "primary" : "ghost"} onClick={() => setMode("hot")}>
                <Flame className="h-4 w-4" />
                最热
              </Button>
            </div>
            <div className="flex rounded-md border border-border bg-surface p-1">
              <Button className="h-8 px-3" variant={viewMode === "display" ? "primary" : "ghost"} onClick={() => setViewMode("display")}>
                展示
              </Button>
              <Button className="h-8 px-3" variant={viewMode === "raw" ? "primary" : "ghost"} onClick={() => setViewMode("raw")}>
                原文
              </Button>
            </div>
            <Button className="h-9" variant="secondary" disabled={loading} onClick={() => void refreshItems()}>
              刷新
            </Button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <TagSelectInput
            label="筛选 tag"
            selectedTags={selectedTags}
            placeholder="输入 tag 名称筛选"
            suggestions={tags}
            allowCreate={false}
            onChange={setSelectedTags}
          />
          <SelectField label="内容类型" value={contentType} options={kindOptions} onChange={setContentType} />
          <div className="flex rounded-md border border-border bg-surface p-1">
            <Button className="h-8 px-3" variant={tagMode === "and" ? "primary" : "ghost"} onClick={() => setTagMode("and")}>
              AND
            </Button>
            <Button className="h-8 px-3" variant={tagMode === "or" ? "primary" : "ghost"} onClick={() => setTagMode("or")}>
              OR
            </Button>
          </div>
        </div>
      </Card>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      {viewMode === "raw" ? (
        <Card className="overflow-hidden">
          <pre className="max-h-[70vh] overflow-auto bg-surface-muted p-4 text-xs leading-5 text-foreground">{JSON.stringify(rawResponse ?? { success: true, message: "ok", data: { total, data: items } }, null, 2)}</pre>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {items.map((content) => (
              <Card key={content.id} className="flex aspect-square min-h-0 flex-col overflow-hidden p-3">
                <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{content.title ?? "未命名内容"}</h2>
                    <p className="mt-1 font-mono text-xs text-subtle-foreground">{content.sign}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(content.createdAt)}</p>
                  </div>
                  <Button
                    className="h-8 min-w-14 px-2"
                    variant="secondary"
                    disabled={busyLikeId === content.id}
                    aria-label="点赞内容"
                    onClick={() => void submitLike(content.id)}
                  >
                    <Heart className="h-4 w-4" />
                    {content.likeCount}
                  </Button>
                </div>
                <div className="mb-2 flex max-h-14 shrink-0 flex-wrap gap-1 overflow-hidden">
                  {content.tags.map((tag) => (
                    <Badge key={tag} className="border-primary/30 bg-primary-muted text-primary-text">
                      {tag}
                    </Badge>
                  ))}
                  {content.tags.length === 0 && <span className="text-xs text-muted-foreground">暂无 tag</span>}
                </div>
                <div className="min-h-0 flex-1">
                  <ContentPreview content={content} onOpenContent={setPreviewContent} onOpenElement={(element) => openElementPreview(element, content.elements)} />
                </div>
              </Card>
            ))}
          </div>
          {items.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">没有符合当前条件的内容。</Card>}
        </>
      )}
      {previewContent && <ContentDetailModal content={previewContent} onClose={() => setPreviewContent(null)} onOpenElement={(element) => openElementPreview(element, previewContent.elements)} />}
      {previewElement && <MediaElementModal element={previewElement} onClose={() => setPreviewElement(null)} onOpenElement={(element) => openElementPreview(element, previewContent?.elements ?? [previewElement])} />}
    </section>
  );
}

function SourceProfileSummary({ profile }: { profile?: SourceProfileDto }) {
  if (!profile) return <div className="text-xs text-muted-foreground">暂无来源资料</div>;
  const isQq = profile.platform === "qq" || profile.platform === "napcat";
  const title = isQq ? profile.displayName || profile.userId || "QQ 用户" : profile.displayName || profile.userId || profile.platform;
  const initial = title.slice(0, 1) || profile.platform.slice(0, 1) || "?";
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-xs font-semibold text-muted-foreground">{initial}</div>
      <div className="min-w-0 text-xs">
        <div className="truncate font-medium text-foreground">{title}</div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-subtle-foreground">
          <span>平台：{isQq ? "QQ" : profile.platform}</span>
          {profile.userId && <span>用户：{profile.userId}</span>}
          {profile.groupId && <span>群：{profile.groupId}</span>}
          {profile.groupName && <span>群名：{profile.groupName}</span>}
        </div>
      </div>
    </div>
  );
}

function AuditLogModal({ detail, onClose }: { detail: AuditDetailDto; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <Card className="max-h-[86vh] w-full max-w-2xl overflow-y-auto p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">审批日志</h2>
            <p className="mt-1 truncate font-mono text-xs text-subtle-foreground">{detail.content.id}</p>
          </div>
          <Button className="h-8" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="space-y-3">
          {detail.events.map((event) => (
            <div key={event.id} className="rounded-md border border-border bg-surface-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge className="border-primary/30 bg-primary-muted text-primary-text">{event.actionLabel}</Badge>
                <span className="text-xs text-subtle-foreground">{formatDateTime(event.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{event.summary}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                <span>操作人：{event.operatorLabel}</span>
                {event.stateChange && <span>状态：{event.stateChange}</span>}
                {event.reason && <span>原因：{event.reason}</span>}
              </div>
            </div>
          ))}
          {detail.events.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">暂无审批日志。</div>}
        </div>
      </Card>
    </div>
  );
}

function AuditsPage({ onOpenImagePreview }: { onOpenImagePreview: ImagePreviewOpener }) {
  const [state, setState] = useState<AuditState | "all">("pending");
  const [type, setType] = useState<MediaType | "all">("all");
  const [items, setItems] = useState<AuditListItemDto[]>([]);
  const [previewContent, setPreviewContent] = useState<AuditListItemDto | null>(null);
  const [previewElement, setPreviewElement] = useState<MediaElement | null>(null);
  const [auditDetail, setAuditDetail] = useState<AuditDetailDto | null>(null);
  const [busyId, setBusyId] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  async function refreshAudits() {
    const page = await listAudits({ state, type, size: 60 });
    setItems(page.data);
    setTotal(page.total);
    setError("");
  }

  useEffect(() => {
    refreshAudits().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载审批内容失败"));
  }, [state, type]);

  function openElementPreview(element: MediaElement, elements: MediaElement[]) {
    if (element.type === "image") {
      const groups = collectContentImagePreviewGroups(items);
      const activeSrc = imagePreviewSrc(element);
      const groupIndex = Math.max(
        0,
        groups.findIndex((group) => group.images.some((image) => image.src === activeSrc)),
      );
      onOpenImagePreview(elements, element, groups, groupIndex);
      return;
    }
    setPreviewElement(element);
  }

  async function runAuditAction(id: string, action: "approve" | "reject" | "archive" | "reset" | "delete") {
    if (action === "delete" && !window.confirm("确认删除这条内容？")) return;
    const body = { operator: { platform: "web" as const }, reason: "前端审批页面操作" };
    setBusyId(id);
    try {
      if (action === "approve") await approveAudit(id, body);
      if (action === "reject") await rejectAudit(id, body);
      if (action === "archive") await archiveAudit(id, body);
      if (action === "reset") await resetAudit(id, body);
      if (action === "delete") await deleteAudit(id, body);
      await refreshAudits();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审批操作失败");
    } finally {
      setBusyId("");
    }
  }

  async function openAuditLog(id: string) {
    setBusyId(id);
    try {
      setAuditDetail(await getAuditDetail(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载审批日志失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="text-base font-semibold">审批管理</h1>
          <p className="mt-1 text-xs text-muted-foreground">当前筛选 {total} 条，默认展示待审批内容。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SelectField label="审批状态" value={state} options={auditStateOptions} onChange={setState} />
          <SelectField label="内容类型" value={type} options={kindOptions} onChange={setType} />
          <Button variant="secondary" onClick={() => void refreshAudits()}>
            刷新
          </Button>
        </div>
      </Card>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((content) => (
          <Card key={content.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{content.title ?? "未命名内容"}</h2>
                <p className="mt-1 font-mono text-xs text-subtle-foreground">{content.sign}</p>
              </div>
              <Badge className={content.auditState === "approved" ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400" : ""}>
                {auditStateLabel(content.auditState)}
              </Badge>
            </div>
            <div className="aspect-video min-h-0">
              <ContentPreview content={content} onOpenContent={setPreviewContent} onOpenElement={(element) => openElementPreview(element, content.elements)} />
            </div>
            <div className="flex max-h-16 flex-wrap gap-1 overflow-hidden">
              {content.tags.map((tag) => (
                <Badge key={tag} className="border-primary/30 bg-primary-muted text-primary-text">
                  {tag}
                </Badge>
              ))}
              {content.tags.length === 0 && <span className="text-xs text-muted-foreground">暂无 tag</span>}
            </div>
            <SourceProfileSummary profile={content.sourceProfile} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={busyId === content.id} variant="primary" onClick={() => void runAuditAction(content.id, "approve")}>
                通过
              </Button>
              <Button disabled={busyId === content.id} variant="secondary" onClick={() => void runAuditAction(content.id, "reject")}>
                拒绝
              </Button>
              <Button disabled={busyId === content.id} variant="secondary" onClick={() => void runAuditAction(content.id, "archive")}>
                归档
              </Button>
              <Button disabled={busyId === content.id} variant="secondary" onClick={() => void runAuditAction(content.id, "reset")}>
                重置
              </Button>
              <Button disabled={busyId === content.id} variant="secondary" onClick={() => void openAuditLog(content.id)}>
                日志
              </Button>
              <Button disabled={busyId === content.id} variant="danger" onClick={() => void runAuditAction(content.id, "delete")}>
                删除
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {items.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">没有符合条件的审批内容。</Card>}
      {previewContent && <ContentDetailModal content={previewContent} onClose={() => setPreviewContent(null)} onOpenElement={(element) => openElementPreview(element, previewContent.elements)} />}
      {previewElement && <MediaElementModal element={previewElement} onClose={() => setPreviewElement(null)} onOpenElement={(element) => openElementPreview(element, previewContent?.elements ?? [previewElement])} />}
      {auditDetail && <AuditLogModal detail={auditDetail} onClose={() => setAuditDetail(null)} />}
    </section>
  );
}

function TagEditModal({ tag, onClose, onSaved }: { tag: TagDto; onClose: () => void; onSaved: () => Promise<void> }) {
  const [renameInput, setRenameInput] = useState(tag.name);
  const [aliasInput, setAliasInput] = useState("");
  const [editingAlias, setEditingAlias] = useState("");
  const [aliases, setAliases] = useState<string[]>(tag.aliases ?? []);
  const [error, setError] = useState("");

  useEffect(() => {
    setRenameInput(tag.name);
    setAliasInput("");
    setEditingAlias("");
    setAliases(tag.aliases ?? []);
    setError("");
  }, [tag]);

  async function submitRename() {
    const to = parseTagInput(renameInput)[0];
    if (!to || to === tag.name) return;
    try {
      await renameTag({ from: tag.name, to });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重命名 tag 失败");
    }
  }

  async function submitAlias() {
    const alias = aliasInput.trim().toLowerCase();
    if (!alias) return;
    try {
      await createTagAlias({ alias, tag: tag.name });
      if (editingAlias && editingAlias !== alias) await deleteTagAlias(editingAlias);
      setAliases((current) => Array.from(new Set([...current.filter((item) => item !== editingAlias), alias])).sort());
      setAliasInput("");
      setEditingAlias("");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存 alias 失败");
    }
  }

  async function removeAlias(alias: string) {
    try {
      await deleteTagAlias(alias);
      setAliases((current) => current.filter((item) => item !== alias));
      if (editingAlias === alias) {
        setAliasInput("");
        setEditingAlias("");
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除 alias 失败");
    }
  }

  return (
    <Modal title="编辑 tag" subtitle={tag.name} closeLabel="关闭 tag 编辑" maxWidth="max-w-3xl" onClose={onClose}>
      <div className="space-y-4 overflow-y-auto p-4">
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Tag 名称</span>
              <input
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={renameInput}
                onChange={(event) => setRenameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitRename();
                }}
              />
            </label>
            <Button className="h-9" disabled={!renameInput.trim() || parseTagInput(renameInput)[0] === tag.name} variant="primary" onClick={() => void submitRename()}>
              重命名
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Alias</span>
              <input
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="例如 dt"
                value={aliasInput}
                onChange={(event) => setAliasInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitAlias();
                }}
              />
            </label>
            <Button className="h-9" disabled={!aliasInput.trim()} variant="primary" onClick={() => void submitAlias()}>
              {editingAlias ? "更新 alias" : "创建 alias"}
            </Button>
            {editingAlias && (
              <Button
                className="h-9"
                variant="ghost"
                onClick={() => {
                  setAliasInput("");
                  setEditingAlias("");
                }}
              >
                取消
              </Button>
            )}
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-border bg-surface-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Alias</span>
              <span className="text-right">操作</span>
            </div>
            {aliases.map((alias) => (
              <div key={alias} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{alias}</span>
                  {editingAlias === alias && <span className="shrink-0 text-xs text-primary-text">正在编辑</span>}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-primary-text/80 hover:text-primary-text"
                    onClick={() => {
                      setAliasInput(alias);
                      setEditingAlias(alias);
                    }}
                  >
                    编辑
                  </button>
                  <button type="button" className="text-red-600 hover:text-red-500 dark:text-red-400" onClick={() => void removeAlias(alias)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
            {aliases.length === 0 && <div className="px-3 py-4 text-sm text-subtle-foreground">暂无 alias</div>}
          </div>
        </Card>
        {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      </div>
    </Modal>
  );
}

function TagManagementPage() {
  const initialRouteState = readTagStateFromUrl();
  const [query, setQuery] = useState(initialRouteState.query);
  const [sort, setSort] = useState<TagSort>(initialRouteState.sort);
  const [currentPage, setCurrentPage] = useState(initialRouteState.page);
  const [pageSize, setPageSize] = useState(initialRouteState.size);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [createTagExists, setCreateTagExists] = useState(false);
  const [createTagChecking, setCreateTagChecking] = useState(false);
  const [mergeSourceTags, setMergeSourceTags] = useState<string[]>([]);
  const [mergeTargetTags, setMergeTargetTags] = useState<string[]>([]);
  const [editingTag, setEditingTag] = useState<TagDto | null>(null);
  const [showSidePagination, setShowSidePagination] = useState(false);
  const [pendingDeleteTag, setPendingDeleteTag] = useState("");
  const [error, setError] = useState("");
  const topPaginationRef = useRef<HTMLDivElement | null>(null);
  const bottomPaginationRef = useRef<HTMLDivElement | null>(null);
  const topPaginationVisibleRef = useRef(true);
  const bottomPaginationVisibleRef = useRef(false);

  const createTagName = parseTagInput(tagInput)[0] ?? "";
  const canCreateTag = Boolean(createTagName) && !createTagChecking && !createTagExists;
  const mergeSource = mergeSourceTags[0];
  const mergeTarget = mergeTargetTags[0];
  const totalPages = Math.max(1, Math.ceil(tags.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedTags = tags.slice(pageStart, pageStart + pageSize);

  async function refreshTagData() {
    const nextTags = await listTags(query, sort);
    setTags(nextTags);
    setTagsLoaded(true);
    setEditingTag((current) => (current ? nextTags.find((tag) => tag.name === current.name) ?? current : null));
    setError("");
  }

  useEffect(() => {
    function syncRouteState() {
      const next = readTagStateFromUrl();
      setQuery(next.query);
      setSort(next.sort);
      setCurrentPage(next.page);
      setPageSize(next.size);
    }

    window.addEventListener("popstate", syncRouteState);
    return () => window.removeEventListener("popstate", syncRouteState);
  }, []);

  useEffect(() => {
    updateTagSearchQuery({ query, sort, page: currentPage, size: pageSize });
  }, [currentPage, pageSize, query, sort]);

  useEffect(() => {
    refreshTagData()
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载 tag 失败"));
  }, [query, sort]);

  useEffect(() => {
    if (tagsLoaded && currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, tagsLoaded, totalPages]);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>("[data-app-scroll-container]");
    if (!scrollContainer) return;
    const topPagination = topPaginationRef.current;
    const bottomPagination = bottomPaginationRef.current;
    if (!topPagination || !bottomPagination) return;

    function updateSidePagination() {
      setShowSidePagination(!topPaginationVisibleRef.current && !bottomPaginationVisibleRef.current);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === topPagination) topPaginationVisibleRef.current = entry.isIntersecting;
          if (entry.target === bottomPagination) bottomPaginationVisibleRef.current = entry.isIntersecting;
        }
        updateSidePagination();
      },
      {
        root: scrollContainer,
        threshold: 0.01,
      },
    );

    observer.observe(topPagination);
    observer.observe(bottomPagination);
    updateSidePagination();
    return () => observer.disconnect();
  }, [pagedTags.length, currentPage, pageSize]);

  useEffect(() => {
    if (!createTagName) {
      setCreateTagExists(false);
      setCreateTagChecking(false);
      return;
    }
    let ignore = false;
    setCreateTagChecking(true);
    listTags(createTagName)
      .then((rows) => {
        if (!ignore) setCreateTagExists(rows.some((tag) => tag.name === createTagName));
      })
      .catch(() => {
        if (!ignore) setCreateTagExists(false);
      })
      .finally(() => {
        if (!ignore) setCreateTagChecking(false);
      });
    return () => {
      ignore = true;
    };
  }, [createTagName]);

  async function submitCreateTag() {
    if (!canCreateTag) return;
    try {
      await createTag({ name: createTagName });
      setTagInput("");
      await refreshTagData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建 tag 失败");
    }
  }

  async function submitMergeTag() {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) return;
    try {
      await mergeTag({ from: mergeSource, to: mergeTarget });
      setMergeSourceTags([]);
      setMergeTargetTags([]);
      await refreshTagData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "合并 tag 失败");
    }
  }

  async function removeTag(name: string) {
    if (pendingDeleteTag !== name) {
      setPendingDeleteTag(name);
      return;
    }
    try {
      await deleteTag(name);
      setPendingDeleteTag("");
      setMergeSourceTags((current) => current.filter((tag) => tag !== name));
      setMergeTargetTags((current) => current.filter((tag) => tag !== name));
      await refreshTagData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除 tag 失败");
    }
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setCurrentPage(defaultTagPage);
  }

  function renderPagination(placement: LibraryPaginationPlacement = "top") {
    return (
      <Pagination
        ariaLabel="tag 分页"
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        pageSizeOptions={libraryPageSizeOptions}
        variant={placement === "side" ? "side" : "horizontal"}
        totalItems={tags.length}
        itemLabel="个 tag"
        onPageChange={setCurrentPage}
        onPageSizeChange={changePageSize}
      />
    );
  }

  return (
    <section className="space-y-4">
      <Card className="p-4 xl:mx-20">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="查找 tag 或 alias"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(defaultTagPage);
              }}
            />
          </div>
          <SelectField
            label="排序"
            value={sort}
            options={tagSortOptions}
            onChange={(nextSort) => {
              setSort(nextSort);
              setCurrentPage(defaultTagPage);
            }}
          />
        </div>
      </Card>
      <Card className="flex flex-wrap items-end gap-4 p-4 xl:mx-20">
        <div className="w-full max-w-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">新 tag</span>
            <div className="flex">
              <input
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-l-md border border-r-0 bg-surface px-3 text-sm outline-none focus:ring-2",
                  createTagExists ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20" : "border-border focus:border-primary focus:ring-primary/20",
                )}
                placeholder="输入 tag"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitCreateTag();
                }}
              />
              <Button className="h-9 rounded-l-none" disabled={!canCreateTag} variant="primary" onClick={() => void submitCreateTag()}>
                <Plus className="h-4 w-4" />
                创建
              </Button>
            </div>
          </label>
          {createTagExists && <div className="mt-1 text-xs text-red-600 dark:text-red-400">tag 已存在</div>}
        </div>
        <div className="hidden h-14 border-l border-border md:block" />
        <TagSelectInput
          className="w-full sm:w-60 lg:w-64"
          label="来源 tag"
          selectedTags={mergeSourceTags}
          placeholder="选择要合并的 tag"
          allowCreate={false}
          maxTags={1}
          onChange={setMergeSourceTags}
        />
        <TagSelectInput
          className="w-full sm:w-60 lg:w-64"
          label="目标 tag"
          selectedTags={mergeTargetTags}
          placeholder="选择合并目标 tag"
          excludeTags={mergeSource ? [mergeSource] : []}
          allowCreate={false}
          maxTags={1}
          onChange={setMergeTargetTags}
        />
        <Button className="h-9" disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget} variant="secondary" onClick={() => void submitMergeTag()}>
          合并
        </Button>
      </Card>
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div ref={topPaginationRef} className="xl:mx-20">{renderPagination("top")}</div>
      {showSidePagination && renderPagination("side")}
      <Card className="overflow-hidden xl:mx-20">
        <div className="hidden grid-cols-[minmax(140px,1.1fr)_minmax(180px,1.4fr)_90px_150px_190px] gap-3 border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
          <span>Tag</span>
          <span>Alias</span>
          <span className="text-right">数量</span>
          <span>创建时间</span>
          <span>操作</span>
        </div>
        {pagedTags.map((tag, index) => (
          <div
            key={tag.name}
            className={cn(
              "grid gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(140px,1.1fr)_minmax(180px,1.4fr)_90px_150px_190px] md:items-center",
              (pageStart + index) % 2 === 0 ? "bg-surface" : "bg-surface-muted",
            )}
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{tag.name}</div>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1">
              {(tag.aliases ?? []).map((alias) => (
                <span key={alias} className="inline-flex rounded-full border border-primary/30 bg-primary-muted px-2 py-0.5 text-xs font-medium text-primary-text">
                  {alias}
                </span>
              ))}
              {(tag.aliases ?? []).length === 0 && <span className="text-xs text-subtle-foreground">暂无 alias</span>}
            </div>
            <span className="text-right font-medium tabular-nums">{tag.count}</span>
            <span className="text-xs text-subtle-foreground">{tag.createdAt ? formatDateTime(tag.createdAt) : "--"}</span>
            <div className="flex flex-wrap gap-2">
              <Button className="h-8" variant="secondary" onClick={() => setEditingTag(tag)}>
                编辑
              </Button>
              <Button className="h-8" variant={pendingDeleteTag === tag.name ? "danger" : "secondary"} onClick={() => void removeTag(tag.name)}>
                <Trash2 className="h-4 w-4" />
                {pendingDeleteTag === tag.name ? "确认删除" : "删除"}
              </Button>
            </div>
          </div>
        ))}
        {pagedTags.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">没有找到匹配的 tag。</div>}
      </Card>
      <div ref={bottomPaginationRef} className="xl:mx-20">{renderPagination("bottom")}</div>
      {editingTag && <TagEditModal tag={editingTag} onClose={() => setEditingTag(null)} onSaved={refreshTagData} />}
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

function DataExportStatusBadge({ status }: { status: DataExportListItemDto["status"] }) {
  const label = status === "ready" ? "已完成" : status === "running" ? "处理中" : "失败";
  return (
    <Badge
      className={cn(
        status === "ready" && "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
        status === "running" && "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        status === "failed" && "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {label}
    </Badge>
  );
}

function DataExportProgress({ item }: { item: DataExportListItemDto }) {
  const writtenBytes = item.status === "running" ? item.zipTempSizeBytes ?? 0 : item.zipSizeBytes;
  const percent = item.progressPercent ?? (item.status === "ready" ? 100 : 0);
  const showBar = item.status === "running" || item.status === "ready";
  return (
    <div className="min-w-0 space-y-1 text-right">
      <div className="tabular-nums text-muted-foreground">{formatBytes(writtenBytes)}</div>
      {item.status === "running" && <div className="text-[11px] text-subtle-foreground">zip.tmp</div>}
      {showBar && (
        <div className="ml-auto flex w-32 items-center justify-end gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
          <span className="w-9 text-right text-[11px] tabular-nums text-subtle-foreground">{percent}%</span>
        </div>
      )}
    </div>
  );
}

function ImportResultPanel({ result }: { result: DataImportResultDto }) {
  const tableEntries = Object.entries(result.tables).filter(([, value]) => value.created || value.updated || value.skipped || value.conflicted);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">导入结果</h2>
        <Badge>{result.conflictPolicy === "overwrite" ? "覆盖冲突" : "保留本地"}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          <div className="text-xs text-muted-foreground">复制文件</div>
          <div className="mt-1 text-lg font-semibold">{result.files.copied}</div>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          <div className="text-xs text-muted-foreground">跳过文件</div>
          <div className="mt-1 text-lg font-semibold">{result.files.skipped}</div>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          <div className="text-xs text-muted-foreground">文件冲突</div>
          <div className="mt-1 text-lg font-semibold">{result.files.conflicted}</div>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
          <div className="text-xs text-muted-foreground">冲突记录</div>
          <div className="mt-1 text-lg font-semibold">{result.conflicts.length}</div>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-border">
        {tableEntries.map(([table, value]) => (
          <div key={table} className="grid grid-cols-[1fr_repeat(4,72px)] items-center border-b border-border px-3 py-2 text-sm last:border-b-0">
            <span className="font-mono text-xs">{table}</span>
            <span className="text-right tabular-nums text-green-600 dark:text-green-400">{value.created}</span>
            <span className="text-right tabular-nums text-blue-600 dark:text-blue-400">{value.updated}</span>
            <span className="text-right tabular-nums text-muted-foreground">{value.skipped}</span>
            <span className="text-right tabular-nums text-red-600 dark:text-red-400">{value.conflicted}</span>
          </div>
        ))}
        {tableEntries.length === 0 && <div className="p-4 text-sm text-muted-foreground">没有数据库记录变化。</div>}
      </div>
      {result.conflicts.length > 0 && (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-700 dark:text-red-300">
          {result.conflicts.slice(0, 50).map((conflict) => (
            <div key={conflict}>{conflict}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DataExportsPage() {
  const [items, setItems] = useState<DataExportListItemDto[]>([]);
  const [selected, setSelected] = useState<DataExportDetailDto | DataExportListItemDto | null>(null);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<DataImportResultDto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshExports() {
    const rows = await listDataExports();
    setItems(rows);
    setSelected((current) => (current ? rows.find((item) => item.id === current.id) ?? null : current));
    setError("");
  }

  useEffect(() => {
    refreshExports().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "加载导出记录失败"));
  }, []);

  useEffect(() => {
    if (!items.some((item) => item.status === "running")) return;
    const timer = window.setInterval(() => {
      refreshExports().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "刷新导出记录失败"));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [items]);

  function startEditing(item: DataExportListItemDto) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditNote(item.note ?? "");
  }

  async function createExport() {
    setBusy("create");
    try {
      const item = await createDataExport();
      await refreshExports();
      setSelected(item);
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建导出失败");
    } finally {
      setBusy("");
    }
  }

  async function uploadExport(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    try {
      const item = await uploadDataExport(file);
      await refreshExports();
      setSelected(item);
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传导出包失败");
    } finally {
      setBusy("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveExport(item: DataExportListItemDto) {
    setBusy(`save:${item.id}`);
    try {
      const updated = await updateDataExport(item.id, { name: editName, note: editNote });
      await refreshExports();
      setSelected(updated);
      setEditingId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存导出记录失败");
    } finally {
      setBusy("");
    }
  }

  async function removeExport(item: DataExportListItemDto) {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    setBusy(`delete:${item.id}`);
    try {
      await deleteDataExport(item.id);
      await refreshExports();
      setSelected((current) => (current?.id === item.id ? null : current));
      setResult(null);
      setPendingDeleteId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除导出记录失败");
    } finally {
      setBusy("");
    }
  }

  async function downloadExport(item: DataExportListItemDto) {
    setBusy(`download:${item.id}`);
    try {
      const link = document.createElement("a");
      link.href = dataExportDownloadUrl(item.id);
      link.download = item.zipFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "下载导出包失败");
    } finally {
      setBusy("");
    }
  }

  async function applyImport(item: DataExportListItemDto) {
    setBusy(`import:${item.id}`);
    try {
      const imported = await importDataExport(item.id);
      setResult(imported);
      setSelected(item);
      await refreshExports();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "应用导入失败");
    } finally {
      setBusy("");
    }
  }

  async function showDetail(item: DataExportListItemDto) {
    setBusy(`detail:${item.id}`);
    try {
      const detail = await getDataExport(item.id);
      setSelected(detail);
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取导出详情失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-4">
      {error && <Card className="border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</Card>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void createExport()} disabled={!!busy}>
            <FileArchive className="h-4 w-4" />
            {busy === "create" ? "导出中" : "新建导出"}
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!!busy}>
            <Upload className="h-4 w-4" />
            {busy === "upload" ? "上传中" : "上传 zip"}
          </Button>
          <Button variant="ghost" className="h-9 w-9 px-0" aria-label="刷新导出列表" onClick={() => void refreshExports()} disabled={!!busy}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <input ref={fileInputRef} className="hidden" type="file" accept=".zip,application/zip" onChange={(event) => void uploadExport(event.target.files?.[0])} />
        </div>
        <Badge>{items.length} 个</Badge>
      </div>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.3fr_88px_84px_84px_132px_84px_148px_300px] items-center border-b border-border bg-surface-muted px-4 py-2 text-xs text-muted-foreground xl:grid">
          <span>名称</span>
          <span>状态</span>
          <span className="text-right">数据库</span>
          <span className="text-right">文件</span>
          <span className="text-right">进度</span>
          <span className="text-right">耗时</span>
          <span>创建时间</span>
          <span className="text-right">操作</span>
        </div>
        {items.map((item) => {
          const editing = editingId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "grid gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0 xl:grid-cols-[1.3fr_88px_84px_84px_132px_84px_148px_300px] xl:items-center",
                selected?.id === item.id ? "bg-primary-muted/50" : "bg-surface hover:bg-surface-muted",
              )}
            >
              <div className="min-w-0">
                {editing ? (
                  <div className="grid gap-2">
                    <input
                      className="h-9 min-w-0 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    <input
                      className="h-9 min-w-0 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="备注"
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="mt-1 truncate text-xs text-subtle-foreground">{item.note || item.id}</div>
                  </>
                )}
              </div>
              <DataExportStatusBadge status={item.status} />
              <span className="text-right tabular-nums text-muted-foreground">{item.databaseRows}</span>
              <span className="text-right tabular-nums text-muted-foreground">{item.objectCount}</span>
              <DataExportProgress item={item} />
              <span className="text-right tabular-nums text-muted-foreground">{formatDuration(item.durationSeconds)}</span>
              <span className="text-xs text-subtle-foreground">{formatDateTime(item.createdAt)}</span>
              <div className="flex flex-wrap justify-end gap-2">
                {editing ? (
                  <>
                    <Button className="h-8" variant="secondary" onClick={() => void saveExport(item)} disabled={busy === `save:${item.id}`}>
                      <Save className="h-4 w-4" />
                      保存
                    </Button>
                    <Button className="h-8" variant="ghost" onClick={() => setEditingId("")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button className="h-8" variant="secondary" onClick={() => void showDetail(item)} disabled={busy === `detail:${item.id}`}>
                      查看
                    </Button>
                    <Button className="h-8" variant="secondary" onClick={() => startEditing(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button className="h-8" variant="secondary" onClick={() => void downloadExport(item)} disabled={item.status !== "ready" || busy === `download:${item.id}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button className="h-8" variant="secondary" onClick={() => void applyImport(item)} disabled={item.status !== "ready" || busy === `import:${item.id}`}>
                      应用导入
                    </Button>
                    <Button className="h-8" variant={pendingDeleteId === item.id ? "danger" : "secondary"} onClick={() => void removeExport(item)} disabled={busy === `delete:${item.id}`}>
                      <Trash2 className="h-4 w-4" />
                      {pendingDeleteId === item.id ? "确认" : "删除"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">暂无导出记录。</div>}
      </Card>
      {selected && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{selected.name}</h2>
              <div className="mt-1 text-xs text-subtle-foreground">{selected.zipFileName}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{selected.databaseRows} 行</Badge>
              <Badge>{selected.objectCount} 文件</Badge>
              <Badge>{formatBytes(selected.objectSizeBytes)}</Badge>
              <Badge>{formatDuration(selected.durationSeconds)} 耗时</Badge>
              {selected.status === "running" && <Badge>{formatBytes(selected.zipTempSizeBytes ?? 0)} 已写入</Badge>}
            </div>
          </div>
          {selected.status === "running" && (
            <div className="mb-4 rounded-md border border-border bg-surface-muted p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>zip.tmp 写入进度</span>
                <span className="tabular-nums">{selected.progressPercent ?? 0}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, selected.progressPercent ?? 0))}%` }} />
              </div>
            </div>
          )}
          {"manifest" in selected && selected.manifest && (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {selected.manifest.tables.map((table) => (
                <div key={table.table} className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{table.table}</span>
                  <span className="tabular-nums text-muted-foreground">{table.rows}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {result && <ImportResultPanel result={result} />}
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
            <div key={content.id} className="grid grid-cols-[1fr_72px_72px_92px_72px] items-center border-b border-border bg-surface px-3 py-2 text-sm last:border-b-0 hover:bg-surface-muted">
              <span className="font-medium">{content.title ?? "未命名内容"}</span>
              <span className="text-muted-foreground">{content.type}</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Heart className="h-3.5 w-3.5" />
                {content.likeCount}
              </span>
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
    if (page !== "workspace") return;
    void refreshAssets();
  }, [filters, page, token]);

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

  function clearSelectedAssets() {
    setSelectedIds([]);
    setPendingAssetDeleteConfirm(false);
  }

  function addAssetByDrag(id: string) {
    addAssetsToDraft([id]);
  }

  function openImagePreview(elements: MediaElement[], activeElement: MediaElement, groups: ImagePreviewGroup[] = [], groupIndex = 0) {
    const images = groups[groupIndex]?.images.length ? groups[groupIndex].images : collectImagePreviewItems(elements);
    const activeSrc = imagePreviewSrc(activeElement);
    const activeIndex = Math.max(
      0,
      images.findIndex((image) => image.src === activeSrc),
    );
    setImagePreview(createImagePreviewState(images.length > 0 ? images : collectImagePreviewItems([activeElement]), activeIndex, groups, groupIndex));
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
    setDraft((current) => ({
      ...current,
      // 手动文本块没有素材来源，用空字符串占位保持 elements 和 assetIds 顺序对齐。
      assetIds: [...alignDraftAssetIds(current.elements, current.assetIds), ""],
      elements: [...current.elements, { type: "text", content }],
      updatedAt: now(),
    }));
  }

  function updateDraftTextElement(index: number, content: string) {
    setDraft((current) => {
      if (index < 0 || index >= current.elements.length) return current;
      const element = current.elements[index];
      if (element?.type !== "text") return current;
      const elements = [...current.elements];
      elements[index] = { ...element, content };
      return { ...current, elements, updatedAt: now() };
    });
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
    if (!draft.tags.some((tag) => tag.trim())) {
      setError("请至少添加一个 tag 后再提交");
      return;
    }
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
    <div className="h-full bg-background text-foreground">
      <Sidebar page={page} onPageChange={changePage} />
      <TopBar page={page} theme={theme} onThemeChange={changeTheme} onLogout={handleLogout} />
      <div className="fixed inset-x-0 bottom-0 top-14 overflow-y-auto lg:left-60" data-app-scroll-container>
        <main className="flex min-h-full flex-col gap-4 px-4 py-4 lg:px-6 lg:pb-6">
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
              onAddTextElement={addTextElementToDraft}
              onClearSelected={clearSelectedAssets}
              onDeleteSelected={() => void deleteSelectedAssets()}
              onDraftChange={updateDraftMeta}
              onFiltersChange={setFilters}
              onIgnoreSelected={() => void ignoreSelected()}
              onMoveElement={moveDraftElement}
              onOpenImagePreview={openImagePreview}
              onRemoveElement={removeDraftElement}
              onUpdateTextElement={updateDraftTextElement}
              onSubmit={() => void submitCurrentDraft()}
              onToggleAsset={toggleAsset}
            />
          )}
          {page === "library" && <ContentLibraryPage onOpenImagePreview={openImagePreview} onOpenWorkspace={() => changePage("workspace")} />}
          {page === "pic" && <PicApiPreviewPage onOpenImagePreview={openImagePreview} />}
          {page === "audits" && <AuditsPage onOpenImagePreview={openImagePreview} />}
          {page === "events" && <EventsPage />}
          {page === "tags" && <TagManagementPage />}
          {page === "exports" && <DataExportsPage />}
        </main>
      </div>
      <ImagePreviewViewer state={imagePreview} onClose={() => setImagePreview(emptyImagePreviewState)} />
    </div>
  );
}
