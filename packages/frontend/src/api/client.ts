import type {
  ApiResp,
  AuditActionDto,
  AuditListItemDto,
  AuditState,
  BatchDeleteMediaAssetsDto,
  BatchDeleteMediaContentsDto,
  AuthSessionDto,
  BatchRestoreMediaContentsToWorkspaceDto,
  BatchRestoreMediaContentsToWorkspaceResultDto,
  BatchUpdateMediaTagsDto,
  CreateIngestEventDto,
  CreateMediaAssetDto,
  CreateMediaContentDto,
  CreateMediaFileDto,
  IngestEventDto,
  MediaAssetDto,
  MediaAssetStatus,
  MediaContentDto,
  MediaFileDto,
  MediaType,
  PageResp,
  Platform,
  TagAliasDto,
  TagDto,
  UpsertTagAliasDto,
} from "@pic/shared";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "pic-content-token";

export interface AssetQuery {
  q?: string;
  status?: MediaAssetStatus | "all";
  kind?: MediaType | "all";
  page?: number;
  size?: number;
}

export interface MediaQuery {
  q?: string;
  tags?: string[];
  tagMode?: "and" | "or";
  sort?: "time_desc" | "time_asc";
  type?: MediaType | "all";
  auditState?: AuditState | "all";
  sourcePlatform?: Platform;
  sourceGroupId?: string;
  sourceUserId?: string;
  page?: number;
  size?: number;
}

export interface AuditQuery {
  state?: AuditState | "all";
  type?: MediaType | "all";
  page?: number;
  size?: number;
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function apiUrl(path: string) {
  if (path.startsWith("http")) return path;
  if (API_BASE_URL) return new URL(path, API_BASE_URL).toString();
  return path;
}

function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const url = new URL(path, API_BASE_URL || window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  if (path.startsWith("http") || API_BASE_URL) return url.toString();
  return `${url.pathname}${url.search}`;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  const payload = (await response.json().catch(() => ({ success: false, message: "接口返回格式错误" }))) as ApiResp<T>;
  if (!response.ok || !payload.success) throw new Error(payload.message || `请求失败：${response.status}`);
  return payload.data as T;
}

export async function loginWithToken(token: string) {
  const data = await request<AuthSessionDto>("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  setStoredToken(token);
  return data;
}

export function listAssets(query: AssetQuery = {}) {
  return request<PageResp<MediaAssetDto>>(
    withQuery("/api/assets", {
      q: query.q,
      status: query.status,
      kind: query.kind,
      page: query.page ?? 1,
      size: query.size ?? 60,
    }),
  );
}

export function ignoreAsset(id: string) {
  return request<MediaAssetDto>(`/api/assets/${id}/ignore`, { method: "PATCH" });
}

export function createAsset(body: CreateMediaAssetDto) {
  return request<MediaAssetDto>("/api/assets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteAssets(body: BatchDeleteMediaAssetsDto) {
  return request<{ deleted: number }>("/api/assets", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export function listMedia(query: MediaQuery = {}) {
  return request<PageResp<MediaContentDto>>(
    withQuery("/api/media", {
      q: query.q,
      tags: query.tags?.join(","),
      tagMode: query.tagMode,
      sort: query.sort,
      type: query.type,
      auditState: query.auditState,
      sourcePlatform: query.sourcePlatform,
      sourceGroupId: query.sourceGroupId,
      sourceUserId: query.sourceUserId,
      page: query.page ?? 1,
      size: query.size ?? 60,
    }),
  );
}

export function createMedia(body: CreateMediaContentDto) {
  return request<MediaContentDto>("/api/media", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function batchUpdateMediaTags(body: BatchUpdateMediaTagsDto) {
  return request<MediaContentDto[]>("/api/media/tags", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteMediaContents(body: BatchDeleteMediaContentsDto) {
  return request<{ deleted: number }>("/api/media", {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export function restoreMediaContentsToWorkspace(body: BatchRestoreMediaContentsToWorkspaceDto) {
  return request<BatchRestoreMediaContentsToWorkspaceResultDto>("/api/media/workspace-assets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listTags(q?: string) {
  return request<TagDto[]>(withQuery("/api/tags", { q }));
}

export function listTagAliases(q?: string) {
  return request<TagAliasDto[]>(withQuery("/api/tag-aliases", { q }));
}

export function createTagAlias(body: UpsertTagAliasDto) {
  return request<TagAliasDto>("/api/tag-aliases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteTagAlias(alias: string) {
  return request<{ deleted: number }>(`/api/tag-aliases/${encodeURIComponent(alias)}`, { method: "DELETE" });
}

export function listAudits(query: AuditQuery = {}) {
  return request<PageResp<AuditListItemDto>>(
    withQuery("/api/audits", {
      state: query.state,
      type: query.type,
      page: query.page ?? 1,
      size: query.size ?? 20,
    }),
  );
}

function submitAuditAction(id: string, action: "approve" | "reject" | "archive" | "reset", body: AuditActionDto = {}) {
  return request<AuditListItemDto>(`/api/audits/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveAudit(id: string, body?: AuditActionDto) {
  return submitAuditAction(id, "approve", body);
}

export function rejectAudit(id: string, body?: AuditActionDto) {
  return submitAuditAction(id, "reject", body);
}

export function archiveAudit(id: string, body?: AuditActionDto) {
  return submitAuditAction(id, "archive", body);
}

export function resetAudit(id: string, body?: AuditActionDto) {
  return submitAuditAction(id, "reset", body);
}

export function deleteAudit(id: string, body: AuditActionDto = {}) {
  return request<{ deleted: number }>(`/api/audits/${id}`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export function listIngestEvents(page = 1, size = 50) {
  return request<PageResp<IngestEventDto>>(withQuery("/api/ingest-events", { page, size }));
}

export function createIngestEvent(body: CreateIngestEventDto) {
  return request<IngestEventDto>("/api/ingest-events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fileUrl(md5: string) {
  return withQuery(`/api/files/${md5}`, { token: getStoredToken() });
}

export function createFile(body: CreateMediaFileDto) {
  return request<MediaFileDto>("/api/files", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
