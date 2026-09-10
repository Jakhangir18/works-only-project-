import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Absolute URLs in the Open Graph tags are resolved against this, so it has to
// be the address a person can actually open, and it has to be the address of
// the build that is running.
//
//   production  VERCEL_PROJECT_PRODUCTION_URL — the stable domain. Not
//               VERCEL_URL, which is the per-deployment hostname and 404s once
//               the deployment is superseded.
//   preview     VERCEL_URL — the preview's own hostname, so a shared preview
//               link previews the preview and not the live site.
//   local, CI   the production domain. The previous fallback was
//               https://localhost:4321, which shipped a whole branch of link
//               previews pointing at the reader's own machine.
//
// SITE_URL overrides all of it, which is how a custom domain arrives.
const vercelSite =
  process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;

const site =
  process.env.SITE_URL ||
  (vercelSite ? `https://${vercelSite}` : 'https://works-only-project.vercel.app');

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
