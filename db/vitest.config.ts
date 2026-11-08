import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@babyblue/pglite-demo": path.resolve(__dirname, "../packages/pglite-demo/src"),
      "@babyblue/utils": path.resolve(__dirname, "../packages/utils/src"),
      "@babyblue/api-client": path.resolve(__dirname, "../packages/api-client/src"),
    },
  },
  test: {
    pool: "forks",
    fileParallelism: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
