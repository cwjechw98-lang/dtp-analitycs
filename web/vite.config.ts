import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages для репозитория <user>/<repo> отдаёт сайт из подпапки /<repo>/,
// поэтому базовый путь фиксирован и совпадает с именем репозитория.
export default defineConfig({
  // Cloudflare Pages отдаёт из корня, зеркало GitHub Pages — из /<repo>/.
  base: process.env.BASE_PATH ?? "/dtp-analitycs/",
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
