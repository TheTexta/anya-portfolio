import { ContentError } from "./content";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertSameOrigin(request: Request, configuredOrigin?: string): void {
  if (!configuredOrigin && import.meta.env?.PROD) throw new HttpError(503, "The site address is not configured yet.");
  const expected = new URL(configuredOrigin || request.url).origin;
  if (request.headers.get("origin") !== expected) throw new HttpError(403, "This request did not come from the editor. Reload and try again.");
}

export async function readBody(request: Request, limit: number): Promise<string> {
  if (Number(request.headers.get("content-length")) > limit) throw new HttpError(413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "The request is empty.");
  const decoder = new TextDecoder();
  let result = "";
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "This request is too large.");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    throw new HttpError(415, "Send this request as JSON.");
  }
  try {
    const value = JSON.parse(await readBody(request, 96_000));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "The request could not be read. Reload and try again.");
  }
}

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ContentError) return json({ error: error.message }, 400);
  console.error("CMS request failed; no content was published.");
  return json({ error: "The request failed. Your published paragraph has not been replaced. Try again." }, 503);
}
