import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadConfig, type AppConfig } from "./config/env.js";
import { registerAssetRoutes } from "./modules/asset/routes.js";
import { registerAuthGuard, registerAuthRoutes } from "./modules/auth/routes.js";
import { registerFileRoutes } from "./modules/file/routes.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerIngestRoutes } from "./modules/ingest/routes.js";
import { registerMediaRoutes } from "./modules/media/routes.js";
import { registerTagRoutes } from "./modules/tag/routes.js";

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

  return app;
}
