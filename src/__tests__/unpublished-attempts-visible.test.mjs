/**
 * UNPUBLISHING AN EXAM NEVER ERASES A STUDENT'S EFFORT (issue 10)
 *
 * Run with: node src/__tests__/unpublished-attempts-visible.test.mjs
 *
 * RLS hides an unpublished exam, so a student's attempts on it come back with
 * section: null. History and "Total Mock Exams" filtered those out while
 * Overall Accuracy and Avg Time were computed over the raw attempts array —
 * a student whose only exam was unpublished saw "Total Mock Exams: 0" above a
 * non-zero accuracy, and an empty History with no explanation.
 *
 * Owner's decision (2026-08-23, Option B): keep the attempt EVERYWHERE. The
 * History row reads "(exam no longer available)", the count includes it, and
 * all four surfaces are finally computed from the same pile.
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

const ANALYTICS = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");

console.log("\nUNPUBLISHING AN EXAM NEVER ERASES A STUDENT'S EFFORT\n");

test("the sessions list keeps attempts whose exam is hidden", () => {
  assert(
    !ANALYTICS.includes(".filter(a => a.section && a.section.exam)"),
    "the null-section filter is back — hidden-exam attempts vanish from History and the count"
  );
});

test("a hidden exam's row says so instead of crashing or lying", () => {
  assert(
    ANALYTICS.includes("'(exam no longer available)'"),
    "the label is gone"
  );
  assert(
    ANALYTICS.includes("first.section?.exam"),
    "examName must null-guard the RLS-hidden embed — first.section.exam.name throws on it"
  );
  assert(
    ANALYTICS.includes("counted.map(a => a.section?.name || '—')"),
    "section chips must survive a null section"
  );
});

test("the tiles finally share one pile: the count comes from the unfiltered list", () => {
  // studentSessionsList is what "Total Mock Exams" counts; accuracy/avg-time
  // read the raw attempts array. With the filter gone, both piles contain the
  // hidden-exam attempts and the tiles agree by construction.
  const memo = ANALYTICS.slice(
    ANALYTICS.indexOf("const studentSessionsList = useMemo"),
    ANALYTICS.indexOf("// Overview Metrics")
  );
  assert(
    !/\.filter\([^)]*section[^)]*exam/.test(memo),
    "no exam-visibility filter may exist anywhere in the sessions memo"
  );
});

test("an unranked row says 'Unranked' with an explainer, never a silent gap (issue 11)", () => {
  assert(
    ANALYTICS.includes(">\n                                Unranked\n                              <") ||
      /Unranked/.test(ANALYTICS),
    "the Unranked chip is gone — the badge gap is a silent mystery again"
  );
  assert(
    ANALYTICS.includes("This attempt predates a change to the paper"),
    "the tooltip must explain WHY the row has no rank"
  );
  assert(
    ANALYTICS.includes("Your score still\n                              counts in your stats") ||
      /Your score still[\s\S]{0,40}counts in your stats/.test(ANALYTICS),
    "the tooltip must reassure that the score itself is intact"
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
