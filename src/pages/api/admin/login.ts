import type { APIRoute } from "astro";
import { sessionClient } from "../../../lib/cms/backend.server";
import { env } from "../../../lib/cms/config.server";
import { assertSameOrigin, errorResponse, HttpError, readBody } from "../../../lib/cms/http.server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request, env("SITE_URL"));
    if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") throw new HttpError(415, "Use the sign-in form.");
    const form = new URLSearchParams(await readBody(request, 4096));
    const email = form.get("email")?.trim() || "";
    const password = form.get("password") || "";
    if (!email || email.length > 254 || !password || password.length > 1024) return redirect("/admin?error=login", 303);
    const client = sessionClient(cookies, request);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return redirect("/admin?error=login", 303);
    const { data: allowed, error: accessError } = await client.rpc("anya_is_editor");
    if (accessError || allowed !== true) {
      await client.auth.signOut({ scope: "local" });
      return redirect("/admin?error=access", 303);
    }
    return redirect("/admin", 303);
  } catch (error) { return errorResponse(error); }
};
