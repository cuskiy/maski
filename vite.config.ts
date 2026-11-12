import { defineConfig } from "vite";
import { config } from "./src/app/config.ts";

export default defineConfig({
  base: config.app.basePath,
  build: {
    target: "es2025",
    // Current browsers only: no downlevelled CSS and therefore no vendor prefixes
    // that the source does not contain.
    cssTarget: "esnext",
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: "index.html",
        zh: "zh-CN/index.html",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  worker: {
    format: "es",
  },
});
