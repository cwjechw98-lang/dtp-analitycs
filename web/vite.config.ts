import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Базовый путь определяется автоматически:
 *  · Cloudflare Pages — из корня (/) — Cloudflare задаёт CF_PAGES=1 при сборке;
 *  · GitHub Pages — из подпапки /<repo>/ (собирается в GitHub Actions);
 *  · локально — переопределяется переменной BASE_PATH при необходимости.
 * Так деплой не зависит от ручной настройки переменных на хостингах.
 */
const base =
  process.env.BASE_PATH ??
  (process.env.CF_PAGES === "1" || process.env.CF_PAGES ? "/" : "/dtp-analytics/");

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
