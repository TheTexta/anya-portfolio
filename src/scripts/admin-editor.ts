import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo, closeHistory } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { editorLinks, fromEditorDocument, paragraphSchema, toEditorDocument } from "../lib/cms/editor";
import { parseDocument, type PortfolioLink, type PortfolioRecord } from "../lib/cms/content";

interface InitialData {
  record: PortfolioRecord;
  canUpload: boolean;
  bundled: Record<string, string>;
  uploaded: Record<string, string>;
}

const root = document.querySelector<HTMLElement>("#portfolio-editor");
if (root) initialize();

function initialize() {
  const data = JSON.parse(document.querySelector("#editor-data")!.textContent!) as InitialData;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const links = new Map(data.record.document.links.map((link) => [link.id, link]));
  const publish = get<HTMLButtonElement>("publish");
  const add = get<HTMLButtonElement>("add-link");
  const remove = get<HTMLButtonElement>("remove-link");
  const status = get("editor-status");
  const form = get<HTMLFormElement>("link-form");
  const fields = get<HTMLFieldSetElement>("link-fields");
  const imageChoice = get<HTMLSelectElement>("link-image");
  const imageUpload = get<HTMLInputElement>("image-upload");
  const uploadStatus = get("upload-status");
  let revision = data.record.revision;
  let saved = JSON.stringify(data.record.document);
  let activeId: string | undefined;
  let busy = false;
  let uploading = false;
  let preview = false;
  let lastList = "";
  let lastMessage = "All changes published.";
  let lastAction = "text";

  const view = new EditorView(get("paragraph-input"), {
    state: EditorState.create({
      doc: toEditorDocument(data.record.document),
      plugins: [history(), keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-y": redo }), keymap(baseKeymap)],
    }),
    attributes: { role: "textbox", "aria-label": "Portfolio paragraph", "aria-describedby": "paragraph-help", "aria-multiline": "false", spellcheck: "true" },
    dispatchTransaction(transaction) {
      if (transaction.docChanged && !transaction.getMeta("linkDetails")) {
        if (lastAction !== "text") transaction = closeHistory(transaction);
        lastAction = "text";
      }
      view.updateState(view.state.apply(transaction));
      if (transaction.docChanged) {
        links.clear();
        editorLinks(view.state.doc).forEach((link, id) => links.set(id, link));
      }
      refresh(transaction.docChanged && !transaction.getMeta("linkDetails"));
    },
    handlePaste(_, event) {
      const plain = event.clipboardData?.getData("text/plain");
      if (plain === undefined) return true;
      view.dispatch(view.state.tr.insertText(plain.replace(/[\r\n]+/g, " ")));
      return true;
    },
    handleDrop: () => true,
    handleKeyDown(_, event) {
      if (event.key !== "Enter") return false;
      view.dispatch(view.state.tr.insertText(" "));
      return true;
    },
  });

  function currentDocument() { return fromEditorDocument(view.state.doc, links); }
  function dirty() { return JSON.stringify(currentDocument()) !== saved || uploading; }

  function updateLink(link: PortfolioLink, action: string) {
    let transaction = view.state.tr.setMeta("linkDetails", true);
    if (lastAction !== action) transaction = closeHistory(transaction);
    lastAction = action;
    const mark = paragraphSchema.mark("link", { id: link.id, details: structuredClone(link) });
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((current) => current.type.name === "link" && current.attrs.id === link.id)) {
        transaction.addMark(pos, pos + node.nodeSize, mark);
      }
    });
    view.dispatch(transaction);
  }

  function selectLink(id: string, focusField = false) {
    let from = -1;
    let to = -1;
    view.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((mark) => mark.attrs.id === id)) {
        if (from < 0) from = pos;
        to = pos + node.nodeSize;
      }
    });
    if (from < 0) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    if (focusField) get<HTMLInputElement>("link-href").focus();
    else if (!preview) view.focus();
  }

  function selectedId(): string | undefined {
    const { $from } = view.state.selection;
    const mark = $from.marks().find((mark) => mark.type.name === "link") ||
      $from.nodeAfter?.marks.find((mark) => mark.type.name === "link");
    return mark?.attrs.id;
  }

  function imageUrl(link: PortfolioLink): string | undefined {
    if (link.image?.kind === "bundled") return data.bundled[link.image.id];
    if (link.image?.kind === "upload") return data.uploaded[link.image.id];
  }

  function refresh(forceFields = false) {
    const doc = currentDocument();
    const nextId = selectedId();
    const link = nextId ? links.get(nextId) : undefined;
    if (nextId !== activeId || forceFields) {
      activeId = nextId;
      if (link) {
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-field]").forEach((input) => {
          input.value = link[input.dataset.field as "href" | "title" | "summary" | "imageAlt"];
        });
        imageChoice.value = link.image?.kind === "bundled" ? link.image.id : link.image ? "upload" : "none";
        uploadStatus.textContent = "";
      }
    }
    form.hidden = !link;
    get("link-empty").hidden = Boolean(link);
    get("selected-preview").hidden = !link;
    if (link) {
      get("linked-words").textContent = doc.segments.filter((segment) => segment.linkId === link.id).map((segment) => segment.text).join(" … ");
      get("selected-title").textContent = link.title || "Preview title";
      get("selected-summary").textContent = link.summary;
      const image = get<HTMLImageElement>("selected-image");
      const src = imageUrl(link);
      if (src && image.getAttribute("src") !== src) image.src = src;
      if (!src) image.removeAttribute("src");
      image.alt = link.imageAlt;
      image.hidden = !src;
      get("image-alt-label").hidden = !link.image;
      get<HTMLInputElement>("link-image-alt").required = Boolean(link.image);
    }
    add.disabled = busy || uploading || view.state.selection.empty;
    remove.disabled = busy || uploading || !link;
    get<HTMLButtonElement>("undo").disabled = busy || uploading || !undo(view.state);
    get<HTMLButtonElement>("redo").disabled = busy || uploading || !redo(view.state);
    fields.disabled = busy || uploading;
    imageUpload.disabled = busy || uploading || !data.canUpload;
    let valid = true;
    let validation = "";
    try { parseDocument(doc); } catch (error) { valid = false; validation = (error as Error).message; }
    publish.disabled = busy || uploading || !valid || !dirty();
    publish.textContent = busy ? "Publishing…" : "Publish changes";
    status.textContent = busy ? "Publishing your paragraph and previews…" : uploading ? "Uploading image. Your current portfolio has not changed."
      : !valid ? validation : dirty() ? "Unpublished changes. Preview them, then publish when you’re ready." : lastMessage;
    const list = JSON.stringify(doc.segments.map((segment) => [segment.text, segment.linkId]));
    if (list !== lastList || forceFields) {
      lastList = list;
      const listEl = get("link-list");
      listEl.replaceChildren();
      for (const link of doc.links) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = doc.segments.filter((segment) => segment.linkId === link.id).map((segment) => segment.text).join(" … ");
        button.className = "min-h-11 max-w-full cursor-pointer break-words border border-black px-3 py-2 text-left text-sm underline decoration-dotted underline-offset-4 hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2";
        button.addEventListener("click", () => { if (!busy && !uploading) selectLink(link.id, true); });
        listEl.append(button);
      }
      if (!doc.links.length) listEl.textContent = "No links yet. Select a phrase above to add one.";
    }
    if (preview) renderPreview();
  }

  function renderPreview() {
    const copy = get("preview-copy");
    copy.replaceChildren();
    for (const segment of currentDocument().segments) {
      if (!segment.linkId) { copy.append(document.createTextNode(segment.text)); continue; }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = segment.text;
      button.className = "cursor-pointer text-inherit underline decoration-dotted decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
      button.addEventListener("click", () => selectLink(segment.linkId!));
      copy.append(button);
    }
  }

  add.addEventListener("click", () => {
    const { from, to, empty } = view.state.selection;
    if (empty || busy || uploading) return;
    const id = crypto.randomUUID();
    const details: PortfolioLink = { id, href: "", title: view.state.doc.textBetween(from, to).slice(0, 160), summary: "", image: null, imageAlt: "" };
    lastAction = "text";
    view.dispatch(closeHistory(view.state.tr.addMark(from, to, paragraphSchema.mark("link", { id, details }))));
    get<HTMLInputElement>("link-href").focus();
  });
  remove.addEventListener("click", () => {
    if (!activeId || busy || uploading) return;
    const transaction = view.state.tr;
    view.state.doc.descendants((node, pos) => {
      for (const mark of node.marks) if (mark.type.name === "link" && mark.attrs.id === activeId) transaction.removeMark(pos, pos + node.nodeSize, mark);
    });
    view.dispatch(transaction);
    view.focus();
  });
  get("undo").addEventListener("click", () => { undo(view.state, view.dispatch); view.focus(); });
  get("redo").addEventListener("click", () => { redo(view.state, view.dispatch); view.focus(); });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (!activeId || !input.dataset.field) return;
    const link = links.get(activeId)!;
    link[input.dataset.field as "href" | "title" | "summary" | "imageAlt"] = input.value;
    updateLink(link, `field:${activeId}:${input.dataset.field}`);
  });
  imageChoice.addEventListener("change", () => {
    if (!activeId) return;
    const link = links.get(activeId)!;
    if (imageChoice.value === "none") { link.image = null; link.imageAlt = ""; }
    else if (imageChoice.value === "tvm" || imageChoice.value === "post-credits") {
      link.image = { kind: "bundled", id: imageChoice.value };
      link.imageAlt = imageChoice.value === "tvm" ? "TVM logo" : "Post-Credits magazine cover";
    }
    updateLink(link, "image");
    refresh(true);
  });
  imageUpload.addEventListener("change", async () => {
    const file = imageUpload.files?.[0];
    const id = activeId;
    if (!file || !id) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
      uploadStatus.textContent = "Choose a JPEG, PNG, or WebP image no larger than 5 MB.";
      imageUpload.value = "";
      return;
    }
    uploading = true;
    view.setProps({ editable: () => false });
    refresh();
    uploadStatus.textContent = "Uploading and checking image…";
    try {
      const started = await requestJson<{ id: string; url: string }>("/api/admin/uploads", { type: file.type, size: file.size });
      const uploaded = await fetch(started.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!uploaded.ok) throw new Error("Image transfer failed. Check your connection and upload again.");
      const finished = await requestJson<{ id: string }>(`/api/admin/uploads/${started.id}`, {});
      const link = links.get(id)!;
      link.image = { kind: "upload", id: finished.id };
      data.uploaded[finished.id] = `/api/admin/uploads/${finished.id}`;
      // Existing alt text is retained when replacing an image; a new image requires it.
      uploading = false;
      updateLink(link, "image-upload");
      refresh(true);
      uploadStatus.textContent = "Image ready. Check its description, then publish to make it public.";
    } catch (error) {
      uploading = false;
      refresh();
      uploadStatus.textContent = (error as Error).message;
    } finally {
      view.setProps({ editable: () => !busy });
      imageUpload.value = "";
    }
  });
  get("toggle-preview").addEventListener("click", () => {
    preview = !preview;
    get("edit-surface").hidden = preview;
    get("paragraph-preview").hidden = !preview;
    get("toggle-preview").setAttribute("aria-pressed", String(preview));
    get("toggle-preview").textContent = preview ? "Back to editing" : "Preview paragraph";
    if (preview) renderPreview();
  });
  publish.addEventListener("click", async () => {
    if (busy || uploading || publish.disabled) return;
    const document = parseDocument(currentDocument());
    busy = true;
    view.setProps({ editable: () => false });
    refresh();
    try {
      const result = await requestJson<{ revision: number }>("/api/admin/content", { document, revision });
      revision = result.revision;
      saved = JSON.stringify(currentDocument());
      lastMessage = "Published. Your portfolio is up to date.";
      busy = false;
      refresh();
    } catch (error) {
      busy = false;
      refresh();
      status.textContent = (error as Error).message;
    } finally { view.setProps({ editable: () => true }); }
  });
  window.addEventListener("beforeunload", (event) => {
    if (dirty() || busy) event.preventDefault();
  });
  refresh();
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401
    ? "Your session has ended. Keep this tab open, sign in at /admin in another tab, then try again."
    : data.error || "The request failed. Your edits are still here. Try again.");
  return data;
}
