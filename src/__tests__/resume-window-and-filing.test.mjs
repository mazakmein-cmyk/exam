/**
 * THE RESUME FEATURE'S REMAINING PIECES (owner spec, 2026-08-23)
 *
 * Run with: node src/__tests__/resume-window-and-filing.test.mjs
 *
 * On top of the F5 fix (20260836000000):
 *
 *  1. THE 5-MINUTE WINDOW. Away longer than 5 minutes → the sitting is sealed:
 *     filed with its saved answers as a normal ranked attempt, and the next
 *     start is fresh. "Away" is measured by a same-device localStorage
 *     heartbeat (~30s, zero network); with no beat on record the safe fallback
 *     is resuming, which grants nothing — the clock ran regardless.
 *  2. LAZY FILING. No scheduler exists on this stack, so expired attempts are
 *     filed at the first opportunity a device gives us: Marketplace/Analytics
 *     mount, once per tab session, deadline-passed rows ONLY — a sweep can
 *     never touch a sitting that is live on another device.
 *  3. POSITION RESTORE. A resume lands on the last-touched question, not Q1.
 *  4. CLOCK LENGTH CAP. The paper itself bounds the duration a browser may
 *     request (sections + whole-paper allowance + group overrides), with
 *     absent-schema guards so un-migrated databases keep starting exams.
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

const SIM = readFileSync(resolve(ROOT, "src/pages/ExamSimulator.tsx"), "utf-8");
const FILING = readFileSync(resolve(ROOT, "src/services/attemptFiling.ts"), "utf-8");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260841000000_clock_length_capped.sql"),
  "utf-8"
);

console.log("\nTHE RESUME FEATURE'S REMAINING PIECES\n");

// ─── [1] The 5-minute window ─────────────────────────────────────────────────

test("the heartbeat is local, throttled, and armed only for real sittings", () => {
  assert(
    SIM.includes("Date.now() - lastAliveBeatRef.current > 30_000"),
    "the beat must be throttled — a write per tick would be noise"
  );
  assert(
    SIM.includes("localStorage.setItem(examAliveKeyRef.current"),
    "the beat must be localStorage — a network heartbeat is exactly the cost the owner forbids"
  );
  assert(
    SIM.includes("examAliveKeyRef.current = null;"),
    "previews and anonymous sittings must not arm the heartbeat"
  );
});

test("away past 5 minutes seals the sitting before the start call", () => {
  const gate = SIM.indexOf("Date.now() - Number(localStorage.getItem(aliveKey) || 0)");
  const seal = SIM.indexOf("await sealAndFileSections(user.id");
  const rpc = SIM.indexOf('supabase.rpc(\n          "start_exam_clock"');
  assert(
    SIM.includes("5 * 60 * 1000") && seal !== -1,
    "the 5-minute comparison and the seal call are gone"
  );
  assert(
    seal < (rpc === -1 ? SIM.indexOf('"start_exam_clock"') : rpc),
    "sealing must happen BEFORE start_exam_clock, or the RPC resumes the very sitting being sealed"
  );
  void gate;
});

test("no beat on record falls back to resuming — never to a fresh clock", () => {
  assert(
    /the safe\s+\/\/ fallback is resuming, which grants nothing/.test(SIM),
    "the fallback direction must stay documented — flipping it reopens the decline-and-restart exploit"
  );
});

// ─── [2] Lazy filing ─────────────────────────────────────────────────────────

test("the sweep files deadline-passed attempts only", () => {
  assert(
    FILING.includes('.lt("clock_deadline_at", new Date().toISOString())'),
    "the sweep must be bounded by the deadline — an unexpired sitting may be live on another device"
  );
  assert(
    FILING.includes('.is("submitted_at", null)'),
    "already-submitted attempts must never re-file"
  );
});

test("filing rides the real submit path, per attempt, fault-tolerantly", () => {
  assert(
    FILING.includes("await saveExamAttempt({") && FILING.includes("attemptId: attempt.id"),
    "filing must reuse saveExamAttempt — server grading, marks, rankings, all of it"
  );
  assert(
    FILING.includes("will retry next visit"),
    "one failed filing must not block the rest"
  );
  assert(
    FILING.includes("timeSpentSeconds: attempt.time_spent_seconds || timeFromRows"),
    "time is what the sitting tracked, never the paperwork delay"
  );
});

test("the sweep is cheap: local session, once per tab, skipped when signed out", () => {
  assert(
    FILING.includes("supabase.auth.getSession()"),
    "getSession is the cached session — getUser would add an auth round-trip"
  );
  assert(
    FILING.includes("sessionStorage.getItem(SESSION_FLAG)"),
    "once per tab session — the owner counts every call"
  );
});

test("both student landing pages trigger the sweep", () => {
  for (const f of ["src/pages/Marketplace.tsx", "src/pages/Analytics.tsx"]) {
    const src = readFileSync(resolve(ROOT, f), "utf-8");
    assert(src.includes("void fileExpiredAttempts()"), `${f} must fire the sweep on mount`);
  }
});

// ─── [3] Position restore ────────────────────────────────────────────────────

test("a resume lands on the last-touched question, guarded against stale markers", () => {
  assert(
    SIM.includes("resumePositionQid = r.question_id"),
    "the last-written row is the position marker"
  );
  assert(
    SIM.includes("(multiNav || resumeSid === activeSectionId)"),
    "a marker for a section this scope doesn't serve must never move the index"
  );
});

// ─── [4] The clock cap ───────────────────────────────────────────────────────

test("the paper bounds its own clock, with absent-schema guards", () => {
  assert(
    MIGRATION.includes("v_seconds := LEAST(v_seconds, v_cap_seconds)"),
    "the cap is gone"
  );
  assert(
    MIGRATION.includes("WHEN undefined_column") && MIGRATION.includes("WHEN undefined_table"),
    "hand-pasted migrations mean either timing source can be absent — a missing one must contribute zero, not fail the start"
  );
  assert(
    MIGRATION.includes("SECURITY INVOKER") &&
      MIGRATION.includes("MIN(a.clock_deadline_at)") &&
      MIGRATION.includes("interval '1 millisecond'"),
    "the rewrite must keep every 20260836000000 rule: invoker, strictest deadline, created_at stagger"
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
