/**
 * PUBLISH — ALL MARKS OR NO MARKS, NEVER HALF
 *
 * Run with: node src/__tests__/marks-coverage-gate.test.mjs
 *
 * The ranking layer decides "does this exam use marks?" with
 * bool_and(has_marks) over every attempt ever recorded — so an exam whose
 * marking scheme covers only PART of the paper flips to correct-count ranking
 * the moment one attempt touches an unscored question, and the creator's
 * +4/−1 silently stops deciding ranks. The owner chose to gate this at the
 * source instead of changing the ranking rule: publishing is blocked while
 * marks cover only part of the paper, with the uncovered sections NAMED so the
 * fix is a checklist ("either remove marks from every section, or add marks
 * to: …").
 *
 * The gate reuses the reads the dialog's marks warning has always made — the
 * only change to any request is answer_type riding along on an existing
 * select. Zero new calls, and the two consistent states stay advisory:
 * all-marks publishes clean, no-marks keeps its red advisory banner.
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

const DIALOG = readFileSync(
  resolve(ROOT, "src/components/PublishExamDialog.tsx"),
  "utf-8"
);

console.log("\nPUBLISH — ALL MARKS OR NO MARKS, NEVER HALF\n");

test("partial coverage sets the gate, with the uncovered sections named", () => {
  assert(
    DIALOG.includes("setMarksGate(") &&
      DIALOG.includes("Either remove marks from every section"),
    "the gate and its either/or instruction are gone"
  );
  assert(
    DIALOG.includes("or add marks to: ${holes.join(") &&
      DIALOG.includes("sectionNameById.get(sid)"),
    "the error must NAME the sections missing marks — a checklist, not a hunt"
  );
});

test("the gate actually disables Publish; the advisories still do not", () => {
  const action = DIALOG.slice(DIALOG.indexOf("<AlertDialogAction"));
  const disabled = action.slice(0, 500);
  assert(
    disabled.includes("(isPublishing && marksGate !== null)"),
    "marksGate must disable the Publish button"
  );
  assert(
    !/marksWarning|instructionFindings/.test(disabled),
    "the consistent states (no marks anywhere; instruction drift) stay advisory"
  );
});

test("the two consistent states are untouched", () => {
  assert(
    DIALOG.includes("No marking scheme is configured for this exam"),
    "an exam with no marks anywhere still publishes with the red advisory"
  );
  // Full coverage → neither banner.
  assert(
    /} else {\s*setMarksWarning\(null\);\s*}/.test(DIALOG),
    "full coverage must clear the warning and set no gate"
  );
});

test("subjective questions are exempt, on the answer-key gate's precedent", () => {
  assert(
    DIALOG.includes('filter((q) => q.answer_type !== "subjective")'),
    "hand-graded questions must not be forced into the marking scheme"
  );
});

test("zero new requests: answer_type rides an existing select", () => {
  assert(
    DIALOG.includes('select("id, section_id, answer_type")'),
    "the coverage data comes from the select the marks warning always made"
  );
  // The gate computation must not have introduced a new marks-table read: the
  // three config sources are still fetched exactly once each.
  for (const table of [
    "exam_scoring_defaults",
    "section_scoring_defaults",
    "question_scoring_config",
  ]) {
    const n = (DIALOG.match(new RegExp(`from\\("${table}"`, "g")) || []).length;
    assert(n === 1, `${table} must be read exactly once (found ${n})`);
  }
});

test("every fresh validation starts with the gate down", () => {
  const fn = DIALOG.slice(
    DIALOG.indexOf("const validateExam = async"),
    DIALOG.indexOf("const validateExam = async") + 500
  );
  assert(
    fn.includes("setMarksGate(null)"),
    "a stale gate from the previous open would block a paper that has been fixed"
  );
});

// ─── Results ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("─".repeat(60) + "\n");
