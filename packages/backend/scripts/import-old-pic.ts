import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApiResp, ImportPicImageDto, PicImageResultDto } from "@pic/shared";

interface OldPicItem {
  name?: string;
  tags?: string[];
}

interface ImportArgs {
  sourceDir: string;
  apiBase: string;
  token: string;
  commit: boolean;
  failureReportPath: string;
}

interface ImportFailure {
  key: string;
  reason: string;
}

async function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../.env"),
    path.resolve(process.cwd(), "../../.env"),
  ];
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
  const sourceDir = path.resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ?? "F:/Desktop/pic/pic");
  const defaultReportName = `old-pic-import-failures-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  return {
    sourceDir,
    apiBase: (argValue("api-base") ?? process.env.PIC_IMPORT_API_BASE ?? "http://localhost:3000").replace(/\/$/, ""),
    token: argValue("token") ?? process.env.ACCESS_TOKEN ?? "",
    commit: process.argv.includes("--commit"),
    failureReportPath: path.resolve(sourceDir, argValue("failure-report") || defaultReportName),
  };
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

  const dataPath = path.join(args.sourceDir, "data.json");
  const storeDir = path.join(args.sourceDir, "store");
  const data = JSON.parse(await fs.readFile(dataPath, "utf8")) as Record<string, OldPicItem>;
  const entries = Object.entries(data);
  const failures: ImportFailure[] = [];
  let imported = 0;
  let existing = 0;
  let missing = 0;

  for (const [key, item] of entries) {
    const sourceFile = path.join(storeDir, item.name ?? key);
    const buffer = await fs.readFile(sourceFile).catch(() => undefined);
    if (!buffer) {
      missing++;
      failures.push({ key, reason: "本地文件不存在或不可读取" });
      continue;
    }

    if (args.commit) {
      try {
        const result = await postImage(args, {
          contentBase64: buffer.toString("base64"),
          tags: Array.from(new Set((item.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
        });
        if (result.existed) existing++;
        else imported++;
      } catch (error) {
        failures.push({ key, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    if ((imported + existing + missing + failures.length) % 200 === 0) {
      console.log(`progress imported=${imported}, existing=${existing}, missing=${missing}, failed=${failures.length}`);
    }
  }

  if (failures.length > 0) {
    await fs.writeFile(args.failureReportPath, JSON.stringify({ sourceDir: args.sourceDir, failures }, null, 2), "utf8");
  }

  console.log(
    JSON.stringify(
      {
        mode: args.commit ? "commit" : "dry-run",
        apiBase: args.apiBase,
        total: entries.length,
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
