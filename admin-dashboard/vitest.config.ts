import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@babyblue/ui": path.resolve(__dirname, "../packages/ui/src"),
      "@babyblue/api-client": path.resolve(__dirname, "../packages/api-client/src"),
      "@babyblue/pglite-demo": path.resolve(__dirname, "../packages/pglite-demo/src"),
      "@babyblue/flow-demo": path.resolve(__dirname, "../packages/flow-demo/src"),
      "@babyblue/utils": path.resolve(__dirname, "../packages/utils/src"),
    },
  },
  test: {
    pool: "forks",
    fileParallelism: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
