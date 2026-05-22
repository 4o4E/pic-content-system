import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApiResp, ImportPicImageDto, PicImageResultDto } from "@pic/shared";

interface NapCatExport {
  assets?: Record<string, NapCatAsset>;
}

interface NapCatAsset {
  key: string;
  type?: string;
  status?: string;
  relativePath?: string;
  sourcePath?: string;
}

interface ImportArgs {
  sourceDir: string;
  apiBase: string;
  token: string;
  commit: boolean;
  tags: string[];
  failureReportPath: string;
}

interface ImportFailure {
  assetKey?: string;
  relativePath?: string;
  reason: string;
}

const defaultTags = ["弔图"];

async function loadEnv() {
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env"), path.resolve(process.cwd(), "../../.env")];
  const envPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!envPath) return;
  const content = await fs.readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
    process.env[key] ??= value;
  }
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseArgs(): ImportArgs {
  const sourceDir = path.resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? ".");
  const tags = [...defaultTags];
  for (const arg of process.argv) {
    if (arg.startsWith("--tag=")) tags.push(arg.slice("--tag=".length));
  }
  const defaultReportName = `napcat-import-failures-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  return {
    sourceDir,
    apiBase: (argValue("api-base") ?? process.env.PIC_IMPORT_API_BASE ?? "http://localhost:3000").replace(/\/$/, ""),
    token: argValue("token") ?? process.env.ACCESS_TOKEN ?? "",
    commit: process.argv.includes("--commit"),
    tags: Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))),
    failureReportPath: path.resolve(sourceDir, argValue("failure-report") || defaultReportName),
  };
}

function isImageAsset(asset: NapCatAsset) {
  const ext = path.extname(asset.relativePath ?? asset.sourcePath ?? "").toLowerCase();
  return asset.type === "image" || [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
}

function safeResolveAssetPath(sourceDir: string, relativePath: string | undefined) {
  if (!relativePath) return undefined;
  const base = path.resolve(sourceDir);
  const target = path.resolve(base, relativePath);
  if (!target.startsWith(`${base}${path.sep}`) && target !== base) return undefined;
  return target;
}

async function postImage(args: ImportArgs, body: ImportPicImageDto) {
  const response = await fetch(`${args.apiBase}/api/pic/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({ success: false, message: "接口返回格式错误" }))) as ApiResp<PicImageResultDto>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message || `导入请求失败：${response.status}`);
  }
  return payload.data;
}

async function main() {
  await loadEnv();
  const args = parseArgs();
  if (args.commit && !args.token) throw new Error("提交导入需要通过 --token 或 ACCESS_TOKEN 提供访问 token");

  const indexPath = path.join(args.sourceDir, "index.json");
  const exportData = JSON.parse(await fs.readFile(indexPath, "utf8")) as NapCatExport;
  const assets = Object.values(exportData.assets ?? {}).filter((asset) => asset.status === "ok" && isImageAsset(asset));
  const failures: ImportFailure[] = [];
  let imported = 0;
  let existing = 0;
  let missing = 0;

  for (const asset of assets) {
    const assetPath = safeResolveAssetPath(args.sourceDir, asset.relativePath);
    const buffer = assetPath ? await fs.readFile(assetPath).catch(() => undefined) : undefined;
    if (!buffer) {
      missing++;
      failures.push({ assetKey: asset.key, relativePath: asset.relativePath, reason: "本地图片资产不存在或不可读取" });
      continue;
    }

    if (args.commit) {
      try {
        const result = await postImage(args, {
          contentBase64: buffer.toString("base64"),
          tags: args.tags,
        });
        if (result.existed) existing++;
        else imported++;
      } catch (error) {
        failures.push({ assetKey: asset.key, relativePath: asset.relativePath, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    if ((imported + existing + missing + failures.length) % 200 === 0) {
      console.log(`progress imported=${imported}, existing=${existing}, missing=${missing}, failed=${failures.length}`);
    }
  }

  if (failures.length > 0) {
    await fs.writeFile(args.failureReportPath, JSON.stringify({ sourceDir: args.sourceDir, tags: args.tags, failures }, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        mode: args.commit ? "commit" : "dry-run",
        apiBase: args.apiBase,
        total: assets.length,
        tags: args.tags,
        imported,
        existing,
        missing,
        failed: failures.length,
        failureReportPath: failures.length > 0 ? args.failureReportPath : undefined,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
