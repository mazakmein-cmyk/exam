/**
 * LIVE EXAMS — MATCHING BY NAME TAG, NOT BY SEAT NUMBER
 *
 * Run with: node src/__tests__/live-group-id-matching.test.mjs
 *
 * Live exams identified a student's question by COUNTING: ROW_NUMBER() within
 * the student's own language, compared against live_exams.current_question_index.
 * That works only while every language holds the same questions in the same
 * order. One question missing from a translation and the room splits — half of
 * it reads a different question than the host announced — while responses are
 * filed under the wrong canonical row and the report blends two questions into
 * one set of percentages that look entirely normal.
 *
 * These assertions guard the migration that replaces that with question_group_id.
 *
 * They are body-text assertions on migration files, like the rest of this suite,
 * because that is the only automated check this project has: migrations are
 * hand-pasted into the SQL editor and plpgsql does not parse a statement until
 * control reaches it. A function body can therefore be structurally broken,
 * survive CREATE OR REPLACE, and fail for the first time in front of a room of
 * students. Two such bodies already shipped that way here.
 *
 * The heaviest assertion is [2]: the edited region of submit_live_response sits
 * directly above the 'Time is up for this question' deadline block, and the
 * original plan's edit range would have swallowed it. Losing it accepts answers
 * after the clock, passes every existing test, and is invisible until a score
 * is disputed.
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

function readSql(relPath) {
  return readFileSync(resolve(ROOT, "supabase", relPath), "utf-8");
}

const HELPER = readSql("migrations/20260817000000_live_primary_questions_helper.sql");
const MATCH = readSql("migrations/20260819000000_live_group_id_matching_submit.sql");
const BACKFILL = readSql("migrations/20260816000000_live_question_group_backfill.sql");
const AUDIT = readSql("tests/verify_live_group_ids.sql");

console.log("\n══ Live exams: name-tag matching ══");

// ─── [1] The two helpers, and what they must not leak ───────────────────────
console.log("\n[1] One definition of the ordering, one of the twin lookup");

test("live_primary_questions returns (id, ordinal) — never the question row", () => {
  assert(
    /RETURNS TABLE \(id UUID, ordinal INTEGER\)/.test(HELPER),
    "returning public.live_questions from a SECURITY DEFINER function hands correct_answer to every caller, reopening the hole 20260729020000 closed"
  );
});

test("live_canonical_for returns UUID, and falls back to self when untagged", () => {
  assert(/RETURNS UUID/.test(MATCH), "same leak, same reason");
  assert(
    /IF v_group IS NULL THEN\s*RETURN p_live_question_id;/.test(MATCH),
    "no tag means the row is its own group — the correct answer for every single-language exam, and what keeps a row the backfill left unlinked behaving as it does today"
  );
  assert(
    /COALESCE\(v_result, p_live_question_id\)/.test(MATCH),
    "a tag that resolves to nothing must fall back to self, not return NULL into the caller's gate"
  );
});

test("both helpers are revoked from PUBLIC", () => {
  assert(
    /REVOKE EXECUTE ON FUNCTION public\.live_primary_questions\(UUID\) FROM PUBLIC/.test(HELPER),
    "PostgreSQL grants EXECUTE to PUBLIC by default; every caller here is SECURITY DEFINER and needs no grant"
  );
  assert(
    /REVOKE EXECUTE ON FUNCTION public\.live_canonical_for\(UUID, UUID\) FROM PUBLIC/.test(MATCH),
    "same default, same fix"
  );
});

test("the tie-break is deterministic", () => {
  assert(
    /ORDER BY lq\.global_index, lq\.q_no, lq\.id\s*LIMIT 1/.test(MATCH),
    "nothing in the schema stops two primary rows sharing a tag; an unordered LIMIT 1 would be worse than the deterministic ROW_NUMBER it replaces"
  );
});

// ─── [2] What must survive the rewrite ──────────────────────────────────────
console.log("\n[2] submit_live_response kept everything that is silent when lost");

const INVARIANTS = [
  ["the deadline is still computed", /v_deadline := public\.live_question_deadline\(/],
  ["answers after the clock are still refused", /RAISE EXCEPTION 'Time is up for this question'/],
  ["FOR SHARE still locks the exam row", /FOR SHARE/],
  ["grading still reads the student's OWN row", /grade_live_answer\(v_question\.correct_answer, p_selected_answer\)/],
  ["the time window is still clamped", /v_window_ms := GREATEST\(/],
  ["the upsert guard is unchanged", /ON CONFLICT \(live_question_id, user_id\) DO NOTHING/],
  ["question_ordinal is still written", /v_is_correct, v_time_taken_ms, now\(\), v_ordinal/],
  ["is_correct is still masked on return", /v_result\.is_correct := NULL/],
];

for (const [label, re] of INVARIANTS) {
  test(label, () => {
    assert(re.test(MATCH), "the edited region sits next to this; losing it passes CREATE OR REPLACE and fails silently at run time");
  });
}

// ─── [3] The gate itself ────────────────────────────────────────────────────
console.log("\n[3] The gate asks the right question");

test("a tagged question is matched by tag, not by position", () => {
  assert(
    /v_canonical_id := public\.live_canonical_for\(p_live_exam_id, p_live_question_id\)/.test(MATCH),
    "this is the whole change"
  );
  assert(
    /IF v_canonical_id IS DISTINCT FROM v_open_id THEN\s*RAISE EXCEPTION 'This question is not currently open for answers'/.test(MATCH),
    "on a drifted exam the old code ACCEPTED the submission and mis-filed it; refusing is visible and recoverable, silent mis-attribution is neither"
  );
});

test("the open question is still located by position", () => {
  assert(
    /FROM public\.live_primary_questions\(p_live_exam_id\)\s*WHERE ordinal = v_exam\.current_question_index/.test(MATCH),
    "current_question_index IS a position and indexes the primary language — the one list guaranteed to exist. De-positionalising it would re-key two primary keys and every frozen report."
  );
});

test("the untagged path is preserved verbatim, not dropped", () => {
  assert(
    /ELSE[\s\S]*ROW_NUMBER\(\) OVER \(ORDER BY lq\.global_index, lq\.q_no, lq\.id\) - 1 AS ordinal[\s\S]*v_canonical_id := COALESCE\(v_open_id, p_live_question_id\)/.test(MATCH),
    "every single-language exam takes this branch — no tag is written for them and none is needed. Removing it would break the common case entirely."
  );
  assert(
    /IF v_question\.question_group_id IS NOT NULL AND v_open_id IS NOT NULL THEN/.test(MATCH),
    "the tagged path must also require an open canonical row; without that guard an exam whose primary language is short would refuse everyone"
  );
});

// ─── [4] The migration proves its own claims ────────────────────────────────
console.log("\n[4] Each migration verifies itself against real data");

test("the helper migration proves it is equivalent to what it replaced", () => {
  assert(
    /EXCEPT[\s\S]*RAISE EXCEPTION[\s\S]*NOT equivalent/.test(HELPER),
    "'zero behaviour change' is the entire claim of that migration, and unlike the rewritten bodies it can be proven by set-comparing against the inline expression"
  );
});

test("the matching migration names every exam whose behaviour changes", () => {
  assert(
    /RAISE NOTICE[\s\S]*resolve differently/.test(MATCH),
    "a drifted exam's non-primary students get refused until the client selects by tag — the operator needs the list, not a warning in a comment"
  );
  assert(
    /to_regprocedure\('public\.live_primary_questions\(uuid\)'\) IS NULL/.test(MATCH),
    "applied out of order this would fail deep inside a function body at run time instead of at apply time"
  );
});

test("the backfill refuses to link across section families", () => {
  assert(
    /p\.section_group_id IS NOT DISTINCT FROM o\.section_group_id/.test(BACKFILL),
    "the ordinal is exam-wide, so differing per-section splits put unrelated questions at the same ordinal — and reorder then collides two rows onto one q_no"
  );
  assert(
    /question_group_id IS NULL/.test(BACKFILL),
    "the backfill must only ever fill blanks, so it is idempotent and cannot re-link what a creator linked"
  );
});

test("the audit's go/no-go covers both ways a tag can be wrong", () => {
  assert(
    /D\. name tag disagrees with position[\s\S]*BLOCKER/.test(AUDIT),
    "a tag pointing at the wrong ordinal silently reinterprets existing responses"
  );
  assert(
    /E\. orphan translation', 'BLOCKER'/.test(AUDIT),
    "a tag pointing at nothing does the same damage, and D structurally cannot see it — its join to primary_tags finds no row to compare"
  );
});

// ─── [5] The client half — which question the student actually reads ────────
console.log("\n[5] The student's screen resolves by tag, not by counting");

const SYNC = readSql("migrations/20260820000000_live_session_sync_group_id.sql");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useLiveSession.ts"), "utf-8");
const STUDENT = readFileSync(resolve(ROOT, "src/pages/LiveExamStudent.tsx"), "utf-8");

test("the server publishes the open question's tag", () => {
  assert(
    /'current_question_group_id',\s+v_open_group_id/.test(SYNC),
    "the app knows the host is on position 5 but not WHICH question that is — only the server holds the primary-language list that current_question_index indexes"
  );
});

test("every pre-existing sync payload key is asserted, not assumed", () => {
  assert(
    /live_session_sync payload lost key\(s\)/.test(SYNC),
    "six definitions of this function exist and only the last applied is real; rebuilding from the wrong body silently reverts the present_* flags with no error anywhere"
  );
});

test("a tag is never carried across an index change", () => {
  assert(
    /next\.currentQuestionGroupId !== undefined[\s\S]{0,220}next\.currentQuestionIndex === cur\.currentQuestionIndex[\s\S]{0,140}: null/.test(HOOK),
    "the push lane reads the exam row, which has no tag because the tag is derived from the question list. Merging it like the projector settings (`?? cur`) would keep the PREVIOUS question's tag across an unlock and point every client at the question the room just left."
  );
});

test("the sync lane sends null rather than undefined", () => {
  assert(
    /currentQuestionGroupId: sync\.current_question_group_id \?\? null/.test(HOOK),
    "this lane always knows the answer, so a missing key means the DB predates the migration — that is null ('match by position'), not undefined ('unknown'), which would make the merge keep a stale tag"
  );
});

test("the student picks the question whose tag matches, and falls back to counting", () => {
  assert(
    /questions\.findIndex\(\(q\) => q\.question_group_id === gid\)/.test(STUDENT),
    "this is the line that stops the room splitting"
  );
  assert(
    /if \(!gid\) return sessionIndex;/.test(STUDENT),
    "no tag means count, exactly as before — every single-language exam takes this path"
  );
  assert(
    /const currentQuestion = isLive && myQuestionIndex >= 0 \? questions\[myQuestionIndex\] : null/.test(STUDENT),
    "reading questions[sessionIndex] is the original bug: sessionIndex is a position in the PRIMARY list, not in mine"
  );
});

test("a missing counterpart is shown, not silently swallowed", () => {
  assert(
    /openMissingInMyLanguage\s*=\s*sessionIndex >= 0 && !!session\.currentQuestionGroupId && myQuestionIndex < 0/.test(STUDENT),
    "resolving to -1 rather than falling back to sessionIndex — showing whatever sits at that position would be the original bug wearing a new hat"
  );
  assert(
    /This question isn't available in your language/.test(STUDENT),
    "previously a blank card and a submit button that did nothing at all"
  );
});

test("the host's cursor still keys the maps that are keyed on it", () => {
  assert(
    /const currentQuestionIndex = sessionIndex;/.test(STUDENT),
    "the timer key, analytics map, responses map and chip strip are all keyed on the CANONICAL position the server returns; re-pointing this at my own list would break four things to fix one"
  );
});

// ─── [6] The gate ───────────────────────────────────────────────────────────
console.log("\n[6] A broken exam cannot start a session");

const GATE = readSql("migrations/20260821000000_live_exam_readiness_gate.sql");
const SERVICE = readFileSync(resolve(ROOT, "src/services/liveExamService.ts"), "utf-8");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/LiveExamDetail.tsx"), "utf-8");

test("enforcement sits in start_live_session, before it changes anything", () => {
  assert(
    /CREATE OR REPLACE FUNCTION public\.start_live_session/.test(GATE),
    "publish is a plain UPDATE permitted by the creator's own RLS policy, and questions can be added after publishing — a client-side check is advisory. start_live_session is the one door every session passes through."
  );
  assert(
    /v_blockers > 0[\s\S]{0,900}RAISE EXCEPTION 'LIVE_NOT_READY[\s\S]{0,400}UPDATE public\.live_exams\s*\n\s*SET status = 'live'/.test(GATE),
    "the check must precede the UPDATE, so a refused start leaves the exam exactly as it was rather than half-transitioned"
  );
});

test("start_live_session keeps the unlock-log wipe", () => {
  assert(
    /DELETE FROM public\.live_unlock_log WHERE live_exam_id = p_live_exam_id/.test(GATE),
    "A10 restores from this log; a stale row would resurrect a timestamp from a previous run"
  );
});

test("the gate and the creator's checklist are the same rule", () => {
  assert(
    /public\.live_exam_readiness\(p_live_exam_id\)/.test(GATE),
    "one definition, two callers"
  );
  assert(
    /rpc\("live_exam_readiness"/.test(SERVICE) && /fetchLiveExamReadiness/.test(DETAIL),
    "a checklist that disagrees with the gate is worse than none — the creator fixes what it lists and is still refused"
  );
});

test("the count mismatch is a blocker", () => {
  assert(
    /'blocker', 'question_count_mismatch'/.test(GATE),
    "this is the check position-matching structurally cannot make, and the one that splits the room"
  );
});

test("an EMPTY SECTION blocks, and it is checked per section", () => {
  // Found by manual testing: an exam with one full section and one empty one
  // published and went live. The first version asked only whether the exam had
  // any questions AT ALL, which an exam-wide EXISTS happily satisfies. An empty
  // section is a dead entry in the student's tab strip — nothing to play,
  // nothing to grade.
  assert(
    /JOIN public\.live_sections s ON s\.live_exam_id = x\.id\s*\nWHERE NOT EXISTS \(\s*\n\s*SELECT 1 FROM public\.live_questions lq WHERE lq\.live_section_id = s\.id/.test(GATE),
    "must walk live_sections directly: an empty section contributes no rows to the question CTE, so it is invisible to anything built on it"
  );
  assert(
    /'Section \"' \|\| s\.name \|\| '\" has no questions\.'/.test(GATE),
    "name the section — 'this exam has a problem' sends the creator hunting"
  );
  assert(
    !/AND NOT EXISTS \(SELECT 1 FROM q WHERE q\.language = x\.primary_language\)/.test(GATE),
    "the exam-wide question check is what let the empty section through; it must not come back"
  );
});

test("the mock gate checks empty sections per section too", () => {
  const MOCK = readFileSync(resolve(ROOT, "src/components/PublishExamDialog.tsx"), "utf-8");
  assert(
    /for \(const sec of langSections\)[\s\S]{0,600}count === 0[\s\S]{0,120}type: "no_questions"/.test(MOCK),
    "the two modules must agree on this: an empty section is unpublishable in both, or a creator learns one rule and is surprised by the other"
  );
});

test("a missing answer key blocks a live session", () => {
  assert(
    /'blocker', 'missing_answer'/.test(GATE),
    "grade_live_answer returns false for a NULL key, so a keyless question marks EVERY student wrong at once, on the projector, with no way to take it back"
  );
});

test("the language list comes from the exam, not from observed questions", () => {
  assert(
    /UNION SELECT u FROM unnest\(x\.supported_languages\) AS u/.test(GATE),
    "driving it off question rows makes a language with ZERO questions vanish — the default shape of a half-authored bilingual exam, so the check that matters most would silently pass"
  );
});

test("option_image_urls is treated as jsonb, not as a Postgres array", () => {
  // This shipped broken and failed on paste: `option_image_urls[o.idx]`.
  // option_image_urls is jsonb (20260731100000), and subscripting it was wrong
  // three ways at once — WITH ORDINALITY yields bigint where a jsonb subscript
  // must be integer, jsonb arrays are 0-based while ORDINALITY is 1-based, and a
  // JSON `null` element (exactly what an option with no picture stores) is not
  // SQL NULL, so `IS NOT NULL` counted every empty slot as an image.
  assert(
    !/option_image_urls\[/.test(GATE),
    "subscripting this column is the bug; join the two arrays by ordinality instead"
  );
  assert(
    /jsonb_array_elements_text\(\s*CASE WHEN jsonb_typeof\(lq\.option_image_urls\)/.test(GATE),
    "jsonb_array_elements_text turns a JSON null into a real SQL NULL, which is what makes the emptiness test correct"
  );
});

test("a figure-only question is not called blank", () => {
  assert(
    /AND q\.image_url IS NULL\s*\n\s*AND COALESCE\(array_length\(q\.image_urls, 1\), 0\) = 0/.test(GATE),
    "a diagram question with an empty text field is a legitimate paper; blocking it would refuse a whole class of exam the editor deliberately supports"
  );
});

test("option-count mismatch warns rather than blocks", () => {
  assert(
    /'warning', 'option_count_mismatch'/.test(GATE),
    "it makes the creator's tally meaningless, but the session still runs and every student is still graded against the paper in front of them"
  );
});

test("unpublishing is never gated", () => {
  assert(
    /const goingLive = exam\.status === "draft";/.test(DETAIL) && /if \(goingLive\) \{/.test(DETAIL),
    "unpublish is the way OUT of a broken state; gating it would trap a creator whose exam fails the check"
  );
});

test("a database without the gate does not block publishing", () => {
  // Two layers word "that function isn't here" completely differently, and only
  // one of them is the one you actually hit. PostgREST refuses the request
  // before it reaches Postgres, returning PGRST202 / "Could not find the
  // function ... in the schema cache" — NOT 42883, and NOT "does not exist".
  // The first version matched only the Postgres wording, so a client deployed
  // ahead of the migration would have thrown and handlePublish would have
  // refused to publish ANY live exam. A missing check must never be worse than
  // no check at all.
  assert(/42883/.test(SERVICE), "the Postgres wording");
  assert(/PGRST202/.test(SERVICE), "the PostgREST wording — this is the one that actually occurs");
  assert(
    /could not find the function/i.test(SERVICE) && /schema cache/i.test(SERVICE),
    "match on message too, since error codes have been dropped by proxies before"
  );
});

test("the gate migration nudges PostgREST's schema cache", () => {
  assert(
    /NOTIFY pgrst, 'reload schema'/.test(GATE),
    "a brand-new function PostgREST has not seen is a 404, so the readiness panel would keep saying 'could not check the exam' after a migration that plainly applied. This is the only migration in the batch adding a CLIENT-callable function — the helpers are revoked from PUBLIC and called server-side."
  );
});

// ─── [7] Reveal timing and timer bounds ─────────────────────────────────────
console.log("\n[7] An answer is published only once its question has finished playing");

const REVEAL = readSql("migrations/20260822000000_live_reveal_and_bounds_by_group.sql");

test("revealability is decided by play order, not by own-language position", () => {
  assert(
    /COALESCE\(pt\.ordinal, o\.ordinal\) AS ordinal/.test(REVEAL),
    "a drifted row's own ordinal can sit BELOW the cursor while it is the translation of the question currently on screen — the server then publishes its answer to that language mid-question"
  );
  assert(
    (REVEAL.match(/COALESCE\(pt\.ordinal, o\.ordinal\)/g) || []).length >= 3,
    "all three functions must use the same play-ordinal definition, or reveal and the timer bounds disagree about where a question plays"
  );
});

test("the deadline still comes from the row the student is reading", () => {
  assert(
    /public\.live_question_deadline\(\s*v_exam\.current_question_unlocked_at,\s*t\.time_seconds/.test(REVEAL),
    "the deadline is a property of the paper in front of the student, not of its twin — and live-v2-answer-reveal.test.mjs asserts this call exists"
  );
});

test("an untagged row keeps its own position, so the bound cannot rise", () => {
  assert(
    /LEFT JOIN prim_tag pt ON pt\.question_group_id = o\.question_group_id/.test(REVEAL),
    "a naive MIN over the name-tag group would DROP unlinked siblings, raising the bound and letting a host extend past a language's real end — the opposite of what this function is for"
  );
});

test("verify_phase2 checks 15/16 still pass by construction", () => {
  const min = REVEAL.slice(REVEAL.indexOf("live_ordinal_min_seconds"));
  assert(
    /MIN\(t\.time_seconds\)/.test(min) && /PARTITION BY ls\.language/.test(min),
    "those are body-text assertions: a correct rewrite that changed the spelling reports as a regression, and a red check treated as 'expected' is how a real failure gets waved through"
  );
});

test("both bound functions keep their signatures", () => {
  assert(
    /live_ordinal_min_seconds\(\s*p_live_exam_id UUID,\s*p_ordinal INTEGER\s*\)/.test(REVEAL) &&
      /live_ordinal_max_seconds\(\s*p_live_exam_id UUID,\s*p_ordinal INTEGER\s*\)/.test(REVEAL),
    "add_live_question_time and end_live_question_time call these; changing the shape would need both rewritten too"
  );
});

test("the migration executes what it installs", () => {
  assert(
    /PERFORM public\.get_revealed_live_answers\(v_exam\.id\)/.test(REVEAL),
    "plpgsql does not parse a statement until control reaches it — two broken bodies in this project survived eight migrations because nothing ever ran them"
  );
});

// ─── [8] The consolidated paste file cannot revert anything ─────────────────
console.log("\n[8] APPLY_REMAINING.sql is retired, not merely out of date");

const APPLY = readSql("APPLY_REMAINING.sql");

test("it contains no SQL that could be executed", () => {
  assert(
    !/CREATE OR REPLACE FUNCTION/.test(APPLY),
    "its content stopped at 20260812000000, so pasting it after 20260815000000 re-ran the OLD bodies of build_live_exam_report and compute_live_moments and reverted that fix — with no error, because the functions still exist and still return JSON"
  );
  assert(
    !/^\s*(UPDATE|INSERT|ALTER|DROP|GRANT|CREATE)\s/im.test(APPLY),
    "any executable statement left behind makes it pasteable again, and a consolidated file that falls one migration behind is a device for reverting work"
  );
});

test("it says what to do instead", () => {
  assert(
    /RETIRED/.test(APPLY) && /supabase\/migrations\//.test(APPLY),
    "a file that only says 'do not use me' sends the reader looking for the answer somewhere else"
  );
  assert(
    /20260822000000/.test(APPLY),
    "the ordered list has to include the newest migration or it recreates the exact staleness that retired it"
  );
});

test("it records which migrations rewrite live_session_sync", () => {
  assert(
    /20260820000000\s+the open question's name tag\s+\[LATEST/.test(APPLY),
    "CREATE OR REPLACE does not merge: whichever of the six runs last is the one the database keeps, and the rest are discarded without a word"
  );
});

test("the installed-state verification exists alongside the file-level one", () => {
  const V = readSql("tests/verify_live_group_matching.sql");
  assert(
    /live_exam_readiness/.test(V) && /live_canonical_for/.test(V),
    "migrations are pasted by hand, so 'the file is in the repo' and 'the database does that' are different claims — only the second matters to a student sitting an exam"
  );
  assert(
    /has_function_privilege\('public'/.test(V),
    "the REVOKE is the only thing keeping the helpers off the API surface, so it is worth asserting against the installed grants rather than the file"
  );
});

test("'the gate blocks nothing' is reported, not asserted", () => {
  const V = readSql("tests/verify_live_group_matching.sql");
  assert(
    /informational, never fails/.test(V),
    "this was an assertion and it failed on install with 8 exams — every one blocked for a real reason (no answer key, one usable option). Failing on that reports the gate working as a defect, and the fix would have been to weaken the gate."
  );
  assert(
    /no cross-language blocker on a single-language exam/.test(V),
    "the invariant that IS worth asserting: a blocker requiring two languages, raised on an exam with one, is a false positive — and those are what actually strand a creator"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  process.exit(1);
}
console.log("");
