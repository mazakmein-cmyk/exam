/**
 * A GUEST'S FINISHED EXAM SURVIVES THE TAB (issue 18)
 *
 * Run with: node src/__tests__/guest-exam-queue.test.mjs
 *
 * The pending-submission queue lived in sessionStorage, which the browser
 * destroys with the tab — a guest who finished a 90-minute paper and closed
 * the tab before signing in lost everything. And the post-sign-in replay
 * cleared the queue only after the WHOLE loop, so a network hiccup on section
 * 3 re-saved sections 1-2 as duplicates on the next attempt.
 *
 * lib/pendingSubmissions.js owns both fixes. These tests EXECUTE it against
 * storage shims: "closing the tab" is simulated by wiping the sessionStorage
 * shim while localStorage survives.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ── storage shims, installed before the module under test is imported ──────
const makeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _wipe: () => m.clear(),
    _size: () => m.size,
  };
};
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

const {
  readPendingSubmissions,
  writePendingSubmissions,
  appendPendingSubmissions,
  clearPendingSubmissions,
  hasPendingSubmissions,
} = await import("../lib/pendingSubmissions.js");

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

const reset = () => {
  globalThis.localStorage._wipe();
  globalThis.sessionStorage._wipe();
};

console.log("\nA GUEST'S FINISHED EXAM SURVIVES THE TAB\n");

test("the queue survives the tab closing", () => {
  reset();
  appendPendingSubmissions([{ sectionId: "s1" }, { sectionId: "s2" }]);
  sessionStorage._wipe(); // the tab closes
  assert(hasPendingSubmissions(), "the finished paper died with the tab again");
  assert(readPendingSubmissions().length === 2, "both sections must survive");
});

test("legacy sessionStorage queues are drained, not orphaned", () => {
  reset();
  // A guest who was mid-flow when the fix deployed: old array key + the
  // even older single-entry key, both in sessionStorage.
  sessionStorage.setItem("pendingExamSubmissions", JSON.stringify([{ sectionId: "old1" }]));
  sessionStorage.setItem("pendingExamSubmission", JSON.stringify({ sectionId: "old2" }));
  const all = readPendingSubmissions();
  assert(all.length === 2, "both legacy locations must be read");
  // Appending re-homes everything durably and clears the old spots — a
  // surviving sessionStorage copy would be re-read and re-appended forever.
  appendPendingSubmissions([{ sectionId: "new" }]);
  assert(sessionStorage._size() === 0, "the legacy copies must be cleared on write");
  assert(readPendingSubmissions().length === 3, "nothing may be lost in the re-homing");
});

test("crossing off as the replay saves leaves only the unsaved remainder", () => {
  reset();
  const queue = [{ sectionId: "s1" }, { sectionId: "s2" }, { sectionId: "s3" }];
  appendPendingSubmissions(queue);
  const pending = readPendingSubmissions();
  // Replay saves section 1 and 2, then the network dies before section 3 —
  // exactly the StudentAuth loop shape.
  writePendingSubmissions(pending.slice(1));
  writePendingSubmissions(pending.slice(2));
  const remaining = readPendingSubmissions();
  assert(
    remaining.length === 1 && remaining[0].sectionId === "s3",
    "only the unsaved section may remain — anything else re-saves duplicates"
  );
  clearPendingSubmissions();
  assert(!hasPendingSubmissions(), "clear must empty every location");
});

test("corrupt JSON reads as empty, never as a crash", () => {
  reset();
  localStorage.setItem("pendingExamSubmissions", "{not json");
  assert(readPendingSubmissions().length === 0, "garbage must parse to an empty queue");
});

// ── the three call sites actually use the module ────────────────────────────

test("simulator, auth replay and the auth listener all go through the module", () => {
  const sim = readFileSync(resolve(ROOT, "src/pages/ExamSimulator.tsx"), "utf-8");
  const auth = readFileSync(resolve(ROOT, "src/pages/StudentAuth.tsx"), "utf-8");
  const listener = readFileSync(resolve(ROOT, "src/components/AuthStateListener.tsx"), "utf-8");
  assert(sim.includes("appendPendingSubmissions(pending)"), "the simulator must park via the module");
  assert(auth.includes("readPendingSubmissions()"), "the replay must read via the module");
  assert(
    auth.includes("writePendingSubmissions(pendingSubmissions.slice(i + 1))"),
    "the replay must cross off each section AS IT LANDS"
  );
  assert(listener.includes("hasPendingSubmissions()"), "the listener must detect via the module");
  for (const [name, src] of [["ExamSimulator", sim], ["StudentAuth", auth], ["AuthStateListener", listener]]) {
    assert(
      !src.includes("sessionStorage.getItem('pendingExamSubmissions')"),
      `${name} still reads the tab-mortal storage directly`
    );
  }
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
