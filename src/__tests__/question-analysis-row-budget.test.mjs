/**
 * QUESTION ANALYSIS PAINTS WHAT THE DEVICE CAN AFFORD
 *
 * Run with: node src/__tests__/question-analysis-row-budget.test.mjs
 *
 * The table drew every question in the paper on first paint. A row is four
 * cells, a ghost button with an icon and an accuracy bar of nested divs —
 * roughly a dozen DOM nodes — so a 200-question paper is a few thousand nodes
 * built, laid out and painted before anything appears. Mid-range Android does
 * that slowly enough to read as broken; the laptop it was built on does it
 * instantly, which is why it shipped.
 *
 * Paging it unconditionally would have been the wrong trade: on a machine with
 * room to spare, a button between a creator and their own numbers is friction
 * with nothing bought. So the budget comes from what the device admits about
 * itself, and a roomy device still gets the whole table with no controls at all.
 *
 * The two invariants worth pinning are not the tier numbers — those are
 * judgement — but the shape of the allocation:
 *
 *   STABLE  revealing one section must never resize another. The budget is
 *           therefore spent on a baseline pass that ignores what was revealed.
 *   HONEST  a section the budget could not reach still reports 0 rather than
 *           vanishing, so its heading and count stay on screen.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  resolveRowBudget,
  allocateRows,
  BUDGET_UNLIMITED,
  BUDGET_TIGHT,
  BUDGET_MODEST,
  TAIL_SLACK_ROWS,
} from "../lib/rowBudget.ts";

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
    console.log(`     -> ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertRows(actual, expected, message) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`
  );
}

const PAGE = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");

console.log("\nQUESTION ANALYSIS PAINTS WHAT THE DEVICE CAN AFFORD\n");

test("a roomy device is left exactly as it was — full table, no controls", () => {
  assert(
    resolveRowBudget({ memoryGb: 8, cores: 8 }) === BUDGET_UNLIMITED,
    "8 GiB and 8 cores is the top tier deviceMemory can even express"
  );
  assert(
    resolveRowBudget({ memoryGb: 8, cores: 16 }) === BUDGET_UNLIMITED,
    "more cores than the threshold must not fall back to a budget"
  );
});

test("a device that admits to being weak gets the tight budget", () => {
  assert(resolveRowBudget({ memoryGb: 2, cores: 8 }) === BUDGET_TIGHT, "2 GiB is 2 GiB, however many cores");
  assert(resolveRowBudget({ memoryGb: 8, cores: 4 }) === BUDGET_TIGHT, "a quad-core is not painting this quickly");
  assert(resolveRowBudget({ memoryGb: 0.5, cores: 2 }) === BUDGET_TIGHT, "both signals poor");
});

test("Data Saver outranks the hardware", () => {
  // The device may well be capable. The reader has still asked for less work,
  // and this is work to skip.
  assert(
    resolveRowBudget({ memoryGb: 8, cores: 16, saveData: true }) === BUDGET_TIGHT,
    "an explicit Data Saver request must win over a roomy spec sheet"
  );
});

test("a device that reports nothing is assumed to be a phone, not a workstation", () => {
  // deviceMemory and a meaningful core count are Chromium-only. Guessing
  // "roomy" on silence would freeze exactly the cheap Android this exists for.
  assert(resolveRowBudget({ viewportWidth: 390 }) === BUDGET_MODEST, "unknown + phone width must not be unlimited");
  assert(resolveRowBudget({}) === BUDGET_MODEST, "unknown with no width at all must not be unlimited");
  assert(
    resolveRowBudget({ viewportWidth: 1440 }) === BUDGET_UNLIMITED,
    "desktop-class width is the one signal that outweighs assume-a-phone"
  );
});

test("a mid device gets the modest budget", () => {
  assert(resolveRowBudget({ memoryGb: 4, cores: 8 }) === BUDGET_MODEST, "4 GiB is neither tier");
  assert(resolveRowBudget({ memoryGb: 8, cores: 6 }) === BUDGET_MODEST, "six cores is neither tier");
});

test("an unlimited budget paints every section whole", () => {
  assertRows(
    allocateRows([25, 25, 50], BUDGET_UNLIMITED, [false, false, false]),
    [25, 25, 50],
    "no budget means no truncation anywhere"
  );
});

test("the budget is a total for the table, spent in display order", () => {
  // Eight sections of thirty clear any sane per-section cap and still paint 240
  // rows. Bounding the total is the only thing that bounds first paint.
  assertRows(
    allocateRows([50, 50, 50], 80, [false, false, false]),
    [50, 30, 0],
    "80 rows of budget must be spent top-down, not handed to each section"
  );
  const painted = allocateRows(Array(8).fill(30), 80, Array(8).fill(false));
  const total = painted.reduce((a, b) => a + b, 0);
  assert(
    total <= 80 + TAIL_SLACK_ROWS,
    `eight sections of thirty must still paint about 80 rows, painted ${total}`
  );
});

test("a section the budget could not reach reports 0 rather than vanishing", () => {
  const rows = allocateRows([100, 40, 40], 40, [false, false, false]);
  assert(rows.length === 3, "every section must come back, so its heading and count still render");
  assertRows(rows, [40, 0, 0], "the sections past the budget are headings only");
});

test("revealing one section never resizes another", () => {
  // The invariant that makes "View more" safe to tap. If an expanded section
  // stopped paying into the budget, its slice would be freed for whoever is
  // below and the table would rearrange itself underneath the tap.
  const sizes = [50, 50, 50];
  const before = allocateRows(sizes, 80, [false, false, false]);
  const afterMiddle = allocateRows(sizes, 80, [false, true, false]);
  const afterLast = allocateRows(sizes, 80, [false, false, true]);

  assertRows(before, [50, 30, 0], "baseline");
  assertRows(afterMiddle, [50, 50, 0], "expanding the middle must not grow the last");
  assertRows(afterLast, [50, 30, 50], "expanding the last must not shrink or grow the ones above");

  for (const [i, after] of [[1, afterMiddle], [2, afterLast]]) {
    for (let j = 0; j < sizes.length; j++) {
      if (j === i) continue;
      assert(
        after[j] === before[j],
        `expanding section ${i} changed section ${j}: ${before[j]} -> ${after[j]}`
      );
    }
  }
});

test("expanding every section is the same as View all", () => {
  assertRows(
    allocateRows([50, 50, 50], 80, [true, true, true]),
    [50, 50, 50],
    "section-by-section reveal must be able to reach the whole table"
  );
});

test("a tail too short to be worth a button is simply painted", () => {
  // "View 2 more" costs a tap and reads as though something is missing.
  assertRows(
    allocateRows([42], 40, [false]),
    [42],
    `a tail of ${TAIL_SLACK_ROWS} or fewer must be shown, not hidden behind a control`
  );
  assertRows(
    allocateRows([60], 40, [false]),
    [40],
    "a tail worth hiding is still hidden"
  );
});

test("a paper smaller than the budget never sees a control at all", () => {
  const sizes = [25, 20];
  assertRows(allocateRows(sizes, BUDGET_TIGHT, [false, false]), sizes, "45 rows fits the tightest budget whole");
});

test("the table slices its rows instead of mapping all of them", () => {
  assert(
    /questions\.slice\(0, visible\)\.map\(/.test(PAGE),
    "the row map must run over a slice, or the budget buys nothing"
  );
  assert(
    !/questions\.sort\(\(a: any, b: any\) => a\.q_no - b\.q_no\)\.map\(/.test(PAGE),
    "the old sort-then-map-everything render must be gone"
  );
});

test("the grouping is memoised, not rebuilt on every render", () => {
  // It used to sit inline in the JSX, so opening an unrelated dialog re-ran the
  // reduce and re-sorted every question — and it sorted the grouped arrays in
  // place while rendering.
  assert(
    /const questionSections = useMemo\(/.test(PAGE),
    "grouping must be a memo keyed on questionStats"
  );
  assert(
    /\[\.\.\.questions\]\.sort\(/.test(PAGE),
    "the sort must run on a copy; questionStats is state"
  );
  assert(
    /const visibleRowCounts = useMemo\(/.test(PAGE),
    "the allocation must be memoised too, or every reveal recomputes it"
  );
});

test("the View all control exists only when something is hidden", () => {
  assert(
    /hiddenRowCount > 0 && \(/.test(PAGE),
    "a device with room to spare must render no control at all"
  );
  assert(
    /setShowAllRows\(true\)/.test(PAGE),
    "View all must drop the budget for the whole table"
  );
  assert(
    /expandSection\(sectionKey\)/.test(PAGE),
    "each section needs its own View more, keyed on identity"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}\n    ${f.error}`);
  console.log("-".repeat(60));
  process.exit(1);
}
console.log("-".repeat(60) + "\n");
