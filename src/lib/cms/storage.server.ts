import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, imageBaseUrl, uploadsEnabled } from "./config.server";
import { uploadedImageIds, UUID, type PortfolioDocument } from "./content";
import { HttpError } from "./http.server";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, normalizePreview } from "./images.server";

function storage() {
  if (!uploadsEnabled()) throw new HttpError(503, "Image uploads are not configured yet. Existing images can still be used.");
  imageBaseUrl();
  const staging = env("R2_STAGING_BUCKET")!;
  const published = env("R2_PUBLISHED_BUCKET")!;
  if (staging === published) throw new HttpError(503, "Private and published image storage must be separate.");
  return {
    client: new S3Client({
      region: "auto", endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env("R2_ACCESS_KEY_ID")!, secretAccessKey: env("R2_SECRET_ACCESS_KEY")! },
      requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    }),
    staging, published,
  };
}

async function readObject(client: S3Client, bucket: string, key: string, maxBytes: number) {
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (!head.ContentLength || head.ContentLength > maxBytes) throw new HttpError(400, "The image is empty or too large. Choose an image no larger than 5 MB.");
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new HttpError(400, "The upload is incomplete. Upload the image again.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    length += chunk.length;
    if (length > maxBytes) throw new HttpError(400, "The uploaded image is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function startUpload(service: SupabaseClient, userId: string, input: Record<string, unknown>) {
  if (!IMAGE_TYPES.includes(input.type as typeof IMAGE_TYPES[number]) || !Number.isInteger(input.size) ||
      (input.size as number) < 1 || (input.size as number) > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, "Choose a JPEG, PNG, or WebP image no larger than 5 MB.");
  }
  const { client, staging } = storage();
  const id = randomUUID();
  const { error } = await service.from("anya_portfolio_assets").insert({ id, created_by: userId });
  if (error) throw new HttpError(503, "The upload could not be started. Try again.");
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: staging, Key: `incoming/${id}`, ContentType: input.type as string,
    ContentLength: input.size as number,
  }), { expiresIn: 120 });
  return { id, url };
}

export async function finishUpload(service: SupabaseClient, userId: string, id: string) {
  if (!UUID.test(id)) throw new HttpError(400, "This upload could not be found.");
  const { data: asset, error } = await service.from("anya_portfolio_assets").select("id, status, width, height")
    .eq("id", id).eq("created_by", userId).single();
  if (error || !asset) throw new HttpError(404, "This upload could not be found. Upload the image again.");
  if (asset.status !== "pending") return { id, width: asset.width, height: asset.height };
  const { client, staging } = storage();
  const original = await readObject(client, staging, `incoming/${id}`, MAX_UPLOAD_BYTES);
  const normalized = await normalizePreview(original);
  await client.send(new PutObjectCommand({
    Bucket: staging, Key: `ready/${id}.webp`, Body: normalized.bytes, ContentType: "image/webp",
    Metadata: { sha256: createHash("sha256").update(normalized.bytes).digest("hex") },
  }));
  const { error: updateError } = await service.from("anya_portfolio_assets").update({
    status: "ready", width: normalized.width, height: normalized.height,
    sha256: createHash("sha256").update(normalized.bytes).digest("hex"),
  }).eq("id", id).eq("status", "pending");
  if (updateError) throw new HttpError(503, "The image could not be saved. Upload it again before publishing.");
  return { id, width: normalized.width, height: normalized.height };
}

export async function readPrivatePreview(service: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw new HttpError(404, "Image not found.");
  const { data } = await service.from("anya_portfolio_assets").select("status").eq("id", id).single();
  if (!data || data.status === "pending") throw new HttpError(404, "Image not found.");
  const { client, staging } = storage();
  return readObject(client, staging, `ready/${id}.webp`, MAX_UPLOAD_BYTES);
}

// R2 writes finish before the transactional database publish. A failure never replaces
// the previous document. Unreferenced objects are retained for explicit owner cleanup.
export async function promoteImages(service: SupabaseClient, document: PortfolioDocument) {
  const ids = uploadedImageIds(document);
  if (!ids.length) return;
  const { client, staging, published } = storage();
  const { data, error } = await service.from("anya_portfolio_assets").select("id, status, sha256").in("id", ids);
  if (error || data?.length !== ids.length || data.some((asset) => asset.status === "pending")) {
    throw new HttpError(400, "Wait for every image to finish uploading before publishing.");
  }
  for (const asset of data) {
    if (asset.status === "published") continue;
    const bytes = await readObject(client, staging, `ready/${asset.id}.webp`, MAX_UPLOAD_BYTES);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new HttpError(503, "An image could not be verified. Upload it again.");
    await client.send(new PutObjectCommand({
      Bucket: published, Key: `previews/${asset.id}.webp`, Body: bytes, ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable", Metadata: { sha256: asset.sha256 },
    }));
    const verification = await readObject(client, published, `previews/${asset.id}.webp`, MAX_UPLOAD_BYTES);
    if (createHash("sha256").update(verification).digest("hex") !== asset.sha256) throw new HttpError(503, "The published image could not be verified. Try again.");
    const { error: updateError } = await service.from("anya_portfolio_assets").update({ status: "published" }).eq("id", asset.id);
    if (updateError) throw new HttpError(503, "Image publication could not be confirmed. Try again.");
  }
}
