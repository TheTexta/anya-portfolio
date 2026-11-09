---
version: 1
slug: "src-pages-admin-index-astro"
primary_target: "src/pages/admin/index.astro"
related_targets:
  - "src/components/AdminEditor.astro"
  - "src/layouts/AdminLayout.astro"
  - "src/scripts/admin-editor.ts"
---

# Portfolio editor

Mode: Operate. Audience: Anya, making occasional paragraph/link-preview edits without code.
Scope: protected sign-in, one visual editing page, optional preview-image uploads, and explicit publication.

## Direction contract

THESIS: The paragraph is the task. Show its editable text directly, with contextual link details instead of a dashboard, sidebar navigation, or page builder.

OWN-WORLD: Inherit the portfolio's white ground, black text, self-hosted Inter, dotted links, square 1px borders, and no decorative effects. Inputs and actions have explicit labels and keyboard focus; primary buttons and form fields have 44px minimum heights. Inline linked phrases retain the paragraph's natural line boxes.

STORY: Sign in, rewrite text, select words to link, adjust the selected link's preview, inspect an inline preview, then explicitly publish. Errors retain edits and explain recovery.

FIRST VIEWPORT: A compact title/action header sits above publication status. Paragraph tools and text own the wider desktop column; the selected link's fields and preview occupy the adjacent narrower column. At phone widths they stack in that reading order.

FORM: User-pinned simple editor in the established visual world; no new visual identity or concept tournament. seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Boundaries and states

The public paragraph-only composition remains unchanged. The CMS-disabled state is a setup message, never a bypass. Handle absent selection, no links, invalid destinations, upload validation/failure, session expiry, publishing, revision conflict, and success. See `docs/admin-cms.md` for operational boundaries and verification evidence.
