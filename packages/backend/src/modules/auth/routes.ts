import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiResp, AuthSessionDto } from "@pic/shared";
import type { AppConfig } from "../../config/env.js";

function tokenFromRequest(request: FastifyRequest) {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  const header = request.headers["x-access-token"];
  if (header) return Array.isArray(header) ? header[0] : header;
  return new URL(request.url, "http://localhost").searchParams.get("token") ?? undefined;
}

export function registerAuthGuard(app: FastifyInstance, config: AppConfig) {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (url === "/health" || url === "/api/auth/session") return;

    if (!config.accessToken) {
      await reply.code(500).send({ success: false, message: "服务端未配置 ACCESS_TOKEN" } satisfies ApiResp);
      return;
    }

    if (tokenFromRequest(request) !== config.accessToken) {
      await reply.code(401).send({ success: false, message: "访问 token 无效" } satisfies ApiResp);
    }
  });
}

export async function registerAuthRoutes(app: FastifyInstance, config: AppConfig) {
  app.post<{ Body: { token?: string }; Reply: ApiResp<AuthSessionDto> }>("/api/auth/session", async (request, reply: FastifyReply) => {
    if (!config.accessToken) {
      return reply.code(500).send({ success: false, message: "服务端未配置 ACCESS_TOKEN" });
    }
    if (request.body?.token !== config.accessToken) {
      return reply.code(401).send({ success: false, message: "访问 token 无效" });
    }
    return { success: true, message: "ok", data: { ok: true } };
  });
}
