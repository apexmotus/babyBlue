import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    pool: "forks",
    fileParallelism: false, environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 120_000 },
});
