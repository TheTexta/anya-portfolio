# Anya portfolio

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro, TypeScript, Tailwind CSS, and npm. No frontend framework or UI library; use Tailwind classes for visual styling. ProseMirror supports the limited paragraph editor. Vercel server routes connect the optional CMS to Supabase Auth/Postgres and R2 preview-image storage.

## Product Purpose

A minimal personal portfolio introducing Anya Kasuri and linking directly to her media work and organisations.

## Capabilities and Constraints

- Preserve the supplied introductory paragraph as the initial content and CMS-disabled fallback. Approved site editors may subsequently edit it through `/admin`.
- Centre the paragraph horizontally and vertically. The approved plan interprets “2/5” as a 40%-wide desktop paragraph; reduce gutters on smaller screens.
- Link relevant projects and organisations throughout the paragraph directly to their destinations from Anya’s Linktree, rather than adding on-page work sections. Keep references without a verified destination unlinked.
- Dotted underlines identify links. Custom hover and keyboard-focus previews have square corners, a 1px black border, relevant imagery where available, and one concise sentence.
- Use Inter throughout, black text, and a white background, as specified in the approved plan.
- Keep administration to one protected paragraph/link-preview editing page, with visual inline linking, optional image uploads, preview, and explicit publication. Site-specific account access is required; other sites' administrators are not implicitly authorized.
- Production database, account grants, and R2/shared-delivery configuration were activated with owner approval on 2026-11-09. Application deployment and acceptance evidence are tracked in `docs/admin-cms.md`.
- The public repository is `TheTexta/anya-portfolio`; the production Vercel origin is `https://anya-portfolio-liard.vercel.app`.

## Evidence on Hand

- Introductory copy and destinations: <https://linktr.ee/anyakasuri>.
- TVM: <https://www.tvmtelevision.com/>.
- Post-Credits: <https://www.tvmtelevision.com/post-credits>.
- McGill Wine Society: <https://www.instagram.com/mcgillwinesociety/>.
- Typeface: <https://rsms.me/inter/>.
