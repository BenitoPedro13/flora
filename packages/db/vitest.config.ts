import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // A live testcontainers Postgres per run — see src/test/containers.ts.
    // Sequential, not parallel: the tests share one container and its data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
