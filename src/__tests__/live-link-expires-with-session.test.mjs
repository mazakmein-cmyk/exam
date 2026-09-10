/**
 * LIVE EXAMS — AN ENDED SHARE LINK ADMITS NOBODY NEW
 *
 * Run with: node src/__tests__/live-link-expires-with-session.test.mjs
 *
 * WHAT WAS BROKEN
 * joinLiveExam upserted a live_participants row with no status check, and the
 * INSERT policy only asked "signed in, and a student?". So anyone opening a
 * share link AFTER the session finished was silently enrolled as an attendee of
 * an exam they never sat: shown a "here's how you finished" card reporting zero,
 * and — the part that is other people's data — listed in the standings the class
 * can see, in the creator's participant list, and in the report's head count.
 *
 * Not an edge case. A live link is handed out at PUBLISH and pasted into class
 * groups, so this happened every time somebody scrolled back to yesterday.
 *
 * THE TWO HALVES THAT MUST BOTH HOLD
 *   1. Nobody new gets in once the session has ended.
 *   2. Everybody who WAS in the room still does — reopening the link to read
 *      your own result is the normal way that page is used afterwards.
 *
 * (2) is why the client must NOT upsert on this path. PostgREST's upsert is
 * still checked against the INSERT policy even when the row already exists, so
 * a returning student would be refused by their own re-join. Reading the
 * existing row and returning it is what keeps them in.
 *
 * The cost shape matters too: the extra read runs only on the ended branch, so
 * a normal join is exactly as expensive as it was.
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
const stripComments = (src) =>
  src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const MIG = read("supabase/migrations/20260846000000_live_join_closes_with_session.sql");
const MIG_CODE = stripComments(MIG);
const SERVICE = read("src/services/liveExamService.ts");
const SERVICE_CODE = stripComments(SERVICE);
const PAGE = read("src/pages/LiveExamStudent.tsx");

/** joinLiveExam's body, so assertions cannot drift onto some other function. */
const JOIN = SERVICE_CODE.slice(
  SERVICE_CODE.indexOf("export async function joinLiveExam"),
  SERVICE_CODE.indexOf("export async function joinLiveExam") + 2600
);

console.log("\n══ Live exams: the link expires with the session ══");

// ─── [1] Nobody new after the end ───────────────────────────────────────────
console.log("\n[1] An ended session admits nobody new");

test("the database refuses the join", () => {
  assert(
    /status IN \('published', 'live'\)/.test(MIG_CODE),
    "the policy is the only half that holds against anything calling the API directly rather than through the page"
  );
  assert(
    /ON public\.live_participants FOR INSERT/.test(MIG_CODE),
    "the gate belongs on INSERT: an UPDATE is a returning student, who must still get in"
  );
});

test("the page refuses it first, so the student reads a sentence not an error", () => {
  assert(
    /examData\?\.status === "ended"/.test(JOIN),
    "without the client-side branch the student would meet a raw policy violation"
  );
  assert(
    /throw new LiveLinkExpiredError\(\)/.test(JOIN),
    "a distinct type, because the page renders a whole different screen for it"
  );
});

test("no participant row is written on the way to that message", () => {
  // The entire point: being late must not make you an attendee.
  const endedBranch = JOIN.slice(
    JOIN.indexOf('examData?.status === "ended"'),
    JOIN.indexOf("throw new LiveLinkExpiredError()")
  );
  assert(
    !/\.upsert\(|\.insert\(/.test(endedBranch),
    "any write here files a zero-score attendee into the standings, the creator's list and the head count"
  );
});

// ─── [2] Everybody who was there still gets in ──────────────────────────────
console.log("\n[2] People who were in the room keep full access");

test("an existing participant is returned, not re-joined", () => {
  const endedBranch = JOIN.slice(JOIN.indexOf('examData?.status === "ended"'));
  assert(
    /from\("live_participants"\)[\s\S]{0,200}\.maybeSingle\(\)/.test(endedBranch),
    "their own row is what proves they were in the room"
  );
  assert(
    /if \(existing\) return existing/.test(endedBranch),
    "returning the row without a write is what keeps the tightened INSERT policy from refusing them: an upsert is checked against it even when the row exists"
  );
});

test("the policy still admits published and live sessions", () => {
  assert(
    /'published'/.test(MIG_CODE) && /'live'/.test(MIG_CODE),
    "an over-tight predicate here reads as 'nobody can join', discovered by a room of students at the moment the host starts"
  );
  assert(
    /the join policy does not admit published\/live sessions/.test(MIG),
    "the self-check must guard that direction too"
  );
});

test("the checks that were already on the policy survive the rewrite", () => {
  assert(
    /auth\.uid\(\) = user_id/.test(MIG_CODE),
    "losing this lets one student join as another"
  );
  assert(
    /user_metadata' ->> 'user_type'\) = 'student'/.test(MIG_CODE),
    "losing this puts creators back on their own leaderboards (20260801000000)"
  );
});

// ─── [3] Cost, and the race ─────────────────────────────────────────────────
console.log("\n[3] Free on the normal path, and honest when it loses a race");

test("status rides the request joinLiveExam already made", () => {
  assert(
    /\.select\("user_id, status"\)/.test(JOIN),
    "the creator check already read this row; widening the select keeps the gate free"
  );
});

test("the extra read happens only on the ended branch", () => {
  const beforeEnded = JOIN.slice(0, JOIN.indexOf('examData?.status === "ended"'));
  assert(
    !/from\("live_participants"\)/.test(beforeEnded),
    "a lookup before the branch would add one request to every join in a 500-student room"
  );
});

test("a session ending mid-join is reported as expiry, not as a database error", () => {
  assert(
    /isJoinAfterEndError/.test(JOIN),
    "the status read and the write are not atomic, so the policy can refuse a join the client thought was fine"
  );
  assert(
    /42501/.test(SERVICE_CODE),
    "42501 is RLS refusing the row; without mapping it the student reads a Postgres string"
  );
});

// ─── [4] What the student sees ──────────────────────────────────────────────
console.log("\n[4] The screen");

test("it says the link expired", () => {
  assert(/Link expired/.test(PAGE), "the requested wording");
  assert(
    /already ended/.test(PAGE),
    "and says why, so it does not read as a broken link"
  );
});

test("expiry is its own state, not folded into blocked or not-found", () => {
  assert(
    /const \[linkExpired, setLinkExpired\]/.test(PAGE),
    "'blocked' means wrong account type and 'not found' means a bad code; this link was real and the person is simply late"
  );
  assert(
    /error instanceof LiveLinkExpiredError/.test(PAGE),
    "matching on the type rather than the message text"
  );
});

test("it is not reported as an error toast", () => {
  const cat = PAGE.slice(PAGE.indexOf("if (error instanceof LiveLinkExpiredError)"));
  const upToToast = cat.slice(0, cat.indexOf("toast("));
  assert(
    /setLinkExpired\(true\);[\s\S]{0,40}return;/.test(upToToast),
    "the student did nothing wrong; the expiry branch must return before the destructive toast"
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
console.log("  Turning up late no longer makes you an attendee.\n");
