import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSameOrigin, readJson } from "../src/lib/cms/http.server";

test("state-changing requests require the configured exact origin", () => {
  const request = (origin?: string) => new Request("https://spoofed.example/api/admin/content", { headers: origin ? { origin } : {} });
  assert.doesNotThrow(() => assertSameOrigin(request("https://anya.example"), "https://anya.example"));
  for (const origin of [undefined, "null", "https://evil.example", "https://anya.example.evil.example"]) {
    assert.throws(() => assertSameOrigin(request(origin), "https://anya.example"));
  }
});

test("JSON requests are typed, bounded and must contain an object", async () => {
  const request = (body: string, contentType = "application/json") => new Request("https://anya.example", { method: "POST", headers: { "Content-Type": contentType }, body });
  assert.deepEqual(await readJson(request('{"revision":0}')), { revision: 0 });
  for (const body of ["null", "[]", "not json", "x".repeat(96001)]) await assert.rejects(readJson(request(body)));
  await assert.rejects(readJson(request("{}", "text/plain")));
});
