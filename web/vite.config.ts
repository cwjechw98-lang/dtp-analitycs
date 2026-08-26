import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages для репозитория <user>/<repo> отдаёт сайт из подпапки /<repo>/,
// поэтому базовый путь фиксирован и совпадает с именем репозитория.
export default defineConfig({
  base: "/dtp-analitycs/",
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
