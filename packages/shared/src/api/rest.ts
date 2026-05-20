export interface AuthSessionDto {
  ok: boolean;
}

export interface TagDto {
  name: string;
  count: number;
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
