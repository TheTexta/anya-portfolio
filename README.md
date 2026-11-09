# Anya portfolio

A minimal Astro + Tailwind CSS portfolio for Anya Kasuri, with a custom protected paragraph editor at `/admin`. Inter is self-hosted through Fontsource. All visual styling uses Tailwind utility classes; the stylesheet only imports Tailwind and registers the font family. Astro's Vercel adapter provides on-demand rendering; no frontend framework is used.

## Develop

Use Node.js 22.23.4 or a newer Node 22 release (`.nvmrc` is pinned; Vercel also uses Node 22).

```sh
npm ci
npm run dev
```

```sh
npm run check   # Astro and TypeScript diagnostics
npm test        # Content, images, mocked storage, and isolated SQL/RLS tests
npm run test:e2e # Browser tests with local test fixtures (Chrome)
npm run build   # Vercel server/static output in .vercel/output/
```

## Content and interaction

- `/admin` edits the paragraph, linked phrases, destinations, hover-preview details, and images. Changes are private to the editing tab until **Publish changes**. Supabase email/password login and explicit Anya-only account access are required.
- The CMS is disabled by default. `src/lib/cms/default-content.ts` preserves the current paragraph and bundled previews until configuration is explicitly enabled. The editor shows a setup message rather than an unprotected demo.
- `src/components/PreviewLink.astro` contains the reusable preview and a small vanilla-JavaScript controller. Hover or keyboard focus opens a preview; Escape dismisses it. Links remain normal navigable links on touch devices and without JavaScript.
- The introduction occupies the middle 40% of desktop screens, with smaller gutters on tablets and phones.
- The initial paragraph links TVM, Post-Credits, and MWS. TVM and Post-Credits use bundled preview images; MWS starts with a text-only preview. Other existing image assets are retained but are not part of the current rendered paragraph. No third-party embeds are loaded. Image sources are recorded in `src/assets/SOURCES.md`.
- Production origin: <https://anya-portfolio-liard.vercel.app>; administration: `/admin`. See [docs/admin-cms.md](docs/admin-cms.md) and `.env.example` for schema, authentication, R2, local testing, and release evidence. The database, approved account grant, production environment, and published-only R2 delivery were configured with owner approval on 2026-11-09. Analytics are not added.
