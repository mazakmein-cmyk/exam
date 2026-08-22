/**
 * PDF DOWNLOAD — "let me get back the file I uploaded."
 *
 * Run with: node src/__tests__/pdf-download.test.mjs
 *
 * A section's PDF is stored in Supabase under a timestamp key and served from
 * another origin. Three properties carry the feature:
 *
 *  1. THE NAME TRAVELS IN THE URL. `<a download>` is ignored cross-origin, so
 *     the readable filename has to ride along as `?download=` — that is the
 *     only reason the browser saves instead of navigating.
 *  2. NO PDF, NO BUTTON. pdfDownloadUrl returns null for a missing or blank
 *     url, and both editors use that as the render guard — there is never a
 *     button that leads nowhere.
 *  3. THE FILENAME IS ALWAYS USABLE. Slashes, colons, quotes and control
 *     characters never reach the disk, and a name that sanitizes to nothing
 *     still produces a valid `.pdf`.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  pdfDownloadFileName,
  pdfDownloadUrl,
  sanitizePdfNamePart,
} from "../lib/pdfDownload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || "Mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) throw new Error(message || `Expected to contain: "${substring}"`);
}

const PUBLIC_URL =
  "https://abcdefgh.supabase.co/storage/v1/object/public/exam-pdfs/exam-1/section-2/1750000000000.pdf";

console.log("\n── Filename ───────────────────────────────────────────────\n");

test("exam and section become one readable name", () => {
  assertEqual(
    pdfDownloadFileName("JEE Main 2027 Mock 3", "Physics Part A"),
    "JEE-Main-2027-Mock-3-Physics-Part-A.pdf"
  );
});

test("either half can be missing and the file still has a name", () => {
  assertEqual(pdfDownloadFileName("SSC MTS Paper 1", ""), "SSC-MTS-Paper-1.pdf");
  assertEqual(pdfDownloadFileName("", "Section 2"), "Section-2.pdf");
  assertEqual(pdfDownloadFileName(undefined, null), "document.pdf");
});

test("path separators and reserved characters never reach the disk", () => {
  const name = pdfDownloadFileName('Maths/Physics: "set A"', "Part 1\\2 <draft>?");
  for (const ch of ['/', '\\', ':', '"', '<', '>', '?', '*', '|']) {
    assert(!name.includes(ch), `${JSON.stringify(ch)} survived in ${name}`);
  }
  assert(name.endsWith(".pdf"), `expected a .pdf, got ${name}`);
});

test("control characters are stripped, not passed through", () => {
  assertEqual(sanitizePdfNamePart("Physics\u0000\u001f Paper"), "Physics-Paper");
});

test("whitespace runs collapse and edge punctuation is trimmed", () => {
  assertEqual(sanitizePdfNamePart("  Physics   Paper  "), "Physics-Paper");
  assertEqual(sanitizePdfNamePart("--Physics--"), "Physics");
  assertEqual(sanitizePdfNamePart("...hidden"), "hidden");
});

test("a name that sanitizes to nothing falls back instead of yielding '.pdf'", () => {
  assertEqual(pdfDownloadFileName("///", ":::"), "document.pdf");
  assertEqual(pdfDownloadFileName("   ", "   "), "document.pdf");
});

test("Hindi titles keep their own script", () => {
  assertEqual(pdfDownloadFileName("भौतिक विज्ञान", "खंड 1"), "भौतिक-विज्ञान-खंड-1.pdf");
});

test("a pathological title cannot blow past the filesystem limit", () => {
  const name = pdfDownloadFileName("x".repeat(500), "y".repeat(500));
  assert(name.length <= 124, `too long: ${name.length}`);
  assert(name.endsWith(".pdf"), "still a pdf");
});

console.log("\n── URL ────────────────────────────────────────────────────\n");

test("the readable name rides along as ?download=", () => {
  const url = pdfDownloadUrl(PUBLIC_URL, "Physics-Part-A.pdf");
  assertEqual(new URL(url).searchParams.get("download"), "Physics-Part-A.pdf");
  assertContains(url, "exam-pdfs/exam-1/section-2/1750000000000.pdf", "the object path is untouched");
});

test("a name needing encoding survives the round trip", () => {
  const url = pdfDownloadUrl(PUBLIC_URL, "भौतिक-विज्ञान.pdf");
  assertEqual(new URL(url).searchParams.get("download"), "भौतिक-विज्ञान.pdf");
  assert(!url.includes(" "), "no raw spaces in the query");
});

test("an existing query string is preserved, and download is set once", () => {
  const url = pdfDownloadUrl(`${PUBLIC_URL}?t=1&download=stale.pdf`, "fresh.pdf");
  const params = new URL(url).searchParams;
  assertEqual(params.get("t"), "1");
  assertEqual(params.getAll("download").length, 1, "no duplicate download param");
  assertEqual(params.get("download"), "fresh.pdf");
});

test("no pdf means no url — the render guard for both editors", () => {
  assertEqual(pdfDownloadUrl(null, "a.pdf"), null);
  assertEqual(pdfDownloadUrl(undefined, "a.pdf"), null);
  assertEqual(pdfDownloadUrl("", "a.pdf"), null);
  assertEqual(pdfDownloadUrl("   ", "a.pdf"), null);
});

test("an unparseable url degrades to the raw link, not a dead button", () => {
  assertEqual(pdfDownloadUrl("not a url at all", "a.pdf"), "not a url at all");
});

test("a missing filename still asks for an attachment", () => {
  assertEqual(new URL(pdfDownloadUrl(PUBLIC_URL)).searchParams.get("download"), "document.pdf");
});

console.log("\n── Wiring ─────────────────────────────────────────────────\n");

const EDITORS = [
  ["src/pages/ExamDetail.tsx", "section?.pdf_url"],
  ["src/pages/LiveExamDetail.tsx", "activeSection?.pdf_url"],
];

for (const [file, pdfExpr] of EDITORS) {
  const source = readFileSync(resolve(ROOT, file), "utf8");

  test(`${file} builds the download url from ${pdfExpr}`, () => {
    assertContains(source, 'from "@/lib/pdfDownload.js"');
    assertContains(source, `pdfDownloadUrl(${pdfExpr}, sectionPdfFileName)`);
  });

  test(`${file} renders the button only when there is a pdf`, () => {
    assertContains(source, "{sectionPdfDownloadUrl && (");
    assertContains(source, "href={sectionPdfDownloadUrl}");
  });

  test(`${file} opens the link out-of-page so an in-progress draft survives`, () => {
    const anchor = source.slice(source.indexOf("href={sectionPdfDownloadUrl}"));
    assertContains(anchor.slice(0, 400), 'target="_blank"');
    assertContains(anchor.slice(0, 400), 'rel="noopener noreferrer"');
  });

  test(`${file} imports the Download icon it renders`, () => {
    assert(/import \{[^}]*\bDownload\b[^}]*\} from "lucide-react"/.test(source), "Download not imported");
  });
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
}
console.log("─".repeat(60) + "\n");
process.exit(failed > 0 ? 1 : 0);
