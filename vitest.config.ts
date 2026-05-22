import { defineConfig } from "vitest/config";

export default defineConfig({
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
