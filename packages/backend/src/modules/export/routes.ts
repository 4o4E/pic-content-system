import multipart from "@fastify/multipart";
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import type {
  ApiResp,
  CreateDataExportDto,
  DataExportDetailDto,
  DataExportListItemDto,
  DataImportResultDto,
  ImportDataExportDto,
  UpdateDataExportDto,
} from "@pic/shared";
import type { AppConfig } from "../../config/env.js";
import {
  createDataExport,
  dataExportZipPath,
  deleteDataExport,
  getDataExport,
  importDataExport,
  listDataExports,
  saveUploadedDataExport,
  updateDataExport,
} from "./export-service.js";

export async function registerDataExportRoutes(app: FastifyInstance, config: AppConfig) {
  await app.register(multipart, {
    limits: {
      fileSize: config.maxRequestBodyBytes,
    },
  });

  app.get<{ Reply: ApiResp<DataExportListItemDto[]> }>("/api/exports", async () => ({
    success: true,
    message: "ok",
    data: await listDataExports(config),
  }));

  app.get<{ Params: { id: string }; Reply: ApiResp<DataExportDetailDto> }>("/api/exports/:id", async (request, reply) => {
    const item = await getDataExport(config, request.params.id);
    if (!item) return reply.code(404).send({ success: false, message: "导出记录不存在" });
    return { success: true, message: "ok", data: item };
  });

  app.post<{ Body: CreateDataExportDto; Reply: ApiResp<DataExportDetailDto> }>("/api/exports", async (request, reply) => {
    try {
      const item = await createDataExport(config, request.body ?? {});
      return { success: true, message: "ok", data: item };
    } catch (cause) {
      return reply.code(500).send({ success: false, message: cause instanceof Error ? cause.message : "导出失败" });
    }
  });

  app.post<{ Reply: ApiResp<DataExportDetailDto> }>("/api/exports/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ success: false, message: "请上传导出 zip 文件" });
    if (!file.filename.toLowerCase().endsWith(".zip")) return reply.code(400).send({ success: false, message: "只能上传 zip 文件" });
    try {
      const item = await saveUploadedDataExport(config, { filename: file.filename, stream: file.file });
      return { success: true, message: "ok", data: item };
    } catch (cause) {
      return reply.code(400).send({ success: false, message: cause instanceof Error ? cause.message : "导入包解析失败" });
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateDataExportDto; Reply: ApiResp<DataExportDetailDto> }>("/api/exports/:id", async (request, reply) => {
    const item = await updateDataExport(config, request.params.id, request.body ?? {});
    if (!item) return reply.code(404).send({ success: false, message: "导出记录不存在" });
    return { success: true, message: "ok", data: item };
  });

  app.delete<{ Params: { id: string }; Reply: ApiResp<{ deleted: number }> }>("/api/exports/:id", async (request) => {
    await deleteDataExport(config, request.params.id);
    return { success: true, message: "ok", data: { deleted: 1 } };
  });

  app.get<{ Params: { id: string } }>("/api/exports/:id/download", async (request, reply) => {
    const item = await getDataExport(config, request.params.id);
    if (!item) return reply.code(404).send({ success: false, message: "导出记录不存在" });
    if (item.status !== "ready") return reply.code(400).send({ success: false, message: "导出包尚未就绪" });
    const zip = dataExportZipPath(config, request.params.id);
    if (!fs.existsSync(zip)) return reply.code(404).send({ success: false, message: "导出 zip 文件不存在" });
    reply
      .type("application/zip")
      .header("Content-Disposition", `attachment; filename="${item.zipFileName}"; filename*=UTF-8''${encodeURIComponent(item.zipFileName)}`);
    return fs.createReadStream(zip);
  });

  app.post<{ Params: { id: string }; Body: ImportDataExportDto; Reply: ApiResp<DataImportResultDto> }>("/api/exports/:id/import", async (request, reply) => {
    try {
      const result = await importDataExport(config, request.params.id, request.body ?? {});
      return { success: true, message: "ok", data: result };
    } catch (cause) {
      return reply.code(400).send({ success: false, message: cause instanceof Error ? cause.message : "导入失败" });
    }
  });
}
