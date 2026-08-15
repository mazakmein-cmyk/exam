/**
 * JSON UPLOAD — A REFRESH MID-IMPORT MUST NOT LOOK LIKE A SAFE EXIT
 *
 * Run with: node src/__tests__/json-upload-commit-guard.test.mjs
 *
 * Both commit paths write questions ROW BY ROW — dozens of sequential
 * PostgREST round-trips. From the outside that's a button spinner and
 * silence; from the inside a refresh, a Back press, or a closed tab kills
 * the loop wherever it happens to be, leaving a half-imported exam that
 * renders fine and fails only when someone counts the questions.
 *
 * The defence is layered, and every layer has a way to quietly fall off:
 *
 *  1. A full-screen overlay (progress bar + "don't refresh") — but it must be
 *     PORTALED to <body>: DialogContent is CSS-transformed for centering, and
 *     a `fixed` child of a transformed ancestor anchors to the dialog box,
 *     not the viewport, silently un-covering the rest of the app.
 *  2. beforeunload → the native "leave site?" prompt for refresh/close.
 *  3. A popstate sentinel → the SPA back button re-pushes itself, because
 *     beforeunload does NOT fire for SPA history navigation.
 *  4. Real progress from inside both commit loops — a bar that visibly moves
 *     is what stops the "it's frozen, I'll refresh" instinct in the first
 *     place. Total counts every accepted question exactly once, and on the
 *     live-secondary path the skipped-no-counterpart questions still advance
 *     the bar, or it stalls short of 100% forever.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

const DIALOG = readSrc("components/JsonUploadDialog.tsx");
const MOCK_PAGE = readSrc("pages/ExamDetail.tsx");
const LIVE_PAGE = readSrc("pages/LiveExamDetail.tsx");

console.log("\n══ JSON upload: mid-import exit guards ══");

// ─── [1] The overlay — visible, on top, and truly full-screen ────────────────
console.log("\n[1] Blocking overlay");

test("overlay renders while committing and warns against refresh/Back/close", () => {
  assert(
    /\{committing &&\s*createPortal\(/.test(DIALOG),
    "the shield must render for the WHOLE commit (gated on `committing`), not on a sub-stage"
  );
  assert(
    /Don't refresh, press Back, or close this tab\./.test(DIALOG),
    "the warning must name all three exits users actually take"
  );
});

test("overlay is portaled to <body> — a fixed child of DialogContent anchors wrong", () => {
  // The overlay is the LAST block before the dialog closes; earlier
  // </DialogContent> occurrences belong to the nested modals.
  const overlay = DIALOG.slice(
    DIALOG.indexOf("{committing &&"),
    DIALOG.lastIndexOf("</DialogContent>")
  );
  assert(
    /createPortal\(/.test(overlay) && /document\.body\s*\)/.test(overlay),
    "must portal to document.body: DialogContent carries a CSS transform, which re-anchors `fixed` descendants to the dialog box and leaves the rest of the app clickable"
  );
  assert(
    /fixed inset-0 z-\[100\]/.test(overlay),
    "must cover the full viewport above the dialog (Radix content sits at z-50)"
  );
});

test("overlay shows a real progress bar driven by commitProgress", () => {
  assert(
    /const \[commitProgress, setCommitProgress\] = useState</.test(DIALOG),
    "expected commitProgress state"
  );
  assert(
    /\{commitProgress\.done\}\/\{commitProgress\.total\}/.test(DIALOG),
    "the overlay must show done/total counts"
  );
  assert(
    /width: `\$\{Math\.min\(100, Math\.round\(\(commitProgress\.done \/ commitProgress\.total\) \* 100\)\)\}%`/.test(
      DIALOG
    ),
    "bar width must derive from done/total (clamped)"
  );
});

// ─── [2] The exits the overlay can't cover ───────────────────────────────────
console.log("\n[2] Refresh and Back guards");

test("beforeunload guard registered exactly while committing", () => {
  const guard = DIALOG.slice(
    DIALOG.indexOf("if (!committing) return;"),
    DIALOG.indexOf("const handleUploadClick")
  );
  assert(
    /window\.addEventListener\("beforeunload", onBeforeUnload\)/.test(guard),
    "refresh/tab-close must hit the native leave-site prompt during a commit"
  );
  assert(
    /e\.preventDefault\(\);\s*e\.returnValue = ""/.test(guard),
    "the handler must preventDefault + set returnValue (both, for cross-browser)"
  );
  assert(
    /window\.removeEventListener\("beforeunload", onBeforeUnload\)/.test(guard),
    "and must unhook on cleanup — a leaked handler nags on every later navigation"
  );
});

test("SPA back is neutralised by a self-re-pushing history sentinel", () => {
  const guard = DIALOG.slice(
    DIALOG.indexOf("if (!committing) return;"),
    DIALOG.indexOf("const handleUploadClick")
  );
  assert(
    /window\.history\.pushState\(\{ jsonImportGuard: true \}, ""\)/.test(guard),
    "beforeunload does NOT fire for SPA history navigation — Back needs its own sentinel entry"
  );
  const popHandler = guard.slice(guard.indexOf("const onPopState"));
  assert(
    /window\.history\.pushState\(\{ jsonImportGuard: true \}, ""\)/.test(popHandler),
    "popping the sentinel while committing must immediately re-push it"
  );
  assert(
    /jsonImportGuard\b[\s\S]*window\.history\.back\(\)/.test(guard),
    "cleanup must pop the sentinel it parked (only when still on top) so Back needs one press afterwards, not two"
  );
});

test("the dialog itself can't be closed mid-commit", () => {
  assert(
    /onOpenChange=\{\(o\) => !committing && onOpenChange\(o\)\}/.test(DIALOG),
    "Esc / X / outside-click all route through onOpenChange — it must ignore closes while committing"
  );
});

// ─── [3] Progress must come from the loops that do the writing ───────────────
console.log("\n[3] Progress plumbing");

test("dialog passes onProgress into commitJson and stages the other uploads", () => {
  assert(
    /onProgress: \(done, total\) =>\s*setCommitProgress\(\{ stage: "Creating sections & questions…", done, total \}\)/.test(
      DIALOG
    ),
    "commit extras must carry the progress callback"
  );
  assert(
    /stage: "Uploading source PDF…"/.test(DIALOG),
    "the PDF upload must announce itself — it can take seconds on its own"
  );
  assert(
    /stage: "Uploading question images…"/.test(DIALOG),
    "snip uploads are sequential and must tick per image"
  );
  assert(
    /setCommitting\(false\);\s*setCommitProgress\(null\);/.test(DIALOG),
    "finally must clear both flags or the shield outlives the commit"
  );
});

test("mock commit reports per-question progress on BOTH language paths", () => {
  const commit = MOCK_PAGE.slice(
    MOCK_PAGE.indexOf("const commitJson = async ("),
    MOCK_PAGE.indexOf("// [2.5] Update sections.pdf_url")
  );
  assert(
    /const totalPlanned = matched\.reduce\(\(n, s\) => n \+ s\.accepted\.length, 0\);/.test(commit),
    "total must be computed up front from accepted questions"
  );
  assert(
    /extras\?\.onProgress\?\.\(0, totalPlanned\);/.test(commit),
    "an initial (0, total) call sizes the bar before the first slow insert"
  );
  const calls = commit.match(/extras\?\.onProgress\?\.\(totalCreated, totalPlanned\);/g) || [];
  assert(
    calls.length === 2,
    `both the primary and secondary per-question loops must tick — found ${calls.length} of 2 tick sites`
  );
});

test("live commit ticks skipped-no-counterpart questions too, or the bar stalls", () => {
  const commit = LIVE_PAGE.slice(
    LIVE_PAGE.indexOf("const commitLiveJson = async ("),
    LIVE_PAGE.indexOf("// [2] Renumber play order")
  );
  assert(
    /const totalPlanned = matchedOrdered\.reduce\(\(n, s\) => n \+ s\.accepted\.length, 0\);/.test(
      commit
    ),
    "total must count every accepted question"
  );
  assert(
    /extras\?\.onProgress\?\.\(0, totalPlanned\);/.test(commit),
    "an initial (0, total) call sizes the bar"
  );
  // Search for the `continue;` AFTER the skip counter — the section loop has
  // an earlier `if (!target) continue;` that would otherwise end the slice
  // before it starts.
  const skipIdx = commit.indexOf("skippedNoCounterpart += 1;");
  const skipBlock = commit.slice(skipIdx, commit.indexOf("continue;", skipIdx) + "continue;".length);
  assert(
    /progressDone \+= 1;\s*extras\?\.onProgress\?\.\(progressDone, totalPlanned\);/.test(skipBlock),
    "a secondary question with no primary twin is SKIPPED, not created — it must still advance the bar or 100% is unreachable"
  );
  const ticks = commit.match(/extras\?\.onProgress\?\.\(progressDone, totalPlanned\);/g) || [];
  assert(
    ticks.length === 3,
    `expected 3 tick sites (primary, secondary-skip, secondary-write), found ${ticks.length}`
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.error}`);
  process.exit(1);
}
