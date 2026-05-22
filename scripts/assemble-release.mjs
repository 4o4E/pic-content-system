import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const releaseRoot = path.join(root, "dist", "release", "pic-content-system");

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(source, target) {
  if (!(await exists(source))) throw new Error(`缺少 release 文件：${path.relative(root, source)}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDir(source, target) {
  if (!(await exists(source))) throw new Error(`缺少 release 目录：${path.relative(root, source)}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

await fs.rm(releaseRoot, { recursive: true, force: true });
await fs.mkdir(releaseRoot, { recursive: true });

for (const file of [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "README.md",
  ".env.production.example",
  "compose.yaml",
]) {
  await copyFile(path.join(root, file), path.join(releaseRoot, file));
}
await copyFile(path.join(root, ".dockerignore.dist"), path.join(releaseRoot, ".dockerignore"));
await copyFile(path.join(root, "Dockerfile.dist"), path.join(releaseRoot, "Dockerfile"));

await copyDir(path.join(root, "docker"), path.join(releaseRoot, "docker"));
await copyDir(path.join(root, "packages", "backend", "dist"), path.join(releaseRoot, "packages", "backend", "dist"));
await copyDir(path.join(root, "packages", "backend", "prisma"), path.join(releaseRoot, "packages", "backend", "prisma"));
await copyDir(path.join(root, "packages", "shared", "dist"), path.join(releaseRoot, "packages", "shared", "dist"));
await copyDir(path.join(root, "packages", "frontend", "dist"), path.join(releaseRoot, "packages", "backend", "public"));

for (const workspacePackage of ["backend", "shared"]) {
  await copyFile(
    path.join(root, "packages", workspacePackage, "package.json"),
    path.join(releaseRoot, "packages", workspacePackage, "package.json"),
  );
}

console.log(`release dist assembled: ${path.relative(root, releaseRoot)}`);
