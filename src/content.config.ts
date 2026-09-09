import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const image = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const work = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/work" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    year: z.string(),
    kind: z.string(),
    role: z.string(),
    team: z.string().optional(),
    stack: z.array(z.string()),
    where: z.string().optional(),
    links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
    cover: image,
    gallery: z.array(image.extend({ caption: z.string().optional() })).optional(),
    order: z.number().int(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { work };
