import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(rootDir, "src/shared"),
      "@renderer": resolve(rootDir, "src/renderer"),
      "@main": resolve(rootDir, "src/main"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
