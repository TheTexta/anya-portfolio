import type { APIRoute } from "astro";
import { requireEditor, serviceClient } from "../../../lib/cms/backend.server";
import { env } from "../../../lib/cms/config.server";
import { assertSameOrigin, errorResponse, json, readJson } from "../../../lib/cms/http.server";
import { startUpload } from "../../../lib/cms/storage.server";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    assertSameOrigin(request, env("SITE_URL"));
    const { user } = await requireEditor(cookies, request);
    return json(await startUpload(serviceClient(), user.id, await readJson(request)), 201);
  } catch (error) { return errorResponse(error); }
};
