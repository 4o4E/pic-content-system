export interface PageReq {
  page: number;
  size: number;
}

export interface PageResp<T> {
  total: number;
  data: T[];
}
