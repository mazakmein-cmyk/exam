/**
 * JSON UPLOAD — THE PASTE FLOW, DRIVEN FOR REAL
 *
 * Run with: node src/__tests__/json-upload-paste-flow.test.mjs
 *
 * The sibling suites (json-upload-paste-text, -commit-guard, -create-sections)
 * read the source as text. They catch a deleted guard or a renamed label; they
 * cannot catch a textarea that never gains focus, a Continue button that stays
 * disabled after a good paste, or an Esc that throws the paste away. This one
 * mounts the actual JsonUploadDialog in jsdom with a fake data source and
 * walks the flow a creator walks:
 *
 *   language row → Paste JSON → paste a whole AI reply (prose, delimiters,
 *   ```json fence) → live check → Ctrl+Enter → preview → Back keeps the text
 *   → schema error inline with the docs anchor → Esc guard → a failed .json
 *   file offers "Edit & retry here" → size errors do not → commit → reset.
 *
 * Nothing is installed for this: jsdom arrives as a transitive dependency and
 * esbuild with vite. If either is missing the file reports a skip, following
 * json-import-over-escaped-latex.test.mjs, rather than failing the run.
 *
 * Supabase, image upload and PDF snipping are stubbed in-memory — the dialog
 * must not touch the network to show a textarea.
 */

import { rmSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(resolve(ROOT, "package.json"));

let build;
let JSDOM;
try {
  ({ build } = require("esbuild"));
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  console.log(`\n  ⏭  ${e?.message?.split("\n")[0] ?? e} — skipping (this suite needs esbuild + jsdom)`);
  process.exit(0);
}

// ─── jsdom globals — must exist before React DOM is evaluated ────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try {
    globalThis[key] = window[key];
  } catch {}
}
// Node ships its own Event/CustomEvent/Blob/File globals, and jsdom's
// dispatchEvent rejects foreign Event instances ("parameter 1 is not of type
// 'Event'", surfacing inside Radix's DismissableLayer). The DOM side must win.
const FORCE = [
  "Event", "CustomEvent", "EventTarget", "UIEvent", "FocusEvent", "KeyboardEvent",
  "MouseEvent", "PointerEvent", "InputEvent", "CompositionEvent", "ClipboardEvent",
  "DragEvent", "WheelEvent", "AnimationEvent", "TransitionEvent", "MutationObserver",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "Blob", "File",
  "FileReader", "FormData", "Node", "Element", "HTMLElement", "Text", "Document",
  "DocumentFragment", "Range", "Selection",
];
const forced = {
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
};
for (const k of FORCE) if (window[k] !== undefined) forced[k] = window[k];
for (const [k, v] of Object.entries(forced)) {
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.HTMLElement.prototype.scrollIntoView ??= function () {};

// ─── Bundle the real dialog, stubbing its I/O edges in memory ────────────────
const STUBS = {
  "@/integrations/supabase/client": `
    export const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
      storage: { from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "http://x/y.pdf" } }),
      }) },
      from: () => { throw new Error("test: supabase.from() must not be called by the dialog"); },
    };`,
  "@/lib/questionImageUpload": `export async function uploadQuestionImage() { return "http://x/img.png"; }`,
  "@/services/autoSnipper": `export async function autoSnip() { return []; }`,
  "@/components/PdfSnipper": `export default function PdfSnipper() { return null; }`,
};
const OUT = resolve(ROOT, ".json-paste-flow-test-bundle.mjs");
await build({
  stdin: {
    contents: `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import JsonUploadDialog from "@/components/JsonUploadDialog";
      export { React, createRoot, JsonUploadDialog };`,
    resolveDir: ROOT,
    loader: "tsx",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile: OUT,
  alias: { "@": resolve(ROOT, "src") },
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"development"' },
  logLevel: "error",
  plugins: [
    {
      name: "in-memory-stubs",
      setup(b) {
        b.onResolve({ filter: /^@\// }, (args) =>
          STUBS[args.path] ? { path: args.path, namespace: "stub" } : undefined
        );
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: STUBS[args.path],
          loader: "tsx",
        }));
      },
    },
  ],
});
const { React, createRoot, JsonUploadDialog } = await import(pathToFileURL(OUT).href);

// ─── Runner + DOM helpers ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}\n     → ${e?.message ?? e}`);
    failed++;
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m || "assertion failed");
};
async function waitFor(pred, label, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    let v;
    try {
      v = pred();
    } catch {}
    if (v) return v;
    await sleep(25);
  }
  throw new Error(`timed out waiting for: ${label}`);
}
const buttonWithText = (text) =>
  [...document.querySelectorAll("button")].find((b) =>
    b.textContent.replace(/\s+/g, " ").trim().includes(text)
  );
const exactButton = (text) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent.replace(/\s+/g, " ").trim() === text
  );
const bodyText = () => document.body.textContent.replace(/\s+/g, " ");
const textarea = () => document.querySelector('textarea[aria-label="JSON for English"]');
// React swallows a plain `.value =`; go through the native setter + an input event.
function setTextarea(el, value) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
}
// Real keydowns are cancelable; without it preventDefault() is a silent no-op.
const keydown = (target, init) =>
  target.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
const q = (n, text) => ({
  q_no: n,
  text,
  answer_type: "single",
  options: ["a", "b", "c", "d"],
  correct_answer: "1",
});

// ─── Mount ───────────────────────────────────────────────────────────────────
const calls = { onOpenChange: [], commit: [] };
const dataSource = {
  loadSectionsByLang: async () => ({
    en: [
      { id: "s1", name: "Quant", sort_order: 0 },
      { id: "s2", name: "Verbal", sort_order: 1 },
    ],
  }),
  loadLangStatus: async () => ({ en: { questionCount: 0, sectionCount: 2, submittedAttemptCount: 0 } }),
  renameSection: async () => {},
  createSections: async () => {},
  requiresSectionTime: true,
  storageBucket: "exam-pdfs",
  showMarks: true,
  replaceBlockedReason: (n) => `${n} attempts`,
};
const container = document.createElement("div");
document.body.appendChild(container);
const root = createRoot(container);
root.render(
  React.createElement(JsonUploadDialog, {
    open: true,
    onOpenChange: (o) => calls.onOpenChange.push(o),
    examId: "e1",
    supportedLanguages: ["en"],
    primaryLanguage: "en",
    docsUrl: "/json-upload-guide",
    dataSource,
    commitJson: async (report, mode, lang) => {
      calls.commit.push({ n: report.perSection.reduce((a, s) => a + s.accepted.length, 0), mode, lang });
      return { ok: true };
    },
  })
);

console.log("\n══ JSON upload: the paste flow, mounted in jsdom ══\n");

await step("language row offers Paste JSON and Upload file, both enabled once sections exist", async () => {
  const paste = await waitFor(() => buttonWithText("Paste JSON"), "Paste JSON button");
  const file = buttonWithText("Upload file");
  assert(file, "Upload file button missing");
  assert(!paste.disabled && !file.disabled, "both buttons must be enabled when sections exist");
  assert(/Paste the JSON your AI produced, or upload the \.json file/.test(bodyText()), "description names both routes");
});

await step("Paste JSON opens the paste view: focused textarea, section hints, Continue disabled", async () => {
  buttonWithText("Paste JSON").click();
  const ta = await waitFor(textarea, "paste textarea");
  await waitFor(() => document.activeElement === ta, "textarea autofocus");
  assert(/Section names in this exam \(English\): Quant · Verbal/.test(bodyText()), "section hint line");
  assert(/Waiting for your paste/.test(bodyText()), "empty-state status");
  assert(buttonWithText("Continue to preview").disabled, "Continue must start disabled");
  assert(buttonWithText("Upload a .json file instead"), "file escape hatch present");
});

const twoSectionDoc = {
  schema_version: "1.0",
  language: "en",
  sections: [
    { name: "Quant", questions: [q(1, "2 + 2 = ?"), q(2, "3 + 3 = ?")] },
    { name: "Reasoning", questions: [q(1, "Odd one out?")] },
  ],
};
const wholeReply = [
  "Sure! Here is the JSON you asked for.",
  "",
  "<<<EXAM_JSON_START>>>",
  "```json",
  JSON.stringify(twoSectionDoc, null, 2),
  "```",
  "<<<EXAM_JSON_END>>>",
  "",
  "Let me know if you'd like any changes.",
].join("\n");

await step("pasting a whole AI reply shows Checking… then Readable with counts and the unmatched hint", async () => {
  setTextarea(textarea(), wholeReply);
  await waitFor(() => /Checking…/.test(bodyText()), "Checking… state", 1000);
  assert(buttonWithText("Continue to preview").disabled, "Continue stays disabled while checking");
  await waitFor(() => /Readable/.test(bodyText()), "Readable status");
  const t = bodyText();
  assert(/Readable — 2 sections · 3 questions/.test(t), "counts line");
  assert(/1 section name isn't in this exam/.test(t), "unmatched-section hint");
  assert(/\d+(\.\d+)? (B|KB)/.test(t), "size shown");
  assert(buttonWithText("Clear"), "Clear button present");
  assert(!buttonWithText("Continue to preview").disabled, "Continue enabled once readable");
});

await step("Ctrl+Enter opens the preview with the parsed sections", async () => {
  keydown(textarea(), { key: "Enter", ctrlKey: true });
  await waitFor(() => /Preview JSON — English/.test(bodyText()), "preview view");
  const t = bodyText();
  assert(/Quant/.test(t) && /Reasoning/.test(t), "preview lists both JSON sections");
  assert(!textarea(), "textarea must be gone in the preview");
});

await step("Back from the preview returns to the paste box with the text intact", async () => {
  document.querySelector("h2 button").click();
  const ta = await waitFor(textarea, "paste textarea after Back");
  assert(ta.value === wholeReply, "pasted text must survive the round trip");
  await waitFor(() => /Readable — 2 sections · 3 questions/.test(bodyText()), "status re-derived");
});

await step("a schema error shows inline, links its docs anchor, and keeps Continue disabled", async () => {
  setTextarea(textarea(), JSON.stringify({ schema_version: "2.0", language: "en", sections: [] }));
  await waitFor(() => /Couldn't read this JSON yet/.test(bodyText()), "error headline");
  const alert = document.querySelector('[role="alert"]');
  assert(alert && /Unsupported schema_version "2\.0"/.test(alert.textContent), "fatal reason in the alert box");
  assert(
    alert.querySelector("a")?.getAttribute("href") === "/json-upload-guide#fix-schema-version",
    "fix link must deep-link the guide"
  );
  assert(textarea().getAttribute("aria-invalid") === "true", "textarea flagged invalid");
  assert(buttonWithText("Continue to preview").disabled, "Continue disabled on error");
});

await step("Esc is swallowed while text is present, and closes once the box is cleared", async () => {
  const before = calls.onOpenChange.length;
  keydown(document, { key: "Escape" });
  await sleep(80);
  assert(calls.onOpenChange.length === before, "Esc must not request close with a paste in progress");
  buttonWithText("Clear").click();
  await waitFor(() => textarea().value === "" && /Waiting for your paste/.test(bodyText()), "cleared");
  assert(!document.querySelector('[role="alert"]'), "no stale error may linger after Clear");
  keydown(document, { key: "Escape" });
  await waitFor(
    () => calls.onOpenChange.length === before + 1 && calls.onOpenChange.at(-1) === false,
    "Esc closes when empty"
  );
});

// A fatal error that is NOT repairable: jsonrepair happily closes truncated
// braces, so a "broken" fixture would legitimately reach the preview.
const fatalFileText = JSON.stringify({ schema_version: "2.0", language: "en", sections: [] });
const jsonFileInput = () => document.querySelector('input[type="file"][accept*="json"]');
function chooseFile(fileLike) {
  const input = jsonFileInput();
  Object.defineProperty(input, "files", { value: [fileLike], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

await step("a .json file that fails to parse offers Edit & retry here, which seeds the box", async () => {
  buttonWithText("Upload a .json file instead").click();
  await sleep(20); // handleUploadClick defers the picker click by a tick
  chooseFile(new window.File([fatalFileText], "broken.json", { type: "application/json" }));
  await waitFor(() => /Couldn't load your JSON/.test(bodyText()), "error banner in languages view");
  assert(!textarea(), "must have returned to the languages view, where the banner lives");
  const retry = buttonWithText("Edit & retry here");
  assert(retry, "Edit & retry here button");
  retry.click();
  const ta = await waitFor(textarea, "paste textarea seeded");
  assert(ta.value === fatalFileText, "box must hold the failed file's text");
  await waitFor(() => /Couldn't read this JSON yet/.test(bodyText()), "same error, now inline");
  const alert = document.querySelector('[role="alert"]');
  assert(alert && /Unsupported schema_version "2\.0"/.test(alert.textContent), "the file's own error is shown inline");
});

await step("size errors do NOT offer Edit & retry — there is no text to edit", async () => {
  buttonWithText("Back").click();
  await waitFor(() => buttonWithText("Upload file"), "languages view");
  buttonWithText("Upload file").click();
  await sleep(20);
  chooseFile({ size: 11 * 1024 * 1024, text: async () => "{}" });
  await waitFor(() => /Max 10 MB\. This file is 11\.0 MB/.test(bodyText()), "too-large banner");
  assert(!buttonWithText("Edit & retry here"), "no text → no edit action");
  assert(document.querySelector('a[href="/json-upload-guide#fix-file-too-large"]'), "size docs link");
});

await step("a clean paste commits through commitJson, and the box is reset afterwards", async () => {
  buttonWithText("Paste JSON").click();
  const ta = await waitFor(textarea, "paste textarea");
  assert(ta.value === fatalFileText, "same-language paste text persists across Back and a size failure");
  buttonWithText("Clear").click();
  await waitFor(() => textarea().value === "", "cleared");
  setTextarea(ta, JSON.stringify({
    schema_version: "1.0",
    language: "en",
    sections: [{ name: "Quant", questions: [q(1, "2 + 2 = ?")] }],
  }));
  await waitFor(() => /Readable — 1 section · 1 question/.test(bodyText()), "readable");
  buttonWithText("Continue to preview").click();
  await waitFor(() => /Preview JSON — English/.test(bodyText()), "preview");
  const confirm = await waitFor(() => {
    const b = buttonWithText("Confirm Upload");
    return b && !b.disabled ? b : null;
  }, "enabled Confirm Upload");
  confirm.click();
  await waitFor(() => calls.commit.length === 1, "commitJson called");
  const c = calls.commit[0];
  assert(c.n === 1 && c.mode === "append" && c.lang === "en", `commit args: ${JSON.stringify(c)}`);
  await waitFor(() => buttonWithText("Paste JSON") && !textarea(), "back on the languages view");
  buttonWithText("Paste JSON").click();
  const again = await waitFor(textarea, "paste textarea reopened");
  assert(again.value === "", "imported text must not be offered again");
});

// ─── Scenario B: an exam with NO sections yet ────────────────────────────────
// The first import of a fresh exam. There is nothing to match against, so the
// preview must offer to create every section from the JSON, the create modal
// must take a time per section (mock exams), and the re-parse must then match
// everything so the import can commit — without the user ever leaving.
root.unmount();
await sleep(50);
container.remove();

const created = []; // what the fake database holds after createSections
const emptyExamSource = {
  ...dataSource,
  loadSectionsByLang: async () => ({ en: created.map((s, i) => ({ id: s.id, name: s.name, sort_order: i })) }),
  loadLangStatus: async () => ({
    en: { questionCount: 0, sectionCount: created.length, submittedAttemptCount: 0 },
  }),
  createSections: async (_examId, rows) => {
    for (const r of rows) {
      if (r.language === "en") created.push({ id: `new-${created.length + 1}`, name: r.name, time_minutes: r.time_minutes });
    }
  },
};
const callsB = { commit: [] };
const containerB = document.createElement("div");
document.body.appendChild(containerB);
createRoot(containerB).render(
  React.createElement(JsonUploadDialog, {
    open: true,
    onOpenChange: () => {},
    examId: "e2",
    supportedLanguages: ["en"],
    primaryLanguage: "en",
    docsUrl: "/json-upload-guide",
    dataSource: emptyExamSource,
    commitJson: async (report, mode, lang) => {
      callsB.commit.push({
        n: report.perSection.reduce((a, s) => a + s.accepted.length, 0),
        sections: report.perSection.filter((s) => s.matchedSectionId).length,
        mode,
        lang,
      });
      return { ok: true };
    },
  })
);

console.log("\n── an exam with no sections yet ──\n");

await step("[no sections] the row stays actionable and says sections will be created", async () => {
  const paste = await waitFor(() => buttonWithText("Paste JSON"), "Paste JSON button");
  assert(!paste.disabled && !buttonWithText("Upload file").disabled, "both buttons must be enabled with zero sections");
  assert(/No sections yet — importing creates them from your JSON\./.test(bodyText()), "row explains the first import");
  assert(/no need to add them first/.test(bodyText()), "the Exam sections box must not demand sections");
});

await step("[no sections] the paste view frames missing sections as the next step, not an error", async () => {
  buttonWithText("Paste JSON").click();
  const ta = await waitFor(textarea, "paste textarea");
  assert(
    /This exam has no sections yet — the ones named in your JSON will be created on the next screen\./.test(bodyText()),
    "hint above the box"
  );
  setTextarea(ta, wholeReply);
  await waitFor(() => /Readable — 2 sections · 3 questions/.test(bodyText()), "readable");
  assert(/the next screen creates all 2 from your JSON/.test(bodyText()), "status explains creation");
  assert(!/aren't in this exam/.test(bodyText()), "must not use the mismatch wording");
  assert(!buttonWithText("Continue to preview").disabled, "Continue enabled");
});

await step("[no sections] the preview leads with Create N sections… and the confirm button points at it", async () => {
  buttonWithText("Continue to preview").click();
  await waitFor(() => /Preview JSON — English/.test(bodyText()), "preview");
  assert(/This exam has no sections yet/.test(bodyText()), "zero-section panel headline");
  assert(/You'll set a time for each\./.test(bodyText()), "mock exams are told about the time step");
  assert(!/don't match this exam/.test(bodyText()), "the amber mismatch panel must not also render");
  const create = buttonWithText("Create 2 sections…");
  assert(create, "create button present in the panel");
  const confirm = buttonWithText("Create sections to continue");
  assert(confirm && confirm.disabled, "confirm button must say what to do and stay disabled");
  create.click();
  await waitFor(() => /Create sections from your JSON/.test(bodyText()), "create modal with the first-import title");
});

await step("[no sections] creating the sections re-parses the paste, matches everything, and the import commits", async () => {
  const inputs = await waitFor(() => {
    const els = [...document.querySelectorAll('input[type="number"]')];
    return els.length === 2 ? els : null;
  }, "two minute inputs");
  for (const input of inputs) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "30");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
  const createBtn = await waitFor(() => {
    const b = exactButton("Create 2 sections");
    return b && !b.disabled ? b : null;
  }, "enabled modal Create button");
  createBtn.click();
  await waitFor(() => created.length === 2, "fake createSections received both sections");
  assert(created.every((s) => s.time_minutes === 30), `minutes must travel with the rows: ${JSON.stringify(created)}`);
  await waitFor(() => !/This exam has no sections yet/.test(bodyText()), "zero-section panel gone after the re-parse");
  const confirm = await waitFor(() => {
    const b = buttonWithText("Confirm Upload");
    return b && !b.disabled ? b : null;
  }, "enabled Confirm Upload");
  assert(/3 valid/.test(bodyText()), "all three questions now validate against the new sections");
  confirm.click();
  await waitFor(() => callsB.commit.length === 1, "commitJson called");
  const c = callsB.commit[0];
  assert(c.n === 3 && c.sections === 2 && c.lang === "en", `commit args: ${JSON.stringify(c)}`);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}\n  ${passed} passed, ${failed} failed`);
try {
  rmSync(OUT);
} catch {}
window.close();
// useToast arms a 1,000,000 ms removal timer; exit explicitly or Node waits for it.
process.exit(failed > 0 ? 1 : 0);
