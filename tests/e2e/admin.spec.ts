import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const origin = "http://127.0.0.1:4322";
const backend = "http://127.0.0.1:54329";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlp8AAAAASUVORK5CYII=", "base64");

async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("anya@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Portfolio editor" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Portfolio paragraph" })).toBeVisible();
}

async function selectPhrase(page: Page, phrase: string) {
  await page.getByRole("textbox", { name: "Portfolio paragraph" }).focus();
  await page.evaluate((phrase) => {
    const root = document.querySelector(".ProseMirror")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const offset = node.textContent!.indexOf(phrase);
      if (offset < 0) continue;
      const range = document.createRange();
      range.setStart(node, offset);
      range.setEnd(node, offset + phrase.length);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("Phrase not found");
  }, phrase);
  await expect(page.getByRole("button", { name: "Add link", exact: true })).toBeEnabled();
}

test.beforeEach(async ({ request }) => { await request.post(`${backend}/__reset`, { data: {} }); });

test("the public paragraph and keyboard previews are preserved", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main > p")).toHaveText("A young media strategist fascinated by what makes audiences watch, click, and act. TVM President. Post-Credits Editor-in-Chief. MWS Social media manager.", { useInnerText: true });
  const link = page.getByRole("link", { name: "TVM President.", exact: true });
  await link.focus();
  await expect(page.getByRole("tooltip").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip").first()).toBeHidden();
});

test("anonymous access and cross-origin writes are denied; other site accounts get no access", async ({ page, request }) => {
  const response = await page.goto("/admin");
  expect(response!.headers()["cache-control"]).toContain("no-store");
  expect(response!.headers()["x-robots-tag"]).toContain("noindex");
  for (const path of ["/api/admin/content", "/api/admin/uploads", "/api/admin/uploads/00000000-0000-4000-8000-000000000001"]) {
    expect((await request.post(path, { headers: { Origin: origin }, data: {} })).status()).toBe(401);
    expect((await request.post(path, { headers: { Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
  }
  expect((await request.get("/api/admin/uploads/00000000-0000-4000-8000-000000000001")).status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill("other@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not access");
  await expect(page.getByRole("textbox", { name: "Portfolio paragraph" })).toHaveCount(0);
});

test("edit, select words, link, preview, publish, and sign out", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  const editor = page.getByRole("textbox", { name: "Portfolio paragraph" });
  await editor.fill("Anya makes films. See TVM.");
  await selectPhrase(page, "TVM");
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("Destination", { exact: true }).fill("https://www.tvmtelevision.com/");
  await page.getByLabel("Preview description", { exact: true }).fill("Watch Anya’s work with TVM.");
  await page.getByRole("button", { name: "Preview paragraph", exact: true }).click();
  await expect(page.locator("#preview-copy")).toHaveText("Anya makes films. See TVM.");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.locator("#editor-status")).toContainText("Published.");
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  const publicPage = await page.context().newPage();
  await publicPage.goto("/");
  await expect(publicPage.locator("main > p")).toHaveText("Anya makes films. See TVM.", { useInnerText: true });
  await expect(publicPage.getByRole("link", { name: "TVM", exact: true })).toHaveAttribute("href", "https://www.tvmtelevision.com/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Anya’s portfolio" })).toBeVisible();
});

test("failed saves and conflicts leave local edits intact", async ({ page, request }) => {
  await signIn(page);
  await page.getByRole("button", { name: "TVM President.", exact: true }).click();
  await page.getByLabel("Preview description", { exact: true }).fill("An unsaved description.");
  await request.post(`${backend}/__state`, { data: { failPublish: true } });
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.locator("#editor-status")).toContainText("could not be published");
  await expect(page.getByLabel("Preview description", { exact: true })).toHaveValue("An unsaved description.");
  await request.post(`${backend}/__state`, { data: { failPublish: false, bumpRevision: true } });
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.locator("#editor-status")).toContainText("another tab");
  await expect(page.getByLabel("Preview description", { exact: true })).toHaveValue("An unsaved description.");
});

test("upload UI validates type, retains failed replacements, and requires image descriptions", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "MWS Social media manager.", exact: true }).click();
  const input = page.getByLabel("Upload a replacement", { exact: true });
  await input.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.locator("#upload-status")).toContainText("Choose a JPEG");
  const id = "00000000-0000-4000-8000-000000000003";
  await page.route("**/api/admin/uploads", (route) => route.fulfill({ json: { id, url: "https://uploads.example.test/fixture" } }));
  await page.route("https://uploads.example.test/fixture", (route) => route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": origin } }));
  await page.route(`**/api/admin/uploads/${id}`, (route) => route.request().method() === "GET"
    ? route.fulfill({ contentType: "image/png", body: pixel }) : route.fulfill({ json: { id, width: 1, height: 1 } }));
  await input.setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: pixel });
  await expect(page.locator("#upload-status")).toContainText("Image ready");
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeDisabled();
  await page.getByLabel("Image description", { exact: true }).fill("A wine society event poster.");
  await expect(page.getByRole("button", { name: "Publish changes" })).toBeEnabled();
  // A transfer failure must not erase the previously selected, validated image.
  await page.route("https://uploads.example.test/fixture", (route) => route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": origin } }));
  await input.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: pixel });
  await expect(page.locator("#upload-status")).toContainText("transfer failed");
  await expect(page.locator("#selected-image")).toHaveAttribute("src", `/api/admin/uploads/${id}`);
});

test("unlink and undo work; editor is usable at desktop and phone widths", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "TVM President.", exact: true }).click();
  await page.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(page.getByRole("button", { name: "TVM President.", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "TVM President.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "TVM President.", exact: true }).click();
  await expect(page.locator("#selected-image")).toBeVisible();
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({ path: ".impeccable/review/admin-desktop.png", fullPage: true, style: "astro-dev-toolbar { display: none !important; }" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Destination", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/admin-mobile.png", fullPage: true, style: "astro-dev-toolbar { display: none !important; }" });
});

test("undo and redo include preview details and image changes", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "TVM President.", exact: true }).click();
  const title = page.getByLabel("Preview title", { exact: true });
  await title.fill("Updated TVM title");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(title).toHaveValue("TVM: Student Television at McGill");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(title).toHaveValue("Updated TVM title");
  await page.getByLabel("Preview image", { exact: true }).selectOption("none");
  await expect(page.locator("#selected-image")).toBeHidden();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Preview image", { exact: true })).toHaveValue("tvm");
  await expect(page.locator("#selected-image")).toBeVisible();
  await expect(title).toHaveValue("Updated TVM title");
});
