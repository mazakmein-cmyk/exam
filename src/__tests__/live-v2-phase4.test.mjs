/**
 * LIVE EXAM v2 — PHASE 4: B14 MOMENTS AND CELEBRATION
 *
 * Run with: node src/__tests__/live-v2-phase4.test.mjs
 *
 * B14 is the one feature in this project that can fail by being ANNOYING rather
 * than by being wrong, and annoying does not throw. The tests that matter most
 * here are the ones about rotation fairness and about who is allowed to make
 * noise — a version that celebrates the same strong student fifteen times, or
 * that auto-blasts a name to a classroom, would pass every correctness check.
 *
 * Covers:
 *  [1] Rotation fairness — the difference between delightful and grating
 *  [2] Copy is something a teacher can say out loud
 *  [3] Celebration is manual, monotonic, and never replays on reconnect
 *  [4] Names are resolved, never stored — privacy mode holds
 *  [5] The control room stays quiet; the wall does the celebrating
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { selectMoment, momentCopy, withRealNames } from "../lib/live/moments.js";

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

const SQL = readMigration("20260805000000_live_v2_moments.sql");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");

const M = (ordinal, kind, user_id, value, priority, display_name = user_id) => ({
  question_ordinal: ordinal,
  kind,
  user_id,
  display_name,
  value,
  priority,
});

const STREAK = 30;
const COMEBACK = 10;

// ─── [1] Rotation fairness ──────────────────────────────────────────────────
console.log("\n[1] Rotation — the difference between delightful and grating");

test("with no history, priority decides", () => {
  const moments = [M(0, "streak", "alice", 3, STREAK), M(0, "comeback", "bob", 2, COMEBACK)];
  assertEqual(selectMoment(moments, 0).user_id, "bob", "a comeback outranks a streak");
});

test("a fresh face beats a higher-priority repeat", () => {
  // This is the whole feature. Without it the strongest student generates a
  // streak on nearly every question and the same name appears fifteen times.
  const moments = [
    M(0, "comeback", "alice", 2, COMEBACK),
    M(1, "comeback", "alice", 3, COMEBACK),
    M(2, "comeback", "alice", 4, COMEBACK),
    M(2, "streak", "bob", 3, STREAK),
  ];
  assertEqual(
    selectMoment(moments, 2).user_id,
    "bob",
    "alice has been featured twice; bob has never been"
  );
});

test("the same student is not featured twice in a row while anyone else qualifies", () => {
  const moments = [
    M(0, "streak", "alice", 3, STREAK),
    M(1, "streak", "alice", 4, STREAK),
    M(1, "streak", "bob", 3, STREAK),
  ];
  assertEqual(selectMoment(moments, 1).user_id, "bob");
});

test("but a repeat still wins when nobody else has a moment", () => {
  const moments = [M(0, "streak", "alice", 3, STREAK), M(1, "streak", "alice", 4, STREAK)];
  assertEqual(
    selectMoment(moments, 1).user_id,
    "alice",
    "showing nothing would be worse than showing the same name again"
  );
});

test("rotation counts only questions BEFORE this one", () => {
  // Two moments for the same student in the same question must not count against
  // each other, or the second would appear pre-penalised.
  const moments = [M(0, "comeback", "alice", 2, COMEBACK), M(0, "streak", "alice", 5, STREAK)];
  assertEqual(selectMoment(moments, 0).kind, "comeback", "priority decides within one question");
});

test("class-wide moments carry no user and never skew rotation", () => {
  const moments = [
    M(0, "class_first_perfect", null, 30, 50),
    M(1, "class_first_perfect", null, 30, 50),
    M(1, "streak", "alice", 3, STREAK),
  ];
  assertEqual(selectMoment(moments, 1).user_id, "alice", "a streak outranks a class note");
  assert(selectMoment(moments, 0).user_id === null, "and the class note still shows when alone");
});

test("a question with no moments yields nothing", () => {
  assertEqual(selectMoment([M(0, "streak", "a", 3, STREAK)], 5), null);
  assertEqual(selectMoment([], 0), null);
  assertEqual(selectMoment(null, 0), null);
});

test("selection is deterministic — the same input always picks the same moment", () => {
  const moments = [
    M(0, "streak", "alice", 3, STREAK),
    M(0, "streak", "bob", 3, STREAK),
  ];
  const first = selectMoment(moments, 0).user_id;
  for (let i = 0; i < 20; i++) {
    assertEqual(selectMoment(moments, 0).user_id, first, "a flickering pick would be worse than none");
  }
});

// ─── [2] Copy ───────────────────────────────────────────────────────────────
console.log("\n[2] Copy — something a teacher can read out");

test("every kind has copy, and none of it is a scoreboard reading", () => {
  const kinds = ["comeback", "lone_correct", "streak", "perfect_run", "class_first_perfect"];
  kinds.forEach((kind) => {
    const copy = momentCopy(M(0, kind, "Sana", 3, 10, "Sana"));
    assert(copy, `no copy for ${kind}`);
    assert(copy.headline.length > 0 && copy.detail.length > 0, `${kind} is missing text`);
    assert(copy.emoji.length > 0, `${kind} is missing an emoji`);
    assert(
      !/achieved|attained|score of|rank/i.test(copy.headline),
      `${kind} reads like a scoreboard: "${copy.headline}"`
    );
  });
});

test("the comeback line says what actually happened", () => {
  const copy = momentCopy(M(3, "comeback", "sana", 3, COMEBACK, "Sana"));
  assert(/Sana/.test(copy.headline), "names the student");
  assert(/turned it around/i.test(copy.headline), "and frames it as improvement");
  assert(/3/.test(copy.detail), "and carries the number");
});

test("a missing name degrades to something sayable, not to 'null'", () => {
  const copy = momentCopy(M(0, "streak", "u1", 4, STREAK, null));
  assert(!/null|undefined/.test(copy.headline), `leaked a null: "${copy.headline}"`);
});

test("an unknown kind renders nothing rather than something broken", () => {
  assertEqual(momentCopy(M(0, "future_kind", "a", 1, 99)), null);
  assertEqual(momentCopy(null), null);
});

// ─── [3] Celebration ────────────────────────────────────────────────────────
console.log("\n[3] Celebration — manual, monotonic, no replay");

test("the counter is monotonic, not a broadcast event", () => {
  assert(
    /celebrate_seq = celebrate_seq \+ 1/.test(SQL),
    "an event cannot be told apart from a replay after a reconnect"
  );
  assert(/CELEBRATE_NOT_ALLOWED/.test(SQL), "and only the creator of a live exam may fire it");
});

test("the first observation establishes a baseline and fires nothing", () => {
  // Otherwise every page load in a session that had already celebrated once would
  // open with confetti.
  for (const page of [PRESENT, STUDENT]) {
    assert(
      /celebratedSeqRef\.current === null && !session\.loading/.test(page),
      "a baseline must be set from the first sync"
    );
    assert(
      /shouldCelebrate\(celebratedSeqRef\.current, seq\)/.test(page),
      "and firing must be gated on it"
    );
  }
});

test("reduced motion silences the confetti but not the sound", () => {
  const celebrate = readSrc("lib/live/celebrate.ts");
  assert(/prefersReducedMotion/.test(celebrate), "must check the preference");
  const soundAt = celebrate.indexOf("playCelebrate()");
  const guardAt = celebrate.indexOf("if (prefersReducedMotion()) return;");
  assert(
    soundAt > 0 && guardAt > soundAt,
    "reduced motion is a vestibular setting, not a request for silence — the sound must play first"
  );
  assert(/disableForReducedMotion: true/.test(celebrate), "and confetti must opt in as well");
});

test("particle counts are capped, and lower on a phone than a projector", () => {
  const celebrate = readSrc("lib/live/celebrate.ts");
  const display = Number(/PARTICLES_DISPLAY = (\d+)/.exec(celebrate)?.[1]);
  const phone = Number(/PARTICLES_PHONE = (\d+)/.exec(celebrate)?.[1]);
  assert(display > 0 && phone > 0, "both must be defined");
  assert(phone < display, "a mid-range phone should not do a projector's work");
  assert(display <= 200, `${display} particles is more than a 1080p wall needs`);
});

test("the control room never fires confetti on itself", () => {
  const code = stripComments(CONTROL);
  assert(
    !/fireCelebration/.test(code),
    "the cockpit must stay responsive at the moment the creator is about to press something, and it has no audience"
  );
  assert(/celebrateLiveExam/.test(code), "it triggers the celebration for everyone else");
});

// ─── [4] Privacy ────────────────────────────────────────────────────────────
console.log("\n[4] Names are resolved, never stored");

test("live_moments stores a user_id and no name", () => {
  const table = SQL.slice(SQL.indexOf("CREATE TABLE IF NOT EXISTS public.live_moments"), SQL.indexOf("CREATE INDEX IF NOT EXISTS idx_live_moments_exam"));
  assert(/user_id/.test(table), "the identity must be stored");
  assert(
    !/display_name|name\s+TEXT/.test(table),
    "a snapshotted name fights privacy mode, which can be toggled at any time — the exact trap that produced the Phase 1 leak"
  );
});

test("the read RPC masks the name and withholds the id from non-creators", () => {
  const fn = SQL.slice(SQL.indexOf("FUNCTION public.get_live_moments"));
  const body = fn.slice(0, fn.indexOf("$$;")).replace(/--[^\n]*/g, "");
  assert(/live_anon_name/.test(body), "must mask under privacy mode");
  assert(
    /WHEN v_exam\.user_id = auth\.uid\(\) THEN lm\.user_id ELSE NULL/.test(body),
    "a user_id is a join key back to a real person — Phase 1 established that"
  );
});

test("only the control room swaps real names back in", () => {
  // Comment-stripped, because the present page's comment explains WHY it does not
  // call withRealNames — and a grep over prose proves nothing about code. This is
  // the third time in this project that a raw-source grep matched an explanation
  // instead of an implementation.
  assert(/withRealNames/.test(stripComments(CONTROL)), "the creator's deck resolves the truth");
  assert(
    !/withRealNames/.test(stripComments(PRESENT)),
    "the projector is creator-authenticated but pointed at a class; it must keep the masked names"
  );
});

test("withRealNames leaves unknown users and class moments untouched", () => {
  const names = new Map([["alice", "Alice Chen"]]);
  const out = withRealNames(
    [M(0, "streak", "alice", 3, STREAK, "Brave Badger"), M(0, "class_first_perfect", null, 9, 50, null)],
    names
  );
  assertEqual(out[0].display_name, "Alice Chen");
  assertEqual(out[1].display_name, null, "a class moment has nobody to resolve");
});

// ─── [5] Two layers, kept apart ─────────────────────────────────────────────
console.log("\n[5] Quiet suggestion vs loud celebration");

test("the creator's chip is a suggestion with a button, not an announcement", () => {
  const card = readSrc("components/live/MomentCard.tsx");
  assert(/MomentChip/.test(card) && /MomentBanner/.test(card), "both layers exist");
  assert(/Celebrate/.test(card), "the loud layer must be opt-in");
});

test("the wall shows a moment only between questions", () => {
  assert(
    /\(isRevealing \|\| isEnded\) && featuredMoment/.test(PRESENT),
    "a moment competing with a question the room is reading is worse than no moment"
  );
});

test("moments are fetched with the analytics, never polled", () => {
  for (const [name, page] of [["control", CONTROL], ["present", PRESENT]]) {
    const code = stripComments(page);
    assert(/fetchLiveMoments/.test(code), `${name} must fetch moments`);
    assert(
      !/setInterval\([^)]*fetchLiveMoments/.test(code),
      `${name} must not poll for them — they only change when analytics do`
    );
  }
});

test("a failure to derive a moment cannot cost the class its analytics", () => {
  const fn = SQL.slice(SQL.indexOf("FUNCTION public.compute_live_question_analytics"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    /EXCEPTION WHEN OTHERS THEN\s*\n\s*RAISE WARNING 'compute_live_moments failed/.test(body),
    "a bug in a window function must never take down the reveal and the rankings with it"
  );
  assert(
    body.indexOf("compute_live_moments") > body.indexOf("RETURNING * INTO result"),
    "and it must run after the analytics are already committed to the row"
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
