# Anya portfolio

A minimal, static Astro + Tailwind CSS portfolio for Anya Kasuri. Inter is self-hosted through Fontsource. All visual styling uses Tailwind utility classes; the stylesheet only imports Tailwind and registers the font family.

## Develop

Use Node.js 22.23.4 or newer.

```sh
npm ci
npm run dev
```

```sh
npm run check   # Astro and TypeScript diagnostics
npm run build   # Static output in dist/
npm run preview # Preview the production build
```

## Content and interaction

- Edit the introduction and three destinations in `src/pages/index.astro`.
- `src/components/PreviewLink.astro` contains the reusable preview and a small vanilla-JavaScript controller. Hover or keyboard focus opens a preview; Escape dismisses it. Links remain normal navigable links on touch devices and without JavaScript.
- The introduction occupies the middle 40% of desktop screens, with smaller gutters on tablets and phones.
- TVM and Post-Credits previews use local images; MWS uses a text-only summary to avoid an Instagram embed. Image sources are recorded in `src/assets/SOURCES.md`.
- No backend, credentials, analytics, or deployment integration is needed.
