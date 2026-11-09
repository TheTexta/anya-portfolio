import type { APIRoute } from "astro";
import { sessionClient } from "../../../lib/cms/backend.server";
import { env } from "../../../lib/cms/config.server";
import { assertSameOrigin, errorResponse, HttpError } from "../../../lib/cms/http.server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    assertSameOrigin(request, env("SITE_URL"));
    const { error } = await sessionClient(cookies, request).auth.signOut({ scope: "local" });
    if (error) throw new HttpError(503, "Sign out failed. Try again.");
    return redirect("/admin", 303);
  } catch (error) { return errorResponse(error); }
};
