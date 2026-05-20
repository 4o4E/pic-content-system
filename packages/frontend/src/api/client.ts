import type {
  ApiResp,
  AuthSessionDto,
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
  TagDto,
} from "@pic/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
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

function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const url = new URL(path, API_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(path: string, init: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(path.startsWith("http") ? path : new URL(path, API_BASE_URL).toString(), {
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

export function listMedia(query: MediaQuery = {}) {
  return request<PageResp<MediaContentDto>>(
    withQuery("/api/media", {
      q: query.q,
      tags: query.tags?.join(","),
      tagMode: query.tagMode,
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

export function listTags(q?: string) {
  return request<TagDto[]>(withQuery("/api/tags", { q }));
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
