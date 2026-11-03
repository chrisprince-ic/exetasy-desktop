import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, "src/main/index.ts") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(import.meta.dirname, "src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    plugins: [react()],
    build: {
      // root is src/renderer, so outDir must be pinned back to desktop/out.
      outDir: resolve(import.meta.dirname, "out/renderer"),
      emptyOutDir: true,
      rollupOptions: { input: resolve(import.meta.dirname, "src/renderer/index.html") },
    },
  },
});
