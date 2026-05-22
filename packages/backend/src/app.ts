import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, type AppConfig } from "./config/env.js";
import { registerAssetRoutes } from "./modules/asset/routes.js";
import { registerAuthGuard, registerAuthRoutes } from "./modules/auth/routes.js";
import { registerFileRoutes } from "./modules/file/routes.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerIngestRoutes } from "./modules/ingest/routes.js";
import { registerMediaRoutes } from "./modules/media/routes.js";
import { registerTagRoutes } from "./modules/tag/routes.js";

async function registerFrontendRoutes(app: FastifyInstance, config: AppConfig) {
  const staticRoot = path.resolve(process.cwd(), config.frontendDistDir);
  const indexFile = path.join(staticRoot, "index.html");
  if (!fs.existsSync(indexFile)) return;

  await app.register(fastifyStatic, {
    root: staticRoot,
    prefix: "/",
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/health" || pathname.startsWith("/api/")) {
      return reply.code(404).send({ success: false, message: "接口不存在" });
    }
    reply.type("text/html; charset=utf-8");
    return fs.createReadStream(indexFile);
  });
}

export async function createApp(config: AppConfig = loadConfig()) {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app, config);
  registerAuthGuard(app, config);
  await registerMediaRoutes(app);
  await registerAssetRoutes(app);
  await registerTagRoutes(app);
  await registerIngestRoutes(app);
  await registerFileRoutes(app, config);
  await registerFrontendRoutes(app, config);

  return app;
}
