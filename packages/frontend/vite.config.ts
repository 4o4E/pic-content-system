import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, repoRoot, "");
  const backendTarget = env.VITE_DEV_API_TARGET ?? process.env.VITE_DEV_API_TARGET ?? `http://localhost:${env.PORT ?? process.env.PORT ?? "3000"}`;

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
