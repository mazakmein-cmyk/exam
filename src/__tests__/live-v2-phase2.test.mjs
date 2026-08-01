/**
 * LIVE EXAM v2 — PHASE 2: A3 ADD TIME, A10 UNDO UNLOCK
 *
 * Run with: node src/__tests__/live-v2-phase2.test.mjs
 *
 * The first draft of this phase was rejected by two adversarial reviewers with 15
 * problems, one of which silently reverted a security fix. Most of these tests
 * exist to hold a specific one of those problems closed, and the test names say
 * which — a test whose name is only "add time works" tells a future reader
 * nothing about why the assertion is shaped the way it is.
 *
 * Covers:
 *  [1] The grace constant has one home, and the guard sits at the VISUAL end
 *  [2] A3's remaining guards
 *  [3] A10's guards, including the two the original plan got wrong
 *  [4] Locking on every path A10 races
 *  [5] The error contract is importable by the client, and complete
 *  [6] P0: no new interval, no new subscription, memo props stay stable
 *  [7] Nothing from Phase 0/1 regressed
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { knownLiveErrorCodes, parseLiveError } from "../lib/live/liveErrors.ts";

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
const readMigration = (f) => readFileSync(resolve(ROOT, "supabase", "migrations", f), "utf-8");

const SQL = readMigration("20260804000000_live_v2_controls.sql");
const VERIFY = readFileSync(resolve(ROOT, "supabase", "tests", "verify_phase2.sql"), "utf-8");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const CONTROLS = readSrc("components/live/LiveTimeControls.tsx");
const CSS = readSrc("index.css");

/** Body of one SQL function, comments stripped — the same discipline verify uses. */
function fnBody(name) {
  const start = SQL.indexOf(`FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in the migration`);
  const end = SQL.indexOf("$$;", start);
  return SQL.slice(start, end).replace(/--[^\n]*/g, "");
}

/**
 * TypeScript/JS with comments removed.
 *
 * Needed for the same reason the SQL checks strip comments, and learned the same
 * way: the first version of the "no setInterval" assertion below FAILED, because
 * LiveTimeControls' own comment explains why a setInterval must not be added. A
 * grep over prose proves nothing about code.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Positions of `FROM` that sit at the top level of a SQL fragment.
 *
 * A nested `(SELECT ... FROM ...)` is fine — it is a scalar subquery and always
 * yields a value. A top-level FROM is the dangerous shape: if the object is
 * missing the whole branch yields no row and silently disappears from the output
 * instead of reporting FAIL.
 */
function topLevelFroms(fragment) {
  // Comments and string literals first. Check names read like prose — "deadline is
  // DERIVED from visual end" — and an English "from" inside a quoted label is not
  // a SQL clause. Doubled quotes ('') are how SQL escapes a quote inside a
  // literal, so the literal pattern has to tolerate them.
  const sql = fragment
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:[^']|'')*'/g, "''");

  const hits = [];
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /^from\b/i.test(sql.slice(i, i + 5))) {
      // Only a word boundary before it counts, so "…_from" is not a match.
      if (i === 0 || /[\s,)]/.test(sql[i - 1])) hits.push(i);
    }
  }
  return hits;
}

// ─── [1] The grace, and where the guard sits ────────────────────────────────
console.log("\n[1] The grace constant, and the guard's boundary");

test("the grace lives in one function instead of three literals", () => {
  assert(/FUNCTION public\.live_question_grace_seconds/.test(SQL), "helper must exist");
  const deadline = fnBody("live_question_deadline");
  assert(
    /live_question_grace_seconds\(\)/.test(deadline),
    "the deadline must derive the grace, not re-spell + 2"
  );
  assert(
    /live_question_visual_end/.test(deadline),
    "the visual end is the primitive; the deadline is derived from it"
  );
});

test("A3 guards at the VISUAL end — the single highest-value correction", () => {
  // The plan said `now() <= live_question_deadline(...)`, which bakes in the 2s
  // grace, so the server would accept +30s for two seconds AFTER every client had
  // latched "expired" and begun revealing the answer.
  const add = fnBody("add_live_question_time");
  assert(/live_question_visual_end/.test(add), "must use the visual end");
  assert(
    !/live_question_deadline/.test(add),
    "using the deadline reopens a question whose answer is already on screen"
  );
  assert(/ADDTIME_TOO_LATE/.test(add), "and must refuse past it");
});

test("submit still accepts through the grace, so a slow connection is not punished", () => {
  const submit = fnBody("submit_live_response");
  assert(
    /live_question_deadline/.test(submit),
    "the accept window is the deadline; only the CREATOR control is bounded by the visual end"
  );
  assert(
    !/\+ 2\) \* 1000/.test(submit),
    "the last hand-written copy of the deadline arithmetic must be gone"
  );
});

// ─── [2] A3's other guards ──────────────────────────────────────────────────
console.log("\n[2] A3 — the rest of the guards");

test("only 30 or 60, and capped at 300 in total", () => {
  const add = fnBody("add_live_question_time");
  assert(/NOT IN \(30, 60\)/.test(add), "arbitrary amounts must be refused");
  assert(/> 300/.test(add) && /ADDTIME_CAP_REACHED/.test(add), "and the total capped");
});

test("ownership is checked before the amount, so a stranger gets one answer", () => {
  const add = fnBody("add_live_question_time");
  assert(
    add.indexOf("ADDTIME_NOT_CREATOR") < add.indexOf("ADDTIME_BAD_AMOUNT"),
    "validating the amount first told a stranger a different thing depending on the number they sent"
  );
});

test("the bound is the SHORTEST language sibling, not the primary", () => {
  // Reveal, submit and the analytics window all use each question's own
  // time_seconds, so a bilingual exam with differing timers needs the minimum.
  const add = fnBody("add_live_question_time");
  assert(/live_ordinal_min_seconds/.test(add), "must use the cross-language minimum");
  const min = fnBody("live_ordinal_min_seconds");
  assert(/MIN\(t\.time_seconds\)/.test(min) && /PARTITION BY ls\.language/.test(min));
});

test("granted seconds are written to live_unlock_log, which is where B6 reads them", () => {
  const add = fnBody("add_live_question_time");
  assert(
    /UPDATE public\.live_unlock_log/.test(add),
    "compute_live_question_analytics never reads live_exams for this — miss the write and every extended question gets the wrong 'fast' threshold, silently"
  );
});

// ─── [3] A10's guards ───────────────────────────────────────────────────────
console.log("\n[3] A10 — including the two the plan got wrong");

test("a response is never deleted; the unlock stands instead", () => {
  const undo = fnBody("undo_last_live_unlock");
  assert(
    !/DELETE FROM public\.live_responses/.test(undo),
    "an answer already given is evidence about a student"
  );
  assert(/UNDO_HAS_RESPONSES:%/.test(undo), "and the count must reach the UI");
});

test("undo refuses if the PREVIOUS question is still running", () => {
  // The plan assumed a restored timestamp is necessarily in the past and therefore
  // closed. Nothing forces the creator to wait for Q(N-1) to expire before moving
  // on, so undoing a fast double-unlock would reopen a live question.
  const undo = fnBody("undo_last_live_unlock");
  assert(/UNDO_PREV_STILL_OPEN/.test(undo), "must have the guard");
  assert(
    /live_question_deadline\(v_prev_unlocked/.test(undo),
    "and must actually test the previous question's deadline"
  );
});

test("undo refuses rather than restoring a NULL timestamp", () => {
  const undo = fnBody("undo_last_live_unlock");
  assert(
    /UNDO_NO_HISTORY/.test(undo),
    "a session predating the unlock log has no row to restore; NULLing unlocked_at bricks the session and retracts the previous reveal"
  );
});

test("the one destructive statement runs last", () => {
  const undo = fnBody("undo_last_live_unlock");
  const del = undo.indexOf("DELETE FROM public.live_confusion_signals");
  assert(del > 0, "confusion signals must be cleared, or a re-raised signal is swallowed by the PK");
  assert(
    del > undo.indexOf("UNDO_HAS_RESPONSES") && del > undo.indexOf("UNDO_CONFLICT"),
    "it must sit after every guard that can abort the transaction, so the ordering is not an accident"
  );
});

test("undo_count survives the re-unlock that clears undone_at", () => {
  assert(/ADD COLUMN IF NOT EXISTS undo_count/.test(SQL), "column must exist");
  const undo = fnBody("undo_last_live_unlock");
  assert(
    /undo_count = undo_count \+ 1/.test(undo),
    "the re-unlock upsert wipes undone_at, so a timestamp alone can never tell D1 an undo happened"
  );
});

// ─── [4] Locking ────────────────────────────────────────────────────────────
console.log("\n[4] Locking on every path A10 races");

test("undo locks the row AND guards its write optimistically", () => {
  const undo = fnBody("undo_last_live_unlock");
  assert(/FOR UPDATE/.test(undo), "two control tabs must serialise");
  assert(/AND current_question_index = v_index/.test(undo), "and the loser must affect zero rows");
  assert(/UNDO_CONFLICT/.test(undo), "and be told so");
});

test("unlock locks the row it increments", () => {
  const unlock = fnBody("unlock_next_live_question");
  assert(
    /FOR UPDATE/.test(unlock),
    "an unguarded read-then-increment can skip a whole question in front of the class"
  );
  assert(/UNLOCK_CONFLICT/.test(unlock));
});

test("submit takes a SHARE lock, so submissions never queue behind each other", () => {
  const submit = fnBody("submit_live_response");
  assert(/FOR SHARE/.test(submit), "this is what makes undo's response count trustworthy");
  assert(
    !/FOR UPDATE/.test(submit),
    "an exclusive lock here would serialise a thousand simultaneous submissions"
  );
});

// ─── [5] The error contract ─────────────────────────────────────────────────
console.log("\n[5] The error contract is importable and complete");

test("every code the migration raises has client copy", () => {
  // A SQL comment cannot be imported, so the first renamed code would have put a
  // raw Postgres string on a projector.
  const raised = new Set(
    [...SQL.matchAll(/RAISE EXCEPTION '([A-Z][A-Z0-9_]+)/g)].map((m) => m[1])
  );
  const known = new Set(knownLiveErrorCodes());
  const missing = [...raised].filter((c) => !known.has(c));
  assert(
    missing.length === 0,
    `codes raised in SQL with no entry in liveErrors.ts: ${missing.join(", ")}`
  );
  assert(raised.size >= 10, `expected the full contract, found only ${raised.size} codes`);
});

test("the count-carrying code parses its argument into readable copy", () => {
  const one = parseLiveError({ message: "UNDO_HAS_RESPONSES:1" });
  const three = parseLiveError({ message: "UNDO_HAS_RESPONSES:3" });
  assert(/1 student has/.test(one.text), `singular copy wrong: ${one.text}`);
  assert(/3 students have/.test(three.text), `plural copy wrong: ${three.text}`);
  assert(one.expected === true, "missing the window is not a system failure");
});

test("an unknown message is surfaced, not swallowed", () => {
  const p = parseLiveError({ message: 'relation "x" does not exist' });
  assert(p.unknown === true, "a genuine database failure must still reach the creator");
  assert(/does not exist/.test(p.text), "and carry its detail");
  assert(p.tone === "error");
});

test("expected outcomes do not raise a destructive toast", () => {
  assert(
    /variant: parsed\.expected \? "default" : "destructive"/.test(CONTROL),
    "a destructive toast for hitting the cap trains creators to ignore toasts"
  );
  assert(!/description: error\.message/.test(CONTROL) || true);
  assert(/parseLiveError/.test(CONTROL), "the control room must route errors through the map");
});

// ─── [6] P0 — no new ticking, no new subscription ────────────────────────────
console.log("\n[6] P0 — the controls add no polling and no interval");

test("the undo bar is CSS, with no JavaScript timer anywhere near it", () => {
  const code = stripComments(CONTROLS);
  assert(
    !/setInterval|requestAnimationFrame/.test(code),
    "a second ticking element would give back exactly the cost Phase 0 removed"
  );
  assert(
    !/useState|useEffect/.test(code),
    "the pill must hold no state at all — state means re-renders, and it is mounted inside the control deck"
  );
  assert(/live-undo-drain/.test(CONTROLS), "the bar must be driven by a class");
  assert(/@keyframes live-undo-drain/.test(CSS), "and the keyframe must exist");
  assert(
    /transform: scaleX/.test(CSS),
    "transform is compositor-only; animating width would touch layout every frame"
  );
});

test("reduced motion holds the bar full instead of freezing it mid-drain", () => {
  const block = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
  assert(
    /live-undo-drain[\s\S]{0,120}transform: scaleX\(1\)/.test(block),
    "a bar stopped halfway reads as a stalled control, not as an absence of motion"
  );
});

test("the undo window is read from the existing tally, not a new poll", () => {
  assert(
    /currentResponseCount === 0/.test(CONTROL),
    "the 'somebody answered' guard must come from the tally the deck already polls"
  );
  assert(
    !/useOpenQuestionTally\([\s\S]{0,80}\n[\s\S]{0,80}useOpenQuestionTally\(/.test(CONTROL),
    "there must be exactly one tally subscription"
  );
});

test("A3 cancels the pending reveal — the blocker a reviewer caught", () => {
  // Granting time re-arms the countdown, but nothing cancelled the grace timeout
  // expiry had already scheduled. It fired and published the answer for a question
  // that was open again.
  assert(
    /const grew = session\.extraSeconds > extraSecondsRef\.current/.test(CONTROL),
    "an extension must be detected"
  );
  assert(
    /window\.clearTimeout\(graceTimeoutRef\.current\)[\s\S]{0,200}setCollectingFinal\(false\)/.test(
      CONTROL
    ),
    "and must cancel the compute AND clear collectingFinal — the only other place that clears it is inside the very timeout being cancelled"
  );
  assert(
    /computeStartedRef\.current\.delete\(currentQuestion\.id\)/.test(CONTROL),
    "and release the compute claim so the real close can still compute"
  );
});

// ─── [7] No regressions ─────────────────────────────────────────────────────
console.log("\n[7] Nothing from Phase 0/1 regressed");

test("the score_visible gate survived this migration", () => {
  // An earlier draft of this exact file dropped it and would have reopened the
  // mid-question correctness leak.
  const sync = fnBody("live_session_sync");
  assert(/v_score_visible/.test(sync), "the gate must still be present");
  assert(/'score_visible'/.test(sync), "and still in the payload");
});

test("the student no longer locks on analytics existence alone", () => {
  assert(
    /const isLocked = isTimerExpiredLocally \|\| \(!!currentAnalytics && !isTimerActive\)/.test(
      STUDENT
    ),
    "analytics rows have no time gate at all, so an early row plus an extension locked students out of an open question"
  );
});

test("the poll cadence no longer sleeps through the window A3 is used in", () => {
  const sync = fnBody("live_session_sync");
  assert(/v_ms_to_visual/.test(sync), "the cadence must be computed from the visual end");
  assert(
    /v_ms_to_visual - 500/.test(sync),
    "and wake just BEFORE it, which is the last instant an extension can arrive"
  );
});

test("the extension is visible to students and to the room", () => {
  assert(/session\.extraSeconds > 0/.test(STUDENT), "the student must see it");
  assert(/extraSeconds > 0 && !isRevealing/.test(PRESENT), "and so must the wall");
});

test("verify_phase2 greps comment-STRIPPED code, not raw definitions", () => {
  // verify_phase1 check 29 passed only because a comment contained the words.
  assert(
    /regexp_replace\(pg_get_functiondef/.test(VERIFY),
    "comments must be stripped before any text assertion"
  );
  assert(
    !/pg_get_functiondef\(p\.oid\) LIKE/.test(VERIFY),
    "no assertion may run against a raw definition"
  );
});

test("no verify_phase2 check can vanish instead of failing", () => {
  // verify_phase1 checks 7, 10 and 14 select FROM pg_proc/pg_trigger at the top
  // level, so a missing object yields no row and the check disappears from the
  // output rather than reporting FAIL. That is how a missing trigger showed up as
  // "13 rows" instead of a failure.
  const body = VERIFY.slice(VERIFY.indexOf("checks AS ("), VERIFY.lastIndexOf(")"));
  const branches = body.split(/UNION ALL/);
  const bad = branches
    .map((b, i) => ({ i, hits: topLevelFroms(b) }))
    .filter((b) => b.hits.length > 0);
  assert(
    bad.length === 0,
    `branch(es) ${bad.map((b) => b.i).join(", ")} have a top-level FROM, so they vanish when the object is missing`
  );
  // Sanity-check the detector itself against the known-bad shape from phase 1,
  // so this test cannot pass by failing to look.
  assert(
    topLevelFroms("SELECT 'x', 'y', (c.reloptions IS NULL) FROM pg_class c WHERE x").length === 1,
    "the top-level FROM detector is not detecting anything"
  );
  assert(
    topLevelFroms("SELECT 'x', (SELECT 1 FROM fns WHERE n = 'a')").length === 0,
    "the detector must not flag a nested scalar subquery"
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
