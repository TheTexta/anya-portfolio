import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { backendConfig, cmsEnabled, env } from "./config.server";
import { parseDocument, type PortfolioRecord } from "./content";
import { defaultDocument } from "./default-content";
import { HttpError } from "./http.server";

export function sessionClient(cookies: AstroCookies, request: Request) {
  const { url, key } = backendConfig();
  // Supabase can read cookies again after signing in during this same request
  // (for example when an unapproved account must immediately be signed out).
  const jar = new Map(parseCookieHeader(request.headers.get("cookie") || "")
    .map(({ name, value }) => [name, value || ""]));
  return createServerClient(url, key, {
    cookieOptions: { path: "/", sameSite: "lax", httpOnly: true, secure: import.meta.env.PROD },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value, options }) => {
        jar.set(name, value);
        cookies.set(name, value, options);
      }),
    },
  });
}

export function serviceClient() {
  const { url } = backendConfig();
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new HttpError(503, "Image uploads are not configured yet.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireEditor(cookies: AstroCookies, request: Request) {
  const client = sessionClient(cookies, request);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new HttpError(401, "Your session has ended. Sign in again before publishing.");
  const { data: allowed, error: membershipError } = await client.rpc("anya_is_editor");
  if (membershipError) throw new HttpError(503, "Editor access could not be checked. Try again shortly.");
  if (allowed !== true) throw new HttpError(403, "This account does not have access to Anya’s portfolio.");
  return { client, user };
}

export async function loadPortfolio(): Promise<PortfolioRecord> {
  if (!cmsEnabled()) return { document: structuredClone(defaultDocument), revision: 0, updated_at: null };
  const { url, key } = backendConfig();
  // No session cookies here: the public response is identical for every visitor.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from("anya_portfolio_content")
    .select("document, revision, updated_at").eq("id", true).single();
  if (error || !data) throw new HttpError(503, "The portfolio is temporarily unavailable.");
  return { document: parseDocument(data.document), revision: data.revision, updated_at: data.updated_at };
}
