import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.db.test.ts"],
    setupFiles: ["./vitest.db.setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
