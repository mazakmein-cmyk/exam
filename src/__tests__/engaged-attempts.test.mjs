/**
 * AN ATTEMPT IS SOMEONE WHO ANSWERED SOMETHING
 *
 * Run with: node src/__tests__/engaged-attempts.test.mjs
 *
 * An attempt row exists from the moment Start is clicked — the clock and the
 * resume feature both need one. So someone who opens a paper, sees 100
 * questions and closes the tab leaves a permanent record behind.
 *
 * The per-question stats already ignored those (they count submitted attempts
 * only), but the headline numbers the browser derives did not: an empty start
 * counted as a student who scored 0%. On a paper shared to a group the people
 * who bounced outnumbered the ones who sat it, so the Score Distribution read
 * as though the paper had crushed the class — while the accuracy tile, built
 * from a different set, said the opposite on the same screen.
 *
 * The rule: answered at least one question = an attempt. Touched nothing = not
 * an attempt and not a repeat visit. Submission is NOT the test — someone who
 * answered forty questions and lost their connection still sat the paper.
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

const SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260845000000_engaged_attempts.sql"),
  "utf-8"
);
const PAGE = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");

console.log("\nAN ATTEMPT IS SOMEONE WHO ANSWERED SOMETHING\n");

// ─── [1] The definition of "answered" ───────────────────────────────────────

test("engagement is decided by mock_has_answer, not by row existence", () => {
  // The in-exam writer saves a row as soon as a question is VIEWED, carrying
  // status and time with a null answer. Counting rows would count reading.
  assert(
    /public\.mock_has_answer\(r\.selected_answer\)/.test(SQL),
    "counting response rows would make viewing a question count as answering it"
  );
});

test('a cleared text box is not an answer', () => {
  // mock_has_answer is the same test the marks engine uses for a skip, so ""
  // and [] are not answers here either — one definition across scoring and
  // counting. 20260843000000 proves those cases at install time.
  const MARKS = readFileSync(
    resolve(ROOT, "supabase/migrations/20260843000000_marks_scored_in_db.sql"),
    "utf-8"
  );
  assert(
    MARKS.includes(`mock_has_answer('""'::jsonb)`) && MARKS.includes(`mock_has_answer('[]'::jsonb)`),
    "the shared definition must keep proving that a blank is not an answer"
  );
});

test("submission is deliberately not the test", () => {
  assert(
    !/submitted_at/.test(SQL),
    "an attempt abandoned after forty answers still sat the paper — filtering on submitted_at would erase it"
  );
});

// ─── [2] The function is safe to expose ─────────────────────────────────────

test("only the exam's owner gets a list back", () => {
  assert(
    /EXISTS \(SELECT 1 FROM owned\)/.test(SQL),
    "without the gate this lists attempt ids to any caller"
  );
  assert(
    SQL.includes("REVOKE EXECUTE ON FUNCTION public.get_exam_engaged_attempts(uuid) FROM PUBLIC"),
    "SECURITY DEFINER functions are executable by PUBLIC unless revoked"
  );
});

test("the creator's own runs stay excluded", () => {
  assert(
    /a\.user_id <> e\.user_id/.test(SQL),
    "every other number on the dashboard excludes them; this must not be the way back in"
  );
});

// ─── [3] Every headline number uses the same population ─────────────────────

test("the four headline numbers all filter on engaged", () => {
  assert(
    /const engagedAttempts = examId/.test(PAGE),
    "the filtered list must exist"
  );
  for (const [label, re] of [
    ["Total Attempts", /engagedAttempts\.filter\(a => firstSectionIds\.has\(a\.section_id\)\)/],
    ["Repeaters", /const studentAttempts = engagedAttempts\.reduce/],
    ["Unique Students", /new Set\(engagedAttempts\.map\(a => a\.user_id\)\)/],
    ["Score Distribution", /engagedAttempts\.forEach\(a => \{/],
  ]) {
    assert(re.test(PAGE), `${label} still counts people who never answered anything`);
  }
});

test("the daily chart adds up to the Total Attempts tile", () => {
  // The bars counted submitted sittings while the tile counted engaged ones, so
  // they summed to different numbers under the same words with nothing on
  // screen to explain the gap.
  assert(
    /engagedAttempts\.forEach\(\(attempt: any\) => \{[\s\S]{0,400}attemptCount\+\+/.test(PAGE),
    "the Attempts line must be built from the same list as the tile"
  );
  assert(
    /attempt\.submitted_at \|\| attempt\.created_at/.test(PAGE),
    "an abandoned sitting has no submitted_at — bucketing on it alone files them all under Invalid Date"
  );
});

test("an abandoned sitting does not invent a 0% on the accuracy series", () => {
  assert(
    /validAttempts\.forEach\(\(attempt: any\) => \{[\s\S]{0,300}scoreCount\+\+/.test(PAGE),
    "accuracy must average graded sittings only"
  );
  assert(
    /g\.scoreCount > 0 \? parseFloat/.test(PAGE),
    "a day with only abandoned sittings has no accuracy to report — it must be null, not 0"
  );
});

test("the chart orders by a real date, not by fetch order", () => {
  assert(
    /\.sort\(\(a: any, b: any\) => a\.key\.localeCompare\(b\.key\)\)/.test(PAGE),
    "the old .reverse() assumed the rows arrived in one particular order"
  );
  assert(
    !/\}\)\)\.reverse\(\); \/\/ Reverse to show chronological/.test(PAGE),
    "the fetch-order reverse must be gone"
  );
});

// ─── Completion, judged per sitting ─────────────────────────────────────────

test("completion no longer depends on which section is last today", () => {
  // The old rule was "submitted whichever section is last TODAY", re-applied to
  // the whole history on every load — so appending a section un-completed every
  // sitting that finished before it existed.
  assert(
    !/lastSectionIds/.test(PAGE),
    "judging against today's last section is what let an edit rewrite the past"
  );
  assert(
    /const completedSittings = \(\) =>|const completedSittings = \(\(\) =>/.test(PAGE),
    "completion must be judged sitting by sitting"
  );
});

test("a sitting is judged against the sections that existed when it started", () => {
  assert(
    /new Date\(sec\.created_at\)\.getTime\(\) <= startedAt/.test(PAGE),
    "a section born after the sitting cannot be one the sitting failed to finish"
  );
  assert(
    /required\.every\(sec => submitted\.has\(sec\.id\)\)/.test(PAGE),
    "complete means every required section was submitted, not just the last one"
  );
});

test("a sitting is only measured against its own language", () => {
  assert(
    /sec\.language === opener\.language/.test(PAGE),
    "a Hindi sitting is not incomplete for skipping the English sections"
  );
});

test("the rate cannot exceed 100%", () => {
  // Both halves now count sittings, and a sitting is opened by exactly one
  // first-section attempt — the same thing totalAttempts counts.
  assert(
    /const submittedCount = examId\s*\n\s*\? completedSittings/.test(PAGE),
    "the numerator must be sittings, counted out of the same set as the denominator"
  );
});

test("the accuracy and time tiles agree with the tiles above them", () => {
  assert(
    /a\.submitted_at && \(!examId \|\| \(a as any\)\.engaged !== false\)/.test(PAGE),
    "a blank submitted paper would otherwise be a real 0% in the averages while being excluded from Total Attempts"
  );
});

// ─── [4] Degrading before the migration lands ───────────────────────────────

test("an un-migrated database counts every attempt, as it did before", () => {
  assert(
    /engaged: engagedMigrated \? engagedIds\.has\(attempt\.id\) : true/.test(PAGE),
    "the flag must default to true, or a missing function would empty the whole dashboard"
  );
  assert(
    /get_exam_engaged_attempts missing/.test(PAGE),
    "say which file to apply rather than failing silently"
  );
});

test("a real error is still thrown, not swallowed as 'not migrated'", () => {
  assert(
    /\} else if \(engagedError\) \{\s*\n\s*throw engagedError;/.test(PAGE),
    "only a missing function is worth continuing past"
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
