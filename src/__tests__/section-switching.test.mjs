/**
 * SECTION SWITCHING — configurable section navigation
 *
 * Run with: node src/__tests__/section-switching.test.mjs
 *
 * The feature: a creator decides whether students may move between sections.
 * Off (the default, and every exam that already exists) keeps the one-way,
 * per-section-clock behavior. On gives the paper a single clock and the student
 * a tab per section.
 *
 * Four properties carry the weight:
 *
 *  1. ABSENT MEANS LOCKED. The migration is applied by hand and PostgREST
 *     caches column lists, so the app routinely reads an exam row with no
 *     `allow_section_switching` key at all. Reading that as "free" would hand
 *     students an untimed paper. Every default in this file leans locked.
 *  2. NO CLOCK OF ZERO. `total_time_minutes` is nullable, so an exam can be in
 *     free mode before the creator has typed a total. The section sum stands in.
 *  3. PER-SECTION MINUTES SURVIVE. Turning switching on must not destroy the
 *     per-section times — turning it back off has to restore the paper exactly.
 *  4. ONE SITTING STAYS ONE SITTING. Free mode opens one attempt per section at
 *     once, and ExamReview reassembles a sitting by walking attempts in
 *     created_at order. Identical timestamps would split it in two.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  isFreeNavigation,
  navigationMode,
  sumSectionMinutes,
  totalExamMinutes,
  totalExamSeconds,
  flattenPaper,
  flatIndexOf,
  stepThroughPaper,
  sectionProgress,
  hasAnswer,
  sectionTimeSpentSeconds,
  staggeredTimestamps,
} from "../lib/examNavigation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ─── Test runner ────────────────────────────────────────────────────────────
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
    throw new Error(`${message || "Mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeep(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "Mismatch"}: expected ${b}, got ${a}`);
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) throw new Error(message || `Expected to contain: "${substring}"`);
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(resolve(ROOT, "supabase/migrations", filename), "utf-8");
}

// ─── [1] Absent means locked ────────────────────────────────────────────────
console.log("\n[1] Mode resolution — an absent column can only mean locked");

test("undefined exam reads as locked", () => {
  assertEqual(isFreeNavigation(undefined), false);
  assertEqual(isFreeNavigation(null), false);
  assertEqual(navigationMode(undefined), "locked");
});

test("exam row without the column reads as locked", () => {
  // Exactly the shape PostgREST returns before the migration lands.
  const preMigration = { id: "e1", name: "SSC CGL", is_published: true };
  assertEqual(isFreeNavigation(preMigration), false);
  assertEqual(navigationMode(preMigration), "locked");
});

test("only a strict true unlocks switching", () => {
  assertEqual(isFreeNavigation({ allow_section_switching: true }), true);
  assertEqual(isFreeNavigation({ allow_section_switching: false }), false);
  assertEqual(isFreeNavigation({ allow_section_switching: null }), false);
  // Truthy-but-not-true values must NOT unlock it: a stale cache or a string
  // from a hand-written row should never widen a student's access.
  assertEqual(isFreeNavigation({ allow_section_switching: "true" }), false);
  assertEqual(isFreeNavigation({ allow_section_switching: 1 }), false);
});

test("navigationMode names both modes", () => {
  assertEqual(navigationMode({ allow_section_switching: true }), "free");
  assertEqual(navigationMode({ allow_section_switching: false }), "locked");
});

// ─── [2] The clock ──────────────────────────────────────────────────────────
console.log("\n[2] The whole-paper clock — never zero, never negative");

const FOUR_SECTIONS = [
  { id: "s1", name: "English", time_minutes: 30 },
  { id: "s2", name: "General Awareness", time_minutes: 30 },
  { id: "s3", name: "Reasoning", time_minutes: 30 },
  { id: "s4", name: "Numerical", time_minutes: 30 },
];

test("section sum adds the per-section clocks", () => {
  assertEqual(sumSectionMinutes(FOUR_SECTIONS), 120);
});

test("section sum tolerates junk rows", () => {
  assertEqual(sumSectionMinutes(null), 0);
  assertEqual(sumSectionMinutes([]), 0);
  assertEqual(
    sumSectionMinutes([
      { id: "a", time_minutes: 20 },
      { id: "b", time_minutes: null },
      { id: "c" },
      { id: "d", time_minutes: -5 },
      { id: "e", time_minutes: "10" },
    ]),
    30,
    "null/absent/negative contribute 0; a numeric string still counts"
  );
});

test("a set total wins over the section sum", () => {
  assertEqual(totalExamMinutes({ total_time_minutes: 60 }, FOUR_SECTIONS), 60);
});

test("an unset total falls back to the section sum", () => {
  // This is the state right after a creator flips the switch on an exam whose
  // total they have not typed yet — it must not produce a 0-minute paper.
  assertEqual(totalExamMinutes({ total_time_minutes: null }, FOUR_SECTIONS), 120);
  assertEqual(totalExamMinutes({}, FOUR_SECTIONS), 120);
  assertEqual(totalExamMinutes(undefined, FOUR_SECTIONS), 120);
});

test("a nonsensical total falls back to the section sum", () => {
  assertEqual(totalExamMinutes({ total_time_minutes: 0 }, FOUR_SECTIONS), 120);
  assertEqual(totalExamMinutes({ total_time_minutes: -30 }, FOUR_SECTIONS), 120);
  assertEqual(totalExamMinutes({ total_time_minutes: "abc" }, FOUR_SECTIONS), 120);
});

test("a fractional total is floored, not rounded up", () => {
  assertEqual(totalExamMinutes({ total_time_minutes: 90.7 }, FOUR_SECTIONS), 90);
});

test("seconds is minutes × 60", () => {
  assertEqual(totalExamSeconds({ total_time_minutes: 90 }, FOUR_SECTIONS), 5400);
  assertEqual(totalExamSeconds({}, FOUR_SECTIONS), 7200);
});

test("both a missing total and empty sections yield 0, not NaN", () => {
  // A 0 here means the start screen shows "0 minutes" — visibly wrong, which is
  // far better than NaN reaching the countdown worker and expiring instantly.
  assertEqual(totalExamMinutes({}, []), 0);
  assertEqual(totalExamSeconds(undefined, undefined), 0);
});

// ─── [3] Walking the paper across section edges ─────────────────────────────
console.log("\n[3] Previous/Next crossing section boundaries");

const SECTIONS_3 = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
const QUESTIONS_BY_SECTION = {
  s1: [{ id: "q1" }, { id: "q2" }],
  s2: [{ id: "q3" }],
  s3: [{ id: "q4" }, { id: "q5" }],
};
const FLAT = flattenPaper(SECTIONS_3, QUESTIONS_BY_SECTION);

test("flattenPaper walks sections in order, questions in order", () => {
  assertEqual(FLAT.length, 5);
  assertDeep(
    FLAT.map((e) => e.questionId),
    ["q1", "q2", "q3", "q4", "q5"]
  );
  assertDeep(FLAT[2], { sectionId: "s2", sectionIndex: 1, questionId: "q3", indexInSection: 0 });
});

test("flattenPaper skips a section with no questions without shifting the rest", () => {
  const flat = flattenPaper([{ id: "s1" }, { id: "empty" }, { id: "s2" }], {
    s1: [{ id: "q1" }],
    empty: [],
    s2: [{ id: "q2" }],
  });
  assertDeep(
    flat.map((e) => e.questionId),
    ["q1", "q2"]
  );
});

test("flatIndexOf locates a position, and reports -1 for a bad one", () => {
  assertEqual(flatIndexOf(FLAT, "s2", 0), 2);
  assertEqual(flatIndexOf(FLAT, "s3", 1), 4);
  assertEqual(flatIndexOf(FLAT, "s2", 3), -1);
  assertEqual(flatIndexOf(FLAT, "nope", 0), -1);
});

test("Next off the end of a section enters the next section", () => {
  assertDeep(stepThroughPaper(FLAT, "s1", 1, "next"), { sectionId: "s2", indexInSection: 0 });
  assertDeep(stepThroughPaper(FLAT, "s2", 0, "next"), { sectionId: "s3", indexInSection: 0 });
});

test("Previous off the top of a section enters the previous section's LAST question", () => {
  assertDeep(stepThroughPaper(FLAT, "s2", 0, "prev"), { sectionId: "s1", indexInSection: 1 });
  assertDeep(stepThroughPaper(FLAT, "s3", 0, "prev"), { sectionId: "s2", indexInSection: 0 });
});

test("Next inside a section stays inside it", () => {
  assertDeep(stepThroughPaper(FLAT, "s1", 0, "next"), { sectionId: "s1", indexInSection: 1 });
});

test("both ends of the paper return null — the caller shows Submit instead", () => {
  assertEqual(stepThroughPaper(FLAT, "s3", 1, "next"), null, "last question of last section");
  assertEqual(stepThroughPaper(FLAT, "s1", 0, "prev"), null, "first question of first section");
});

test("an unknown position steps nowhere rather than jumping to the start", () => {
  assertEqual(stepThroughPaper(FLAT, "ghost", 0, "next"), null);
  assertEqual(stepThroughPaper(FLAT, "s1", 99, "prev"), null);
});

// ─── [4] Per-section progress ───────────────────────────────────────────────
console.log("\n[4] Tab counts and the submit confirmation");

test("hasAnswer matches the simulator's own emptiness test", () => {
  assertEqual(hasAnswer(null), false);
  assertEqual(hasAnswer(undefined), false);
  assertEqual(hasAnswer(""), false);
  assertEqual(hasAnswer("   "), false, "a blank typed answer is not an answer");
  assertEqual(hasAnswer([]), false, "a multi-select with nothing ticked is not an answer");
  assertEqual(hasAnswer("0"), true, "option index 0 is a real choice");
  assertEqual(hasAnswer(0), true);
  assertEqual(hasAnswer(["1"]), true);
});

test("sectionProgress counts answered, marked and unanswered", () => {
  const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }];
  const states = {
    q1: { selectedAnswer: "2", isMarkedForReview: false },
    q2: { selectedAnswer: null, isMarkedForReview: true },
    q3: { selectedAnswer: ["0", "1"], isMarkedForReview: true },
    q4: { selectedAnswer: "", isMarkedForReview: false },
  };
  assertDeep(sectionProgress(questions, states), {
    answered: 2,
    marked: 2,
    unanswered: 2,
    total: 4,
  });
});

test("a question the student never opened counts as unanswered, not missing", () => {
  assertDeep(sectionProgress([{ id: "q1" }, { id: "q2" }], { q1: { selectedAnswer: "1" } }), {
    answered: 1,
    marked: 0,
    unanswered: 1,
    total: 2,
  });
});

test("an empty section reports 0/0 rather than throwing", () => {
  assertDeep(sectionProgress([], {}), { answered: 0, marked: 0, unanswered: 0, total: 0 });
  assertDeep(sectionProgress(null, null), { answered: 0, marked: 0, unanswered: 0, total: 0 });
});

// ─── [5] Per-section time in free mode ──────────────────────────────────────
console.log("\n[5] Per-section time when there is no wall-clock slice");

test("a section's time is the time spent on its own questions", () => {
  const states = {
    q1: { timeSpentSeconds: 40 },
    q2: { timeSpentSeconds: 20 },
    q3: { timeSpentSeconds: 500 },
  };
  assertEqual(sectionTimeSpentSeconds([{ id: "q1" }, { id: "q2" }], states), 60);
});

test("questions with no recorded time contribute 0, not NaN", () => {
  assertEqual(
    sectionTimeSpentSeconds([{ id: "q1" }, { id: "q2" }, { id: "q3" }], {
      q1: { timeSpentSeconds: 30 },
      q2: {},
      q3: { timeSpentSeconds: null },
    }),
    30
  );
  assertEqual(sectionTimeSpentSeconds([], {}), 0);
});

// ─── [6] One sitting stays one sitting ──────────────────────────────────────
console.log("\n[6] Attempt timestamps — ExamReview must see one sitting");

test("timestamps are strictly increasing, in section order", () => {
  const stamps = staggeredTimestamps(Date.parse("2026-08-14T10:00:00.000Z"), 4);
  assertEqual(stamps.length, 4);
  for (let i = 1; i < stamps.length; i++) {
    assert(
      stamps[i] > stamps[i - 1],
      `stamp ${i} (${stamps[i]}) must sort after ${stamps[i - 1]} — equal created_at lets ExamReview split one sitting`
    );
  }
  assertEqual(stamps[0], "2026-08-14T10:00:00.000Z");
  assertEqual(stamps[3], "2026-08-14T10:00:00.003Z");
});

test("a single-section paper and a zero-section paper are both fine", () => {
  assertEqual(staggeredTimestamps(0, 1).length, 1);
  assertEqual(staggeredTimestamps(0, 0).length, 0);
  assertEqual(staggeredTimestamps(0, -3).length, 0);
});

// ─── [7] Migration ──────────────────────────────────────────────────────────
console.log("\n[7] Migration");

const MIGRATION = "20260814000000_add_section_navigation_mode.sql";

test("migration adds both columns, idempotently", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "ADD COLUMN IF NOT EXISTS allow_section_switching BOOLEAN NOT NULL DEFAULT FALSE");
  assertContains(sql, "ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER");
});

test("the switch defaults to FALSE, so every existing exam keeps its behavior", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "DEFAULT FALSE");
  assert(
    !/allow_section_switching\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE/i.test(sql),
    "defaulting to TRUE would silently change every exam already in the database"
  );
});

test("migration reloads the PostgREST schema cache", () => {
  assertContains(
    readMigration(MIGRATION),
    "NOTIFY pgrst, 'reload schema'",
    "without this the first save after pasting fails with PGRST204"
  );
});

test("migration verifies its own paste", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "RAISE EXCEPTION");
  assertContains(sql, "information_schema.columns");
});

test("a total time of zero or less is rejected at the database", () => {
  assertContains(
    readMigration(MIGRATION),
    "total_time_minutes IS NULL OR total_time_minutes > 0"
  );
});

test("migration does not touch sections.time_minutes", () => {
  const sql = readMigration(MIGRATION);
  assert(
    !/UPDATE\s+public\.sections/i.test(sql) && !/DROP\s+COLUMN[\s\S]*time_minutes/i.test(sql),
    "per-section times must survive so turning switching back off restores the paper"
  );
});

// ─── [8] Writes are gated on the column existing ────────────────────────────
console.log("\n[8] Writes gate on the live schema");

test("examSettings probes for the column before writing it", () => {
  const src = readSrc("lib/examSettings.ts");
  assertContains(src, 'tableHasColumn("exams", ALLOW_SWITCHING_COLUMN)');
  assertContains(src, 'reason: "missing-column"');
});

test("readNavigationSettings treats a missing column as locked", () => {
  const src = readSrc("lib/examSettings.ts");
  assertContains(
    src,
    "row[ALLOW_SWITCHING_COLUMN] === true",
    "a strict === true is what keeps an absent key from reading as free"
  );
});

test("a save that names a missing column tells the creator which migration to paste", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  assertContains(src, "20260814000000_add_section_navigation_mode.sql");
  assertContains(
    src,
    "setAllowSectionSwitching(previous.allow)",
    "a failed save must roll the toggle back rather than appear to stick"
  );
});

test("duplicating an exam carries the mode across, gated", () => {
  assertContains(readSrc("pages/ExamDetail.tsx"), "navigationCopyPatch(exam)");
  assertContains(readSrc("pages/Dashboard.tsx"), "navigationCopyPatch(exam)");
});

// ─── [9] Creator UI ─────────────────────────────────────────────────────────
console.log("\n[9] Creator UI");

test("the toggle lives in the Sections card", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  assertContains(src, "<SectionNavigationControl");
  assertContains(src, "onToggle={handleToggleSectionSwitching}");
  assertContains(src, "onTotalMinutesChange={handleTotalTimeChange}");
});

test("per-section minute boxes are replaced, not merely disabled, when switching is on", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  assertContains(src, "allowSectionSwitching ? (");
  assertContains(src, "Timed as one paper");
});

test("turning switching on seeds the total from the section sum in the same write", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  assertContains(src, "sumSectionMinutes(sections)");
  assertContains(src, "...(seedTotal !== undefined ? { total_time_minutes: seedTotal } : {})");
});

test("the control offers a way back to the section total", () => {
  assertContains(readSrc("components/exam/SectionNavigationControl.tsx"), "Use section total");
});

// ─── [10] Student UI ────────────────────────────────────────────────────────
console.log("\n[10] Student UI");

test("the simulator selects * from exams, never a column list", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(
    src,
    'supabase.from("exams").select("*")',
    "naming allow_section_switching in the select would make the whole paper unopenable pre-migration"
  );
  assert(
    !src.includes('.select("is_published, primary_language, user_id")'),
    "the old narrow select must be gone"
  );
});

test("tabs only render for a multi-section paper in free mode", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "const showSectionTabs = isFreeNav && allSections.length > 1");
  assertContains(src, "<SectionTabs");
});

test("switching sections does NOT navigate — that would restart the clock", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const switchFn = src.slice(
    src.indexOf("const handleSectionSwitch"),
    src.indexOf("const handleAnswerChange")
  );
  assert(switchFn.length > 0, "handleSectionSwitch should exist");
  assert(
    !switchFn.includes("navigate("),
    "handleSectionSwitch must change state only; a route change remounts the page and restarts the timer"
  );
  assertContains(switchFn, "setActiveSectionId(nextSectionId)");
  assertContains(switchFn, "updateQuestionTime()", "time on the question being left must be banked first");
});

test("free mode times the paper, locked mode times the section", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "const clockMinutes = isFreeNav ? totalPaperMinutes : (section?.time_minutes || 0)");
});

test("free mode opens one attempt per section, with staggered created_at", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "staggeredTimestamps(Date.now(), sectionsToOpen.length)");
  assertContains(
    src,
    "...(isFreeNav ? { created_at: stamps[i] } : {})",
    "locked mode must keep its original insert shape — only free mode needs the stagger"
  );
});

test("attempts are never opened for a section with no questions", () => {
  assertContains(
    readSrc("pages/ExamSimulator.tsx"),
    "allSections.filter((s) => (questionsBySection[s.id] || []).length > 0)"
  );
});

test("every question in the paper gets a state row before the clock starts", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "const questionsToInit = isFreeNav");
  assertContains(src, "Object.values(questionsBySection).flat()");
});

test("free mode submits every section, each with its own time", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "sectionTimeSpentSeconds(secQuestions, updatedQuestionStates)");
  assertContains(src, "for (const entry of sectionsToSubmit)");
});

test("anonymous free-mode students queue one pending submission per section", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "...existingSubmissions, ...pending");
});

test("the completion dialog does not offer a next section in free mode", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const dialog = src.slice(src.indexOf("showSectionCompleteDialog} onOpenChange"));
  const freeBranch = dialog.slice(0, dialog.indexOf("Section Completed!"));
  assert(
    !freeBranch.includes("Start Next Section"),
    "free mode already submitted every section — there is nothing to proceed to"
  );
  assertContains(freeBranch, "View Results");
});

test("Submit stays reachable from anywhere in a free-navigation paper", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "Submit Exam");
  assertContains(src, "const atEndOfPaper = isFreeNav");
});

test("the submit confirmation names the sections still left unanswered", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "perSectionSummary.map((s)");
  assertContains(src, "of ${s.total} left");
});

test("the intro screen states the format before the student starts", () => {
  const src = readSrc("pages/ExamIntro.tsx");
  assertContains(src, "You can switch between sections");
  assertContains(src, "One section at a time");
  assertContains(src, "for the whole paper");
});

test("tabs carry each section's answered count", () => {
  const src = readSrc("components/exam/SectionTabs.tsx");
  assertContains(src, "sectionProgress(questions, questionStates)");
  assertContains(src, "{answered}/{total}");
});

// ─── [11] Locked mode is untouched ──────────────────────────────────────────
console.log("\n[11] Locked mode regression");

test("the per-section start screen and clock still exist", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "Time Limit: {section?.time_minutes} minutes");
  assertContains(src, "handleProceedToNextSection", "sequential hand-off must still be there");
  assertContains(src, "Start Next Section");
});

test("the attempt is still created on Start, never on page load", () => {
  // Guards the same property as regression.test.mjs [4], which the rewritten
  // start path could easily have broken.
  const src = readSrc("pages/ExamSimulator.tsx");
  const fetchFn = src.slice(
    src.indexOf("const fetchSectionAndQuestions"),
    src.indexOf("const handleStartSection")
  );
  assert(
    !fetchFn.includes('.from("attempts")'),
    "loading the page must not create an attempt row"
  );
  assertContains(
    src.slice(src.indexOf("const handleStartSection")),
    'from("attempts")'
  );
});

test("a creator preview still records nothing", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "if (user && !isPreview)");
  assertContains(src, "if (isPreview) {");
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
}
console.log(`${"─".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
