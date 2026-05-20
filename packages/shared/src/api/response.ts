export interface ApiResp<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export interface ApiError {
  code: string;
  message: string;
  detail?: unknown;
}
