import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.MASKI_BASE ?? "/",
  build: {
    target: "es2025",
    cssTarget: "esnext",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { main: "index.html", zh: "zh-CN/index.html" },
    },
  },
  server: { port: 5173, strictPort: true },
  worker: { format: "es" },
});
