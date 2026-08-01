/**
 * LIVE EXAM v2 — PHASE 5: A9, C10, C7, C1
 *
 * Run with: node src/__tests__/live-v2-phase5.test.mjs
 *
 * The load-bearing test in this file is the isolation one: a rehearsal that wrote
 * a single row into a real leaderboard would be worse than having no rehearsal,
 * and nothing about that failure would throw. Everything else here is ordinary.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  makeRng,
  makeCohort,
  simulateQuestion,
  difficultyFor,
  eventsToAnalytics,
} from "../lib/live/rehearsal.js";

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
    throw new Error(`${message || "Mismatch"} — expected ${expected}, got ${actual}`);
  }
}

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");
const readMigration = (f) => readFileSync(resolve(ROOT, "supabase", "migrations", f), "utf-8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SQL = readMigration("20260806000000_live_v2_authoring.sql");
const REHEARSAL = readSrc("lib/live/rehearsal.js");
const DRIVER = readSrc("hooks/useRehearsal.ts");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const EDITOR = readSrc("pages/LiveExamDetail.tsx");
const COUNTDOWN = readSrc("components/live/ScheduledCountdown.tsx");

// ─── [1] C1 isolation — the one that matters ────────────────────────────────
console.log("\n[1] C1 — a rehearsal cannot reach the database");

test("the simulation module imports nothing that could reach a network", () => {
  const imports = [...REHEARSAL.matchAll(/^import\s.*$/gm)].map((m) => m[0]);
  assertEqual(imports.length, 0, `rehearsal.js must be pure, found: ${imports.join(" | ")}`);
  assert(!/supabase|fetch\(|XMLHttpRequest/.test(REHEARSAL), "no client, no fetch");
});

test("the driver imports no supabase client either", () => {
  const code = stripComments(DRIVER);
  assert(
    !/from "@\/integrations\/supabase/.test(code),
    "the guarantee is structural — there must be no path to disable, not a flag"
  );
  assert(!/liveExamService/.test(code), "and no service layer, which would import one");
});

test("the tally poll is switched off during a rehearsal", () => {
  // The one place a rehearsal could still have touched the network.
  assert(
    /hasOpenQuestion && !rehearsal\.active/.test(CONTROL),
    "polling the server about a simulated question would be both wrong and pointless"
  );
});

test("the rehearsal banner is unmissable and cannot be confused with live", () => {
  assert(/Rehearsal · nothing is saved/.test(CONTROL), "must be labelled");
  // Structural rather than proximity-based: the rehearsal badge must be the TRUE
  // branch of the same ternary whose false branch shows "On air", so the two can
  // never render together. A character-distance regex was fragile here — the
  // markup happened to sit right on the window boundary.
  const badge = CONTROL.slice(
    CONTROL.indexOf("{rehearsal.active ? ("),
    CONTROL.indexOf("On air")
  );
  assert(badge.length > 0, "the rehearsal branch must precede the On air branch");
  assert(
    /FlaskConical/.test(badge) && /Rehearsal/.test(badge),
    "the rehearsal badge must replace the On air badge, not sit beside it"
  );
});

// ─── [2] C1 simulation quality ──────────────────────────────────────────────
console.log("\n[2] C1 — a rehearsal has to teach something");

test("the same seed always produces the same rehearsal", () => {
  const a = makeCohort(10, makeRng(42));
  const b = makeCohort(10, makeRng(42));
  assertEqual(JSON.stringify(a), JSON.stringify(b), "a creator must be able to practise twice");
});

test("the cohort has a spread of ability, not a uniform class", () => {
  const cohort = makeCohort(30, makeRng(7));
  const skills = cohort.map((s) => s.skill);
  const spread = Math.max(...skills) - Math.min(...skills);
  assert(spread > 0.35, `too uniform (${spread.toFixed(2)}) — every insight would look the same`);
  assert(cohort.some((s) => s.flaky), "some students must drop off, or the offline rule never shows");
});

test("wrong answers cluster on a distractor rather than spreading evenly", () => {
  // Without this the misconception classifier reports "scattered" every time and a
  // rehearsal never shows the creator what a real misconception looks like.
  const cohort = makeCohort(60, makeRng(3));
  const events = simulateQuestion(
    cohort,
    { optionCount: 4, correctIndex: 0, difficulty: 0.7, windowMs: 60000 },
    makeRng(3)
  );
  const wrong = events.filter((e) => !e.correct);
  const counts = [0, 0, 0, 0];
  wrong.forEach((e) => (counts[e.optionIndex] += 1));
  const topWrong = Math.max(counts[1], counts[2], counts[3]);
  assert(wrong.length >= 10, `not enough wrong answers to judge (${wrong.length})`);
  assert(
    topWrong > wrong.length * 0.4,
    `distractor took only ${topWrong}/${wrong.length} — too even to look like a misconception`
  );
});

test("answers arrive spread over the window, not all at once", () => {
  const cohort = makeCohort(40, makeRng(11));
  const events = simulateQuestion(
    cohort,
    { optionCount: 4, correctIndex: 1, difficulty: 0.4, windowMs: 60000 },
    makeRng(11)
  );
  const times = events.map((e) => e.atMs);
  assert(Math.min(...times) < 20000, "some answer early");
  assert(Math.max(...times) > 30000, "and some straggle — watching the count climb is the point");
  assert(
    events.every((e, i) => i === 0 || e.atMs >= events[i - 1].atMs),
    "events must be ordered so the driver can release them in time"
  );
});

test("difficulty follows an arc so the session is not flat", () => {
  const rng = makeRng(5);
  const ds = Array.from({ length: 9 }, (_, i) => difficultyFor(i, 9, rng));
  const mid = ds[4];
  assert(mid > ds[0] || mid > ds[8], "the middle should be harder than at least one end");
  assert(ds.every((d) => d > 0 && d < 1), "and all must stay in range");
});

test("simulated events aggregate into the REAL analytics shape", () => {
  // So every insight surface renders from the fields it would in a live session,
  // with no rehearsal-specific rendering path anywhere.
  const cohort = makeCohort(20, makeRng(9));
  const events = simulateQuestion(
    cohort,
    { optionCount: 4, correctIndex: 2, difficulty: 0.5, windowMs: 30000 },
    makeRng(9)
  );
  const a = eventsToAnalytics(events, 20, 30000);
  for (const field of [
    "total_responses", "correct_count", "wrong_count", "skipped_count",
    "option_distribution", "median_time_ms", "fast_correct", "slow_correct",
    "fast_wrong", "slow_wrong", "impulsive_wrong", "time_histogram", "confusion_count",
  ]) {
    assert(field in a, `missing ${field} — an insight surface would render blank`);
  }
  assertEqual(a.time_histogram.length, 12, "histogram must match the server's bucket count");
  assertEqual(
    a.fast_correct + a.slow_correct + a.fast_wrong + a.slow_wrong,
    a.total_responses,
    "the four B6 quadrants must account for every response"
  );
  assert(
    Object.keys(a.option_distribution).every((k) => /^"\d+"$/.test(k)),
    "keys must match the jsonb-string shape SQL produces, or the normaliser mis-reads them"
  );
});

// ─── [3] C7 reorder ─────────────────────────────────────────────────────────
console.log("\n[3] C7 — reordering is atomic and moves every language");

test("the RPC refuses once a session has started", () => {
  assert(
    /REORDER_SESSION_ACTIVE/.test(SQL),
    "current_question_index points at a POSITION; shuffling under it changes which question is on screen"
  );
});

test("the RPC validates the id set exactly", () => {
  assert(
    /REORDER_SET_MISMATCH/.test(SQL),
    "a partial or duplicated list would leave gaps or collisions in q_no"
  );
});

test("language siblings are moved with the question", () => {
  assert(/question_group_id/.test(SQL), "siblings are linked by group id");
  assert(
    /v_group_order/.test(SQL),
    "the new order must be expressed as group ids and applied to every language"
  );
});

test("global_index is renumbered in the same transaction", () => {
  assert(/renumber_live_global_indexes/.test(SQL));
  assert(
    /PARTITION BY s\.language/.test(SQL),
    "each language is walked separately so sibling ordinals keep matching"
  );
});

test("the editor rolls back a failed reorder instead of showing it as saved", () => {
  const code = stripComments(EDITOR);
  assert(/setQuestions\(previous\)/.test(code), "must restore the old order");
  assert(
    /Couldn't save the new order/.test(EDITOR),
    "and say so — a wrong order shown as saved is worse than a visible failure"
  );
});

test("the editor disables dragging once the exam is live", () => {
  const code = stripComments(EDITOR);
  assert(/const canReorder = exam\?\.status !== "live"/.test(code));
  assert(/disabled=\{!canReorder\}/.test(code), "the handle must disappear, not just fail on drop");
});

// ─── [4] A9 / C10 ───────────────────────────────────────────────────────────
console.log("\n[4] A9 and C10 — scheduling");

test("the countdown renders only when a time was actually set", () => {
  assert(
    /if \(target === null\) return null;/.test(COUNTDOWN),
    "an unscheduled session must keep its honest open-ended message"
  );
  for (const [name, page] of [["student", readSrc("pages/LiveExamStudent.tsx")], ["present", readSrc("pages/LiveExamPresent.tsx")]]) {
    assert(
      /scheduledStartAt/.test(page),
      `${name} must gate the countdown on the scheduled time`
    );
  }
});

test("the countdown runs on server-corrected time, never Date.now", () => {
  const code = stripComments(COUNTDOWN);
  assert(/serverNow\(\)/.test(code), "must use the corrected clock");
  assert(
    !/Date\.now\(\)/.test(code),
    "phones are routinely minutes off; two devices disagreeing in one room is worse than no countdown"
  );
});

test("it never shows a negative number", () => {
  assert(
    /Starting shortly/.test(COUNTDOWN),
    "past zero, -00:04:12 reads as broken software rather than a teacher running late"
  );
});

test("auto-start is opt-in and never fires unattended", () => {
  const code = stripComments(CONTROL);
  assert(/session\.autoStart/.test(code), "must be gated on the setting");
  assert(
    /session\.status !== "published"/.test(code),
    "and only from a published exam"
  );
  assert(
    /autoStartFiredRef/.test(code),
    "and exactly once — a re-render must not start the session twice"
  );
  const schedule = readSrc("components/live/ScheduleControl.tsx");
  assert(
    /Nothing starts unattended/.test(schedule),
    "the constraint must be stated to the creator, not hidden"
  );
});

test("the scheduled time is stored as an instant, not a naive local string", () => {
  const schedule = stripComments(readSrc("components/live/ScheduleControl.tsx"));
  assert(
    /asDate\.toISOString\(\)/.test(schedule),
    "storing local text would make the countdown disagree across time zones"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exitCode = 1;
}
console.log(`${"─".repeat(60)}\n`);
