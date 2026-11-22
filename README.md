# Anya portfolio

A minimal personal portfolio introducing Anya Kasuri and linking to her media work
and organisations, with an optional protected paragraph editor at `/admin`.

## Features

- A responsive, typography-led introduction with direct project links.
- Hover and keyboard-focus previews; links also work without JavaScript.
- An optional protected editor for text, links, and preview images, with explicit
  publication.

## Run locally

Use Node.js **22.23.4 or a newer 22.x release** and npm. `.nvmrc` selects Node 22.
From the repository root:

```sh
npm ci
npm run dev
```

Open <http://localhost:4321>. No environment variables or backend credentials are
needed for the bundled portfolio. The CMS defaults to disabled; `/admin` shows a
setup message instead of an unprotected demo.

For CMS development, copy [`.env.example`](.env.example) to an ignored `.env` file.
Follow the [activation procedure](docs/admin-cms.md#activation-procedure) for approved
schema/account setup and optional R2 uploads before setting `CMS_ENABLED=true`.
Set `SITE_URL` to the exact local origin. Keep service-role and R2 credentials
server-only; never expose them through `PUBLIC_*` variables or commit them.

## Checks

```sh
npm run check   # Astro and TypeScript diagnostics
npm test        # Unit and isolated database tests
npm run test:e2e # Local browser fixtures; Chrome by default
npm run build   # Production build
```

See [local verification](docs/admin-cms.md#local-verification) for browser alternatives
and required test ports. These local tests do not replace approved backend acceptance.

## Architecture and design

- Astro server rendering on Vercel, using TypeScript and vanilla JavaScript
  rather than a frontend framework.
- Tailwind utility styling and self-hosted Inter maintain the minimal
  black-and-white presentation.
- The optional CMS uses Supabase Auth/Postgres with site-specific editor access
  and separate private/published R2 image storage.

## Documentation

- [CMS guide](docs/admin-cms.md): editing, authorization, uploads, setup gates,
  recovery, and recorded deployment/acceptance evidence.
- [Design system](DESIGN.md) and [product scope](PRODUCT.md).
- [Image sources and attribution](src/assets/SOURCES.md).
