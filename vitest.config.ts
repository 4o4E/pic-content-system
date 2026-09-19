import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "packages/frontend/src") },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "packages/**/*.db.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/backend/src/**/*.ts", "packages/shared/src/**/*.ts"],
      exclude: ["**/*.test.ts", "packages/backend/src/main.ts"],
    },
  },
});
