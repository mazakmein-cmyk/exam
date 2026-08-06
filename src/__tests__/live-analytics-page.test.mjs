/**
 * LIVE EXAM — POST-SESSION ANALYTICS (Tier 0 + Tier 1)
 *
 * Run with: node src/__tests__/live-analytics-page.test.mjs
 *
 * Three properties carry the weight here:
 *
 *  1. The deep dive NEVER travels on the public link. Its queries are
 *     creator-gated by RLS, and the page must not even render the tabs on the
 *     token path — student-level detail is the most sensitive data the live
 *     system holds.
 *  2. Per-student numbers are recomputed from responses, not read from
 *     participant totals — compute_live_rankings runs from the creator's tab
 *     on a timer, and a closed laptop leaves totals stale forever.
 *  3. The report is REACHABLE. The whole reason this feature exists is that a
 *     finished session's report had no link anywhere in the UI.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  DROPOFF_TAIL,
  askedQuestionCount,
  buildQuestionRows,
  accuracyByOrdinal,
  buildStudentRows,
  buildHeatmap,
  studentsToCheckOn,
  overviewExtras,
  pacingRows,
  median,
} from "../lib/live/reportInsights.js";

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

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");

const PAGE = readSrc("pages/LiveExamReport.tsx");
const DASHBOARD = readSrc("pages/Dashboard.tsx");
const DETAIL = readSrc("pages/LiveExamDetail.tsx");
const SERVICE = readSrc("services/liveExamService.ts");
const STUDENTS_TAB = readSrc("components/live/report/ReportStudentsTab.tsx");
const QUESTIONS_TAB = readSrc("components/live/report/ReportQuestionsTab.tsx");
const INSIGHTS = readSrc("lib/live/reportInsights.js");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const T0 = "2026-08-06T10:00:00.000Z";
const at = (secs) => new Date(Date.parse(T0) + secs * 1000).toISOString();

const questions = [
  { id: "q0", time_seconds: 30, options: ["a", "b"], answer_type: "single", correct_answer: "0", text: "Q1" },
  { id: "q1", time_seconds: 60, options: ["a", "b"], answer_type: "single", correct_answer: "1", text: "Q2" },
  { id: "q2", time_seconds: 45, options: ["a", "b"], answer_type: "single", correct_answer: "0", text: "Q3" },
  { id: "q3", time_seconds: 45, options: ["a", "b"], answer_type: "single", correct_answer: "0", text: "Q4 (never asked)" },
];

const analytics = [
  { live_question_id: "q0", total_responses: 4, correct_count: 3, wrong_count: 1, skipped_count: 0 },
  { live_question_id: "q1", total_responses: 4, correct_count: 1, wrong_count: 3, skipped_count: 0 },
  // q2 asked but analytics never computed (creator tab closed) — must not crash anything.
];

const pacing = [
  { ordinal: 0, unlocked_at: at(0), extra_seconds: 0, undo_count: 0 },
  { ordinal: 1, unlocked_at: at(45), extra_seconds: 30, undo_count: 1 },
  { ordinal: 2, unlocked_at: at(160), extra_seconds: -20, undo_count: 0 },
];

const participants = [
  // Stale totals on purpose: total_correct disagrees with the response rows below.
  { user_id: "alice", display_name: "Alice", joined_at: at(-60), rank: 1, total_correct: 0, total_answered: 0 },
  { user_id: "bob", display_name: "Bob", joined_at: at(-50), rank: 2, total_correct: 0, total_answered: 0 },
  { user_id: "cara", display_name: "Cara", joined_at: at(-40), rank: 3, total_correct: 0, total_answered: 0 },
  { user_id: "dave", display_name: "Dave", joined_at: at(-30), rank: null, total_correct: 0, total_answered: 0 },
];

const responses = [
  { user_id: "alice", question_ordinal: 0, is_correct: true, time_taken_ms: 8000 },
  { user_id: "alice", question_ordinal: 1, is_correct: true, time_taken_ms: 20000 },
  { user_id: "alice", question_ordinal: 2, is_correct: true, time_taken_ms: 11000 },
  { user_id: "bob", question_ordinal: 0, is_correct: true, time_taken_ms: 9000 },
  { user_id: "bob", question_ordinal: 1, is_correct: false, time_taken_ms: 30000 },
  { user_id: "bob", question_ordinal: 2, is_correct: false, time_taken_ms: 15000 },
  // Cara answers Q1 only, then goes silent for the last two → dropped off.
  { user_id: "cara", question_ordinal: 0, is_correct: false, time_taken_ms: 25000 },
  // A row whose grade is (bad-data) unknown:
  { user_id: "bob", question_ordinal: 3, is_correct: null, time_taken_ms: 1000 }, // beyond askedCount, ignored by heatmap
];

const confusion = [
  { user_id: "cara", live_question_id: "q0" },
  { user_id: "cara", live_question_id: "q1" },
];

// ─── [1] askedQuestionCount ──────────────────────────────────────────────────
console.log("\n[1] Asked ≠ authored");

test("counts from the pacing log, not the question list", () => {
  const n = askedQuestionCount({ pacing, responses: [], analyticsOrdinals: [] });
  assert(n === 3, `expected 3, got ${n}`);
});

test("responses and analytics vote when the unlock log is missing (pre-v2)", () => {
  assert(askedQuestionCount({ pacing: [], responses, analyticsOrdinals: [] }) === 4);
  assert(askedQuestionCount({ pacing: [], responses: [], analyticsOrdinals: [0, 1] }) === 2);
});

test("a session that ended before Q1 counts zero", () => {
  assert(askedQuestionCount({}) === 0);
});

// ─── [2] Question rows ──────────────────────────────────────────────────────
console.log("\n[2] Question rows and the difficulty curve");

test("joins analytics by question id; ordinal is the array index", () => {
  const rows = buildQuestionRows({ questions, analytics });
  assert(rows.length === 4);
  assert(rows[0].accuracyPct === 75, `Q1 accuracy ${rows[0].accuracyPct}`);
  assert(rows[1].accuracyPct === 25, `Q2 accuracy ${rows[1].accuracyPct}`);
  assert(rows[2].analytics === null && rows[2].accuracyPct === null, "missing analytics must be null, not fabricated");
});

test("the curve slices to askedCount and keeps gaps as null (no invented zeros)", () => {
  const rows = buildQuestionRows({ questions, analytics });
  const curve = accuracyByOrdinal(rows, 3);
  assert(curve.length === 3);
  assert(curve[2].accuracy === null, "unanswered question must chart as a gap");
  assert(curve[0].name === "Q1" && curve[2].name === "Q3");
});

// ─── [3] Student rows: responses are the record ─────────────────────────────
console.log("\n[3] Per-student numbers come from responses, not stale totals");

const studentRows = buildStudentRows({ participants, responses, confusion, askedCount: 3 });
const byName = new Map(studentRows.map((s) => [s.name, s]));

test("correct/answered recomputed from response rows", () => {
  const alice = byName.get("Alice");
  assert(alice.correct === 3 && alice.answered === 3, "Alice should be 3/3 despite stale participant totals");
  assert(alice.accuracyPct === 100);
  const bob = byName.get("Bob");
  assert(bob.correct === 1, `Bob correct ${bob.correct}`);
});

test("average time is over all answers, rounded", () => {
  const alice = byName.get("Alice");
  assert(alice.avgTimeMs === Math.round((8000 + 20000 + 11000) / 3), `got ${alice.avgTimeMs}`);
});

test(`drop-off = answered something, then missed the last ${DROPOFF_TAIL}+ questions`, () => {
  assert(byName.get("Cara").droppedOff === true, "Cara stopped after Q1");
  assert(byName.get("Alice").droppedOff === false);
  assert(byName.get("Bob").droppedOff === false, "Bob answered the final question");
});

test("joined-but-silent is its own state, not a drop-off", () => {
  const dave = byName.get("Dave");
  assert(dave.neverAnswered === true && dave.droppedOff === false);
  assert(dave.accuracyPct === null && dave.avgTimeMs === null);
});

test("confusion taps are counted per student", () => {
  assert(byName.get("Cara").confusionCount === 2);
  assert(byName.get("Alice").confusionCount === 0);
});

// ─── [4] Heatmap ────────────────────────────────────────────────────────────
console.log("\n[4] The class grid");

test("cells are correct/wrong/skipped, sized by askedCount", () => {
  const grid = buildHeatmap({ studentRows, askedCount: 3 });
  const alice = grid.find((g) => g.name === "Alice");
  assert(alice.cells.length === 3);
  assert(alice.cells.every((c) => c.state === "correct"));
  const cara = grid.find((g) => g.name === "Cara");
  assert(cara.cells[0].state === "wrong" && cara.cells[1].state === "skipped");
});

test("a null grade renders as 'answered', never silently as wrong", () => {
  const grid = buildHeatmap({
    studentRows: buildStudentRows({
      participants,
      responses: [{ user_id: "bob", question_ordinal: 1, is_correct: null, time_taken_ms: 5000 }],
      confusion: [],
      askedCount: 3,
    }),
    askedCount: 3,
  });
  const bob = grid.find((g) => g.name === "Bob");
  assert(bob.cells[1].state === "answered", `got ${bob.cells[1].state}`);
});

test("out-of-range ordinals are ignored, not crashed on", () => {
  const grid = buildHeatmap({ studentRows, askedCount: 2 });
  assert(grid.every((g) => g.cells.length === 2));
});

// ─── [5] Check-in list and overview extras ──────────────────────────────────
console.log("\n[5] Who to check in on, and the headline extras");

test("flags carry human-readable reasons", () => {
  const flagged = studentsToCheckOn(studentRows);
  const names = flagged.map((f) => f.row.name);
  assert(names.includes("Cara"), "Cara: low accuracy + dropped off + confusion");
  assert(names.includes("Dave"), "Dave: never answered");
  assert(!names.includes("Alice"), "Alice is fine");
  const cara = flagged.find((f) => f.row.name === "Cara");
  assert(cara.reasons.some((r) => r.includes("stopped answering after Q1")), cara.reasons.join(", "));
  assert(cara.reasons.some((r) => r.includes("lost")), "confusion reason missing");
});

test("the list is capped and worst-first", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    userId: `u${i}`, name: `S${i}`, rank: null, joinedAt: T0,
    answered: 0, correct: 0, accuracyPct: null, avgTimeMs: null,
    lastAnsweredOrdinal: -1, neverAnswered: true, droppedOff: false,
    confusionCount: 0, responses: [],
  }));
  assert(studentsToCheckOn(many).length === 5);
});

test("median handles odd, even and empty", () => {
  assert(median([1, 3, 5]) === 3);
  assert(median([1, 3]) === 2);
  assert(median([]) === null);
});

test("overview extras: median score, participation, drop-off count", () => {
  const extras = overviewExtras({ studentRows, askedCount: 3 });
  // corrects are [3,1,0,0] → median 0.5
  assert(extras.medianCorrect === 0.5, `median ${extras.medianCorrect}`);
  // answered/3 clamped at 1: [1, 1 (Bob's stray Q4 row must not exceed 100%), 1/3, 0] → mean ≈ 58%
  assert(extras.participationPct === 58, `participation ${extras.participationPct}`);
  assert(extras.dropOffCount === 2, "Cara dropped off + Dave never answered");
});

// ─── [6] Pacing rows ────────────────────────────────────────────────────────
console.log("\n[6] Pacing: granted and cut keep their signs, talk gaps are derived");

test("granted time, early closes and undos are separated", () => {
  const rows = pacingRows({ pacing, questions, endedAt: at(220) });
  assert(rows[0].grantedSeconds === 0 && !rows[0].closedEarly);
  assert(rows[1].grantedSeconds === 30 && rows[1].undoCount === 1);
  assert(rows[2].closedEarly && rows[2].cutSeconds === 20 && rows[2].grantedSeconds === 0);
});

test("the open window is planned + signed extra, clamped at zero", () => {
  const rows = pacingRows({ pacing, questions, endedAt: null });
  assert(rows[0].windowSeconds === 30);
  assert(rows[1].windowSeconds === 90, `Q2 window ${rows[1].windowSeconds}`);
  assert(rows[2].windowSeconds === 25, `Q3 window ${rows[2].windowSeconds}`);
});

test("talk gap = next unlock minus this question's deadline; last runs to ended_at", () => {
  const rows = pacingRows({ pacing, questions, endedAt: at(220) });
  // Q1: unlocked 0, window 30 → next unlock at 45 → gap 15
  assert(rows[0].talkGapSeconds === 15, `gap0 ${rows[0].talkGapSeconds}`);
  // Q2: unlocked 45, window 90 → next unlock 160 → gap 25
  assert(rows[1].talkGapSeconds === 25, `gap1 ${rows[1].talkGapSeconds}`);
  // Q3: unlocked 160, window 25 → ended 220 → gap 35
  assert(rows[2].talkGapSeconds === 35, `gap2 ${rows[2].talkGapSeconds}`);
});

test("without ended_at the last gap is unknown, not zero", () => {
  const rows = pacingRows({ pacing, questions, endedAt: null });
  assert(rows[2].talkGapSeconds === null);
});

// ─── [7] The public link never carries the deep dive ────────────────────────
console.log("\n[7] Deep dive stays creator-only");

test("the page only fetches the deep dive on the creator path", () => {
  assert(
    /if \(!isPublic && liveExamId\)[\s\S]{0,400}fetchLiveDeepDive/.test(PAGE),
    "fetchLiveDeepDive must sit inside the !isPublic branch"
  );
});

test("the public path renders the recap alone — no Tabs", () => {
  const branch = PAGE.indexOf("{isPublic ? (");
  const tabs = PAGE.indexOf("<Tabs", branch);
  assert(branch !== -1, "public/creator branch missing");
  assert(tabs !== -1 && tabs > branch, "Tabs must live in the creator side of the branch");
  const recapFirst = PAGE.indexOf("recapSections", branch);
  assert(recapFirst !== -1 && recapFirst < tabs, "the public side must render recapSections directly");
});

test("deep-dive failure is non-fatal: the recap still renders", () => {
  assert(PAGE.includes("setDeepError"), "deep errors must be caught separately");
  assert(
    /catch \(deepErr[\s\S]{0,200}setDeepError/.test(PAGE),
    "fetchLiveDeepDive must have its own catch"
  );
});

// ─── [8] Reachability (Tier 0) ──────────────────────────────────────────────
console.log("\n[8] The report is reachable");

test("Dashboard: ended live cards link to the report", () => {
  assert(
    DASHBOARD.includes("/live-exam/${user.id}/${exam.id}/report"),
    "no report link on the dashboard's live cards"
  );
  const gate = DASHBOARD.indexOf('exam.status === "ended" ? (');
  const link = DASHBOARD.indexOf("/live-exam/${user.id}/${exam.id}/report");
  assert(gate !== -1 && gate < link, "the report button must be gated on ended status");
});

test("editor: the ended banner links to the report", () => {
  assert(DETAIL.includes("View session report"), "banner button missing");
  assert(
    DETAIL.includes("/live-exam/${creatorId}/${liveExamId}/report"),
    "banner must navigate to the report route"
  );
});

// ─── [9] Service and rendering hygiene ──────────────────────────────────────
console.log("\n[9] Hygiene");

test("bulk response reads page past PostgREST's 1000-row cap", () => {
  const fn = SERVICE.slice(SERVICE.indexOf("export async function fetchAllLiveResponses"));
  assert(fn.includes(".range(from, from + DEEP_DIVE_PAGE_SIZE - 1)"), "fetchAllLiveResponses must page");
  const fn2 = SERVICE.slice(SERVICE.indexOf("export async function fetchLiveConfusionSignals"));
  assert(fn2.includes(".range(from, from + DEEP_DIVE_PAGE_SIZE - 1)"), "fetchLiveConfusionSignals must page");
});

test("heatmap cells never speak in color alone (glyphs + validated pair)", () => {
  assert(STUDENTS_TAB.includes("bg-emerald-700") && STUDENTS_TAB.includes("bg-rose-400"),
    "the CVD-validated emerald-700/rose-400 pair is required — the 500 steps fail deutan separation");
  assert(STUDENTS_TAB.includes('"✓"') && STUDENTS_TAB.includes('"✕"'), "cells must carry glyphs");
});

test("the difficulty curve is a single series with no invented zeros", () => {
  assert(QUESTIONS_TAB.includes("connectNulls={false}"), "gaps must stay gaps");
  assert(!QUESTIONS_TAB.includes("Legend"), "a single series needs no legend box");
});

test("reportInsights stays pure (no Date.now, no randomness, no imports of services)", () => {
  assert(!INSIGHTS.includes("Date.now"), "no wall-clock reads");
  assert(!INSIGHTS.includes("Math.random"), "no randomness");
  assert(!INSIGHTS.includes("supabase"), "no data access from the math layer");
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}: ${f.error}`);
  process.exit(1);
}
