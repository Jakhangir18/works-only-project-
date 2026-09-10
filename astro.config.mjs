import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Absolute URLs in the Open Graph tags are resolved against this, so it has to
// be the address a person can actually open. VERCEL_URL is the per-deployment
// hostname (works-only-project-abc123-....vercel.app), which changes on every
// push and 404s once the deployment is superseded; VERCEL_PROJECT_PRODUCTION_URL
// is the stable one. Local and CI builds have neither, and used to fall back to
// https://localhost:4321 — every link preview shipped pointing at the reader's
// own machine. Falling back to the production domain keeps the cards correct
// wherever the build runs. SITE_URL overrides all of it for a custom domain.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://works-only-project.vercel.app');

export default defineConfig({
  site,

  scopedStyleStrategy: 'class',

  server: {
    host: true,
  },

  vite: {
    resolve: {
      alias: {
        '@/': `${path.resolve(__dirname, 'src')}/`
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use 'sass:math'; @use 'sass:map'; @use "@/styles/import" as *;`
        }
      }
    },
    build: {
      assetsInlineLimit: 0
    }
  },

  devToolbar: {
    enabled: false
  }
});
