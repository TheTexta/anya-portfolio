import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument, safeLink, serializedForHtml } from "../src/lib/cms/content";
import { defaultDocument } from "../src/lib/cms/default-content";
import { fromEditorDocument, toEditorDocument } from "../src/lib/cms/editor";

test("the seed and editor round trip preserve the current paragraph and link metadata", () => {
  const content = parseDocument(defaultDocument);
  assert.deepEqual(content, defaultDocument);
  assert.deepEqual(fromEditorDocument(toEditorDocument(content), new Map(content.links.map((link) => [link.id, link]))), content);
});

test("linked text is structural, not substring matching", () => {
  const doc = structuredClone(defaultDocument);
  doc.segments = [{ text: "TVM " }, { text: "TVM", linkId: "tvm" }, { text: " 🖤 Anya’s work" }];
  doc.links = doc.links.slice(0, 1);
  assert.deepEqual(parseDocument(doc).segments, doc.segments);
});

test("unsafe destinations and arbitrary image URLs are rejected", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,hi", "//example.com", "https://user:pass@example.com", "file:///etc/passwd"]) {
    assert.throws(() => safeLink(href));
  }
  assert.equal(safeLink("https://example.com/path?q=hello"), "https://example.com/path?q=hello");
  const doc = structuredClone(defaultDocument);
  Object.assign(doc.links[0]!, { image: { kind: "url", id: "https://internal.invalid" } });
  assert.throws(() => parseDocument(doc));
});

test("missing, duplicate, orphaned links and excessive content are rejected", () => {
  const doc = structuredClone(defaultDocument);
  doc.links.push(doc.links[0]!);
  assert.throws(() => parseDocument(doc));
  doc.links.pop();
  doc.segments[1]!.linkId = "missing";
  assert.throws(() => parseDocument(doc));
  doc.segments = [{ text: "Unlinked paragraph" }];
  assert.throws(() => parseDocument(doc));
  doc.links = [];
  doc.segments = [{ text: " " }];
  assert.throws(() => parseDocument(doc));
  doc.segments = [{ text: "x".repeat(20001) }];
  assert.throws(() => parseDocument(doc));
});

test("HTML-like copy stays text and cannot break out of serialized initial data", () => {
  const doc = structuredClone(defaultDocument);
  doc.segments[0]!.text = '</script><img src=x onerror="alert(1)">';
  assert.equal(parseDocument(doc).segments[0]!.text, doc.segments[0]!.text);
  assert(!serializedForHtml(doc).includes("<"));
  assert.deepEqual(JSON.parse(serializedForHtml(doc)), doc);
});
