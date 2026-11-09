import sharp from "sharp";
import { HttpError } from "./http.server";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function normalizePreview(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(400, "Choose an image no larger than 5 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning", animated: true });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "") || (metadata.pages || 1) > 1) throw new Error();
    // Re-encoding strips metadata and prevents serving the original untrusted bytes.
    const { data, info } = await image.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw new HttpError(400, "Choose a valid, still JPEG, PNG, or WebP image under 24 megapixels.");
  }
}
