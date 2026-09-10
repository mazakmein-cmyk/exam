/**
 * LIVE EXAMS — A SESSION WHOSE HOST HAS GONE CLOSES ITSELF
 *
 * Run with: node src/__tests__/live-auto-end-abandoned.test.mjs
 *
 * WHAT WAS BROKEN
 * If the host's tab went away mid-session — dead battery, closed laptop, browser
 * crash — the exam stayed 'live' forever. Students sat on "waiting for the next
 * question" indefinitely, anyone with the share code could still walk in hours
 * later, and the session produced NO report and NO final standings, because
 * end_live_session is the thing that computes rankings and builds the report.
 * The teacher lost the results of a class that actually happened.
 *
 * WHY NOTHING NOTICED, WHICH IS THE INTERESTING PART
 * Two individually correct decisions combined into a blind spot:
 *   * joinLiveExam deliberately never inserts the creator into live_participants
 *     (a teacher must not appear on their own leaderboard), and
 *   * live_session_sync recorded presence only `IF p_beat AND v_is_participant`.
 * So the host's browser had been sending a heartbeat every 30 seconds the whole
 * time and the server was dropping it on the floor.
 *
 * THE INVARIANT THAT MATTERS MOST
 * The dangerous failure is NOT "abandoned sessions stay open" — that is the old
 * behaviour and it is survivable. It is ending a session that is still running,
 * in front of a room, halfway through a paper. Most of what follows guards that
 * direction: the staleness test must run BEFORE the caller's own heartbeat is
 * recorded (so an open creator tab can never age out), it must have fallback
 * evidence (so a session with no heartbeat row yet is not killed on sight), and
 * it must refuse to act on no evidence at all.
 *
 * Body-text assertions on the migration, like the rest of this suite: migrations
 * here are hand-pasted into the SQL editor, and plpgsql does not parse a body
 * until control reaches it, so a broken function survives CREATE OR REPLACE and
 * fails for the first time in front of a live room.
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
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

const MIG = read("supabase/migrations/20260845000000_live_auto_end_abandoned_session.sql");
const CODE = stripComments(MIG);
/** Just the sync function's executable body — where ORDER is the feature. */
const SYNC = CODE.slice(CODE.indexOf("CREATE OR REPLACE FUNCTION public.live_session_sync("));
const HOOK = read("src/hooks/useLiveSession.ts");
const CONTROL = read("src/pages/LiveExamControl.tsx");
const PRESENT = read("src/pages/LiveExamPresent.tsx");

console.log("\n══ Live exams: an abandoned session closes itself ══");

// ─── [1] The host is finally being watched ──────────────────────────────────
console.log("\n[1] The host's heartbeat is recorded — somewhere that does no harm");

test("there is a table to record it in", () => {
  assert(
    /CREATE TABLE IF NOT EXISTS public\.live_host_presence/i.test(CODE),
    "IF NOT EXISTS because migrations here are pasted by hand and re-run"
  );
});

test("the creator's beat is written, on the beat the client already sends", () => {
  assert(
    /IF p_beat AND v_is_creator THEN[\s\S]{0,200}INSERT INTO public\.live_host_presence/i.test(SYNC),
    "without this nothing ever learns the host is present and every session would close after 15 minutes"
  );
});

test("no client change is required — the creator already beats", () => {
  // This is the fact that makes the whole feature a server-only migration. If
  // shouldBeat ever grows a role gate, the creator stops beating, and every
  // live session starts auto-ending 15 minutes in, mid-class.
  const runSync = HOOK.slice(HOOK.indexOf("const runSync"), HOOK.indexOf("const runSync") + 1200);
  assert(
    /const beat = shouldBeat\(/.test(runSync),
    "could not find the beat decision in useLiveSession"
  );
  assert(
    !/role\s*===\s*"student"[\s\S]{0,80}shouldBeat|shouldBeat[\s\S]{0,80}role\s*===/.test(runSync),
    "the heartbeat must stay role-agnostic: a role gate here silently turns every live session into one that ends itself mid-class"
  );
});

test("both creator surfaces count as the host being present", () => {
  // A session driven from the projector alone is not abandoned.
  assert(/role: "creator"/.test(CONTROL), "the control page must identify as creator");
  assert(/role: "creator"/.test(PRESENT), "the projector must identify as creator, or a wall-only session would end under the teacher");
});

test("the head count did not grow a phantom host", () => {
  assert(
    /COUNT\(\*\)\s+INTO\s+v_online\s+FROM\s+public\.live_presence/i.test(SYNC),
    "v_online must still count live_presence only — putting the host in that table would add one to every 'students online' reading"
  );
  assert(
    !/INSERT INTO public\.live_presence[\s\S]{0,120}v_is_creator/i.test(SYNC),
    "the host must not be written into the participant presence table"
  );
});

test("the heartbeat is NOT a column on live_exams", () => {
  // live_exams is published over Realtime, so a write every 30s would broadcast
  // the whole exam row to every student in the room, all session long.
  assert(
    !/ALTER TABLE public\.live_exams[\s\S]{0,200}host_last_seen|ALTER TABLE public\.live_exams[\s\S]{0,200}host_seen/i.test(CODE),
    "a heartbeat column on live_exams would turn every beat into a Realtime broadcast to the entire room"
  );
});

// ─── [2] The requirement: an open tab must not age out ──────────────────────
console.log("\n[2] The 15 minutes do not run while the creator's tab is open");

test("the staleness test runs BEFORE this caller's own beat is recorded", () => {
  // THE load-bearing assertion. Beat-then-test would let a creator returning
  // after an hour stamp a fresh timestamp on the way in, and no session would
  // ever close itself — the feature would silently do nothing.
  const testPos = SYNC.indexOf("PERFORM public.end_live_session_system");
  const beatPos = SYNC.indexOf("INSERT INTO public.live_host_presence");
  assert(testPos > 0, "the sync function never checks for an absent host");
  assert(beatPos > 0, "the sync function never records the host heartbeat");
  assert(
    testPos < beatPos,
    "the host beat is written before the staleness test — a returning host would reset the clock and no session would ever auto-close"
  );
});

test("the grace period is 15 minutes", () => {
  assert(
    /now\(\) - v_host_seen > interval '15 minutes'/i.test(SYNC),
    "the requested grace period, measured from the last sign of the host"
  );
});

test("only a live session can auto-close", () => {
  assert(
    /IF v_exam\.status = 'live' THEN/.test(SYNC),
    "a published-but-unstarted exam must never end itself, and an ended one must not be re-ended"
  );
});

// ─── [3] It refuses to close a session on weak evidence ─────────────────────
console.log("\n[3] Never end a class on an absence of information");

test("unlocking a question and starting the session both count as proof of life", () => {
  assert(
    /GREATEST\([\s\S]{0,300}current_question_unlocked_at[\s\S]{0,200}started_at/i.test(SYNC),
    "for a session that began before this migration there is no heartbeat row, and these are the only evidence there is — without the fallback the first poll after the migration would end every session in progress at once"
  );
});

test("no evidence at all means do nothing", () => {
  assert(
    /v_host_seen > to_timestamp\(0\)/.test(SYNC),
    "the cost of leaving a session open is an untidy row; the cost of closing one wrongly is a class cut off mid-paper"
  );
});

test("sessions already live when this lands are seeded a heartbeat", () => {
  assert(
    /INSERT INTO public\.live_host_presence[\s\S]{0,200}WHERE le\.status = 'live'/i.test(CODE),
    "applying this mid-class must not read as 'the host has been gone since the epoch'"
  );
});

// ─── [4] One caller closes it, and no student can ───────────────────────────
console.log("\n[4] Exactly once, and never by a candidate");

test("students cannot call the ending function directly", () => {
  assert(
    /REVOKE EXECUTE ON FUNCTION public\.end_live_session_system\(UUID\)\s*FROM PUBLIC, anon, authenticated/i.test(CODE),
    "the auto-end function must be reachable only from inside live_session_sync; left open, any candidate could end the exam they are sitting, for everyone"
  );
});

test("it also repairs the same hole in the migration before it", () => {
  // 20260844000000 is likely already applied, so the repair has to live here
  // rather than in a re-paste of that file.
  assert(
    /REVOKE EXECUTE ON FUNCTION public\.live_question_payload_at\(uuid, integer\)\s*FROM PUBLIC, anon, authenticated/i.test(CODE),
    "live_question_payload_at stays a paper-reading oracle until this revoke lands"
  );
  assert(
    /live_question_payload_at is callable by students/.test(MIG),
    "and the self-check must fail loudly if it ever comes back"
  );
});

test("every REVOKE EXECUTE here names anon and authenticated, not just PUBLIC", () => {
  // The bug this pins actually happened, on the first paste. A Supabase project
  // ships with default privileges that GRANT EXECUTE on new public functions
  // DIRECTLY to anon/authenticated, so `REVOKE ... FROM PUBLIC` removes a grant
  // nobody was using and the function stays callable from any browser. Every
  // REVOKE EXECUTE written in this repo before 20260845000000 has that hole.
  const revokes = CODE.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) || [];
  assert(revokes.length > 0, "expected at least one REVOKE EXECUTE");
  revokes.forEach((r) => {
    const target = r.split("FROM").pop();
    assert(
      /anon/.test(target) && /authenticated/.test(target),
      `revokes FROM PUBLIC only, which is a no-op on Supabase: ${r.replace(/\s+/g, " ").slice(0, 110)}`
    );
  });
});


test("the status predicate makes the ending idempotent under a stampede", () => {
  const fn = CODE.slice(
    CODE.indexOf("FUNCTION public.end_live_session_system"),
    CODE.indexOf("REVOKE EXECUTE ON FUNCTION public.end_live_session_system")
  );
  assert(
    /UPDATE public\.live_exams[\s\S]{0,200}AND status = 'live'/i.test(fn),
    "when the grace period lapses every client in the room arrives within the same second; the row lock plus this predicate is what builds the report exactly once"
  );
  assert(
    /IF v_result\.id IS NULL THEN\s*RETURN v_result;/.test(fn),
    "losing the race is the expected outcome for all but one caller, so it must return quietly rather than raise"
  );
});

test("the losers do not queue behind the winner's report build", () => {
  assert(
    /pg_try_advisory_xact_lock/.test(SYNC),
    "without a non-blocking lock every client in the room waits out the rankings and the report on this one poll"
  );
});

test("the creator's own End button is unchanged in behaviour", () => {
  const fn = CODE.slice(CODE.indexOf("FUNCTION public.end_live_session(p_live_exam_id"));
  assert(
    /user_id = auth\.uid\(\)/.test(fn),
    "ending a session must still require being its creator"
  );
  assert(
    (MIG.match(/Cannot end: not the creator or exam is not live/g) || []).length >= 2,
    "the original exception text must survive on both the ownership check and the post-call re-check"
  );
});

test("there is exactly one copy of what 'ending a session' means", () => {
  assert(
    /v_result := public\.end_live_session_system\(p_live_exam_id\)/.test(CODE),
    "end_live_session must delegate; two copies of the rankings-and-report sequence would drift the moment either is fixed"
  );
  const manual = CODE.slice(CODE.indexOf("FUNCTION public.end_live_session(p_live_exam_id"));
  assert(
    !/compute_live_rankings/.test(manual),
    "the manual path must not carry its own copy of the ending steps"
  );
});

// ─── [5] Ending still does everything it used to ────────────────────────────
console.log("\n[5] An auto-closed session produces the same artefacts as a manual one");

test("rankings and the report are still built", () => {
  assert(/PERFORM public\.compute_live_rankings/.test(CODE), "no rankings means no final standings");
  assert(
    /INSERT INTO public\.live_exam_reports[\s\S]{0,200}build_live_exam_report/i.test(CODE),
    "the report is the artefact the teacher actually wanted; an abandoned session producing none is the whole point of this migration"
  );
});

test("a failed report build does not sink the ending", () => {
  assert(
    /EXCEPTION WHEN OTHERS THEN\s*RAISE WARNING 'build_live_exam_report failed/.test(CODE),
    "the session must still end even if the report cannot be built — and this now runs inside a student's poll, which must not fail either"
  );
});

test("the analytics backfill keeps its ordering note", () => {
  assert(
    /status is flipped to 'ended' ABOVE[\s\S]{0,120}Do not reorder/i.test(MIG),
    "the analytics guard depends on the status already being 'ended'; the note is the only thing recording that"
  );
});

test("the reply already says 'ended', so the room acts on it immediately", () => {
  assert(
    /PERFORM public\.end_live_session_system\(p_live_exam_id\);\s*(--[^\n]*\s*)*SELECT \* INTO v_exam FROM public\.live_exams/.test(
      MIG.replace(/\r/g, "")
    ),
    "without re-reading the row this poll would still report 'live' and every client would wait another cycle before running its end-of-session flow"
  );
});

test("students need no new UI — the existing end flow fires", () => {
  assert(
    /prev\.status === "live" && next\.status === "ended"/.test(HOOK),
    "an auto-closed session must look exactly like a manually ended one to every client, which is what makes this a server-only change"
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
console.log("  A class nobody is running does not stay open forever.\n");
