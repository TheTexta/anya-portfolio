import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { defaultDocument } from "../src/lib/cms/default-content";
import { parseDocument } from "../src/lib/cms/content";

test("isolated Postgres: publication, RLS, site membership, assets, and stale-write protection", async () => {
  const db = new PGlite();
  const editor = "00000000-0000-4000-8000-000000000001";
  const outsider = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      insert into auth.users values ('${editor}'), ('${outsider}');
    `);
    const migration = await readFile(new URL("../supabase/migrations/202611090001_anya_portfolio_cms.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const seeded = await db.query<{ document: unknown }>("select document from public.anya_portfolio_content");
    assert.deepEqual(seeded.rows[0]!.document, defaultDocument);
    await db.exec(`insert into private.anya_portfolio_editors(user_id) values ('${editor}')`);

    await db.exec("set role anon");
    assert.equal((await db.query("select document from public.anya_portfolio_content")).rows.length, 1);
    await assert.rejects(db.query("select updated_by from public.anya_portfolio_content"));
    await assert.rejects(db.query("update public.anya_portfolio_content set revision = 10"));
    await assert.rejects(db.query("select * from public.anya_portfolio_assets"));
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(defaultDocument)]));

    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${outsider}'`);
    assert.equal((await db.query<{ allowed: boolean }>("select public.anya_is_editor() as allowed")).rows[0]!.allowed, false);
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(defaultDocument)]));
    await assert.rejects(db.query("select * from private.anya_portfolio_editors"));

    await db.exec(`set request.jwt.claim.sub = '${editor}'`);
    assert.equal((await db.query<{ allowed: boolean }>("select public.anya_is_editor() as allowed")).rows[0]!.allowed, true);
    await assert.rejects(db.query("update public.anya_portfolio_content set revision = 10"));
    await assert.rejects(db.query("insert into public.anya_portfolio_assets(id, created_by) values ($1, $2)", [editor, editor]));
    const edited = structuredClone(defaultDocument);
    for (const href of ["https://user:pass@example.com/", "https://", "https://example.com:99999/", "https://999.1.1.1/", "https://foo.123/", "javascript:alert(1)"]) {
      const invalid = structuredClone(edited);
      invalid.links[0]!.href = href;
      await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(invalid)]));
    }
    for (const value of ["\u0001", "\u000b", "\u001f"]) {
      const invalid = structuredClone(edited);
      invalid.links[0]!.summary = value;
      await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(invalid)]));
    }
    for (const [field, size] of [["title", 81], ["summary", 301], ["imageAlt", 101]] as const) {
      const invalid = structuredClone(edited);
      invalid.links[0]![field] = "🖤".repeat(size);
      assert.throws(() => parseDocument(invalid));
      await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(invalid)]));
    }
    const longParagraph = structuredClone(edited);
    longParagraph.segments[0]!.text = "🖤".repeat(10001);
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(longParagraph)]));
    edited.segments[0]!.text = "Edited paragraph. ";
    edited.links[0]!.title = "🖤".repeat(80);
    await db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(edited)]);
    const stored = await db.query<{ document: unknown }>("select document from public.anya_portfolio_content");
    assert.doesNotThrow(() => parseDocument(stored.rows[0]!.document));
    assert.equal((await db.query<{ revision: number }>("select revision from public.anya_portfolio_content")).rows[0]!.revision, 1);
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 0)", [JSON.stringify(defaultDocument)]));
    edited.links[0]!.href = "javascript:alert(1)";
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 1)", [JSON.stringify(edited)]));
    edited.links[0]!.href = defaultDocument.links[0]!.href;
    edited.links[0]!.image = { kind: "upload", id: editor };
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 1)", [JSON.stringify(edited)]));

    await db.exec("reset role; set role service_role");
    await db.query("insert into public.anya_portfolio_assets(id, created_by, status, width, height, sha256) values ($1, $1, 'ready', 512, 512, $2)", [editor, "a".repeat(64)]);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${editor}'`);
    await assert.rejects(db.query("select public.anya_publish_portfolio($1::jsonb, 1)", [JSON.stringify(edited)]));
    await db.exec(`reset role; set role service_role; update public.anya_portfolio_assets set status = 'published'`);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${editor}'`);
    await db.query("select public.anya_publish_portfolio($1::jsonb, 1)", [JSON.stringify(edited)]);
    assert.equal((await db.query<{ revision: number }>("select revision from public.anya_portfolio_content")).rows[0]!.revision, 2);
  } finally { await db.close(); }
});
