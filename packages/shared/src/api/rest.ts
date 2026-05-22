export interface AuthSessionDto {
  ok: boolean;
}

export interface TagDto {
  name: string;
  count: number;
}

export interface TagAliasDto {
  alias: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTagAliasDto {
  alias: string;
  tag: string;
}

export interface ResolveTagsDto {
  tags: string[];
}

export interface ResolveTagsResultDto {
  tags: string[];
}

export interface RenameTagDto {
  from: string;
  to: string;
}

export interface RenameTagResultDto {
  updated: number;
}

export interface IngestEventDto {
  id: string;
  source: string;
  status: string;
  platform: string;
  platformEventId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIngestEventDto {
  source: string;
  status: string;
  platform: string;
  platformEventId?: string;
  payload?: unknown;
  error?: string;
}
