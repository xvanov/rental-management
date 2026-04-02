import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ["./env-setup.ts", "./global-setup.ts"],
    include: ["lifecycle/full-lifecycle.test.ts"],
    root: __dirname,
    reporters: ["verbose"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
    },
  },
});
