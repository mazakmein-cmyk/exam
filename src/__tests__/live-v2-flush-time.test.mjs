/**
 * LIVE EXAM v2 — A3b: "TIME'S UP" (FLUSH THE LEFTOVER TIME)
 *
 * Run with: node src/__tests__/live-v2-flush-time.test.mjs
 *
 * The feature is one sentence — remove the seconds still on the clock — and the
 * entire risk is in the second half of that sentence: AND NOTHING ELSE. A control
 * that ends a question by any route other than the one a natural expiry takes is
 * a second definition of "closed", and the first time the two drift it does so in
 * front of a class.
 *
 * So most of what follows is not about ending the question. It is about proving
 * that ending it this way is indistinguishable from the clock running out:
 *
 *   [1] The bound. A bilingual exam is where "flush" quietly means "flush one of
 *       the two languages" — A3 bounds on the SHORTEST sibling, so this must bound
 *       on the LONGEST one, and rounding has to go down rather than up.
 *   [2] The write. Extra seconds and nothing else, locked, mirrored to the unlock
 *       log the analytics window is read from.
 *   [3] The countdown store really does fire the ordinary expiry for an EARLIER
 *       deadline on the same question — exercised, not grepped, because this is
 *       the hinge the whole "no new flow" claim hangs on.
 *   [4] The grace survives, so an answer already in flight still lands.
 *   [5] The error contract reaches the client, and the client adds no ceremony.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { knownLiveErrorCodes, parseLiveError } from "../lib/live/liveErrors.ts";
import { createLiveTimerStore } from "../lib/live/timerStore.ts";
import { remainingSeconds, serverCloseMs, visualEndMs } from "../lib/live/deadline.js";

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
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SQL = readMigration("20260811000000_live_v2_flush_remaining_time.sql");
const CONTROLS_SQL = readMigration("20260804000000_live_v2_controls.sql");
const APPLY = readFileSync(resolve(ROOT, "supabase", "APPLY_REMAINING.sql"), "utf-8");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const CONTROLS = readSrc("components/live/LiveTimeControls.tsx");
const SERVICE = readSrc("services/liveExamService.ts");
const REHEARSAL = readSrc("hooks/useRehearsal.ts");
const REPORT = readSrc("pages/LiveExamReport.tsx");

/** Body of one SQL function, comments stripped — a grep over prose proves nothing. */
function fnBody(name, sql = SQL) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`function ${name} not found in the migration`);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end).replace(/--[^\n]*/g, "");
}

const END = fnBody("end_live_question_time");
const CONTROL_CODE = stripComments(CONTROL);

console.log("\n══ LIVE EXAM v2 — A3b FLUSH THE LEFTOVER TIME ══");

// ─── [1] The bound, and the rounding ────────────────────────────────────────
console.log("\n[1] Which sibling it flushes against, and which way it rounds");

test("it bounds on the LONGEST sibling, where A3 bounds on the shortest", () => {
  // A bilingual exam can carry a 60s question and its 90s translation at the same
  // ordinal. Flushing against the minimum sets the visual end for the 60s room and
  // leaves the 90s room with half a minute still on the clock — a control that
  // fails to do the only thing it exists for, on the exam where nobody would think
  // to check.
  assert(/live_ordinal_max_seconds/.test(END), "must read the longest sibling");
  assert(
    !/live_ordinal_min_seconds/.test(END),
    "the minimum is A3's bound and is the wrong one here, in the opposite direction"
  );
  const max = fnBody("live_ordinal_max_seconds");
  assert(/MAX\(t\.time_seconds\)/.test(max), "and it must actually take the maximum");
  assert(
    /PARTITION BY ls\.language/.test(max),
    "ordinals are per language; without the partition the Nth row of a two-language exam is not the Nth question"
  );
});

test("the mirror of A3's helper, not a copy that drifts", () => {
  // Same shape, same ordering, same ordinal derivation — only the aggregate
  // differs. If these two ever disagree about what "the Nth question" is, the two
  // time controls are bounding against different questions.
  const min = fnBody("live_ordinal_min_seconds", CONTROLS_SQL);
  const max = fnBody("live_ordinal_max_seconds");
  const shape = (s) =>
    s
      .replace(/M(IN|AX)\(/g, "AGG(")
      .replace(/live_ordinal_(min|max)_seconds/g, "live_ordinal_agg_seconds")
      .replace(/\s+/g, " ")
      .trim();
  assert(
    shape(min) === shape(max),
    "the two helpers must differ only in the aggregate — anything else is a second definition of an ordinal"
  );
});

test("elapsed seconds round DOWN, so the clock cannot keep a straggler second", () => {
  assert(/FLOOR\(/.test(END), "must floor the elapsed seconds");
  assert(
    !/CEIL\(|ROUND\(/.test(END),
    "extra_seconds is an INTEGER, so rounding up lands the visual end AFTER now — a second still on a clock the creator has announced as finished"
  );
});

test("it can only ever shorten the question", () => {
  assert(
    /LEAST\(/.test(END),
    "a control whose promise is to take time away must not be able to hand any back"
  );
});

// ─── [2] What it writes, and what it must not ───────────────────────────────
console.log("\n[2] The write is extra_seconds and nothing else");

test("the UPDATE touches one column", () => {
  const upd = END.slice(END.indexOf("UPDATE public.live_exams"), END.indexOf("RETURNING"));
  assert(
    /SET current_question_extra_seconds = v_new_extra/.test(upd),
    "the deadline is edited through the one term every deadline expression shares"
  );
  assert(
    !/status|current_question_index\s*=|current_question_unlocked_at\s*=/.test(upd),
    "moving the index or the status here would make this a skip, a close or an end — three flows that already exist and are not this one"
  );
});

test("two tabs serialise", () => {
  assert(
    /FOR UPDATE/.test(END),
    "an unlocked read-then-write lets the second caller recompute from a pre-flush baseline"
  );
});

test("the unlock log is kept in step, which is where B6 reads the window from", () => {
  assert(
    /UPDATE public\.live_unlock_log/.test(END),
    "compute_live_question_analytics never reads live_exams for this — miss the write and every flushed question is scored for 'fast answers' against the window it would have had"
  );
});

test("ownership is answered before anything about the question", () => {
  assert(
    END.indexOf("ENDTIME_NOT_CREATOR") < END.indexOf("ENDTIME_NOT_LIVE"),
    "a stranger probing with an arbitrary exam id must get one answer, not a description of the session"
  );
  assert(END.indexOf("ENDTIME_NOT_LIVE") < END.indexOf("ENDTIME_NO_OPEN_QUESTION"));
});

test("a question already at zero is refused, not rewritten", () => {
  assert(/ENDTIME_ALREADY_OVER/.test(END), "must have the guard");
  assert(
    /live_question_visual_end/.test(END),
    "and it must sit at the VISUAL end — past it the room has been shown zero and the reveal may already be on screen"
  );
  assert(
    END.indexOf("ENDTIME_ALREADY_OVER") < END.indexOf("UPDATE public.live_exams"),
    "the guard is worthless after the write"
  );
});

test("the paste-once file carries this migration", () => {
  assert(
    APPLY.includes("end_live_question_time"),
    "supabase/APPLY_REMAINING.sql is this project's deployment channel; a migration missing from it is a button that 404s"
  );
});

// ─── [3] The claim: nothing downstream can tell the difference ──────────────
console.log("\n[3] An earlier deadline is an ordinary expiry — exercised, not grepped");

test("the countdown store fires the normal expiry when the deadline moves onto now", () => {
  const store = createLiveTimerStore();
  let now = 1_700_000_000_000;
  store.setNowProvider(() => now);

  const fired = [];
  store.onExpire((key) => fired.push(key));

  // Q6 opens with 60s on it.
  store.setTarget({ key: 6, endMs: now + 60_000, totalSeconds: 60 });
  assert(store.getPhase().running === true, "the question must actually be counting down first");
  assert(fired.length === 0, "nothing has expired yet");

  // 21s in, the creator flushes: the server's new extra_seconds puts the visual
  // end on now, and the spine hands the store the same key with an earlier end.
  now += 21_000;
  store.setTarget({ key: 6, endMs: now, totalSeconds: 21 });

  assert(store.getPhase().running === false, "the clock must read as stopped");
  assert(store.getCountdown().remaining === 0, "and the visible number must be zero");
  assert(
    fired.length === 1 && fired[0] === 6,
    `the ordinary expiry must fire exactly once, for Q6 — got ${JSON.stringify(fired)}`
  );
});

test("a poll landing after the push does not fire a second expiry", () => {
  // The flush arrives twice by design: the control room's own refresh() and the
  // realtime UPDATE. A second expiry would compute analytics twice and toast the
  // creator twice, mid-class.
  const store = createLiveTimerStore();
  let now = 1_700_000_000_000;
  store.setNowProvider(() => now);
  const fired = [];
  store.onExpire((key) => fired.push(key));

  store.setTarget({ key: 6, endMs: now + 60_000, totalSeconds: 60 });
  now += 21_000;
  store.setTarget({ key: 6, endMs: now, totalSeconds: 21 });
  now += 400;
  store.setTarget({ key: 6, endMs: now - 400, totalSeconds: 21 });

  assert(fired.length === 1, `expiry must be once per question, got ${fired.length}`);
});

test("a question that was already over when this tab arrived still stays quiet", () => {
  // The guard that makes the test above meaningful: expiry is only for a target
  // observed counting down. A creator opening a second tab onto a finished
  // question must not recompute its analytics.
  const store = createLiveTimerStore();
  const now = 1_700_000_000_000;
  store.setNowProvider(() => now);
  const fired = [];
  store.onExpire((key) => fired.push(key));

  store.setTarget({ key: 6, endMs: now - 5_000, totalSeconds: 60 });
  assert(fired.length === 0, "a target set already-expired must not replay the event");
});

// ─── [4] The grace, and the arithmetic a negative extra produces ────────────
console.log("\n[4] The answer already in flight still lands");

test("a negative extra is ordinary arithmetic in the shared deadline helpers", () => {
  const unlocked = 1_700_000_000_000;
  const allotted = 60;
  const elapsed = 21;
  // Exactly what the RPC writes for a single-language exam.
  const extra = elapsed - allotted;

  const end = visualEndMs(unlocked, allotted, extra);
  assert(end === unlocked + elapsed * 1000, "the visual end must land on the flush instant");
  assert(
    remainingSeconds(end, unlocked + elapsed * 1000) === 0,
    "and the countdown must read zero, not a negative number"
  );
});

test("the two-second grace survives the flush", () => {
  const unlocked = 1_700_000_000_000;
  const extra = 21 - 60;
  const flushedAt = unlocked + 21 * 1000;
  assert(
    serverCloseMs(unlocked, 60, extra) === flushedAt + 2000,
    "the grace is what saves an answer already travelling over a slow connection; a flush that skipped it would discard honest submissions to save two seconds"
  );
});

test("the report reads the sign, instead of summing it away", () => {
  assert(
    /Math\.max\(0, p\.extra_seconds \|\| 0\)/.test(REPORT),
    "a raw sum reports a session that granted 90s and flushed two questions as having granted less than it did"
  );
  assert(/closed early/.test(REPORT), "and the flushes are worth their own count in the pacing line");
});

// ─── [5] The contract, and the absence of ceremony ──────────────────────────
console.log("\n[5] The error contract, and what the client does NOT do");

test("every ENDTIME_ code the migration raises has client copy", () => {
  const raised = new Set([...SQL.matchAll(/RAISE EXCEPTION '(ENDTIME_[A-Z0-9_]+)/g)].map((m) => m[1]));
  const known = new Set(knownLiveErrorCodes());
  const missing = [...raised].filter((c) => !known.has(c));
  assert(missing.length === 0, `codes with no entry in liveErrors.ts: ${missing.join(", ")}`);
  assert(raised.size === 4, `expected the four guards, found ${raised.size}`);
});

test("losing a race is not a system failure", () => {
  const p = parseLiveError({ message: "ENDTIME_ALREADY_OVER" });
  assert(p.unknown === false, "must be recognised");
  assert(p.expected === true, "a second tab getting there first is an outcome, not an error");
  assert(!!p.text, "and it must say what happened");
});

test("the control room orchestrates nothing after the flush", () => {
  const handler = CONTROL_CODE.slice(
    CONTROL_CODE.indexOf("const handleEndTime"),
    CONTROL_CODE.indexOf("const handleUndoUnlock")
  );
  assert(handler.length > 0, "handleEndTime must exist");
  assert(/endLiveQuestionTime\(liveExamId\)/.test(handler), "it must call the RPC");
  assert(
    !/computeQuestionAnalytics|computeRankings|unlockNextQuestion|endLiveSession|setCollectingFinal/.test(
      handler
    ),
    "the expiry path already does all of this; a second copy here is the drift this feature is one sentence long to avoid"
  );
});

test("the service function exists and asks for exactly one thing", () => {
  assert(/export async function endLiveQuestionTime/.test(SERVICE));
  assert(/rpc\("end_live_question_time", \{ p_live_exam_id: examId \}\)/.test(SERVICE));
});

test("the button lives inside the gate the rest of the row lives inside", () => {
  const code = stripComments(CONTROLS);
  assert(/onEndTime/.test(code), "the prop must exist");
  assert(
    code.indexOf("if (!canAddTime) return null;") < code.indexOf("onEndTime={") ||
      code.indexOf("if (!canAddTime) return null;") < code.indexOf("onClick={onEndTime}"),
    "past zero there is no time to remove, so the control must vanish with the extensions rather than linger and be refused"
  );
  assert(/<AddTimeControls[\s\S]{0,400}onEndTime=\{handleEndTime\}/.test(CONTROL), "and be wired");
});

test("the row is still stateless, per the P0 rule this file was written under", () => {
  const code = stripComments(CONTROLS);
  assert(
    !/useState|useEffect|setInterval|requestAnimationFrame/.test(code),
    "this component is mounted inside the control deck; state here re-renders the deck, which is the cost Phase 0 spent its whole effort removing"
  );
});

test("a rehearsal never reaches the network, including on a flush", () => {
  assert(/const endNow = useCallback/.test(REHEARSAL), "the driver must own its own version");
  assert(
    !/supabase|liveExamService/.test(REHEARSAL),
    "a rehearsal that leaked into a real leaderboard would be worse than having no rehearsal"
  );
  assert(
    /if \(rehearsalActiveRef\.current\) \{\s*rehearsalEndNow\(\);/.test(CONTROL_CODE),
    "the button must drive the simulation, not the RPC, during a rehearsal"
  );
  assert(
    /if \(rehearsalActiveRef\.current\) return;/.test(CONTROL_CODE),
    "and the shared expiry listener must not compute server analytics for an imaginary class"
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
