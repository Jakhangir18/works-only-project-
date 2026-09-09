import { defineConfig } from "astro/config";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://localhost:4321",

  scopedStyleStrategy: "class",

  server: {
    host: "127.0.0.1",
  },

  vite: {
    server: {
      allowedHosts: [".ts.net"],
    },
    resolve: {
      alias: {
        "@/": `${path.resolve(__dirname, "src")}/`,
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use 'sass:math'; @use 'sass:map'; @use "@/styles/import" as *;`,
        },
      },
    },
    build: {
      assetsInlineLimit: 0,
    },
  },

  devToolbar: {
    enabled: false,
  },
});
