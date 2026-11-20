import assert from "node:assert/strict";
import { test } from "node:test";
import { closeHistory, history, redo, undo } from "prosemirror-history";
import { EditorState } from "prosemirror-state";
import type { PortfolioLink } from "../src/lib/cms/content";
import { defaultDocument } from "../src/lib/cms/default-content";
import { fromEditorDocument, paragraphSchema, toEditorDocument } from "../src/lib/cms/editor";

function createState() {
  return EditorState.create({ doc: toEditorDocument(defaultDocument), plugins: [history()] });
}

function replaceDetails(state: EditorState, details: PortfolioLink, separate = true) {
  const transaction = state.tr.setMeta("linkDetails", true);
  const mark = paragraphSchema.mark("link", { id: details.id, details: structuredClone(details) });
  state.doc.descendants((node, pos) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "link" && mark.attrs.id === details.id)) {
      transaction.addMark(pos, pos + node.nodeSize, mark);
    }
  });
  return state.apply(separate ? closeHistory(transaction) : transaction);
}

test("conversion snapshots do not share mutable link or image details", () => {
  const input = structuredClone(defaultDocument);
  const doc = toEditorDocument(input);
  input.links[0]!.title = "Changed outside the editor";
  input.links[0]!.image!.id = "post-credits";
  const snapshot = fromEditorDocument(doc);
  assert.deepEqual(snapshot, defaultDocument);
  snapshot.links[0]!.summary = "Changed snapshot";
  snapshot.links[0]!.image!.id = "post-credits";
  assert.deepEqual(fromEditorDocument(doc), defaultDocument);
});

test("field edits serialize from the supplied document through existing undo and redo steps", () => {
  const original = createState();
  const link = fromEditorDocument(original.doc).links[0]!;
  let state = replaceDetails(original, { ...link, title: "New title" });
  const firstEdit = fromEditorDocument(state.doc);
  state = replaceDetails(state, { ...link, title: "New title continued" }, false);
  const edited = fromEditorDocument(state.doc);
  assert.equal(edited.links[0]!.title, "New title continued");
  assert.deepEqual(edited.segments, defaultDocument.segments);
  assert.deepEqual(fromEditorDocument(original.doc), defaultDocument);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), firstEdit);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), defaultDocument);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), firstEdit);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), edited);
});

test("paragraph typing keeps its history group separate from link detail edits", () => {
  let state = createState();
  state = state.apply(state.tr.insertText("Hello ", 1));
  state = state.apply(state.tr.insertText("Anya. ", 7));
  const typed = fromEditorDocument(state.doc);
  assert.equal(typed.segments[0]!.text, `Hello Anya. ${defaultDocument.segments[0]!.text}`);
  state = replaceDetails(state, { ...typed.links[0]!, summary: "New summary" });
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), typed);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), defaultDocument);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), typed);
});

test("image replacement and removal retain independent history and author descriptions", () => {
  let state = createState();
  const link = fromEditorDocument(state.doc).links[0]!;
  const replacement: PortfolioLink = {
    ...link, image: { kind: "upload", id: "12345678-1234-1234-1234-123456789abc" },
    imageAlt: "Author’s image description",
  };
  state = replaceDetails(state, replacement);
  const replaced = fromEditorDocument(state.doc);
  assert.deepEqual(replaced.links[0], replacement);
  state = replaceDetails(state, { ...replacement, image: null, imageAlt: "" });
  const removed = fromEditorDocument(state.doc);
  assert.equal(removed.links[0]!.image, null);
  assert.equal(removed.links[0]!.imageAlt, "");
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), replaced);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), defaultDocument);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), replaced);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), removed);
});

test("unlink drops details without changing text and undo restores link identity", () => {
  let state = createState();
  const transaction = state.tr;
  state.doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (mark.type.name === "link" && mark.attrs.id === "tvm") {
        transaction.removeMark(pos, pos + node.nodeSize, mark);
      }
    }
  });
  state = state.apply(transaction);
  const unlinked = fromEditorDocument(state.doc);
  assert.deepEqual(unlinked.links, defaultDocument.links.slice(1));
  assert(!unlinked.segments.some((segment) => segment.linkId === "tvm"));
  assert.equal(state.doc.textContent, toEditorDocument(defaultDocument).textContent);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), defaultDocument);
  assert(redo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), unlinked);
});

test("separate phrases sharing a link serialize one current set of details", () => {
  const input = structuredClone(defaultDocument);
  input.segments.push({ text: " and " }, { text: "TVM again", linkId: "tvm" });
  let state = EditorState.create({ doc: toEditorDocument(input), plugins: [history()] });
  const link = { ...input.links[0]!, summary: "Updated for both phrases" };
  state = replaceDetails(state, link);
  const edited = fromEditorDocument(state.doc);
  assert.deepEqual(edited.links, [link, ...input.links.slice(1)]);
  assert.deepEqual(edited.segments, input.segments);
  assert(undo(state, (transaction) => { state = state.apply(transaction); }));
  assert.deepEqual(fromEditorDocument(state.doc), input);
});
