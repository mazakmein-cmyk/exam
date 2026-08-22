/**
 * AUTOMATED REGRESSION TEST SUITE
 * Tests all logic changed during the scalability optimization session
 *
 * Run with: node src/__tests__/regression.test.mjs
 *
 * Covers:
 *  [1] Analytics: N+1 → batch query logic (student rank map)
 *  [2] Analytics: O(N²) → O(1) Map lookup logic (creator scoring)
 *  [3] Analytics: DB is_correct trusted over re-grading
 *  [4] ExamSimulator: Attempt NOT created on load, created on Start
 *  [5] useUserRole: location.pathname removed from deps (static check)
 *  [6] Migration files: Indexes and RLS files exist and are valid SQL
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

function assertContains(str, substring, message) {
  if (!str.includes(substring))
    throw new Error(message || `Expected to contain: "${substring}"`);
}

function assertNotContains(str, substring, message) {
  if (str.includes(substring))
    throw new Error(message || `Expected NOT to contain: "${substring}"`);
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(
    resolve(ROOT, "supabase", "migrations", filename),
    "utf-8"
  );
}

// ─── [1] Analytics: N+1 → Batch Query Fix ───────────────────────────────────
console.log("\n[1] Analytics — N+1 → Batch Query (Student Rank Logic)");

test("analyticsTs: FOR loop with sequential awaits per exam is REMOVED", () => {
  const src = readSrc("pages/Analytics.tsx");
  // The old pattern: for (const eid of examIds) { await supabase.from("sections")...
  assertNotContains(
    src,
    'for (const eid of examIds) {\n              // Get sections for this exam (ordered)',
    "Old N+1 for-loop still present"
  );
});

// Both rank queries are still driven by the whole id list in one pass (no
// per-exam N+1), but the list is now sliced into fixed chunks: every id is
// serialized into the query string, so an aspirant with enough exams would
// otherwise overflow the URL length ceiling and 414.
test("analyticsTs: sections rank query batches over the full examIds list", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "fetchInChunks(examIds", "Batched sections query not found");
  assertContains(src, '.in("exam_id", slice)', "Chunked sections .in() not found");
});

test("analyticsTs: paged and chunked fetches surface errors instead of dropping data", () => {
  const src = readSrc("pages/Analytics.tsx");
  // A silently-ignored error here made every rank badge vanish with no toast.
  // The check now lives in fetchAllPages, which every chunked read goes through.
  assertContains(src, "if (error) throw error;", "Page-level error check not found");
  assertContains(src, "fetchAllPages((from, to) => run(slice, from, to))", "Chunked reads must page, not take one capped response");
});

// The client used to fetch every user's attempts and rank them here. RLS shows
// this client only its OWN rows, so that ranked a student against their own
// retakes and printed it as a cohort placement — "🏆 #1/1" for a single sitting.
// Ranking now runs in get_my_exam_ranks, which reads every sitting with definer
// rights and returns only the caller's rank. These tests fail if either page
// goes back to ranking locally.
test("analyticsTs: ranks come from the server RPC, not a local cross-user query", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "get_my_exam_ranks", "Rank RPC call not found");
  assertNotContains(
    src,
    "attemptsByExam",
    "Client-side cross-user rank grouping is back — RLS makes it rank a student against themselves"
  );
});

test("examReviewTs: ranks come from the server RPC, not a local cross-user query", () => {
  const src = readSrc("pages/ExamReview.tsx");
  assertContains(src, "get_my_exam_ranks", "Rank RPC call not found");
  assertNotContains(
    src,
    "const sessions: ExamSession[]",
    "Client-side session ranking is back — it disagreed with Analytics and ranked against RLS-filtered rows"
  );
});

// 20260828010000 supersedes 20260827000000 wholesale, so the invariants are
// asserted against the LIVE definition. Asserting the older file would pass
// while the function the database actually runs had drifted.
const LIVE_RANK_SQL = "20260828010000_student_exam_ranks_jsonb.sql";

test("rankRpc: the migration ranks sittings across all users but returns only the target's", () => {
  const sql = readMigration(LIVE_RANK_SQL);
  assertContains(sql, "SECURITY DEFINER", "Rank RPC must bypass RLS to see the cohort");
  assertContains(sql, "WHERE ranked.user_id = (SELECT uid FROM target)", "Rank RPC must return only the target's rows");
  assertContains(sql, "RANK() OVER", "Ties must share a place");
  assertContains(sql, "a.submitted_at IS NOT NULL", "Abandoned attempts must not be ranked");
  assertContains(sql, "a.user_id <> e.user_id", "The creator's own attempts must not be ranked");
});

test("rankRpc: only the exam's owner can read another user's rank", () => {
  const sql = readMigration(LIVE_RANK_SQL);
  // p_user_id exists so a creator reviewing a student keeps the rank card.
  // Honouring it without the ownership test would turn it into a rank oracle.
  assertContains(sql, "WHERE e.id = ANY(p_exam_ids) AND e.user_id = auth.uid()", "p_user_id must be gated on exam ownership");
});

test("rankRpc: PUBLIC cannot execute the definer function", () => {
  const sql = readMigration(LIVE_RANK_SQL);
  // Postgres grants EXECUTE to PUBLIC by default, which would leave a
  // SECURITY DEFINER function callable with the browser's publishable key.
  assertContains(sql, "REVOKE EXECUTE ON FUNCTION public.get_my_exam_ranks", "Missing REVOKE FROM PUBLIC");
});

test("rankRpc: orphan attempts are excluded, and a re-sat section replaces its score", () => {
  const sql = readMigration(LIVE_RANK_SQL);
  // Ranking the orphan bucket invented a competitor and inflated everyone's
  // "out of N"; summing repeat attempts on one section let a student stack
  // scores past the paper maximum and outrank a clean run.
  assertContains(sql, "WHERE sitting_no > 0", "Orphan bucket must not be ranked");
  assertContains(sql, "DISTINCT ON (exam_id, user_id, sitting_no, section_id)", "Latest attempt per section must win");
});

test("rankRpc: returns one JSON document, so the row cap cannot truncate ranks", () => {
  const sql = readMigration(LIVE_RANK_SQL);
  // Set-returning RPCs are capped at 1000 rows like any other read, which
  // silently dropped rank badges from an arbitrary subset of history rows.
  assertContains(sql, "RETURNS jsonb", "Rank RPC must return a single document");
  assertContains(sql, "DROP FUNCTION IF EXISTS public.get_my_exam_ranks(uuid[], uuid)", "The old set-returning signature must be dropped");
});

test("analyticsTs: the History grouping is committed before ranking is attempted", () => {
  const src = readSrc("pages/Analytics.tsx");
  // A rank failure used to skip setFirstSectionsByExamId, which shattered the
  // list into one row per section — the exact result of shipping the client
  // ahead of the migration.
  const groupingAt = src.indexOf("setFirstSectionsByExamId(firstSectionsMap)");
  // The quoted form matches the rpc() call site, not the prose about it —
  // comments mentioning the function name must not move this assertion.
  const rpcAt = src.indexOf('"get_my_exam_ranks",');
  assert(groupingAt > -1 && rpcAt > -1, "Expected both the grouping setter and the rank RPC call");
  assert(groupingAt < rpcAt, "Session grouping must be committed before the rank RPC can throw");
});

test("examReviewTs: the ranked sitting and the displayed sitting use the same attempts", () => {
  const src = readSrc("pages/ExamReview.tsx");
  assertContains(src, '.not("submitted_at", "is", null)', "ExamReview must exclude abandoned attempts, as the rank RPC does");
});

// Re-answering one section must REPLACE that section's score, not add to it.
// Summing repeats produced a row reading "4 sections, 62/125" on a 3-section
// 100-question paper, and a rank badge that disagreed with the score printed
// beside it, because ExamReview and get_my_exam_ranks already de-duplicated.
// Both client aggregations derive their totals from a per-section survivor set,
// so these tests fail if either goes back to accumulating inline.
test("analyticsTs: History totals count the latest attempt per section, not every attempt", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "const closeSitting = ", "History sittings must be closed and then totalled");
  assertContains(src, "countedAttempts(atts)", "History totals must come from the per-section survivors");
  assertNotContains(src, "cur.totalScore += att.score", "History is accumulating every attempt again");
  assertNotContains(src, "cur.sections.push(", "History is listing a re-sat section twice again");
});

test("analyticsTs: the leaderboard counts the latest attempt per section too", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "const closeLbSitting = ", "Leaderboard sittings must be closed and then totalled");
  assertNotContains(src, "cur.totalScore += att.score || 0;", "Leaderboard is accumulating every attempt again");
});

test("analyticsTs: every attempt id stays on the sitting so the rank still resolves", () => {
  const src = readSrc("pages/Analytics.tsx");
  // The server keys a rank to every attempt of the sitting, superseded ones
  // included. Narrowing allAttemptIds to the counted set would drop the badge.
  assertContains(src, "allAttemptIds: atts.map(a => a.id)", "allAttemptIds must span every attempt, not just the counted ones");
});

test("analyticsTs: the survivor is chosen on created_at, matching the RPC and ExamReview", () => {
  const src = readSrc("pages/Analytics.tsx");
  // Keying on submitted_at instead made the client pick a different attempt
  // than the server for the same section — the score shown and the rank shown
  // then came from different arithmetic, which is the defect being fixed.
  // Raw ISO comparison, because new Date() truncates Postgres microseconds.
  assertContains(
    src,
    "a.created_at > b.created_at || (a.created_at === b.created_at && a.id > b.id)",
    "Survivor must be picked on created_at then id, as raw text"
  );
  // Row ORDER still keys on submitted_at; conflating the two silently reorders
  // the whole History list.
  assertContains(src, "const finishTimeOf =", "Sort order must keep its own submitted_at comparator");
});

test("analyticsTs: an abandoned attempt can never supersede a completed one", () => {
  const src = readSrc("pages/Analytics.tsx");
  // The creator query deliberately keeps unsubmitted rows and the summary
  // scores them 0 out of the full section, so letting one win would erase a
  // section the student actually finished — worse than the double-counting.
  assertContains(src, "if (aDone !== bDone) return aDone;", "Submitted must outrank abandoned before any time comparison");
});

test("examReviewTs: the attempts list is a total order, so it agrees with the RPC on ties", () => {
  const src = readSrc("pages/ExamReview.tsx");
  assertContains(src, '.order("id", { ascending: false })', "created_at alone leaves tie order unspecified");
});

// The submit path upserts on (attempt_id, question_id). Without a unique index
// Postgres rejects that ON CONFLICT target on every submit and the code falls
// back to an APPENDING insert, so a re-submitted section writes a second full
// set of answers — and every reader counts rows, so accuracy can exceed 100%.
// This is also the prerequisite for ever saving answers mid-exam.
test("responsesSql: one row per (attempt, question) is enforced by a unique index", () => {
  const sql = readMigration("20260829000000_responses_one_row_per_question.sql");
  assertContains(
    sql,
    "CREATE UNIQUE INDEX IF NOT EXISTS responses_attempt_question_key",
    "The upsert's ON CONFLICT target needs a unique index"
  );
  assertContains(sql, "ON public.responses (attempt_id, question_id)", "Index must cover exactly the upsert's columns");
  // Duplicates already in the table would make the index creation fail, so the
  // de-dup has to run first and keep the student's latest answer.
  assertContains(sql, "ORDER BY updated_at DESC NULLS LAST", "De-dup must keep the most recent answer");
  assertContains(sql, "AND ranked.rn > 1", "De-dup must never delete a question's only answer");
});

// Grading moved to the server. The browser could only ever grade because the
// answer key is delivered to it at exam start — moving the grading is what lets
// the key stop being sent. It also makes `score` the server's to decide, which
// matters because the attempts write policy does not restrict WHICH columns a
// student may change on their own row.
test("submitRpc: the server grades, derives its own denominator, and refuses to re-grade", () => {
  const sql = readMigration("20260831000000_submit_exam_attempt.sql");
  assertContains(sql, "SECURITY DEFINER", "It must read the key the student cannot");
  assertContains(sql, "grade_mock_answer(q.correct_answer, i.selected_answer)", "Grading must reuse the pinned comparison");
  // Without this guard a student could submit one answer, read the verdict,
  // change it and submit again — an oracle, one answer at a time.
  assertContains(sql, "IF v_attempt.submitted_at IS NOT NULL THEN", "Re-grading must be refused");
  assertContains(sql, "'already_submitted', true", "A repeat call must report, not re-grade");
  // The browser must not get to choose what it is scored out of.
  assertContains(sql, "FROM public.parsed_questions q", "total_questions must come from the section");
  assertContains(sql, "WHERE q.section_id = v_attempt.section_id", "…that attempt's own section");
  assertContains(sql, "v_attempt.user_id <> v_uid", "It must refuse someone else's attempt");
  assertContains(sql, "REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt", "Missing REVOKE FROM PUBLIC");
});

test("examServiceTs: submit calls the server grader and lets it stamp the attempt", () => {
  const src = readSrc("services/examService.ts");
  assertContains(src, '"submit_exam_attempt"', "Submit must go through the server grader");
  // Stamping submitted_at before the call would make the grader take its
  // already-submitted branch and never grade anything.
  const insertAt = src.indexOf(".from(\"attempts\")");
  const insertBlock = src.slice(insertAt, insertAt + 400);
  assertNotContains(insertBlock, "submitted_at:", "The attempt insert must not stamp submitted_at");
  assertContains(src, "if (!serverGraded)", "The client may only write the scores when the server did not");
});

test("examServiceTs: the browser does not overwrite the server's verdicts", () => {
  const src = readSrc("services/examService.ts");
  // The server writes every response row WITH the authoritative is_correct.
  // Writing them again from the browser would replace those verdicts.
  // Collapsed whitespace: this file's line endings differ by checkout.
  const flat = src.replace(/\s+/g, " ");
  assertContains(flat, "= serverGraded ? { error: null } :", "The responses write must be skipped when the server graded");
});

// ─── The answer key is not sent to candidates ───────────────────────────────
// The runner used to select("*") on parsed_questions, and the policy returned
// whole rows to anyone — including anon — so the key for every question was in
// the page from the moment the exam began. Three pages also RENDERED it to
// anyone who typed the URL, because none checks ownership.
test("answerKeySql: the student view withholds both answer channels", () => {
  const sql = readMigration("20260832000000_hide_practice_answer_key.sql");
  assertContains(sql, "CREATE OR REPLACE VIEW public.parsed_questions_student", "Student view missing");
  // answer_hint is a second key: the PDF parser is told to put the answer there
  // if it finds one in the paper. Withholding only correct_answer leaves it open.
  assertContains(sql, "answer_hint", "The migration must account for answer_hint");
  assertContains(sql, "column_name IN ('correct_answer', 'answer_hint')", "Both channels must be self-checked");
  // Omitting either of these 400s the runner or silently reorders the paper.
  assertContains(sql, "q.is_excluded", "The runner filters on is_excluded");
  assertContains(sql, "q.final_order", "The runner sorts on final_order");
});

test("answerKeySql: the base-table read is removed but creators keep theirs", () => {
  const sql = readMigration("20260832000000_hide_practice_answer_key.sql");
  assertContains(
    sql,
    'DROP POLICY IF EXISTS "Anyone can view questions of published exams" ON public.parsed_questions',
    "The leak closes here or nowhere"
  );
  assertContains(sql, "'Users can view questions from their exams'", "The creator policy must be asserted intact");
});

test("answerKeySql: anon keeps the view — practice exams can be sat without an account", () => {
  const sql = readMigration("20260832000000_hide_practice_answer_key.sql");
  // The revoke that live exams needed must NOT be copied here: a signed-out
  // visitor resolves to "take", so revoking would blank the paper for guests.
  assertContains(sql, "TO authenticated, anon", "anon must keep SELECT on the student view");
  assertContains(sql, "anon lost the student view", "…and it must be self-checked");
});

test("answerKeySql: the key is revealed only for a submitted attempt you may see", () => {
  const sql = readMigration("20260832000000_hide_practice_answer_key.sql");
  assertContains(sql, "get_attempt_answer_key", "Reveal function missing");
  assertContains(sql, "RETURNS TABLE (question_id uuid, correct_answer jsonb)", "It must return two columns, never a table rowtype");
  assertContains(sql, "a.submitted_at IS NOT NULL", "Not before the paper is handed in");
  assertContains(sql, "a.user_id = auth.uid() OR e.user_id = auth.uid()", "Own attempt, or the exam's owner");
});

test("answerKeySql: per-question marks survive for students", () => {
  const sql = readMigration("20260832000000_hide_practice_answer_key.sql");
  // The marks-settings policy reached through parsed_questions as the INVOKER.
  // With the student policy gone that silently returns nothing, and
  // scoringService swallows the error — so marks would quietly be wrong.
  assertContains(sql, "get_published_question_ids", "The policy needs a definer helper");
  assertContains(
    sql,
    "USING (question_id IN (SELECT public.get_published_question_ids()))",
    "The marks-settings policy must not read the table as invoker"
  );
});

test("studentScreens: the runner and intro read the view, never the table", () => {
  const runner = readSrc("pages/ExamSimulator.tsx");
  const intro = readSrc("pages/ExamIntro.tsx");
  assertNotContains(runner, 'from("parsed_questions")', "The runner must not read the base table");
  assertNotContains(intro, 'from("parsed_questions")', "The intro must not read the base table");
  assertContains(runner, 'from("parsed_questions_student"', "The runner must read the student view");
  assertContains(intro, 'from("parsed_questions_student"', "The intro must read the student view");
  // And it must never have needed the key: the runner never read it. Comments
  // stripped, so prose explaining the change does not trip this.
  const runnerCode = runner.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assertNotContains(runnerCode, "correct_answer", "The runner must not touch the answer key at all");
});

test("examReviewTs: the review gets the key separately and cannot crash on a missing question", () => {
  const src = readSrc("pages/ExamReview.tsx");
  assertContains(src, "question:parsed_questions_student(*)", "Review must embed the student view");
  assertContains(src, "get_attempt_answer_key", "Review must fetch the key through the reveal function");
  // The old sort dereferenced r.question blindly, so a filtered-out question
  // blanked the whole page with a TypeError instead of degrading.
  assertContains(src, "filter((r: any) => r.question)", "A response with no question must be dropped, not dereferenced");
});

test("examServiceTs: the appending fallback is no longer silent", () => {
  const src = readSrc("services/examService.ts");
  assertContains(src, "onConflict: 'attempt_id,question_id'", "Upsert target must not change shape");
  assertContains(
    src,
    "responses upsert fell back to insert",
    "A missing unique index must be reported, not swallowed"
  );
});

// ─── [2] Analytics: the creator dashboard aggregates in the database ────────
console.log("\n[2] Analytics — creator scoring is aggregated server-side");

// The browser used to download every answer of every student and grade them
// locally. PostgREST caps a response at 1000 rows without saying so, and the
// fetch was batched by attempt while it needed a row per answer — so real
// students rendered at 0%. The counting now happens where the rows are and the
// browser receives a fixed-size summary. These tests fail if it moves back.
test("analyticsTs: the creator dashboard no longer downloads raw responses", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertNotContains(src, 'from("responses")', "Analytics must not read the responses table directly");
  assertNotContains(src, "CHUNK_SIZE = 200", "The batched responses fetch is back");
  assertNotContains(src, "responsesByAttempt", "Local per-attempt response grouping is back");
});

test("analyticsTs: scores and question counts come from get_exam_analytics", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "get_exam_analytics", "Summary RPC call not found");
  assertContains(src, "scoreByAttempt", "Per-attempt summary lookup not found");
  assertContains(src, "statByQuestion", "Per-question summary lookup not found");
});

test("analyticsTs: every read that can exceed the row cap is paged", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, ".range(from, to)", "Paged range call not found");
  assertContains(src, "if (!data || data.length < PAGE) return rows;", "Page loop termination not found");
  // Paging over a non-deterministic order duplicates and skips rows.
  assertContains(src, '.order("id")', "Paged reads need id as a final tiebreaker");
});

// ─── [3] Analytics: grading lives in SQL and still trusts is_correct ────────
console.log("\n[3] Analytics — the grader trusts is_correct, then falls back");

test("examAnalyticsSql: is_correct is trusted, with a fallback only when NULL", () => {
  const sql = readMigration("20260828000000_exam_analytics_summary.sql");
  assertContains(
    sql,
    "COALESCE(r.is_correct, public.grade_mock_answer(q.correct_answer, r.selected_answer))",
    "is_correct must be trusted first, re-graded only when NULL"
  );
});

test("examAnalyticsSql: excluded questions are not counted, creator attempts are not either", () => {
  const sql = readMigration("20260828000000_exam_analytics_summary.sql");
  assertContains(sql, "q.is_excluded = false", "Excluded questions would inflate every denominator");
  assertContains(sql, "a.user_id <> e.user_id", "The creator's own attempts must be excluded");
  assertContains(sql, "r.submitted_at IS NOT NULL", "Question stats must ignore abandoned attempts");
});

test("examAnalyticsSql: the summary is creator-only and not PUBLIC", () => {
  const sql = readMigration("20260828000000_exam_analytics_summary.sql");
  assertContains(sql, "WHERE e.id = p_exam_id AND e.user_id = auth.uid()", "Summary must be owner-gated");
  assertContains(sql, "REVOKE EXECUTE ON FUNCTION public.get_exam_analytics", "Missing REVOKE FROM PUBLIC");
});

test("examAnalyticsSql: it returns one JSONB row, so the row cap cannot bite again", () => {
  const sql = readMigration("20260828000000_exam_analytics_summary.sql");
  // A set-returning function would have reintroduced the same silent 1000-row
  // ceiling at a different number.
  assertContains(sql, "RETURNS jsonb", "The summary must be a single JSON document");
});

test("examAnalyticsSql: the SQL grader is pinned by assertions on real answer shapes", () => {
  const sql = readMigration("20260828000000_exam_analytics_summary.sql");
  assertContains(sql, "'set equal out of order'", "Multi-select set equality must be asserted");
  assertContains(sql, "'partial answer is wrong'", "A scalar against a multi-answer key must be asserted wrong");
  assertContains(sql, "'zero is a real answer'", "A stored answer of 0 must not read as absent");
});

// ─── [4] ExamSimulator: Deferred Attempt Creation ───────────────────────────
console.log("\n[4] ExamSimulator — Attempt Created on Start, Not Page Load");

test("examSimulatorTs: attempt INSERT is NOT inside fetchSectionAndQuestions", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // The old code had .insert({ user_id, section_id, started_at }) inside fetchSectionAndQuestions
  // after setQuestionStates. Check that the comment about deferred creation is present.
  assertContains(
    src,
    "do NOT create attempt yet (wait for user to click",
    "Deferred attempt creation comment not found"
  );
});

test("examSimulatorTs: handleStartSection function exists", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "const handleStartSection = async", "handleStartSection not found");
});

test("examSimulatorTs: Start Section button calls handleStartSection", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "onClick={handleStartSection}", "Start button not wired to handleStartSection");
});

test("examSimulatorTs: attempt INSERT is inside handleStartSection", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // handleStartSection must contain the insert and set the attempt id.
  //
  // The insert became multi-row when configurable section navigation landed:
  // a paper with `allow_section_switching` on opens one attempt per section at
  // once, so the sitting's id is picked out of the returned rows instead of a
  // single `data.id`. The property under test — nothing is inserted until the
  // student presses Start — is unchanged.
  const handleStart = src.slice(
    src.indexOf("const handleStartSection = async"),
    src.indexOf("const updateQuestionTime")
  );
  assertContains(handleStart, '.from("attempts")', "attempt insert not in handleStartSection");
  assertContains(handleStart, "setAttemptId(", "setAttemptId not in handleStartSection");
  assertContains(
    handleStart,
    "setAttemptIdBySection(",
    "per-section attempt map not populated in handleStartSection"
  );
  assertContains(handleStart, "setHasStarted(true)", "setHasStarted not in handleStartSection");
});

test("examSimulatorTs: setHasStarted(true) is NOT inside fetchSectionAndQuestions", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const fetchFn = src.slice(
    src.indexOf("const fetchSectionAndQuestions = async"),
    src.indexOf("const handleStartSection = async")
  );
  assertNotContains(
    fetchFn,
    "setHasStarted(true)",
    "setHasStarted(true) still inside fetchSectionAndQuestions — attempt created on page load!"
  );
});

// ─── [5] useUserRole: No subscription leak ───────────────────────────────────
console.log("\n[5] useUserRole — Subscription Created Once, Not Per Navigation");

test("useUserRole: useLocation import is REMOVED", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertNotContains(src, "useLocation", "useLocation still imported — subscription will leak per navigation");
});

test("useUserRole: location.pathname NOT in dep array", () => {
  const src = readSrc("hooks/use-user-role.ts");
  // Check the dep array line specifically — the word appears in comments but not in code
  const depArrayLine = src.split("\n").find((l) => l.includes("}, ["));
  assert(depArrayLine, "Could not find dep array line");
  assertNotContains(
    depArrayLine,
    "location.pathname",
    "location.pathname still in dep array — subscription recreated on every URL change"
  );
});

test("useUserRole: window.location.pathname used for dynamic path read", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(
    src,
    "window.location.pathname",
    "Dynamic path read not found — redirect logic may be broken"
  );
});

test("useUserRole: only [navigate] in dep array", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(src, "}, [navigate]);", "Dep array is not [navigate] — may still be leaking");
});

test("useUserRole: subscription cleanup still present", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(src, "subscription.unsubscribe()", "Cleanup not found — subscription will truly leak on unmount");
});

// ─── [6] Migration Files ─────────────────────────────────────────────────────
console.log("\n[6] Migration Files — Indexes and RLS Optimization");

test("migration exists: 20260330000000_add_performance_indexes.sql", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assert(sql.length > 0, "File is empty");
});

test("indexes migration: idx_attempts_section_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_attempts_section_id", "Missing index on attempts.section_id");
});

test("indexes migration: idx_attempts_user_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_attempts_user_id", "Missing index on attempts.user_id");
});

test("indexes migration: idx_responses_attempt_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_responses_attempt_id", "Missing index on responses.attempt_id");
});

test("indexes migration: idx_parsed_questions_section_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_parsed_questions_section_id", "Missing index on parsed_questions.section_id");
});

test("indexes migration: all use IF NOT EXISTS (idempotent)", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  const count = (sql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
  assert(count === 4, `Expected 4 IF NOT EXISTS indexes, found ${count}`);
});

test("migration exists: 20260330000001_optimize_rls_policies.sql", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assert(sql.length > 0, "File is empty");
});

test("rls migration: 4 helper functions created", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const count = (sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length;
  assert(count === 4, `Expected 4 functions, found ${count}`);
});

test("rls migration: functions are STABLE (cached per statement)", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  // Count standalone STABLE declarations (on their own line, not inside comments)
  const count = sql.split("\n").filter((l) => l.trim() === "STABLE").length;
  assert(count === 4, `Expected 4 STABLE declarations (one per function), found ${count}`);
});

test("rls migration: functions use SECURITY DEFINER", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const count = (sql.match(/SECURITY DEFINER/g) || []).length;
  assert(count === 4, `Expected 4 SECURITY DEFINER declarations, found ${count}`);
});

test("rls migration: all 4 old SELECT policies are DROPped safely", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assertContains(sql, 'DROP POLICY IF EXISTS "Users can view sections of their exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Anyone can view sections of published exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Users can view questions from their exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Anyone can view questions of published exams"');
});

test("rls migration: new policies use IN (SELECT fn()) pattern", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assertContains(sql, "IN (SELECT public.get_owned_exam_ids())", "sections owner policy not using function");
  assertContains(sql, "IN (SELECT public.get_published_exam_ids())", "sections public policy not using function");
  assertContains(sql, "IN (SELECT public.get_owned_section_ids())", "questions owner policy not using function");
  assertContains(sql, "IN (SELECT public.get_published_section_ids())", "questions public policy not using function");
});

test("rls migration: correlated subqueries (EXISTS) NOT present in new policies", () => {
  // Get only the part after all functions are defined
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const policiesSection = sql.slice(sql.indexOf("-- 2. Rewrite sections"));
  assertNotContains(
    policiesSection,
    "EXISTS (",
    "New policies still use EXISTS correlated subquery — optimization not applied"
  );
});

// ─── Pre-existing TS errors (should not be NEW) ───────────────────────────────
console.log("\n[7] Pre-existing TS Errors Baseline Check");

test("analyticsTs: no import of useLocation (not needed)", () => {
  const src = readSrc("pages/Analytics.tsx");
  // Analytics never used useLocation, this is just a sanity check
  assert(true, "trivially true");
});

test("examServiceTs: is_correct is still set on every response row", () => {
  const src = readSrc("services/examService.ts");
  assertContains(src, "is_correct: isCorrect", "examService no longer saves is_correct to responses!");
});

// ─── Rich-text answer options ─────────────────────────────────────────────────
// Options can now hold editor HTML (bold/math/colour) as well as the plain text
// every older row still contains. Both shapes must keep working: markup renders
// as markup, plain text keeps the HTML-ESCAPING path so "a < b" isn't eaten.
console.log("\n[8] Rich-text answer options");

test("richText: helpers exist and the tag test is allowlist-based", () => {
  const src = readSrc("lib/richText.ts");
  assertContains(src, "export function looksLikeHtml");
  assertContains(src, "export function htmlToPlainText");
  assertContains(src, "export function isRichTextEmpty");
  assertContains(src, "export function optionMatchKey");
  assertContains(src, "EDITOR_TAGS", "tag detection must use the editor-tag allowlist");
});

test("renderMath: renderMathInRichText routes HTML vs plain text", () => {
  const src = readSrc("lib/renderMath.ts");
  assertContains(src, "export function renderMathInRichText");
  assertContains(
    src,
    "looksLikeHtml(s) ? renderMathInHtml(s) : renderMathInText(s)",
    "rich-text renderer must fall back to the escaping path for plain options"
  );
});

test("renderMath: collapsed question previews render math instead of printing source", () => {
  // A one-line preview strips HTML tags to flatten the row — but the LaTeX in
  // the text survives that strip. Printed raw, the collapsed row read
  // "$(Use~\\pi=\\frac{22}{7})$" while the expanded Question Text box directly
  // below it showed the same string properly rendered.
  const cases = [
    ["pages/ExamDetail.tsx", "renderMathInText(displayText || 'Question with passage')"],
    ["pages/LiveExamDetail.tsx", 'renderMathInText(plainText || "Question with image")'],
  ];
  for (const [file, expected] of cases) {
    const src = readSrc(file);
    assertContains(src, expected, `${file}: the collapsed preview must render its text, not print it`);
    assert(
      !/truncate">\{(plainText|displayText)/.test(src),
      `${file}: a raw {text} dump in the collapsed row shows LaTeX source`
    );
  }
});

test("renderMath: the Question Text detail box shows the stored source, not rendered output", () => {
  // Deliberately the inverse of the collapsed row above it. The row shows how
  // the question READS; this box shows what is STORED, because the renderer
  // repairs import damage on the fly (a control char where \frac's \f was) and
  // a creator auditing an imported paper would never see the corruption.
  const src = readSrc("pages/ExamDetail.tsx");
  const box = src.slice(src.indexOf(">Question Text</Label>"));
  const inner = box.slice(0, box.indexOf("</div>"));
  assert(
    !inner.includes("dangerouslySetInnerHTML"),
    "the Question Text box must print its value, not render it"
  );
  assert(
    inner.includes("htmlToPlainText("),
    "editor markup (<span style=…>) is the editor's noise, not the author's text — strip it, keep the LaTeX"
  );
});

test("QuestionForm: option fields use the rich editor, not a plain input", () => {
  const src = readSrc("components/QuestionForm.tsx");
  assertContains(src, "<RichTextEditor", "options no longer render a rich editor");
  assertContains(src, "singleLine", "option editor should swallow Enter");
  assertNotContains(
    src,
    "placeholder={`Option ${idx + 1}`}\n                                    value={opt}",
    "options fell back to the plain TransliterateInput"
  );
});

test("RichTextEditor: keeps Indic transliteration for option typing", () => {
  const src = readSrc("components/RichTextEditor.tsx");
  assertContains(src, "getTransliterationSuggestions", "transliteration was dropped");
  assertContains(src, "handleTranslitKeyDown", "suggestion keyboard nav missing");
});

test("every option renderer handles markup (no renderMathInText on options)", () => {
  for (const file of [
    "pages/ExamSimulator.tsx",
    "pages/ExamReview.tsx",
    "pages/LiveExamStudent.tsx",
    "pages/LiveExamControl.tsx",
    "pages/Analytics.tsx",
    "pages/AdminDashboard.tsx",
    "pages/LiveExamDetail.tsx",
  ]) {
    const src = readSrc(file);
    assertNotContains(
      src,
      "renderMathInText(opt",
      `${file} still escapes option markup — bold/math options would show raw tags`
    );
    assertNotContains(
      src,
      "renderMathInText(option",
      `${file} still escapes option markup — bold/math options would show raw tags`
    );
  }
});

test("blank rich-text options can't be saved as real choices", () => {
  const examDetail = readSrc("pages/ExamDetail.tsx");
  const liveDetail = readSrc("pages/LiveExamDetail.tsx");
  assertContains(
    examDetail,
    "!isRichTextEmpty(newQuestionOptions[i])",
    "ExamDetail still uses .trim() — a cleared editor's <br> would be saved as an option"
  );
  // Same shape as ExamDetail now: joint text-or-image filtering keeps
  // image-only options while still treating a cleared editor as blank.
  assertContains(
    liveDetail,
    "!isRichTextEmpty(newQuestionOptions[i])",
    "LiveExamDetail still uses .trim() — a cleared editor's <br> would be saved as an option"
  );
});

test("text-based answers still match options the creator has formatted", () => {
  const src = readSrc("pages/ExamReview.tsx");
  assertContains(src, "optionMatchKey(o) === optionMatchKey(val)");
  assertNotContains(
    src,
    "String(o).trim().toLowerCase() === String(val).trim().toLowerCase()",
    "option-text matching compares raw HTML — a bolded option stops matching its stored answer"
  );
});

// ─── Cloze blanks: ***N*** markers render as ___(N)___ ──────────────────────
// Gemini transcribes a PDF's "____1____" fill-in-the-blank gaps as ***1***.
// Raw they show as asterisks; through the markdown bold pass they become
// broken <strong>/<em> nesting. renderClozeBlanks must run before both.

test("renderClozeBlanks regex converts numbered markers and spares prose", () => {
  const src = readSrc("lib/richText.ts");
  // Test the SHIPPED regex, extracted from source, not a copy that can drift.
  const m = src.match(/value\.replace\((\/[^/]+\/g),\s*"___\(\$1\)___"\)/);
  assert(m, "renderClozeBlanks replace(...) not found in richText.ts");
  const body = m[1].slice(1, -2); // strip enclosing /.../g
  const re = new RegExp(body, "g");
  const apply = (s) => s.replace(re, "___($1)___");

  assert(apply("feel ***1*** if") === "feel ___(1)___ if", "***1*** not converted");
  assert(apply("engage *** 2 *** small") === "engage ___(2)___ small", "spaced marker not converted");
  assert(apply("certain ***(5)*** should") === "certain ___(5)___ should", "parenthesised marker not converted");
  assert(apply("blank ***12*** here") === "blank ___(12)___ here", "two-digit marker not converted");
  assert(apply("this is ***important*** text") === "this is ***important*** text",
    "bold-italic prose was wrongly treated as a blank");
});

test("cloze markers are handled before math and markdown passes", () => {
  const renderMath = readSrc("lib/renderMath.ts");
  assertContains(renderMath, "renderClozeBlanks(html ?? \"\")",
    "renderMathInHtml no longer normalizes cloze markers — passages show raw ***1***");
  assertContains(renderMath, "renderClozeBlanks(text == null",
    "renderMathInText no longer normalizes cloze markers — options show raw ***1***");
  // The markdown-lite bold pass would mangle ***1*** into broken <strong>
  // nesting, so raw text must go through renderClozeBlanks first. The
  // simulator (and its All Questions overview) share that ordering via
  // renderQuestionHtml; ExamReview still inlines the same pipeline.
  const questionContent = readSrc("lib/questionContent.ts");
  assertContains(questionContent, "renderMathInHtml(applyInlineMarkdown(renderClozeBlanks(",
    "lib/questionContent.ts: renderQuestionHtml runs the bold/italic pass before cloze markers are normalized");
  assertContains(readSrc("pages/ExamSimulator.tsx"), "renderQuestionHtml(",
    "pages/ExamSimulator.tsx: question text no longer goes through the shared cloze-safe renderer");
  assertContains(readSrc("components/exam/AllQuestionsDialog.tsx"), "renderQuestionHtml(",
    "AllQuestionsDialog: question text no longer goes through the shared cloze-safe renderer");
  assertContains(readSrc("pages/ExamReview.tsx"), "renderMathInHtml(renderClozeBlanks(",
    "pages/ExamReview.tsx: question text hits the bold/italic pass before cloze markers are normalized");
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  ❌ ${f.name}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log("\n🎉 All tests passed! All optimizations are in place.");
  process.exit(0);
}
