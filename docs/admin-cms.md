# Paragraph CMS

## Scope and status

`/admin` is an invitation-only, single-page editor for the introductory paragraph,
inline links, hover-preview titles/descriptions, and optional preview images.
It keeps Astro, vanilla TypeScript, Tailwind utilities, and the public design.
ProseMirror supplies selection, text editing, and paragraph undo/redo; there is no
frontend framework or arbitrary-HTML/page-builder capability.

**The Anya-only database migration, approved existing-account grant, production
environment, and published-only R2 delivery were configured with owner approval
on 2026-11-09.** Application deployment acceptance is recorded below.
`CMS_ENABLED` defaults to false. In that state the public site renders the original
paragraph from `src/lib/cms/default-content.ts`; `/admin` reports incomplete setup
and disables sign-in. That fallback is not a backup of later CMS edits.

## Editing

- Type in the paragraph; select words and choose **Add link**. Select a linked
  phrase or its button below the paragraph to edit its destination and preview.
- **Unlink** keeps the words. Undo/redo covers paragraph text, link marks, preview
  details, and image selection. Undoing an upload only changes the selection; it
  never deletes the retained image bytes.
- Paste imports plain text, with line breaks replaced by spaces. One paragraph,
  at most 20,000 UTF-16 code units, 50 links, and 500 text runs is supported. Text
  limits consistently use browser/JavaScript UTF-16 units in the database as well.
- Destinations must be complete HTTP(S) links without embedded credentials.
  Preview titles are required; descriptions are optional. Images need alt text.
- TVM/Post-Credits bundled images remain selectable. Upload a JPEG, PNG, or WebP
  of at most 5 MiB and 24 megapixels. Animated images and SVG are not accepted.
- **Preview paragraph** is an inline preview, not a navigation or publish action.
  Linked phrases select their preview in the adjacent details area.
- **Publish changes** explicitly replaces the published document. A stale tab
  cannot overwrite a newer revision. A failure leaves local edits and the prior
  published document intact. Leaving with edits invokes the browser's native
  unsaved-change warning. Draft text is not saved across closing/reloading tabs.
- On session expiry, keep the editing tab open, sign in in another tab at the
  same origin, then retry. Sign-out only ends this browser's session, not sessions
  for other sites using the shared identity provider.

## Storage and authorization

The site-specific migration is
`supabase/migrations/202611090001_anya_portfolio_cms.sql`. It creates:

- `private.anya_portfolio_editors`: explicit Supabase Auth user IDs for this site.
  No users are granted access by the migration. Other sites' admin metadata or
  permissions have no effect here.
- `public.anya_portfolio_content`: one published structured JSON document,
  revision, and publication timestamp. Anonymous/authenticated readers can select
  only the public content columns; direct writes are not granted.
- `public.anya_publish_portfolio`: authenticated, membership-checked,
  database-validated publication with a row lock and expected-revision check.
- `public.anya_portfolio_assets`: server-managed upload validation/availability
  records. Neither anonymous nor authenticated clients can forge image attestations.

RLS and narrow grants protect the tables. Only the upload lifecycle uses the
server-only Supabase service-role key, after server-verified site membership;
ordinary content publication runs with the signed-in user's JWT. The key grants
broad privileges on the shared Supabase instance, so restrict it to server
environments and keep it out of logs, browser bundles, screenshots, and commits.
No shared cross-project membership migration is introduced by this feature.

Session cookies are HTTP-only, SameSite=Lax, and Secure in production. The server
validates users through Supabase Auth and rechecks site membership for every
protected request. State-changing requests require an exact configured Origin;
no mutation happens on GET. Admin pages/responses are private/no-store, noindex,
non-frameable, and use no arbitrary user-authored HTML. The public page never
uses an administrator's session or cookies for its content read.

## Image lifecycle

Use two **Anya-only**, private R2 buckets and credentials scoped to those buckets.
The approved production buckets are `anya-portfolio-staging` and `anya-portfolio`.
Both use the default jurisdiction and ENAM location. Do not reuse another site's
buckets or keys.

1. An authorized request creates a pending asset and a 120-second signed PUT to
   the private staging bucket at `incoming/<uuid>`. The browser sends directly to
   R2, avoiding Vercel's function-request body limit.
2. The authenticated finalizer bounds the actual bytes, decodes the image, checks
   dimensions/format/animation, strips metadata, and re-encodes to WebP at a maximum
   1024×1024 inside fit. It records dimensions and SHA-256 for the distinct private
   `ready/<uuid>.webp` object. Reusing the original signed PUT cannot alter this
   validated output.
3. `/api/admin/uploads/<uuid>` GET is an authenticated, no-store staging preview.
   Staging is never publicly bound or served. Replacement failure retains the
   previous selection.
4. Publish copies only verified ready bytes to `previews/<uuid>.webp` in the
   published bucket, reads them back and checks SHA-256, then marks availability.
   The content RPC refuses unvalidated/unpublished asset IDs and commits the
   document only after image promotion succeeds.
5. Published image URLs are immutable under `R2_PUBLIC_BASE_URL`. Public delivery
   must serve only the published bucket. Publishing explicitly makes these image
   bytes public, even if a later document commit conflicts/fails; that can leave
   unreferenced published objects, but never an incomplete replacement paragraph.

No automated deletions or bucket lifecycle rules are installed. Originals,
validated staging images, replaced images, and failed/unreferenced uploads are
retained. Cleanup and deletion require a separate inventory and owner approval.
This is not a reusable media library or an asset-revocation system.

## Setup and activation gates (owner approval required)

### Database initialization completed — 2026-11-09

- Applied `202611090001_anya_portfolio_cms.sql` and granted the owner-approved
  existing Auth account access to Anya only. The shared account, its password,
  metadata, and other sites' memberships were not changed. Account identifiers
  are deliberately not recorded in this public repository.
- Recorded version `202611090001`, name `anya_portfolio_cms`, and the exact source
  in the existing `supabase_migrations.schema_migrations` ledger. The migration,
  grant, ledger entry, and PostgREST schema-reload notification committed in one
  transaction. Do not replay the non-idempotent migration against this instance.
- Applied source SHA-256:
  `0c08fc4d61aaaa55661e27768064e415295c3accbb8cd65906afa69eb44d0107`.
- Production's existing `private` schema and migration ledger are owned by
  `supabase_admin`. Apply through that authorized migration owner; do not broaden
  `private` schema permissions for the ordinary `postgres` role. The initial
  restricted-role attempt rolled back fully before the owner-role application.
- Read-only live checks confirmed one editor, one valid seeded paragraph at
  revision 0, no uploaded assets, and RLS enabled on all three Anya tables.
  Authenticated-role checks returned true for the approved editor and false for
  an ungranted identity. Anonymous publish/editor RPC access, direct authenticated
  content writes, private membership reads, and asset writes were denied.
- The isolated migration/RLS regression test passed before application. No real
  password login, browser editing, image upload, or deployed-site acceptance was
  attempted. Environment/R2 configuration and deployment remain separate gates.

### Activation procedure

1. Confirm the final Vercel project/origin, account(s), and approved migration.
   Back up any existing Anya CMS data before modifying an already-installed schema.
   The new migration touches only its named Anya objects; do not replay other
   sites' migrations or change shared Auth settings.
2. For a new instance, apply the migration once through the approved Supabase
   migration process. On the shared production instance, this step is already
   complete; verify the ledger rather than replaying the file.
   Create/identify the approved Supabase Auth account out of band; do not put its
   password in source or agent messages. Grant only its verified UUID, for example:

   ```sql
   insert into private.anya_portfolio_editors (user_id)
   values ('<approved-auth-user-uuid>');
   ```

   Revocation removes this Anya-only row; it does not disable the shared account.
3. Copy `.env.example` to an ignored local environment file. Configure
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and exact `SITE_URL` (the actual development
   origin locally; the canonical HTTPS origin in production). Set
   `CMS_ENABLED=true` only once the schema/grant checks pass. Confirm Supabase Auth
   login rate limits; add site-scoped login abuse protection in Vercel if needed,
   without altering other projects' shared Auth policies.
4. Provision the two private R2 buckets, disable public r2.dev access, issue an
   Anya-scoped credential, and configure the server-only R2 variables and
   `SUPABASE_SERVICE_ROLE_KEY`. The app refuses identical staging/published bucket
   names. Do not expose any of these values through PUBLIC_* variables.
5. Configure staging CORS for the exact approved app origin(s), method PUT, and
   request header Content-Type. Never enable public staging delivery. Signed
   URLs expire in 120 seconds; retry a failed transfer rather than retaining URLs.
6. Set up and verify an Anya-only published image prefix. If using the shared
   `images.dextery.dev/anya-portfolio` delivery target, all Worker/configuration
   work belongs to `../dextery-infrastructure`, requires separate approval, and
   must include existing-project regression checks. Bind **only** the published
   bucket; restrict to the intended `previews/<uuid>.webp` keys. No Worker changes
   are included here. Set `R2_PUBLIC_BASE_URL` to that verified HTTPS prefix.
7. Deploy only after approval. Verify signed-out denial, approved/non-approved
   users, text publication, two-tab conflicts, real browser upload/CORS,
   authenticated staging preview, public byte delivery, and anonymous staging
   denial. Retain rollback data and do not delete existing media.

### Production configuration and media release — 2026-11-09

- Vercel project: `anya-portfolio` (`prj_cHvnMuC8ClBIotR2gQCs9cuiFSO6`) in
  `thetextas-projects`. Canonical origin and `SITE_URL`:
  `https://anya-portfolio-liard.vercel.app`. Node 22 matches the tested local
  runtime; production is public while preview deployments retain Vercel protection.
- All eleven variables in `.env.example` are configured for **production only**.
  The two Supabase credentials and two R2 credential values are sensitive/server-only.
  Local development and unconfigured previews retain the disabled CMS fallback.
- The R2 account-owned production credential is restricted to object read/write
  on these two Anya buckets. Standard AWS SDK checks returned 200 for each Anya
  bucket and 403 AccessDenied for an unrelated existing bucket. No broad account
  bucket-management permission was granted.
- Both buckets have public r2.dev access disabled and no bucket custom domains.
  Staging CORS allows only PUT and Content-Type from the exact production origin;
  signed PUT and browser-style preflight passed (200/204) with SHA-256 read-back.
- Published delivery is live under `https://images.dextery.dev/anya-portfolio`
  and `https://media.dextery.dev/anya-portfolio`. Shared Worker version
  `1db6124b-5844-48c0-a2e6-c06ea1821a30` serves 100%; prior version
  `05101250-19be-4f94-833a-4fdfa2f1db53` is retained for rollback. The only added
  zone route is `images.dextery.dev/anya-portfolio/*`; only the published bucket
  is bound. The private infrastructure repository owns this release and its tests.
- One 44-byte 8×8 grey WebP commissioning object is retained at
  `previews/a6a742db-7e2a-4bcd-8efc-7a83b3cc99f8.webp` in published R2, with a
  private copy at `incoming/a6a742db-7e2a-4bcd-8efc-7a83b3cc99f8` in staging.
  These are operator probes, not CMS uploads or paragraph references. No original,
  existing image, paragraph, or publication revision was changed by these checks.
- Both delivery hosts passed original-byte checksum, WebP MIME, HEAD, 304, range,
  transform, and private/noncanonical path-denial checks. Ten existing-project
  original/transform/legacy sample URLs retained identical bytes and ETags across
  the Worker deployment. Detailed evidence is in the private infrastructure repo's
  `docs/anya-portfolio-delivery.md`.
- Temporary verification variables were removed before deployment. The unused
  setup token was revoked with owner confirmation; only the SDK-verified production
  credential is retained. No Supabase/R2 secret values were written to project
  files or Git; any CLI-managed local authentication file remains ignored.
- Live public Supabase SDK reads passed for the seeded content (revision 0) and
  server-only asset metadata (zero rows). Real owner password login, session
  refresh, and authenticated browser publication/upload acceptance remain to be
  performed by the owner; no password was requested or changed and no substitute
  account or production session was created for testing.

Text/link editing and bundled-image selection work without R2 configuration;
uploads are visibly disabled until the image configuration is present. Once
uploaded images are referenced, the service key and R2 configuration are required
for subsequent publish requests as well.

## Rendering, failure, and recovery

The Vercel adapter renders `/`, `/admin`, and API routes on demand. No redeploy is
needed for content edits. The public page is no-store so a successful publication
is visible on the next request; immutable images remain cacheable. Enabling the
CMS introduces a Supabase dependency on public requests. If that read fails, the
site returns a non-cacheable 503 rather than silently resurrecting outdated copy.

Before activation, retain a deployment rollback and the seeded JSON. For later
content rollback, export the current content row to secure storage before an
approved replacement. Version history/restore UI is intentionally not included.
Disabling `CMS_ENABLED` deliberately shows the original source paragraph, **not**
the most recently published CMS document. No existing bundled assets are deleted.

## Local verification

```sh
npm run check
npm test
npm run test:e2e
npm run build
npm audit
```

Unit tests cover content/editor round trips, escaping, origin/body validation,
image normalization, and mocked R2 validation/promotion/read-back failures.
PGlite runs the actual SQL in isolated in-memory Postgres with test Auth roles;
it never connects to the shared Supabase server. Playwright uses a loopback-only
Supabase-shaped fixture and intercepted browser uploads, never production.
It starts an untracked Astro server on port 4322 using `--ignore-lock`, preserving
an existing developer server. Ports 4322/54329 must be free. Chrome is the default;
set `PLAYWRIGHT_CHANNEL=chromium` with a locally installed Playwright Chromium
instead if preferred. Real R2 CORS, deployed Supabase/PostgREST integration, and
public Worker delivery still require the separately approved acceptance run.

The Vercel adapter's transitive `@vercel/routing-utils` path-to-regexp dependency
is overridden to patched 6.3+, and `@vercel/nft` glob to 14.0.4+, to avoid the
upstream pinned vulnerabilities. Recheck these overrides when updating the adapter.
