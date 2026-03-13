import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/main/index.ts",
        onstart({ startup: startElectron }) {
          void startElectron();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            lib: {
              entry: "src/main/index.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              output: {
                format: "cjs",
              },
            },
          },
        },
      },
      {
        entry: "src/main/preload.ts",
        onstart({ reload }) {
          reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            sourcemap: true,
            lib: {
              entry: "src/main/preload.ts",
              formats: ["cjs"],
              fileName: () => "preload.cjs",
            },
            rollupOptions: {
              output: {
                format: "cjs",
              },
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      "@shared": resolve(rootDir, "src/shared"),
      "@renderer": resolve(rootDir, "src/renderer"),
      "@main": resolve(rootDir, "src/main"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
