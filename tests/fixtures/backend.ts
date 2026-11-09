// Loopback-only Supabase-shaped fixture. Never imported by application code.
import { createServer } from "node:http";
import { defaultDocument } from "../../src/lib/cms/default-content";
import { parseDocument } from "../../src/lib/cms/content";

let document = structuredClone(defaultDocument);
let revision = 0;
let failPublish = false;
const editor = "00000000-0000-4000-8000-000000000001";
const outsider = "00000000-0000-4000-8000-000000000002";
const token = (id: string) => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
  "local-test-signature",
].join(".");

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  const url = new URL(request.url || "/", "http://127.0.0.1:54329");
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  const authorization = request.headers.authorization || "";
  let userId: string | undefined;
  try { userId = JSON.parse(Buffer.from(authorization.split(".")[1] || "", "base64url").toString()).sub; } catch { /* no test session */ }
  const user = (id: string) => ({ id, email: id === editor ? "anya@example.test" : "other@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  const send = (status: number, value: unknown) => { response.statusCode = status; response.end(JSON.stringify(value)); };
  if (url.pathname === "/health") return send(200, {});
  if (url.pathname === "/__reset") {
    document = structuredClone(defaultDocument); revision = 0; failPublish = false;
    return send(200, {});
  }
  if (url.pathname === "/__state") {
    if (body.bumpRevision) revision++;
    if (typeof body.failPublish === "boolean") failPublish = body.failPublish;
    return send(200, { document, revision });
  }
  if (url.pathname === "/auth/v1/token") {
    if (body.password !== "test-password") return send(400, { error_code: "invalid_credentials", msg: "Invalid credentials" });
    const id = body.email === "anya@example.test" ? editor : outsider;
    return send(200, { access_token: token(id), refresh_token: `local-test-${id}`, expires_in: 3600, token_type: "bearer", user: user(id) });
  }
  if (url.pathname === "/auth/v1/user") return userId ? send(200, user(userId)) : send(401, { msg: "No session" });
  if (url.pathname === "/auth/v1/logout") { response.statusCode = 204; return response.end(); }
  if (url.pathname === "/rest/v1/rpc/anya_is_editor") return send(200, userId === editor);
  if (url.pathname === "/rest/v1/anya_portfolio_content") return send(200, { document, revision, updated_at: new Date().toISOString() });
  if (url.pathname === "/rest/v1/rpc/anya_publish_portfolio") {
    if (userId !== editor) return send(403, { code: "42501" });
    if (failPublish) return send(503, { code: "fixture_unavailable" });
    if (body.p_revision !== revision) return send(409, { code: "40001" });
    document = parseDocument(body.p_document);
    revision++;
    return send(200, { revision, updated_at: new Date().toISOString() });
  }
  send(404, { error: "Unknown fixture route" });
}).listen(54329, "127.0.0.1");
