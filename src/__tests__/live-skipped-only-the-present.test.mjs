/**
 * LIVE EXAMS — "SKIPPED" COUNTS ONLY PEOPLE WHO WERE IN THE ROOM
 *
 * Run with: node src/__tests__/live-skipped-only-the-present.test.mjs
 *
 * WHAT WAS BROKEN (doc #26)
 * A question's skip rate was
 *
 *     skipped = (everyone who ever joined) - (people who answered THIS question)
 *
 * with no bound on WHEN anyone joined. Turn up at question 15 and you were
 * recorded as having skipped questions 1 to 14 — in the one number a teacher
 * uses to decide what to reteach.
 *
 * Mostly invisible, because a question's numbers are computed as its timer ends
 * and the attendee list at that instant holds only people who had arrived. It
 * bites when they are computed LATE: end_live_session backfills every unlocked
 * question that never got analytics, using the FINAL head count. That is the
 * normal path for a session whose host closed their tab, and it is EVERY
 * question of a session that auto-closes under 20260845000000.
 *
 * The student's own screen already drew this distinction — questions before you
 * joined are labelled "Missed", not "Skipped". This moves the same rule server
 * side.
 *
 * AND A DEFECT IN 20260845000000 THAT THIS FILE ALSO FIXES
 * The auto-end could not work as shipped. end_live_session_system backfills
 * analytics by calling compute_live_question_analytics, which begins by raising
 * 'Access denied: not the exam creator'. On the auto-end path the caller is a
 * STUDENT whose poll noticed the host had gone — SECURITY DEFINER changes the
 * ROLE, not auth.uid(), which reads a request GUC and still returns the student.
 * So the ending raised, the whole transaction rolled back, the session did not
 * end, and every subsequent poll did it again.
 *
 * It was guaranteed to be hit: analytics are computed from exactly one place,
 * the creator's control room, so a session whose host has gone ALWAYS has an
 * unlocked question with no analytics — the exact condition the loop looks for.
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

const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

const MIG = read("supabase/migrations/20260847000000_live_skipped_counts_only_the_present.sql");
const CODE = stripComments(MIG);
const STUDENT = read("src/pages/LiveExamStudent.tsx");

const between = (a, b) => CODE.slice(CODE.indexOf(a), b ? CODE.indexOf(b) : undefined);
const CORE = between(
  "FUNCTION public.compute_live_question_analytics_core",
  "REVOKE EXECUTE ON FUNCTION public.compute_live_question_analytics_core"
);
const ENDER = between("FUNCTION public.end_live_session_system", "REVOKE EXECUTE ON FUNCTION public.end_live_session_system");

console.log("\n══ Live exams: skipped counts only the present ══");

// ─── [1] The stamp ──────────────────────────────────────────────────────────
console.log("\n[1] Where the room had got to when you walked in");

test("the column exists and is added idempotently", () => {
  assert(
    /ADD COLUMN IF NOT EXISTS joined_at_question_index INTEGER/i.test(CODE),
    "migrations here are pasted by hand and re-run"
  );
});

test("the server stamps it, not the client", () => {
  const trig = between("FUNCTION public.protect_live_participant_scores", "FUNCTION public.compute_live_question_analytics_core");
  assert(
    /SELECT le\.current_question_index INTO NEW\.joined_at_question_index/i.test(trig),
    "a client that could choose its own join position could exempt itself from every skip count, exactly as it could with joined_at"
  );
  assert(
    /NEW\.joined_at_question_index := OLD\.joined_at_question_index/.test(trig),
    "immutable on UPDATE: re-joining must not move you past the questions you already missed"
  );
});

// ─── [2] The count ──────────────────────────────────────────────────────────
console.log("\n[2] Only those who were there");

test("participants are filtered by their join position", () => {
  assert(
    /COALESCE\(joined_at_question_index, -1\) <= v_play_ordinal/.test(CORE),
    "this is the whole fix: the old count was every attendee, for every question"
  );
});

test("the question's position comes from the primary list, not from a response", () => {
  assert(
    /SELECT p\.ordinal INTO v_play_ordinal\s*FROM public\.live_primary_questions/.test(CORE),
    "a question nobody answered has no response row to read an ordinal from — and that is precisely the question whose skip count matters"
  );
});

test("old rows keep today's numbers rather than silently changing", () => {
  assert(
    /COALESCE\(joined_at_question_index, -1\)/.test(CORE),
    "rows written before this migration have no stamp; treating them as present throughout is exactly the old behaviour, so no past report moves"
  );
  assert(
    /v_play_ordinal IS NULL\s*OR/.test(CORE),
    "on an unresolvable ordinal, fall back to counting everyone — keep the old answer rather than invent a new one"
  );
});

test("sessions in flight when this lands are stamped", () => {
  assert(
    /UPDATE public\.live_participants[\s\S]{0,300}status IN \('published', 'live'\)/i.test(CODE),
    "without it a room mid-session reads as though nobody had joined yet"
  );
});

test("the student page's own rule is unchanged", () => {
  // The server is catching up to the client here, not overriding it.
  assert(
    /idx < joinIndexRef\.current \? "missed" : "skipped"/.test(STUDENT),
    "the student screen already distinguished missed from skipped; this migration moves that rule server-side, it does not replace it"
  );
});

// ─── [3] The auto-end defect ────────────────────────────────────────────────
console.log("\n[3] The auto-end can now actually close a session");

test("the ownership test moved out of the analytics body", () => {
  assert(
    !/Access denied: not the exam creator/.test(CORE),
    "with the test still inside, the auto-end raises on the student poll that triggers it and rolls the whole ending back"
  );
  assert(
    !/auth\.uid\(\)/.test(CORE),
    "auth.uid() reads a request GUC, so SECURITY DEFINER does not make a student the creator — any use of it here re-creates the bug"
  );
});

test("the caller-facing function keeps the test and delegates", () => {
  const wrapper = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION public.compute_live_question_analytics(\n  p_live_exam_id UUID"));
  assert(
    /Access denied: not the exam creator/.test(wrapper.slice(0, 900)),
    "the creator-facing contract must be unchanged — same name, arguments, return and exception text"
  );
  assert(
    /RETURN public\.compute_live_question_analytics_core\(/.test(wrapper),
    "one copy of the work, not two"
  );
});

test("the ending calls the core", () => {
  assert(
    /PERFORM public\.compute_live_question_analytics_core\(p_live_exam_id, v_qid\)/.test(ENDER),
    "this single call is the difference between an abandoned session closing itself and every student's poll erroring for ever"
  );
});

test("neither internal function is reachable from a browser", () => {
  for (const fn of ["compute_live_question_analytics_core", "end_live_session_system"]) {
    const re = new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*FROM PUBLIC, anon, authenticated`, "i");
    assert(re.test(CODE), `${fn} must be revoked from anon and authenticated, not only PUBLIC — Supabase grants EXECUTE to those roles directly`);
  }
});

test("the creator can still draw a breakdown", () => {
  assert(
    /GRANT EXECUTE ON FUNCTION public\.compute_live_question_analytics\(UUID, UUID\) TO authenticated/i.test(CODE),
    "the control room calls this on every timer expiry; losing the grant blanks the live breakdown"
  );
});

// ─── [4] The migration's own guard rails ────────────────────────────────────
console.log("\n[4] It refuses to land half-applied");

test("it checks the stamp, the trigger and the auto-end repair", () => {
  assert(/joined_at_question_index missing/.test(MIG), "no column, no fix");
  assert(/does not stamp the join position/.test(MIG), "an unstamped joiner is NULL for ever, silently reverting to the old count");
  assert(
    /still calls the ownership-checked analytics function/.test(MIG),
    "the check that would catch the auto-end defect coming back"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  You cannot skip a question you were never shown.\n");
