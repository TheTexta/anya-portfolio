import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { test, mock } from "node:test";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { startUpload, finishUpload, promoteImages } from "../src/lib/cms/storage.server";
import { defaultDocument } from "../src/lib/cms/default-content";

interface Asset { id: string; created_by?: string; status: string; sha256?: string; width?: number; height?: number }

function fixture() {
  Object.assign(process.env, {
    CMS_ENABLED: "true", SUPABASE_SERVICE_ROLE_KEY: "local-test", R2_ACCOUNT_ID: "local-test",
    R2_ACCESS_KEY_ID: "local-test", R2_SECRET_ACCESS_KEY: "local-test",
    R2_STAGING_BUCKET: "private-test", R2_PUBLISHED_BUCKET: "published-test", R2_PUBLIC_BASE_URL: "https://images.example.test/anya",
  });
  const objects = new Map<string, Buffer>();
  const assets: Asset[] = [];
  let failPut = false;
  let corruptPublished = false;
  mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof HeadObjectCommand) return { ContentLength: objects.get(`${command.input.Bucket}/${command.input.Key}`)?.length };
    if (command instanceof GetObjectCommand) {
      const key = `${command.input.Bucket}/${command.input.Key}`;
      const bytes = objects.get(key);
      if (!bytes) throw new Error("Missing test object");
      return { Body: Readable.from([corruptPublished && key.startsWith("published-test/") ? Buffer.from("corrupt") : bytes]) };
    }
    if (command instanceof PutObjectCommand) {
      if (failPut) throw new Error("Fixture write failure");
      objects.set(`${command.input.Bucket}/${command.input.Key}`, Buffer.from(command.input.Body as Uint8Array));
      return {};
    }
    throw new Error("Unexpected storage call: no network access is allowed in this test");
  });
  const service = {
    from: () => ({
      insert: async (row: Asset) => { assets.push({ ...row, status: "pending" }); return { error: null }; },
      select: () => {
        const filters: [string, unknown][] = [];
        const query = {
          eq: (name: string, value: unknown) => { filters.push([name, value]); return query; },
          single: async () => ({ data: assets.find((asset) => filters.every(([name, value]) => asset[name as keyof Asset] === value)), error: null }),
          in: async (_: string, ids: string[]) => ({ data: assets.filter((asset) => ids.includes(asset.id)), error: null }),
        };
        return query;
      },
      update: (patch: Partial<Asset>) => {
        const filters: [string, unknown][] = [];
        const query = {
          eq: (name: string, value: unknown) => { filters.push([name, value]); return query; },
          then: (resolve: (value: { error: null }) => void) => {
            assets.filter((asset) => filters.every(([name, value]) => asset[name as keyof Asset] === value))
              .forEach((asset) => Object.assign(asset, patch));
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return query;
      },
    }),
  } as unknown as SupabaseClient;
  return { objects, assets, service, failWrites: () => { failPut = true; }, corruptReadback: () => { corruptPublished = true; } };
}

test("signed uploads target staging; finalization and publication verify normalized bytes", async () => {
  const f = fixture();
  try {
    const original = await sharp({ create: { width: 80, height: 40, channels: 3, background: "white" } }).png().toBuffer();
    const started = await startUpload(f.service, "test-user", { type: "image/png", size: original.length });
    const signed = new URL(started.url);
    assert(signed.hostname.startsWith("private-test.") && signed.pathname.startsWith("/incoming/"));
    assert.equal(new URL(started.url).searchParams.get("X-Amz-Expires"), "120");
    f.objects.set(`private-test/incoming/${started.id}`, original);
    await finishUpload(f.service, "test-user", started.id);
    const ready = f.objects.get(`private-test/ready/${started.id}.webp`)!;
    assert.equal((await sharp(ready).metadata()).format, "webp");
    assert.equal(f.assets[0]!.status, "ready");
    const doc = structuredClone(defaultDocument);
    doc.links[0]!.image = { kind: "upload", id: started.id };
    await promoteImages(f.service, doc);
    assert.equal(f.assets[0]!.status, "published");
    assert.deepEqual(f.objects.get(`published-test/previews/${started.id}.webp`), ready);
    assert.equal(f.assets[0]!.sha256, createHash("sha256").update(ready).digest("hex"));
  } finally { mock.restoreAll(); }
});

test("unvalidated uploads, transfer failures and corrupt read-back are never marked published", async () => {
  for (const mode of ["pending", "write-failure", "corrupt-readback"] as const) {
    const f = fixture();
    try {
      const id = "00000000-0000-4000-8000-000000000003";
      const bytes = Buffer.from("verified fixture bytes");
      f.assets.push({ id, status: mode === "pending" ? "pending" : "ready", sha256: createHash("sha256").update(bytes).digest("hex") });
      f.objects.set(`private-test/ready/${id}.webp`, bytes);
      if (mode === "write-failure") f.failWrites();
      if (mode === "corrupt-readback") f.corruptReadback();
      const doc = structuredClone(defaultDocument);
      doc.links[0]!.image = { kind: "upload", id };
      await assert.rejects(promoteImages(f.service, doc));
      assert.notEqual(f.assets[0]!.status, "published");
    } finally { mock.restoreAll(); }
  }
});
