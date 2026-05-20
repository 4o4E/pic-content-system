import type { FastifyInstance } from "fastify";
import type { ApiResp } from "@pic/shared";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get<{ Reply: ApiResp<{ name: string; status: string }> }>("/health", async () => {
    return {
      success: true,
      message: "ok",
      data: {
        name: "pic-content-system",
        status: "ready",
      },
    };
  });
}
