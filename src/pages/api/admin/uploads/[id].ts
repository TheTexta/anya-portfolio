import type { APIRoute } from "astro";
import { requireEditor, serviceClient } from "../../../../lib/cms/backend.server";
import { env } from "../../../../lib/cms/config.server";
import { assertSameOrigin, errorResponse, json } from "../../../../lib/cms/http.server";
import { finishUpload, readPrivatePreview } from "../../../../lib/cms/storage.server";

export const POST: APIRoute = async ({ request, cookies, params }) => {
  try {
    assertSameOrigin(request, env("SITE_URL"));
    const { user } = await requireEditor(cookies, request);
    return json(await finishUpload(serviceClient(), user.id, params.id || ""));
  } catch (error) { return errorResponse(error); }
};

export const GET: APIRoute = async ({ request, cookies, params }) => {
  try {
    await requireEditor(cookies, request);
    const bytes = await readPrivatePreview(serviceClient(), params.id || "");
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
};
