import type { APIRoute } from "astro";
import { projects } from "../data/projects";

/**
 * The public routes: the home and every listed case page. The unlisted
 * pages, /tunnel/ and the endpoints are not here, and their own pages say
 * noindex. Built once, like the rest of the site.
 */
export const GET: APIRoute = ({ site }) => {
  // astro.config.mjs always sets `site`.
  const urls = ["/", ...projects.map((p) => p.href)].map((path) => new URL(path, site!).href);
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    "\n</urlset>\n";
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
