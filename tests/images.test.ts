import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { normalizePreview, MAX_UPLOAD_BYTES } from "../src/lib/cms/images.server";

test("preview images are resized and re-encoded as metadata-free WebP", async () => {
  const original = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "white" } }).jpeg().withMetadata().toBuffer();
  const result = await normalizePreview(original);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(result.width, 1024);
  assert.equal(result.height, 512);
  assert.equal(metadata.exif, undefined);
});

test("empty, malformed, oversized, SVG and excessive-pixel images are rejected", async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from("not an image"), Buffer.alloc(MAX_UPLOAD_BYTES + 1), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')]) {
    await assert.rejects(normalizePreview(bytes));
  }
  const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(normalizePreview(oversized));
});
