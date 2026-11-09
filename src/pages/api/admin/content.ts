import type { APIRoute } from "astro";
import { requireEditor, serviceClient } from "../../../lib/cms/backend.server";
import { env } from "../../../lib/cms/config.server";
import { parseDocument, uploadedImageIds } from "../../../lib/cms/content";
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from "../../../lib/cms/http.server";
import { promoteImages } from "../../../lib/cms/storage.server";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    assertSameOrigin(request, env("SITE_URL"));
    const { client } = await requireEditor(cookies, request);
    const input = await readJson(request);
    const document = parseDocument(input.document);
    if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) throw new HttpError(400, "Reload the paragraph before publishing.");
    // Detect stale tabs before copying images; the RPC also checks under a row lock.
    const { data: current, error: readError } = await client.from("anya_portfolio_content").select("revision").eq("id", true).single();
    if (readError) throw new HttpError(503, "The paragraph could not be read. Try again.");
    if (current?.revision !== input.revision) throw new HttpError(409, "The paragraph changed in another tab. Copy your edits, then reload before publishing.");
    if (uploadedImageIds(document).length) await promoteImages(serviceClient(), document);
    const { data, error } = await client.rpc("anya_publish_portfolio", { p_document: document, p_revision: input.revision });
    if (error?.code === "40001") throw new HttpError(409, "The paragraph changed in another tab. Copy your edits, then reload before publishing.");
    if (error) throw new HttpError(503, "The paragraph could not be published. Your changes are still in this editor. Try again.");
    return json(data);
  } catch (error) { return errorResponse(error); }
};
