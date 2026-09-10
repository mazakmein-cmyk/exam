/**
 * REHEARSAL MUST NEVER TOUCH THE REAL EXAM
 *
 * Run with: node src/__tests__/rehearsal-guards.test.mjs
 *
 * A rehearsal deliberately forces the control room to LOOK live (`status =
 * rehearsal.active ? "live" : …`) so the creator practises the real controls.
 * The cost of that disguise: anything that acts on the real session while a
 * rehearsal runs is invisible — the screen already shows "live", so nothing
 * changes when the real thing happens underneath.
 *
 * Three controls were missing the "is this a rehearsal?" check that
 * handleUnlockNext and handleEndTime already had:
 *
 *   1. The C10 auto-start effect. Rehearsing past the scheduled start time
 *      started the REAL exam: students joined a room nobody was driving, and
 *      the host's space bar only advanced the simulation.
 *   2. handleEndExam, reachable through primaryAction's "All questions done —
 *      end exam" once a rehearsal plays out its last question. After a silent
 *      auto-start the exam is genuinely live, so this ended it for everyone.
 *   3. handleAddTime (+30s/+60s), which called the real RPC and displayed the
 *      real row's extraSeconds while the rehearsal clock ignores both.
 *
 * These assertions pin the guards, the held-start banner, and the display's
 * use of the rehearsal-aware extraSeconds.
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

const SRC = readFileSync(
  resolve(ROOT, "src/pages/LiveExamControl.tsx"),
  "utf-8"
);

/** The body of a top-level block, located by its opening line. */
function sliceFrom(marker, length = 2000) {
  const at = SRC.indexOf(marker);
  assert(at !== -1, `cannot find: ${marker}`);
  return SRC.slice(at, at + length);
}

console.log("\nREHEARSAL MUST NEVER TOUCH THE REAL EXAM\n");

// ─── [1] Auto-start holds during a rehearsal ────────────────────────────────

test("the auto-start effect holds instead of firing while a rehearsal runs", () => {
  const effect = sliceFrom("const autoStartFiredRef = useRef(false);");
  assert(
    effect.includes("if (rehearsal.active)") &&
      effect.includes("setAutoStartHeld(true)"),
    "the effect must hold the start during a rehearsal, not begin the real exam"
  );
  // The hold must come AFTER the time check (else it flags before the time
  // arrives) and BEFORE the fire.
  const timeCheck = effect.indexOf("session.serverNow()");
  const hold = effect.indexOf("setAutoStartHeld(true)");
  const fire = effect.indexOf("void handleStartLive()");
  assert(
    timeCheck !== -1 && timeCheck < hold && hold < fire,
    "hold must sit between the time-reached check and the start call"
  );
});

test("exiting the rehearsal re-runs the effect so the held start fires", () => {
  const effect = sliceFrom("const autoStartFiredRef = useRef(false);");
  assert(
    /\[session\.autoStart[^\]]*rehearsal\.active\]/s.test(effect),
    "rehearsal.active must be a dependency, or the held start never fires on exit"
  );
});

test("a banner tells the host the scheduled time passed during the rehearsal", () => {
  assert(
    SRC.includes("rehearsal.active && autoStartHeld &&"),
    "the held start must be visible — the screen already looks live, that's the whole trap"
  );
  assert(
    SRC.includes("the real exam has NOT started"),
    "the banner must say the real exam is not running"
  );
});

// ─── [2] The end control ends the simulation, not the session ───────────────

test("handleEndExam ends the rehearsal, never the real session", () => {
  const fn = sliceFrom("const handleEndExam = async () => {", 600);
  const guard = fn.indexOf("if (rehearsal.active)");
  const stop = fn.indexOf("rehearsal.stop()");
  const realCall = fn.indexOf("endLiveSession(");
  assert(guard !== -1 && stop !== -1, "the rehearsal guard is gone");
  assert(
    realCall === -1 || guard < realCall,
    "the guard must come before the real end call"
  );
});

test("a played-out rehearsal offers 'exit', not the destructive end button", () => {
  assert(
    SRC.includes("Rehearsal done — exit"),
    "primaryAction's last-question branch must not offer the real end during a rehearsal"
  );
});

// ─── [3] +30s/+60s drives the simulation, never the real exam ───────────────

test("handleAddTime grows the simulated clock during a rehearsal", () => {
  const fn = sliceFrom("const handleAddTime = useCallback(", 900);
  const guard = fn.indexOf("if (rehearsalActiveRef.current)");
  const sim = fn.indexOf("rehearsalAddTimeRef.current(seconds)");
  const realCall = fn.indexOf("addLiveQuestionTime(");
  assert(guard !== -1, "the rehearsal branch on handleAddTime is gone");
  assert(
    sim !== -1 && guard < sim,
    "the rehearsal branch must add time to the simulation — the button is a control being practised, not a dead one"
  );
  assert(
    realCall === -1 || sim < realCall,
    "the simulation branch must come before the real add-time RPC"
  );
});

test("the rehearsal driver owns its own add-time, off the network", () => {
  const DRIVER = readFileSync(
    resolve(ROOT, "src/hooks/useRehearsal.ts"),
    "utf-8"
  );
  assert(
    /const addTime = useCallback/.test(DRIVER),
    "useRehearsal must expose addTime"
  );
  // The speed multiplier compresses ALL simulated time, granted extensions
  // included — at 10x a +30s grant plays out in 3 real seconds. The grant and
  // the speed are independent controls: one records, the other paces.
  assert(
    DRIVER.includes("Math.round(state.extraSeconds / state.speed)"),
    "the clock's share of a grant must be compressed by the rehearsal speed"
  );
  // The deadline is unlockedAt + seconds + extraSeconds everywhere, so the
  // extension must be zeroed wherever that sum is expected to land on a known
  // instant: a fresh unlock, and a flush whose deadline must land on now.
  const unlock = DRIVER.slice(
    DRIVER.indexOf("const unlockNext = useCallback"),
    DRIVER.indexOf("const endNow = useCallback")
  );
  assert(
    unlock.includes("extraSeconds: 0"),
    "unlockNext must reset the extension — added time belongs to the question it was added on"
  );
  const flush = DRIVER.slice(DRIVER.indexOf("const endNow = useCallback"));
  assert(
    flush.includes("extraSeconds: 0"),
    "endNow must zero the extension or the flushed clock shows extra time remaining"
  );
});

test("the grant and the clock read different numbers, on purpose", () => {
  // The chip and the 300s cap show what was GRANTED (raw, means what it means
  // live); the countdown consumes it at rehearsal speed. Feeding either the
  // other's number breaks one of them: a scaled chip lies about the grant, a
  // raw deadline makes +30s outlast a 10x question by ten times.
  assert(
    SRC.includes("extraSeconds={deckExtraSeconds}"),
    "AddTimeControls must show the raw grant"
  );
  assert(
    !SRC.includes("extraSeconds={session.extraSeconds}"),
    "the real row's extraSeconds must not render during a rehearsal"
  );
  assert(
    SRC.includes(
      "rehearsal.active ? rehearsal.extraSeconds : session.extraSeconds"
    ),
    "the displayed grant must read the rehearsal's own extension while rehearsing"
  );
  assert(
    SRC.includes("extraSeconds: deckClockExtraSeconds"),
    "the countdown must be fed the clock's number, not the display's"
  );
  assert(
    /deckClockExtraSeconds = rehearsal\.active\s*\?\s*rehearsal\.scaledExtraSeconds/s.test(SRC),
    "the clock's number must be the speed-compressed grant while rehearsing"
  );
});

test("the rehearsal countdown shows simulated seconds ticking speed× fast", () => {
  // The real deadline stays compressed (a 130s question at 10x still closes in
  // 13 real seconds) but the NUMBER must read 02:10 racing down, and a +60s
  // grant must visibly add 60 to it — not 6. That's the displayScale seam.
  assert(
    SRC.includes("displayScale: rehearsal.active ? rehearsal.speed : 1"),
    "the control room must hand the rehearsal speed to the countdown display"
  );
  const STORE = readFileSync(
    resolve(ROOT, "src/lib/live/timerStore.ts"),
    "utf-8"
  );
  assert(
    STORE.includes("((target.endMs - now) * scale) / 1000"),
    "the store must read simulated seconds off the real clock"
  );
  assert(
    STORE.includes("Math.round(target.totalSeconds * scale)"),
    "the ring's denominator must scale with the display or a grant overflows it"
  );
  assert(
    STORE.includes("(next.displayScale ?? 1) !== (target.displayScale ?? 1)"),
    "a speed change mid-question must reach the snapshot, not be dropped as an unchanged target"
  );
});

// ─── [4] The guards that already existed stay ────────────────────────────────

test("the unlock and flush controls keep their rehearsal branches", () => {
  const unlock = sliceFrom("const handleUnlockNext = async () => {", 400);
  assert(
    unlock.includes("if (rehearsal.active)") && unlock.includes("rehearsal.unlockNext()"),
    "handleUnlockNext lost its rehearsal branch"
  );
  const endTime = sliceFrom("const handleEndTime = useCallback(async () => {", 500);
  assert(
    endTime.includes("if (rehearsalActiveRef.current)") && endTime.includes("rehearsalEndNow()"),
    "handleEndTime lost its rehearsal branch"
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
