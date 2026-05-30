export interface AuthSessionDto {
  ok: boolean;
}

export interface TagDto {
  name: string;
  count: number;
  aliases?: string[];
  createdAt?: string;
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

export interface UpsertTagDto {
  name: string;
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

export interface MergeTagDto {
  from: string;
  to: string;
}

export interface RenameTagResultDto {
  updated: number;
}

export interface DeleteTagResultDto {
  deleted: number;
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

export type DataExportStatus = "ready" | "running" | "failed";
export type DataImportConflictPolicy = "keep_local" | "overwrite";

export interface DataExportTableSummaryDto {
  table: string;
  rows: number;
}

export interface DataExportObjectSummaryDto {
  storageKey: string;
  sizeBytes: number;
}

export interface DataExportManifestDto {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  tables: DataExportTableSummaryDto[];
  objects: DataExportObjectSummaryDto[];
}

export interface DataExportListItemDto {
  id: string;
  name: string;
  note?: string;
  status: DataExportStatus;
  schemaVersion: number;
  zipFileName: string;
  zipSizeBytes: number;
  databaseRows: number;
  objectCount: number;
  objectSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface DataExportDetailDto extends DataExportListItemDto {
  manifest?: DataExportManifestDto;
}

export interface CreateDataExportDto {
  name?: string;
  note?: string;
}

export interface UpdateDataExportDto {
  name?: string;
  note?: string;
}

export interface ImportDataExportDto {
  conflictPolicy?: DataImportConflictPolicy;
}

export interface DataImportTableResultDto {
  created: number;
  updated: number;
  skipped: number;
  conflicted: number;
}

export interface DataImportFileResultDto {
  copied: number;
  skipped: number;
  conflicted: number;
}

export interface DataImportResultDto {
  exportId: string;
  conflictPolicy: DataImportConflictPolicy;
  files: DataImportFileResultDto;
  tables: Record<string, DataImportTableResultDto>;
  conflicts: string[];
}
