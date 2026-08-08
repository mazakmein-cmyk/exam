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
import { reconcileTimingLine } from "../lib/examInstructionEngine.js";
import {
  auditInstructionTiming,
  describeTimingDrift,
  effectivePaperMinutes,
} from "../lib/instructionTimingAudit.js";

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

// ─── [12] Instructions that went out of date ────────────────────────────────
console.log("\n[12] Instruction timing audit");

const LOCKED_PAPER = { allowSectionSwitching: false, totalMinutes: 155, sectionMinutes: [30, 30, 30, 30] };
const FREE_PAPER = { allowSectionSwitching: true, totalMinutes: 155, sectionMinutes: [30, 30, 30, 30] };

test("a locked paper is worth the sum of its sections, whatever the total says", () => {
  // The stored total_time_minutes is ignored in locked mode — the runner gives
  // each section its own clock, so 155 is not a number any student will see.
  assertEqual(effectivePaperMinutes(LOCKED_PAPER), 120);
  assertEqual(effectivePaperMinutes(FREE_PAPER), 155);
});

test("the reported bug: text claiming 155 min on a 120 min paper", () => {
  const findings = auditInstructionTiming(
    "You have 155 minutes for the whole paper. All sections share one clock.",
    LOCKED_PAPER
  );
  assertEqual(findings.length, 2, "both the number and the mode are wrong");
  assertEqual(findings[0].kind, "duration");
  assertEqual(findings[0].stated, 155);
  assertEqual(findings[0].expected, 120);
  assertEqual(findings[1].kind, "mode");
  assertContains(describeTimingDrift(findings), "it says 155 min, but students get 120 min");
});

test("text that agrees with the paper says nothing", () => {
  assertEqual(
    auditInstructionTiming(
      "You have 120 minutes. Sections are sat one at a time, each on its own clock.",
      LOCKED_PAPER
    ).length,
    0
  );
  assertEqual(
    auditInstructionTiming("You have 155 minutes for the whole paper. All sections share one clock.", FREE_PAPER).length,
    0
  );
});

test("the five-minute warning is not a claim about the paper's length", () => {
  // The standard General Instructions say "a warning appears when 5 minutes
  // remain". Flagging that would train creators to ignore the warning.
  assertEqual(
    auditInstructionTiming(
      "The paper is submitted automatically when time runs out; a warning appears when 5 minutes remain.",
      LOCKED_PAPER
    ).length,
    0
  );
});

test("listing a section's own clock is legitimate", () => {
  assertEqual(
    auditInstructionTiming("Each section is 30 minutes long.", LOCKED_PAPER).length,
    0,
    "30 is a real section clock on this paper, not a stale claim"
  );
});

test("hours are read as durations too", () => {
  const findings = auditInstructionTiming("You have 3 hours for this paper.", LOCKED_PAPER);
  assertEqual(findings.length, 1);
  assertEqual(findings[0].stated, 180);
});

test("a paper with no clock cannot be contradicted about its clock", () => {
  assertEqual(
    auditInstructionTiming("You have 90 minutes.", {
      allowSectionSwitching: false,
      totalMinutes: null,
      sectionMinutes: [],
    }).length,
    0
  );
  assertEqual(auditInstructionTiming("", LOCKED_PAPER).length, 0);
  assertEqual(describeTimingDrift([]), null);
});

test("a stale generated timing line is corrected before anyone reads it", () => {
  const LOCKED_NOW = {
    sections: [
      { name: "English", minutes: 30, questionCount: 25 },
      { name: "General Awareness", minutes: 30, questionCount: 25 },
      { name: "Reasoning", minutes: 30, questionCount: 20 },
      { name: "Numerical", minutes: 30, questionCount: 20 },
    ],
    allowSectionSwitching: false,
    totalMinutes: 155,
    marking: null,
    answerTypes: null,
    languageNames: null,
  };
  const stale = [
    "1. This paper has 4 sections.",
    "2. You have 155 minutes for the whole paper. All sections share one clock — move between them in any order and change any answer until you submit.",
    "3. Every question is multiple choice with a single correct answer.",
  ].join("\n");
  const out = reconcileTimingLine(stale, LOCKED_NOW, "en");
  assertEqual(out.changed, true);
  assert(!out.text.includes("155 minutes"), "the number nobody will get must not survive");
  assertContains(out.text, "120 minutes in all");
  assertContains(out.text, "2. Each section is timed separately", "the numbering is preserved");
  assertContains(out.text, "3. Every question is multiple choice", "other lines are untouched");
});

test("a creator's own wording is never rewritten", () => {
  const facts = {
    sections: [{ name: "A", minutes: 30, questionCount: 10 }, { name: "B", minutes: 30, questionCount: 10 }],
    allowSectionSwitching: false,
    totalMinutes: 155,
    marking: null,
    answerTypes: null,
    languageNames: null,
  };
  // Says the wrong thing, but this app did not write it — rewriting a creator's
  // prose on their behalf is worse than telling them about it in the editor.
  const out = reconcileTimingLine("2. You get 155 minutes, so be quick.", facts, "en");
  assertEqual(out.changed, false);
  assertContains(out.text, "155 minutes, so be quick");
  // Unsupported language: leave it alone rather than swapping in English.
  assertEqual(reconcileTimingLine("2. Something", facts, "fr").changed, false);
});

test("the creator's preview is the candidate's screen, with no extra notes", () => {
  const intro = readSrc("pages/ExamIntro.tsx");
  assertContains(intro, "reconcileTimingLine(", "the intro corrects the sentence for everyone");
  // The corrected copy flows on through the table dedup (dropShapeLine) and is
  // rendered as shownExamInstruction — same text, same correction, one pipeline.
  assertContains(intro, "dropShapeLine(displayedExamInstruction", "and renders the corrected copy");
  assertContains(intro, "text={shownExamInstruction}", "and renders the corrected copy");
  assert(
    !intro.includes("Only you can see this."),
    "a preview that shows the creator something the candidate cannot see is not a preview"
  );

  // The editor still says the stored text is stale — that is where it is fixed.
  const editor = readSrc("pages/ExamDetail.tsx");
  assertContains(editor, "auditInstructionTiming(text, {");
  assertContains(editor, "{timingDrift && (");
});

test("nobody starts an exam without accepting the declaration", () => {
  const src = readSrc("pages/ExamIntro.tsx");
  assertContains(src, "const [accepted, setAccepted] = useState(false);", "never pre-ticked");
  assertContains(src, "id=\"exam-declaration\"");
  // The gate itself: Start is disabled on !canStart, and canStart requires it.
  assertContains(src, "const canStart = blockedReason === null;");
  assertContains(src, ": !accepted");
  assertContains(src, "disabled={!canStart}");
  assertContains(src, "Tick the declaration to continue.", "a disabled button has to say why");
});

test("the intro is two screens with the step buttons locked to the foot", () => {
  const src = readSrc("pages/ExamIntro.tsx");
  assertContains(src, "exam-frame", "the intro fills the viewport rather than scrolling as one column");
  assertContains(src, "const [step, setStep] = useState(0);");
  assertContains(src, "bodyRef.current?.scrollTo({ top: 0 })", "screen 2 starts at its own first line");

  const footer = src.slice(src.indexOf("{/* Locked footer"));
  assert(footer.includes("setStep(1)"), "Next belongs in the pinned footer");
  assert(footer.includes("setStep(0)"), "so does Back");
  assert(footer.includes("handleStartExam"), "and so does Start");

  // Split across the two screens, not stacked on one.
  const general = src.indexOf("General Instructions");
  const examSpecific = src.indexOf("{displayExamInstruction ? (");
  assert(
    general > -1 && examSpecific > general,
    "general instructions on screen 1, the paper's own instructions on screen 2"
  );
});

test("tabs carry each section's answered count", () => {
  const src = readSrc("components/exam/SectionTabs.tsx");
  assertContains(src, "sectionProgress(questions, questionStates)");
  assertContains(src, "{answered}/{total}");
});

test("a paper with more sections than fit swaps the strip for a picker", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(
    src,
    "allSections.length > SECTION_TAB_LIMIT",
    "past the limit the strip becomes a scrub bar — the picker has to take over"
  );
  assertContains(src, "useSectionPicker ? (");
  assertContains(src, "<SectionPicker");
});

test("the picker is the switcher on mobile at every section count", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const mobileRow = src.slice(src.indexOf('className="lg:hidden flex min-w-0'));
  assert(
    mobileRow.indexOf("<SectionPicker") < mobileRow.indexOf("</div>"),
    "the mobile row must switch sections itself, not point at the palette sheet"
  );
});

test("the picker scrolls its list and searches a long one", () => {
  const src = readSrc("components/exam/SectionPicker.tsx");
  assertContains(src, "max-h-[min(60vh,22rem)] overflow-y-auto", "60 sections must scroll, not overflow the viewport");
  assertContains(src, "SEARCH_THRESHOLD");
  assertContains(src, 'variant="stacked"', "the list reuses the sheet's rows rather than a second design");
});

test("Clear / Previous / Next are pinned, not scrolled to", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // The bar is a sibling of the scroll container, not inside it: sticky
  // positioning inside would let it sit on top of the last option.
  assertContains(src, 'ref={questionScrollRef} className="flex-1 min-h-0 overflow-y-auto');
  const bar = src.slice(src.indexOf("{/* Locked action bar"));
  assert(bar.indexOf("handleClearResponse") > -1, "Clear Response belongs in the pinned bar");
  assert(
    bar.indexOf('handleNavigation("prev")') > -1 && bar.indexOf('handleNavigation("next")') > -1,
    "both navigation buttons belong in the pinned bar"
  );
  assert(
    src.indexOf("{/* Locked action bar") > src.indexOf("</Card>"),
    "the bar sits below the question column, outside it"
  );
});

test("the bar reads Previous · Clear Response · Next, and carries no counter", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const bar = src.slice(
    src.indexOf("{/* Locked action bar"),
    src.indexOf("{/* Desktop Question Palette")
  );
  const prev = bar.indexOf('handleNavigation("prev")');
  const clear = bar.indexOf("handleClearResponse");
  const next = bar.indexOf('handleNavigation("next")');
  assert(prev > -1 && clear > -1 && next > -1, "all three controls live in the bar");
  assert(prev < clear && clear < next, "back left, clear centre, forward right");
  assert(
    !bar.includes("{questions.length}"),
    "the question counter belongs to the palette, not the bar"
  );
});

test("Mark for Review sits right-aligned on the question's metadata line", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const start = src.indexOf("{/* Question metadata");
  assert(start > -1, "the metadata row moved — re-anchor this test");
  // Search for the card *after* the row: earlier screens in this file open Cards too.
  const row = src.slice(start, src.indexOf("<Card", start));
  assertContains(row, "handleMarkForReview");
  assertContains(row, 'className="ml-auto h-7', "hard right, and chip-height so the row stays one line");
});

test("moving to another question scrolls back to its first line", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(
    src,
    "questionScrollRef.current?.scrollTo({ top: 0 })",
    "with Next pinned, a half-scrolled long question would otherwise carry its offset to the next one"
  );
  assertContains(src, "}, [currentQuestionIndex, activeSectionId]);");
});

test("the runner's frame is one viewport tall, address bar included", () => {
  assertContains(readSrc("pages/ExamSimulator.tsx"), "exam-frame");
  const css = readFileSync(resolve(ROOT, "src/index.css"), "utf8");
  const frame = css.slice(css.indexOf(".exam-frame"), css.indexOf(".delay-100"));
  // A definite height, not a floor: with height:auto the flex row inside sizes
  // to the question, the inner scroller never scrolls, and the document does —
  // taking the "pinned" action bar off the bottom of the screen with it.
  assertContains(frame, "height: 100dvh;");
  assertContains(frame, "overflow: hidden;");
  assert(
    !frame.includes("min-height"),
    "min-height is a floor — it does not stop a tall question growing the frame"
  );
});

test("a search narrowed to one section still renders it", () => {
  // SectionTabs used to bail out below two sections, which would have blanked
  // the picker's list on any search specific enough to matter.
  const src = readSrc("components/exam/SectionTabs.tsx");
  assertContains(src, "if (!stacked && sections.length < 2) return null;");
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
