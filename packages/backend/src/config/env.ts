import fs from "node:fs";
import path from "node:path";

export interface AppConfig {
  port: number;
  filesDir: string;
  accessToken: string;
  frontendDistDir: string;
  maxRequestBodyBytes: number;
}

let dotEnvLoaded = false;

export function ensureDotEnvLoaded() {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  const candidates = ["../../.env", "../.env", ".env"];
  for (const candidate of candidates) {
    try {
      const file = path.resolve(process.cwd(), candidate);
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index < 0) continue;
        const key = trimmed.slice(0, index);
        const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
        process.env[key] ??= value;
      }
      return;
    } catch {
      // 本地配置加载失败时继续使用已有环境变量。
    }
  }
}

export function loadConfig(): AppConfig {
  ensureDotEnvLoaded();
  return {
    port: Number(process.env.PORT ?? 3000),
    filesDir: process.env.FILES_DIR ?? "./data/files",
    accessToken: process.env.ACCESS_TOKEN ?? "",
    frontendDistDir: process.env.FRONTEND_DIST_DIR ?? "packages/backend/public",
    maxRequestBodyBytes: Number(process.env.MAX_REQUEST_BODY_BYTES ?? 100 * 1024 * 1024),
  };
}
