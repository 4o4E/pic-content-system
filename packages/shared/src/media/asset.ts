import type { MediaElement, MediaType } from "./element";

export type MediaAssetStatus = "pending" | "selected" | "used" | "ignored" | "failed";

export interface MediaAssetDto {
  id: string;
  kind: MediaType;
  fileMd5?: string;
  element: MediaElement;
  sourceId?: string;
  status: MediaAssetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMediaAssetDto {
  kind: MediaType;
  fileMd5?: string;
  element: MediaElement;
  sourceId?: string;
  status?: MediaAssetStatus;
}

export interface WorkspaceDraftDto {
  id: string;
  title?: string;
  tags: string[];
  elements: MediaElement[];
  assetIds: string[];
  status: "editing" | "submitted" | "discarded";
  createdAt: string;
  updatedAt: string;
}

export interface UpdateWorkspaceDraftDto {
  title?: string;
  tags: string[];
  elements: MediaElement[];
  assetIds: string[];
}
