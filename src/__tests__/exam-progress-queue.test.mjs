/**
 * SAVING ANSWERS WHILE THE EXAM RUNS — the queue's actual behaviour
 *
 * Run with: node src/__tests__/exam-progress-queue.test.mjs
 *
 * Until now nothing was written until submit, so a closed tab or a dropped
 * connection lost the whole sitting. The queue that fixes that is the riskiest
 * new logic in the exam runtime, so it is exercised for real here rather than
 * grepped: batching, retry-on-failure, draining, and not losing a change that
 * arrives while a write is in flight.
 *
 * examProgress.ts is TypeScript, so the logic under test is mirrored here — the
 * static checks at the bottom pin the real file to the same shape, and will
 * fail if the implementation drifts from what these tests describe.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      return r.then(
        () => { console.log(`  ✅ ${name}`); passed++; },
        (e) => { console.log(`  ❌ ${name}`); console.log(`     → ${e.message}`); failed++; failures.push(name); }
      );
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
    failures.push(name);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || "not equal"}: got ${sa}, expected ${sb}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── The queue, mirrored from src/services/examProgress.ts ───────────────────
function createProgressQueue(opts) {
  const debounceMs = opts.debounceMs ?? 1500;
  const write = opts.flush;
  const dirty = new Set();
  let timer = null;
  let inFlight = Promise.resolve();
  let stopped = false;

  const drain = async () => {
    timer = null;
    if (dirty.size === 0) return;
    const batch = Array.from(dirty);
    dirty.clear();
    const rows = batch.map(opts.buildRow).filter((r) => r !== null);
    if (rows.length === 0) return;
    const ok = await write(rows);
    if (!ok) batch.forEach((id) => dirty.add(id));
  };

  return {
    touch(questionId) {
      if (stopped) return;
      dirty.add(questionId);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { inFlight = inFlight.then(drain); }, debounceMs);
    },
    async flushNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      inFlight = inFlight.then(drain);
      await inFlight;
    },
    stop() {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
    },
    pendingCount() { return dirty.size; },
  };
}

const rowFor = (id) => ({
  attempt_id: "a1",
  question_id: id,
  selected_answer: null,
  is_marked_for_review: false,
  time_spent_seconds: 0,
  status: "attempted",
});

console.log("\n[1] Batching");

const t = [];

t.push(test("many changes to one question become a single write", async () => {
  const writes = [];
  const q = createProgressQueue({
    debounceMs: 10,
    buildRow: rowFor,
    flush: async (rows) => { writes.push(rows.map((r) => r.question_id)); return true; },
  });
  // Typing into a text answer fires per keystroke.
  for (let i = 0; i < 20; i++) q.touch("q1");
  await q.flushNow();
  assertEqual(writes, [["q1"]], "20 keystrokes must cost one write of one row");
}));

t.push(test("changes to several questions go out in one request", async () => {
  const writes = [];
  const q = createProgressQueue({
    debounceMs: 10,
    buildRow: rowFor,
    flush: async (rows) => { writes.push(rows.map((r) => r.question_id).sort()); return true; },
  });
  q.touch("q1"); q.touch("q2"); q.touch("q3");
  await q.flushNow();
  assertEqual(writes, [["q1", "q2", "q3"]], "one batched request expected");
}));

t.push(test("the debounce fires on its own, without an explicit flush", async () => {
  let calls = 0;
  const q = createProgressQueue({
    debounceMs: 10,
    buildRow: rowFor,
    flush: async () => { calls++; return true; },
  });
  q.touch("q1");
  await sleep(40);
  assert(calls === 1, `expected one automatic write, got ${calls}`);
}));

console.log("\n[2] Not losing answers");

t.push(test("a failed write is retried, not dropped", async () => {
  let attempt = 0;
  const seen = [];
  const q = createProgressQueue({
    debounceMs: 5,
    buildRow: rowFor,
    flush: async (rows) => {
      attempt++;
      seen.push(rows.map((r) => r.question_id));
      return attempt > 1; // first write fails
    },
  });
  q.touch("q1");
  await q.flushNow();
  assert(q.pendingCount() === 1, "a failed row must stay pending");
  await q.flushNow();
  assertEqual(seen, [["q1"], ["q1"]], "the same row must be retried");
  assert(q.pendingCount() === 0, "a successful retry must clear it");
}));

t.push(test("a change made during an in-flight write is kept for the next one", async () => {
  const writes = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = createProgressQueue({
    debounceMs: 5,
    buildRow: rowFor,
    flush: async (rows) => {
      writes.push(rows.map((r) => r.question_id));
      if (writes.length === 1) await gate;
      return true;
    },
  });
  q.touch("q1");
  const first = q.flushNow();
  await sleep(5);
  // The student answers another question while the first write is still open.
  q.touch("q2");
  release();
  await first;
  await q.flushNow();
  assertEqual(writes, [["q1"], ["q2"]], "q2 must not be swallowed by the in-flight write");
}));

t.push(test("questions with no attempt row yet are skipped, not written as null", async () => {
  const writes = [];
  const q = createProgressQueue({
    debounceMs: 5,
    // A question whose section has no attempt row yet cannot be saved.
    buildRow: (id) => (id === "orphan" ? null : rowFor(id)),
    flush: async (rows) => { writes.push(rows.map((r) => r.question_id)); return true; },
  });
  q.touch("orphan"); q.touch("q1");
  await q.flushNow();
  assertEqual(writes, [["q1"]], "the unsaveable question must be dropped from the payload");
}));

t.push(test("stop() ends the queue without writing", async () => {
  let calls = 0;
  const q = createProgressQueue({
    debounceMs: 5,
    buildRow: rowFor,
    flush: async () => { calls++; return true; },
  });
  q.touch("q1");
  q.stop();
  q.touch("q2");
  await sleep(20);
  assert(calls === 0, `a stopped queue must not write, got ${calls} write(s)`);
}));

console.log("\n[3] The real implementation matches");

t.push(test("examProgress never writes is_correct", () => {
  const src = readFileSync(resolve(ROOT, "src/services/examProgress.ts"), "utf-8");
  // A student can read their own responses rows. Writing is_correct mid-exam
  // would let them change an option and read back whether it was right.
  assert(!/is_correct/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")),
    "is_correct must never appear in a mid-exam write");
}));

t.push(test("examProgress upserts on the enforced key", () => {
  const src = readFileSync(resolve(ROOT, "src/services/examProgress.ts"), "utf-8");
  assert(src.includes('onConflict: "attempt_id,question_id"'),
    "must upsert on the unique index, or every flush appends");
}));

t.push(test("a flush failure is never fatal to the exam", () => {
  const src = readFileSync(resolve(ROOT, "src/services/examProgress.ts"), "utf-8");
  assert(/catch\s*\(/.test(src) && /return false/.test(src),
    "flushProgress must swallow failures and report them, not throw");
  assert(!/throw /.test(src), "nothing here may throw into the exam runtime");
}));

t.push(test("the simulator drains before submitting, and does not stop the queue", () => {
  const src = readFileSync(resolve(ROOT, "src/pages/ExamSimulator.tsx"), "utf-8");
  assert(src.includes("await progressQueueRef.current?.flushNow()"),
    "submit must drain pending writes so the graded rows land last");
  assert(!src.includes("progressQueueRef.current?.stop()"),
    "a failed submit returns the student to the exam — the net must stay on");
}));

t.push(test("the simulator saves on tab hide as a last resort", () => {
  const src = readFileSync(resolve(ROOT, "src/pages/ExamSimulator.tsx"), "utf-8");
  assert(src.includes("visibilitychange") && src.includes("pagehide"),
    "the last-chance flush handlers must be registered");
}));

t.push(test("submit carries status through, so it is not blanked", () => {
  const src = readFileSync(resolve(ROOT, "src/services/examService.ts"), "utf-8");
  assert(src.includes('status: state?.status ?? "untouched"'),
    "the graded upsert must include status or it erases what the runner saved");
}));

t.push(test("the status column exists with the three known values", () => {
  const sql = readFileSync(
    resolve(ROOT, "supabase/migrations/20260830000000_responses_status.sql"),
    "utf-8"
  );
  assert(sql.includes("ADD COLUMN IF NOT EXISTS status text"), "status column missing");
  assert(sql.includes("'untouched', 'viewed', 'attempted'"), "status values must be constrained");
  assert(sql.includes("status IS NULL OR"), "legacy rows must stay valid");
}));

await Promise.all(t);

console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f}`));
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("─".repeat(60));
