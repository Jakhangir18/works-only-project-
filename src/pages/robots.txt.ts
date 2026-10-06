import type { APIRoute } from "astro";

/** Everything may be crawled; the pages that should not be indexed say so
 *  themselves. The sitemap lists the public routes. */
export const GET: APIRoute = ({ site }) => {
  // astro.config.mjs always sets `site`.
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL("/sitemap.xml", site!).href}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
