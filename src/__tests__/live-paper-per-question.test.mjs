/**
 * LIVE EXAMS — THE PAPER IS RELEASED ONE QUESTION AT A TIME
 *
 * Run with: node src/__tests__/live-paper-per-question.test.mjs
 *
 * WHAT WAS BROKEN
 * fetchAllLiveQuestionsStudent asked for every question of the exam in a single
 * request at join, and live_questions_student gated only on the exam's STATUS.
 * So a student's browser held the whole paper from the moment they opened the
 * link — and the link is handed out at PUBLISH, before the session starts. The
 * answer keys were correctly withheld the whole time, which is what made this
 * easy to miss: in a live exam the paper itself is the secret. Reading ahead was
 * a right-click away, and "one question at a time" was a visual effect rather
 * than a rule.
 *
 * WHAT MAKES THE FIX HARD
 * The obvious repair — fetch each question as it unlocks — costs one request per
 * question per student. A 40-question paper in front of 300 students is 12,000
 * requests that did not exist before, which is precisely what a free-tier
 * project cannot spend. So the fix must add ZERO requests, and these tests exist
 * mostly to stop that constraint being quietly given back later.
 *
 * Two halves, and both must hold or the room breaks in a way nobody sees until
 * a session is running:
 *
 *   1. The VIEW stops running ahead of the cursor, so the same single fetch the
 *      client already makes returns only what has been asked. Too tight a
 *      predicate here does not throw — it hands a room of students a blank exam.
 *
 *   2. Each newly unlocked question rides the live_exams row, which every
 *      student already receives over Realtime and inside live_session_sync. If
 *      the trigger that maintains it is lost, half one still hides the paper and
 *      nothing ever delivers it.
 *
 * These are body-text assertions on migration and source files, like the rest of
 * this suite: migrations here are hand-pasted into the SQL editor, and plpgsql
 * does not parse a body until control reaches it, so a broken function survives
 * CREATE OR REPLACE and fails for the first time in front of a live room.
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

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

/** Comments describe the fix; only executable text proves it is there. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

const MIG = read("supabase/migrations/20260844000000_live_paper_released_per_question.sql");
const MIG_CODE = stripComments(MIG);
const SERVICE = read("src/services/liveExamService.ts");
const HOOK = read("src/hooks/useLiveSession.ts");
const STUDENT = read("src/pages/LiveExamStudent.tsx");
const PRESENT = read("src/pages/LiveExamPresent.tsx");
const MERGE = read("src/lib/live/pushedQuestions.js");

console.log("\n══ Live exams: the paper is released one question at a time ══");

// ─── [1] The view stops running ahead of the session ────────────────────────
console.log("\n[1] The student view is gated by the cursor, not just by status");

test("the view's predicate reads the cursor", () => {
  assert(
    /current_question_index\s+AS\s+cursor/i.test(MIG_CODE),
    "the view must carry the cursor into its predicate; gating on status alone is the original bug"
  );
  assert(
    /ordinal\s*<=\s*q?\.?cursor/i.test(MIG_CODE.replace(/q\./g, "q.")),
    "without `ordinal <= cursor` the view still returns the whole paper and every other half of this fix is decoration"
  );
});

test("an ended exam still returns everything", () => {
  assert(
    /exam_status\s*=\s*'ended'\s*(\r?\n|\s)*OR/i.test(MIG_CODE),
    "the review screen needs the full paper once the session is over; dropping this branch blanks every student's report"
  );
});

test("ordinal is numbered per language, matching the reveal path", () => {
  assert(
    /PARTITION BY[^)]*language/i.test(MIG_CODE),
    "get_revealed_live_answers numbers ordinals per language; a view that numbered them differently would reveal answers for questions it had not released"
  );
});

test("a published-but-unstarted exam sits at -1 and releases nothing", () => {
  // This is the whole point: the share link exists before the session does.
  assert(
    /-1|not started|before the session/i.test(MIG),
    "the -1 case deserves to be stated, because it is the case the fix exists for"
  );
});

// ─── [2] Delivery, on messages that were already being sent ─────────────────
console.log("\n[2] Each new question rides a message that was going to be sent anyway");

test("the payload column exists and is added idempotently", () => {
  assert(
    /ADD COLUMN IF NOT EXISTS current_question_payload jsonb/i.test(MIG_CODE),
    "migrations here are pasted by hand and re-run; a bare ADD COLUMN aborts the whole script on the second paste"
  );
});

test("a TRIGGER maintains it, so every writer of the cursor is caught", () => {
  assert(
    /CREATE TRIGGER trg_live_question_payload/i.test(MIG_CODE),
    "two functions already move current_question_index (the unlock and the undo) and a third would be easy to forget; editing them one by one is how this silently stops working"
  );
  assert(
    /BEFORE UPDATE ON public\.live_exams/i.test(MIG_CODE),
    "BEFORE, so the payload is written in the same row version the unlock publishes — an AFTER trigger would need a second UPDATE and a second Realtime message"
  );
  assert(
    /IS DISTINCT FROM OLD\.current_question_index/i.test(MIG_CODE),
    "rebuilding the payload on every unrelated UPDATE (a projector toggle, a heartbeat) turns a cheap trigger into a per-write query"
  );
});

test("the payload never carries the answer key", () => {
  const fnBody = MIG_CODE.slice(
    MIG_CODE.indexOf("live_question_payload_at"),
    MIG_CODE.indexOf("live_question_payload_sync")
  );
  assert(fnBody.length > 100, "could not locate the payload builder");
  assert(
    !/correct_answer|answer_hint/i.test(fnBody),
    "the key is released only by get_revealed_live_answers, on its own timer; putting it on the exam row hands it out at unlock"
  );
});

test("the payload carries every language, so switching costs no request", () => {
  assert(
    /ls\.language/i.test(MIG_CODE),
    "a student may switch language mid-session; if the payload held only one, that switch would become a fetch per question"
  );
});

test("the builder is not reachable from a browser", () => {
  assert(
    /REVOKE EXECUTE ON FUNCTION public\.live_question_payload_at/i.test(MIG_CODE),
    "a SECURITY DEFINER function that returns any question by ordinal is a paper-reading oracle: rpc('live_question_payload_at', {p_ordinal: 39}) would hand over question 40 before it is asked"
  );
});

test("every REVOKE EXECUTE here names anon and authenticated, not just PUBLIC", () => {
  // The bug this pins actually happened, on the first paste. A Supabase project
  // ships with default privileges that GRANT EXECUTE on new public functions
  // DIRECTLY to anon/authenticated, so `REVOKE ... FROM PUBLIC` removes a grant
  // nobody was using and the function stays callable from any browser. Every
  // REVOKE EXECUTE written in this repo before 20260845000000 has that hole.
  const revokes = MIG_CODE.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) || [];
  assert(revokes.length > 0, "expected at least one REVOKE EXECUTE");
  revokes.forEach((r) => {
    const target = r.split("FROM").pop();
    assert(
      /anon/.test(target) && /authenticated/.test(target),
      `revokes FROM PUBLIC only, which is a no-op on Supabase: ${r.replace(/\s+/g, " ").slice(0, 110)}`
    );
  });
});


test("already-live sessions are backfilled", () => {
  assert(
    /UPDATE public\.live_exams[\s\S]{0,400}current_question_payload\s*=/i.test(MIG_CODE),
    "without the backfill a session that is mid-flight when this lands sits on a blank question until the next unlock"
  );
});

// ─── [3] The cost constraint, which is the reason for the whole design ──────
console.log("\n[3] Zero added requests");

test("neither live page fetches per unlock", () => {
  for (const [name, src] of [["student runner", STUDENT], ["projector", PRESENT]]) {
    const merge = src.slice(src.indexOf("mergePushedQuestion("));
    const fetches = (merge.match(/fetchAllLiveQuestionsStudent\(/g) || []).length;
    assert(
      fetches <= 1,
      `${name}: the merge path may fetch only on a detected hole, not per unlock — found ${fetches} calls`
    );
    assert(
      /outcome\.kind === "gap"/.test(merge),
      `${name}: the one permitted fetch must be guarded by the gap outcome; unguarded it becomes the per-question cost this whole design exists to avoid`
    );
  }
});

test("both live pages consume the pushed payload", () => {
  assert(
    /session\.currentQuestionPayload/.test(STUDENT),
    "the student page must consume the payload, or the gated view simply means students never see question 2 onwards"
  );
  // The projector is the one that fails MOST visibly and was missed first: its
  // fetch runs once per (exam, language) and never again, so against a gated
  // view a wall opened before the session starts would stay blank all session,
  // in front of the room, with nothing logged anywhere.
  assert(
    /session\.currentQuestionPayload/.test(PRESENT),
    "the projector must consume it too — it fetches once and never refetches on unlock"
  );
});

test("the position-filing rule has exactly one home", () => {
  assert(
    /export function mergePushedQuestion/.test(MERGE),
    "both pages address their list by position; two copies of that rule is how they drift into showing different questions for the same cursor"
  );
  assert(
    /ordinal > held\.length/.test(MERGE),
    "the gap check is the rule that keeps the array dense"
  );
  assert(
    !/mergePushedQuestion\s*\(/.test(MERGE.slice(MERGE.indexOf("export function")) .slice(40)),
    "the helper must not recurse into itself"
  );
});

test("displayed totals come from the paper, not from what has been released", () => {
  // The regression this pins was caused BY the fix above. Both pages used to
  // read questions.length as "how many questions are in this exam", which was
  // true while the browser held the whole paper. Now the array holds only what
  // has been asked, so that reading makes every "x of N" shrink to "x of x" as
  // the session runs — the score denominator, the progress bar, and the lobby's
  // "N questions" all silently count the wrong thing. Nothing throws.
  for (const [name, src] of [["student runner", STUDENT], ["projector", PRESENT]]) {
    assert(
      /const totalQuestionCount = exam\?\.total_questions \|\| questions\.length \|\| 0;/.test(src),
      `${name}: the authored total must win over the released count`
    );
  }
  assert(
    !/\/ \{questions\.length\}/.test(PRESENT),
    "the projector must not divide by the released count"
  );
});

test("the canonical map grows as questions unlock", () => {
  assert(
    /canonicalIdToOrdinalRef\.current\.set\([\s\S]{0,80}ordinal/.test(STUDENT),
    "the map is built at join and keyed on primary-language ids; if it never grows, analytics for every later question is dropped by the `ord === undefined` guard"
  );
});

// ─── [4] Absent is not the same as empty ────────────────────────────────────
console.log("\n[4] A missing payload means 'unknown', never 'no question'");

test("the push lane distinguishes an absent column from a null one", () => {
  assert(
    /"current_question_payload" in \(exam as/.test(HOOK),
    "Realtime builds echoed rows from a CACHED column list, so a freshly added column goes missing for a while — the exact failure payloadBool exists to absorb. `?? null` here would blank the open question on every echo."
  );
});

test("the merge carries a payload forward when an observation omits it", () => {
  const merge = HOOK.slice(HOOK.indexOf("currentQuestionPayload:"));
  assert(
    /next\.currentQuestionPayload !== undefined/.test(merge),
    "undefined must mean 'this message says nothing', so the held question survives a stale-column echo instead of vanishing until the next poll"
  );
});

test("payloads are compared by content, not by reference", () => {
  assert(
    /function samePayload/.test(HOOK),
    "every poll parses fresh objects out of JSON; reference equality would report a change every 15 seconds on a session where nothing happened"
  );
  assert(
    /samePayload\(a\.currentQuestionPayload, b\.currentQuestionPayload\)/.test(HOOK),
    "the state comparator must actually use it, or the field is invisible to React and a payload arriving after the index never renders"
  );
});

test("both transport lanes can deliver the payload", () => {
  assert(
    /current_question_payload\?:/.test(SERVICE),
    "the type must allow the key to be absent — a database one migration behind omits it entirely"
  );
  assert(
    (SERVICE.match(/current_question_payload\?:/g) || []).length >= 2,
    "both LiveExam (the push lane's row) and LiveSessionSync (the poll lane's reply) must carry it; one lane alone leaves the other stalled"
  );
});

// ─── [5] The migration's own guard rails ────────────────────────────────────
console.log("\n[5] The migration refuses to leave the room broken");

test("it self-checks that the trigger and column landed", () => {
  assert(
    /trg_live_question_payload missing/i.test(MIG),
    "a lost trigger hides the paper without ever delivering it — the worst of both halves, and silent"
  );
  assert(
    /current_question_payload missing/i.test(MIG),
    "the column is the delivery channel; its absence must abort the migration, not the session"
  );
});

test("it re-asserts that the student view still hides the key", () => {
  assert(
    /live_questions_student exposes an answer channel/i.test(MIG),
    "this migration redefines the view; CREATE OR REPLACE VIEW re-snapshots the column list, so a stray column added here is a permanent key leak"
  );
});

test("it does NOT re-grant anon on the view it recreates", () => {
  // 20260823000000 revoked anon here and left a warning for exactly this
  // migration: "a future recreate must not re-add anon or this silently
  // reopens." A `GRANT ... TO authenticated, anon` copied along with the view
  // definition is the whole failure, and nothing at runtime would complain.
  assert(
    !/GRANT SELECT ON public\.live_questions_student TO[^;]*anon/i.test(MIG_CODE),
    "this migration recreates live_questions_student; granting anon lets anyone holding the bundled publishable key read the released questions of every live exam"
  );
  assert(
    /REVOKE ALL ON public\.live_questions_student FROM anon/i.test(MIG_CODE),
    "revoke explicitly rather than relying on CREATE OR REPLACE VIEW leaving privileges alone — the point is that re-running this file is always safe"
  );
  assert(
    /GRANT SELECT ON public\.live_questions_student TO authenticated/i.test(MIG_CODE),
    "students must still read it, or the paper is blank for the whole room"
  );
});

test("its self-check guards the grant in both directions", () => {
  assert(
    /anon can SELECT live_questions_student/i.test(MIG),
    "the check must fail loudly if anon comes back, since the reopening is invisible from the app"
  );
  assert(
    /authenticated lost SELECT on live_questions_student/i.test(MIG),
    "an over-broad revoke hands every student an empty paper mid-session, and the client's catch blocks turn that into a blank screen rather than an error"
  );
});

test("PostgREST is told to reload, or the new column is invisible to the API", () => {
  assert(
    /NOTIFY pgrst, 'reload schema'/.test(MIG_CODE),
    "without the reload the sync RPC's new field is dropped from responses until the cache expires on its own"
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
console.log("  The paper stays with the host until it is asked for.\n");
