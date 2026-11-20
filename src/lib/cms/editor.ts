import { Schema, type Node as EditorNode } from "prosemirror-model";
import type { PortfolioDocument, PortfolioLink } from "./content";

export const paragraphSchema = new Schema({
  nodes: {
    doc: { content: "paragraph" },
    paragraph: { content: "text*", toDOM: () => ["p", 0], parseDOM: [{ tag: "p" }] },
    text: { group: "inline" },
  },
  marks: {
    link: {
      attrs: { id: {}, details: {} }, inclusive: false,
      toDOM: (mark) => ["span", { "data-link-id": mark.attrs.id, class: "underline decoration-dotted underline-offset-4" }, 0],
      // Clipboard HTML is deliberately not imported. Pasted text is always plain.
    },
  },
});

export function toEditorDocument(document: PortfolioDocument): EditorNode {
  const links = new Map(document.links.map((link) => [link.id, link]));
  return paragraphSchema.node("doc", null, paragraphSchema.node("paragraph", null,
    document.segments.filter((segment) => segment.text).map((segment) => paragraphSchema.text(
      segment.text, segment.linkId ? [paragraphSchema.mark("link", { id: segment.linkId, details: structuredClone(links.get(segment.linkId)) })] : [],
    )),
  ));
}

export function fromEditorDocument(doc: EditorNode): PortfolioDocument {
  const segments: PortfolioDocument["segments"] = [];
  const links = new Map<string, PortfolioLink>();
  doc.firstChild?.forEach((node) => {
    const mark = node.marks.find((mark) => mark.type.name === "link");
    const id = mark?.attrs.id as string | undefined;
    if (mark && id) links.set(id, structuredClone(mark.attrs.details));
    segments.push(id ? { text: node.text || "", linkId: id } : { text: node.text || "" });
  });
  return { version: 1, segments, links: [...links.values()] };
}
