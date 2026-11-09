export type PreviewImage =
  | { kind: "bundled"; id: "tvm" | "post-credits" }
  | { kind: "upload"; id: string };

export interface PortfolioLink {
  id: string;
  href: string;
  title: string;
  summary: string;
  image: PreviewImage | null;
  imageAlt: string;
}

export interface PortfolioDocument {
  version: 1;
  segments: { text: string; linkId?: string }[];
  links: PortfolioLink[];
}

export interface PortfolioRecord {
  document: PortfolioDocument;
  revision: number;
  updated_at: string | null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINK_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export class ContentError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentError("The paragraph has an invalid format. Reload and try again.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) {
    throw new ContentError(`${name} must be text of no more than ${max} characters.`);
  }
  if (required && !value.trim()) throw new ContentError(`${name} is required.`);
  return value;
}

export function safeLink(value: unknown): string {
  const href = text(value, "Link address", 2048, true).trim();
  try {
    const url = new URL(href);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new ContentError("Enter a complete https:// or http:// link without a username or password.");
  }
}

export function parseDocument(value: unknown): PortfolioDocument {
  const doc = object(value);
  if (doc.version !== 1 || !Array.isArray(doc.segments) || !Array.isArray(doc.links) ||
      doc.segments.length > 500 || doc.links.length > 50) {
    throw new ContentError("Use one paragraph with no more than 50 links.");
  }

  const ids = new Set<string>();
  const links = doc.links.map((value): PortfolioLink => {
    const link = object(value);
    const id = text(link.id, "Link identifier", 64, true);
    if (!LINK_ID.test(id) || ids.has(id)) throw new ContentError("Each link must have a unique identifier.");
    ids.add(id);
    let image: PreviewImage | null = null;
    if (link.image !== null) {
      const candidate = object(link.image);
      if (candidate.kind === "bundled" && (candidate.id === "tvm" || candidate.id === "post-credits")) {
        image = { kind: "bundled", id: candidate.id };
      } else if (candidate.kind === "upload" && typeof candidate.id === "string" && UUID.test(candidate.id)) {
        image = { kind: "upload", id: candidate.id };
      } else {
        throw new ContentError("Choose an existing preview image or upload a new one.");
      }
    }
    return {
      id,
      href: safeLink(link.href),
      title: text(link.title, "Preview title", 160, true).trim(),
      summary: text(link.summary, "Preview description", 600).trim(),
      image,
      imageAlt: text(link.imageAlt, "Image description", 200, image !== null).trim(),
    };
  });

  const used = new Set<string>();
  const segments: PortfolioDocument["segments"] = [];
  let length = 0;
  for (const value of doc.segments) {
    const segment = object(value);
    const valueText = text(segment.text, "Paragraph", 20000);
    length += valueText.length;
    let linkId: string | undefined;
    if (segment.linkId !== undefined) {
      if (!valueText) throw new ContentError("A linked phrase cannot be empty.");
      linkId = text(segment.linkId, "Linked phrase", 64, true);
      if (!ids.has(linkId)) throw new ContentError("A linked phrase is missing its link details.");
      used.add(linkId);
    }
    if (!valueText) continue;
    const previous = segments.at(-1);
    if (previous && previous.linkId === linkId) previous.text += valueText;
    else segments.push(linkId ? { text: valueText, linkId } : { text: valueText });
  }
  if (length > 20000 || !segments.some((segment) => segment.text.trim())) {
    throw new ContentError("Write a paragraph of between 1 and 20,000 characters.");
  }
  if (links.some((link) => !used.has(link.id))) throw new ContentError("Remove unused link details before publishing.");
  return { version: 1, segments, links };
}

export function uploadedImageIds(document: PortfolioDocument): string[] {
  return [...new Set(document.links.flatMap((link) => link.image?.kind === "upload" ? [link.image.id] : []))];
}

export function serializedForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
