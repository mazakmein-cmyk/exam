/**
 * LIVE EXAM v2 — PHASE 0 REGRESSION SUITE
 *
 * Run with: node src/__tests__/live-v2-phase0.test.mjs
 *
 * These import the real modules rather than re-implementing them. The pure
 * maths of Phase 0 lives in plain .js with JSDoc types precisely so that the
 * app (via allowJs) and this file exercise the same code — a test that mirrors
 * the implementation proves only that someone copied it correctly twice.
 *
 * Covers:
 *  [1] Deadline: visual end vs server close, grace, extra seconds (A3)
 *  [2] Clock offset: NTP-lite midpoint, RTT rejection, first-sample adoption
 *  [3] Poll cadence: hidden tabs, jitter bounds, stop, heartbeat interval
 *  [4] Static guards: the fan-out fix and the single-deadline rule must not
 *      silently regress
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  GRACE_SECONDS,
  isRunning,
  remainingFraction,
  remainingSeconds,
  serverCloseMs,
  toEpochMs,
  totalSeconds,
  visualEndMs,
} from "../lib/live/deadline.js";
import { createClockOffset, MAX_TRUSTED_RTT_MS } from "../lib/live/clock.js";
import {
  BEAT_INTERVAL_MS,
  clientPollDelayMs,
  HIDDEN_POLL_MS,
  JITTER_RATIO,
  MIN_POLL_MS,
  shouldBeat,
  STOP,
} from "../lib/live/cadence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ─── Test Runner ────────────────────────────────────────────────────────────
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

function assertClose(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message || "Mismatch"} — expected ${expected} ±${tolerance}, got ${actual}`
    );
  }
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(resolve(ROOT, "supabase", "migrations", filename), "utf-8");
}

// ─── [1] Deadline ───────────────────────────────────────────────────────────
console.log("\n[1] Deadline — one definition, shared with the SQL helper");

const T0 = Date.UTC(2026, 7, 1, 10, 0, 0); // arbitrary fixed instant

test("visual end excludes the grace window", () => {
  assertEqual(visualEndMs(T0, 60, 0), T0 + 60_000, "60s question");
});

test("server close adds exactly GRACE_SECONDS beyond the visual end", () => {
  assertEqual(serverCloseMs(T0, 60, 0), T0 + 60_000 + GRACE_SECONDS * 1000);
});

test("the grace window is 2s, matching live_question_deadline in SQL", () => {
  assertEqual(GRACE_SECONDS, 2);
});

test("A3 extra seconds extend both the visual end and the server close", () => {
  assertEqual(visualEndMs(T0, 60, 30), T0 + 90_000, "visual end");
  assertEqual(serverCloseMs(T0, 60, 30), T0 + 92_000, "server close");
});

test("a student is still inside the server window after their timer shows zero", () => {
  const atVisualZero = visualEndMs(T0, 60, 0);
  assert(atVisualZero < serverCloseMs(T0, 60, 0), "grace must outlast the display");
  assertEqual(remainingSeconds(atVisualZero, atVisualZero), 0, "display reads zero");
});

test("ISO timestamps are accepted — PostgREST never sends epoch ms", () => {
  assertEqual(visualEndMs(new Date(T0).toISOString(), 30, 0), T0 + 30_000);
});

test("a null unlock time means no deadline, not a deadline of zero", () => {
  assertEqual(visualEndMs(null, 60, 0), null);
  assertEqual(serverCloseMs(undefined, 60, 0), null);
  assertEqual(remainingSeconds(null, T0), 0);
  assertEqual(isRunning(null, T0), false);
});

test("garbage timestamps degrade to null rather than NaN", () => {
  assertEqual(toEpochMs("not a date"), null);
  assertEqual(visualEndMs("not a date", 60, 0), null);
});

test("missing or non-numeric seconds are treated as zero, never NaN", () => {
  assertEqual(visualEndMs(T0, null, null), T0);
  assertEqual(visualEndMs(T0, undefined, "x"), T0);
  assertEqual(totalSeconds(null, undefined), 0);
});

test("remaining rounds UP, so the final second is visible for a full second", () => {
  const end = T0 + 60_000;
  assertEqual(remainingSeconds(end, T0 + 59_001), 1, "999ms left shows 1");
  assertEqual(remainingSeconds(end, T0 + 59_999), 1, "1ms left still shows 1");
  assertEqual(remainingSeconds(end, end), 0, "exactly at the deadline shows 0");
});

test("remaining never goes negative", () => {
  assertEqual(remainingSeconds(T0 + 1_000, T0 + 99_000), 0);
});

test("isRunning flips exactly at the deadline", () => {
  const end = T0 + 60_000;
  assert(isRunning(end, end - 1), "1ms before is running");
  assert(!isRunning(end, end), "at the deadline is not running");
});

test("totalSeconds is the ring denominator, so +30s cannot overfill it", () => {
  const total = totalSeconds(60, 30);
  assertEqual(total, 90);
  const fraction = remainingFraction(visualEndMs(T0, 60, 30), T0, total);
  assertClose(fraction, 1, 0.001, "a fresh extended question is exactly full");
});

test("remainingFraction is clamped to 0..1 and survives a zero-length question", () => {
  assertEqual(remainingFraction(T0 + 60_000, T0 + 61_000, 60), 0, "past the end");
  assertEqual(remainingFraction(T0 + 60_000, T0, 0), 0, "no divide-by-zero");
  assert(remainingFraction(T0 + 60_000, T0 - 5_000, 60) <= 1, "never above 1");
});

// ─── [2] Clock offset ───────────────────────────────────────────────────────
console.log("\n[2] Clock offset — a wrong device clock must not cost a student their answer");

test("offset is measured at the midpoint of the round trip", () => {
  const clock = createClockOffset();
  // Local clock is 60s behind the server. Request took 100ms.
  const sent = 1_000_000;
  const received = 1_000_100;
  const serverNow = 1_000_050 + 60_000;
  assert(clock.addSample(serverNow, sent, received), "sample accepted");
  assertClose(clock.getOffsetMs(), 60_000, 1, "recovers the 60s skew");
});

test("the first trusted sample is adopted outright, not smoothed toward zero", () => {
  const clock = createClockOffset();
  clock.addSample(500_000 + 90_000, 500_000, 500_000);
  assertClose(
    clock.getOffsetMs(),
    90_000,
    1,
    "a 90s-fast phone must be corrected on the FIRST poll — that is the poll where a question opens"
  );
});

test("later samples are smoothed, so the countdown creeps rather than jumping", () => {
  const clock = createClockOffset({ alpha: 0.3 });
  clock.addSample(1_000_000, 1_000_000, 1_000_000); // offset 0
  clock.addSample(1_001_000, 1_000_000, 1_000_000); // sample says +1000
  assertClose(clock.getOffsetMs(), 300, 1, "moves 30% of the way, not all of it");
});

test("a slow round trip is rejected rather than averaged in", () => {
  const clock = createClockOffset();
  clock.addSample(1_000_000, 1_000_000, 1_000_020); // 20ms RTT, best
  const before = clock.getOffsetMs();
  const accepted = clock.addSample(9_999_999, 2_000_000, 2_000_900); // 900ms RTT
  assert(!accepted, "sample far worse than the best RTT is refused");
  assertEqual(clock.getOffsetMs(), before, "offset untouched by the bad sample");
});

test("round trips beyond the hard ceiling are never trusted, even as the first sample", () => {
  const clock = createClockOffset();
  const accepted = clock.addSample(1_000_000, 0, MAX_TRUSTED_RTT_MS + 1);
  assert(!accepted, "rejected");
  assertEqual(clock.sampleCount(), 0);
});

test("a backwards local clock mid-flight is discarded, not believed", () => {
  const clock = createClockOffset();
  assert(!clock.addSample(1_000_000, 1_000_100, 1_000_000), "negative RTT rejected");
});

test("unusable server timestamps are ignored", () => {
  const clock = createClockOffset();
  assert(!clock.addSample(null, 0, 10));
  assert(!clock.addSample("nonsense", 0, 10));
  assertEqual(clock.sampleCount(), 0);
});

test("with no samples the clock is a pass-through, never a guess", () => {
  const clock = createClockOffset();
  assertEqual(clock.getOffsetMs(), 0);
  assertClose(clock.serverNow(), Date.now(), 50);
});

test("reset returns the clock to untrusted", () => {
  const clock = createClockOffset();
  clock.addSample(1_000_000 + 5_000, 1_000_000, 1_000_000);
  clock.reset();
  assertEqual(clock.getOffsetMs(), 0);
  assertEqual(clock.sampleCount(), 0);
  assertEqual(clock.bestRttMs(), Infinity);
});

// ─── [3] Poll cadence ───────────────────────────────────────────────────────
console.log("\n[3] Poll cadence — the client may only ever slow the server down");

test("a hidden tab drops to the slow keep-alive, ignoring a fast server request", () => {
  assertEqual(clientPollDelayMs(750, { hidden: true }), HIDDEN_POLL_MS);
  assertEqual(clientPollDelayMs(1_500, { hidden: true }), HIDDEN_POLL_MS);
});

test("zero from the server means stop, on every lane", () => {
  assertEqual(clientPollDelayMs(0, {}), STOP);
  assertEqual(clientPollDelayMs(-1, {}), STOP);
  assertEqual(clientPollDelayMs(null, {}), STOP);
  assertEqual(clientPollDelayMs(undefined, {}), STOP);
});

test("stop wins over hidden — an ended exam is not worth a keep-alive", () => {
  assertEqual(clientPollDelayMs(0, { hidden: true }), STOP);
});

test("jitter stays inside +/-15% so total load is unchanged", () => {
  const base = 2_000;
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const delay = clientPollDelayMs(base, { random: () => r });
    assert(
      delay >= base * (1 - JITTER_RATIO) - 1 && delay <= base * (1 + JITTER_RATIO) + 1,
      `random=${r} produced ${delay}, outside the jitter band`
    );
  }
});

test("jitter spreads in both directions — a one-sided spread is not jitter", () => {
  const base = 2_000;
  assert(clientPollDelayMs(base, { random: () => 0 }) < base, "random=0 polls earlier");
  assert(clientPollDelayMs(base, { random: () => 0.999 }) > base, "random~1 polls later");
});

test("the floor holds even when jitter pulls a small interval down", () => {
  assert(clientPollDelayMs(500, { random: () => 0 }) >= MIN_POLL_MS, "never below the floor");
  assert(clientPollDelayMs(1, { random: () => 0 }) >= MIN_POLL_MS, "absurd input is floored");
});

test("an out-of-range jitter ratio falls back to the default rather than misbehaving", () => {
  const delay = clientPollDelayMs(2_000, { jitterRatio: 5, random: () => 0.999 });
  assert(delay <= 2_000 * (1 + JITTER_RATIO) + 1, "ratio of 5 would have tripled the delay");
});

test("heartbeats are decoupled from polling: never faster than every 30s", () => {
  assertEqual(BEAT_INTERVAL_MS, 30_000);
  assert(shouldBeat(null, 1_000_000), "the first sync always beats");
  assert(!shouldBeat(1_000_000, 1_000_000 + 29_999), "29.9s later does not beat");
  assert(shouldBeat(1_000_000, 1_000_000 + 30_000), "30s later beats");
});

test("a room polling at 1.5s still only writes presence every 30s", () => {
  // 20 polls at 1.5s covers 30s, and exactly one of them should carry a beat.
  let last = null;
  let beats = 0;
  for (let i = 0; i <= 20; i++) {
    const now = i * 1_500;
    if (shouldBeat(last, now)) {
      beats++;
      last = now;
    }
  }
  assertEqual(beats, 2, "one beat at t=0 and one at t=30s — not 21");
});

// ─── [4] Static guards ──────────────────────────────────────────────────────
console.log("\n[4] Static guards — the two regressions that would be silent");

test("live_participants is removed from the realtime publication", () => {
  const sql = readMigration("20260802000000_live_v2_foundations.sql");
  assert(
    /ALTER PUBLICATION supabase_realtime DROP TABLE public\.live_participants/.test(sql),
    "the N-squared fan-out fix is missing from the migration"
  );
});

test("live_responses is removed from the realtime publication", () => {
  const sql = readMigration("20260802000000_live_v2_foundations.sql");
  assert(
    /ALTER PUBLICATION supabase_realtime DROP TABLE public\.live_responses/.test(sql),
    "per-response fan-out to the creator is still enabled"
  );
});

test("no page subscribes to participant or response rows any more", () => {
  const hook = readSrc("hooks/useLiveExamRealtime.ts");
  assert(
    !/table:\s*"live_participants"/.test(hook),
    "a participant binding would restore the N-squared fan-out"
  );
  assert(
    !/table:\s*"live_responses"/.test(hook),
    "a response binding would restore per-student messages to the creator"
  );
});

test("both live pages read the deadline from the shared store, not their own interval", () => {
  for (const page of ["pages/LiveExamControl.tsx", "pages/LiveExamStudent.tsx"]) {
    const src = readSrc(page);
    assert(
      !/setInterval\(\s*tick\s*,\s*250\s*\)/.test(src),
      `${page} still runs its own 250ms countdown interval`
    );
    assert(
      /useLiveTimerTarget/.test(src),
      `${page} must arm the countdown through the shared target hook`
    );
  }
});

test("neither page spells out a deadline by hand", () => {
  for (const page of ["pages/LiveExamControl.tsx", "pages/LiveExamStudent.tsx"]) {
    const src = readSrc(page);
    assert(
      !/time_seconds\s*\*\s*1000/.test(src),
      `${page} computes a deadline inline — that is the drift A3 cannot survive`
    );
  }
});

test("every SQL deadline goes through live_question_deadline", () => {
  const sql = readMigration("20260802000000_live_v2_foundations.sql");
  for (const fn of [
    "get_revealed_live_answers",
    "get_my_live_responses",
    "submit_live_response",
  ]) {
    const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}`));
    const end = body.indexOf("$$;");
    assert(
      /live_question_deadline/.test(body.slice(0, end)),
      `${fn} does not use the shared deadline helper`
    );
  }
});

test("the unlock RPC records history and clears granted time", () => {
  const sql = readMigration("20260802000000_live_v2_foundations.sql");
  const body = sql.slice(sql.indexOf("FUNCTION public.unlock_next_live_question"));
  const fn = body.slice(0, body.indexOf("$$;"));
  assert(/INSERT INTO public\.live_unlock_log/.test(fn), "A10 has nothing to restore from");
  assert(
    /current_question_extra_seconds\s*=\s*0/.test(fn),
    "granted time would leak into the next question"
  );
});

// ─── [5] Regressions caused by removing the participant broadcast ───────────
console.log("\n[5] Consequences of dropping the participant fan-out");

test("the student's live rank does not come from the frozen join row", () => {
  const src = readSrc("pages/LiveExamStudent.tsx");
  assert(
    /const myRank = session\.myRank/.test(src),
    "rank must come from the session sync"
  );
  assert(
    !/participant\?\.rank \?\? null/.test(src) && !/#\{participant\?\.rank/.test(src),
    "participant.rank is the row from joining and never updates — it would show a frozen rank all session"
  );
});

test("the student's live score does not come from the frozen join row", () => {
  const src = readSrc("pages/LiveExamStudent.tsx");
  assert(
    /const myTotalCorrect = session\.myTotalCorrect/.test(src),
    "score must come from the session sync"
  );
  assert(
    !/participant\?\.total_correct/.test(src),
    "participant.total_correct never updates — it would read 0 for the whole exam"
  );
});

test("the sync RPC actually returns the rank and score the student page relies on", () => {
  const sql = readMigration("20260802000000_live_v2_foundations.sql");
  assert(/'my_rank'/.test(sql), "my_rank missing from live_session_sync");
  assert(/'my_total_correct'/.test(sql), "my_total_correct missing from live_session_sync");
});

test("the class's leaderboard refetch is spread out, not a thundering herd", () => {
  const src = readSrc("pages/LiveExamStudent.tsx");
  assert(
    /scheduleLeaderboardRefresh/.test(src),
    "every student is triggered by the same reveal event at the same millisecond"
  );
  assert(
    /Math\.random\(\) \* LEADERBOARD_SPREAD_MS/.test(src),
    "the refetch must be jittered across the room"
  );
});

test("the creator cannot start two analytics computes for one question", () => {
  const src = readSrc("pages/LiveExamControl.tsx");
  assert(/computeStartedRef/.test(src), "no guard between the expiry path and the sweep");
  // Claimed before awaiting, or the guard does not cover the in-flight window.
  const claim = src.indexOf("computeStartedRef.current.add(currentQ.id)");
  const call = src.indexOf("await computeQuestionAnalytics(liveExamId, currentQ.id)");
  assert(claim > 0 && call > 0 && claim < call, "the claim must precede the RPC call");
});

test("a failed compute releases its claim so the sweep can retry", () => {
  const src = readSrc("pages/LiveExamControl.tsx");
  const releases = src.match(/computeStartedRef\.current\.delete/g) || [];
  assert(
    releases.length >= 2,
    "both compute paths must release on failure — a question with no analytics has no reveal and no ranking"
  );
});

// ─── [6] Render cost of the once-a-second poll ──────────────────────────────
console.log("\n[6] Render cost — the answered-count poll must stay in the deck");

test("the heavy live components are memoised", () => {
  // The control room re-renders ~1.3x/second while a question is open, because
  // the answered count polls at 750ms. Each of these would otherwise redo real
  // work on every one of those ticks.
  for (const [file, comp] of [
    ["components/live/LiveQuestionBody.tsx", "LiveQuestionBody"],
    ["components/live/LiveOption.tsx", "LiveOption"],
    ["components/live/LiveLeaderboard.tsx", "LiveLeaderboard"],
    ["components/live/QuestionRail.tsx", "QuestionRail"],
  ]) {
    const src = readSrc(file);
    assert(
      new RegExp(`export default memo\\(${comp}\\)`).test(src),
      `${comp} is not memoised — a KaTeX pass or a full list rebuild every poll tick`
    );
  }
});

test("nothing hands a memoised child a freshly built prop each render", () => {
  const control = readSrc("pages/LiveExamControl.tsx");
  assert(
    /onSelect=\{handleRailSelect\}/.test(control),
    "an inline arrow for onSelect gives the rail a new prop identity every tick, defeating its memo"
  );
  assert(
    /const handleRailSelect = useCallback/.test(control),
    "handleRailSelect must be stable"
  );

  const student = readSrc("pages/LiveExamStudent.tsx");
  assert(
    /const mySelf: LiveParticipant \| null = useMemo\(/.test(student),
    "a fresh `self` object each render would defeat the leaderboard's memo"
  );
});

test("the countdown store emits at most once per second, never per tick", () => {
  const src = readSrc("lib/live/timerStore.ts");
  // A fraction-based emission would put a 4Hz re-render back into the leaves.
  assert(
    !/Math\.abs\(fraction - countdown\.fraction\)/.test(src),
    "sub-second fraction emissions reintroduce a 4Hz render; CSS transitions do the smoothing"
  );
  assert(
    /remaining !== countdown\.remaining/.test(src),
    "the snapshot must be gated on the whole second changing"
  );
});

test("ticking stops when no question is counting down", () => {
  const src = readSrc("lib/live/timerStore.ts");
  assert(
    /if \(!running\) stopTicking\(\);/.test(src),
    "an idle control room and a finished exam must cost nothing"
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
