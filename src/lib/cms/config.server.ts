import { HttpError } from "./http.server";

export function env(name: string): string | undefined {
  return process.env[name] || import.meta.env?.[name];
}

export function cmsEnabled(): boolean {
  return env("CMS_ENABLED") === "true";
}

export function backendConfig() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY");
  if (!cmsEnabled() || !url || !key) {
    throw new HttpError(503, "The editor is not configured yet. Ask the site owner to finish setup.");
  }
  return { url, key };
}

export function imageBaseUrl(): string {
  const value = env("R2_PUBLIC_BASE_URL");
  if (!value) throw new HttpError(503, "Image delivery is not configured yet.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new HttpError(503, "Image delivery is not configured correctly.");
  }
  return value.replace(/\/$/, "");
}

export function publicImageUrl(id: string): string {
  return `${imageBaseUrl()}/previews/${id}.webp`;
}

export function uploadsEnabled(): boolean {
  return cmsEnabled() && ["SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY", "R2_STAGING_BUCKET", "R2_PUBLISHED_BUCKET", "R2_PUBLIC_BASE_URL"]
    .every((name) => Boolean(env(name)));
}
