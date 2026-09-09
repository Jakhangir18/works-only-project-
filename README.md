# Jakhangir Tynshimov — portfolio

Minimal Astro site: a hero, a numbered list of selected work with hover previews, one page per project, about, contact. Design decisions live in `docs/design-spec.md`.

```bash
npm ci
npm run dev        # http://127.0.0.1:4321
npm run build      # dist/
npm run preview -- --port 4347
./init.sh          # type check + build + sizes
```

Projects are Markdown files in `src/content/work/`; media in `public/projects/<slug>/`.
