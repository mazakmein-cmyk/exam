/**
 * MARKS ARE SCORED BY THE SERVER, SO A PLACEMENT CANNOT BE TYPED IN
 *
 * Run with: node src/__tests__/marks-scored-in-db.test.mjs
 *
 * get_my_exam_ranks does not rank by the locked score when an exam has marks:
 *   ORDER BY (CASE WHEN rank_by_marks THEN total_marks ELSE total_score END)
 * and rank_by_marks is bool_and(has_marks) OVER (PARTITION BY exam_id). So while
 * marks_score was client-writable a student could both take rank 1 by inflating
 * it AND switch marks-based ranking off for the whole exam by blanking it.
 *
 * 20260843000000 ports scoringEngine.ts into SQL, computes marks inside
 * submit_exam_attempt's transaction, and adds marks_score/marks_max to the
 * attempts lock. These assertions pin the port against the engine it came from,
 * because the two now have to agree for every historical attempt.
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

const SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260843000000_marks_scored_in_db.sql"),
  "utf-8"
);
const ENGINE = readFileSync(resolve(ROOT, "src/services/scoringEngine.ts"), "utf-8");
const EXAM_SVC = readFileSync(resolve(ROOT, "src/services/examService.ts"), "utf-8");
const RANK_SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260828010000_student_exam_ranks_jsonb.sql"),
  "utf-8"
);

console.log("\nMARKS ARE SCORED BY THE SERVER\n");

// ─── [1] Why this had to move at all ────────────────────────────────────────

test("rank really is decided by marks, which is what made the residual matter", () => {
  assert(
    /CASE WHEN r\.rank_by_marks THEN r\.total_marks ELSE r\.total_score END/.test(RANK_SQL),
    "if ranking stopped using total_marks this migration's premise would be stale"
  );
  assert(
    /bool_and\(g\.has_marks\) OVER \(PARTITION BY g\.exam_id\)/.test(RANK_SQL),
    "one blanked marks_score switching the whole exam's ranking mode is the second half of the hole"
  );
});

// ─── [2] The lock ───────────────────────────────────────────────────────────

test("marks_score and marks_max are inside the attempts lock", () => {
  const fn = SQL.slice(
    SQL.indexOf("CREATE OR REPLACE FUNCTION public.attempts_lock_columns"),
    SQL.indexOf("-- 5. The marks log is a server record too.")
  );
  for (const col of ["marks_score", "marks_max"]) {
    assert(
      new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(fn),
      `${col} is still writable — a student could pick their own placement`
    );
  }
});

test("the per-question marks log is server-written too", () => {
  assert(
    SQL.includes("QUESTION_MARKS_LOG_LOCKED"),
    "the breakdown both review screens read must not be student-writable"
  );
  assert(
    SQL.includes("BEFORE INSERT OR UPDATE ON public.question_marks_log"),
    "the log lock must cover inserts as well as updates"
  );
});

test("the role gate is intact, or the server's own writes would be blocked", () => {
  assert(
    (SQL.match(/current_user NOT IN \('authenticated', 'anon'\)/g) || []).length >= 2,
    "both the attempts lock and the marks log lock need the passthrough"
  );
});

// ─── [3] The port matches the engine ────────────────────────────────────────

test("resolveConfig stays one level whole, not a per-field merge", () => {
  // The engine is `questionConfigs.get() ?? sectionConfigs.get() ?? examConfig`.
  // A COALESCE per column would inherit an exam penalty into a section override.
  assert(
    /questionConfigs\.get\(questionId\) \?\?\s*\n?\s*sectionConfigs\.get\(sectionId\) \?\?/.test(ENGINE),
    "the engine's inheritance shape changed — re-check the SQL port"
  );
  assert(
    SQL.includes("cfg_level"),
    "the SQL must pick one level and record which, mirroring resolveConfig"
  );
  assert(
    !/COALESCE\(qsc\.marks_correct, ssd\.marks_correct/.test(SQL),
    "per-field COALESCE would silently merge levels the engine keeps separate"
  );
});

test("an unscored question awards nothing and adds nothing to the maximum", () => {
  assert(
    /WHEN p\.cfg_level IS NULL THEN 0::numeric/.test(SQL),
    "no config at any level must award 0, as the engine does"
  );
  assert(
    /FILTER \(WHERE r\.cfg_level IS NOT NULL\)/.test(SQL),
    "marks_max must count only scored questions"
  );
});

test("skipped means the same three things it means in the engine", () => {
  // !state || status === 'untouched' || !hasAnswerValue(selectedAnswer)
  assert(
    /r\.question_id IS NULL[\s\S]{0,120}status = 'untouched'[\s\S]{0,120}mock_has_answer/.test(SQL),
    "no row, untouched, or no answer value — all three must count as skipped"
  );
});

test("multi-select is gated on an array key, exactly like calculateMarks", () => {
  assert(
    /answer_type === "multi" \|\| q\.answer_type === "multiple"/.test(ENGINE),
    "the engine's multi test changed"
  );
  assert(
    /answer_type IN \('multi', 'multiple'\)[\s\S]{0,80}jsonb_typeof\(c\.correct_answer\) = 'array'/.test(SQL),
    "a multi-typed question with a scalar key must fall through to SCQ scoring"
  );
});

test("both sides of a multi-select are deduped before counting", () => {
  assert(
    /Array\.from\(new Set\(correctOptions\.map\(normalize\)\)\)/.test(ENGINE) &&
      /Array\.from\(new Set\(selectedOptions\.map\(normalize\)\)\)/.test(ENGINE),
    "the engine dedupes both sides"
  );
  assert(
    /COUNT\(DISTINCT COALESCE\(public\.mock_answer_norm/.test(SQL) &&
      /SELECT DISTINCT COALESCE\(public\.mock_answer_norm/.test(SQL),
    "a repeated option must not inflate partial credit"
  );
});

test("the per-option penalty is capped at one question's marks", () => {
  assert(
    /Math\.max\(rawPenalty, -config\.marks_correct\)/.test(ENGINE),
    "the engine caps the per_option penalty"
  );
  assert(
    /GREATEST\(-p\.marks_wrong \* n\.wrong_sel, -p\.marks_correct\)/.test(SQL),
    "GREATEST is the SQL spelling of that cap — without it a wrong multi-select can cost more than the question is worth"
  );
});

test("rounding applies to partial credit only", () => {
  assert(
    /applyRounding\(raw, config\.rounding_strategy\)/.test(ENGINE),
    "the engine rounds the partial-credit branch"
  );
  assert(
    /mock_apply_rounding\(\s*n\.correct_sel \* \(p\.marks_correct \/ n\.total_correct\)/.test(SQL),
    "the SQL must round the same branch and no other"
  );
});

test("JS half-rounding is reproduced, because totals go negative", () => {
  // Math.round(-2.5) === -2, round(-2.5) === -3. Negative marking makes this reachable.
  assert(
    /floor\(v \* 100 \+ 0\.5\) \/ 100/.test(SQL),
    "floor(x + 0.5) is Math.round; Postgres round() breaks half away from zero and would disagree"
  );
  assert(
    SQL.includes("mock_js_round2(-0.025) <> -0.02"),
    "the migration must prove the boundary at install time"
  );
});

test('"" and [] stay cleared answers, so a blank never pays the wrong penalty', () => {
  assert(
    /if \(typeof value === "string"\) return value\.trim\(\) !== "";/.test(ENGINE),
    "the engine's hasAnswerValue changed"
  );
  assert(
    SQL.includes(`mock_has_answer('""'::jsonb)`) && SQL.includes(`mock_has_answer('[]'::jsonb)`),
    "the migration must prove the blank rules at install time"
  );
});

test("the { answer } / { value } key shape is read with an explicit null test", () => {
  assert(
    /jsonb_typeof\(p\.correct_answer -> 'answer'\) <> 'null'/.test(SQL),
    "a correct answer of 0 must not read as 'no key stored' — that marks everyone wrong"
  );
});

// ─── [4] Multi-language and the transaction ─────────────────────────────────

test("config still resolves through the primary language", () => {
  assert(
    /section_group_id = v_section\.section_group_id[\s\S]{0,120}language = v_primary_lang/.test(SQL),
    "a Hindi sitting reads config authored on the primary section"
  );
  assert(
    /pq\.question_group_id = s\.question_group_id/.test(SQL),
    "per-question config pairs across languages by question_group_id"
  );
  assert(
    /LIMIT 1\s*\), s\.id\) AS config_qid/.test(SQL),
    "a missing pairing must fall back to the question's own id, as examService did"
  );
  // Nothing makes question_group_id unique within a section, so the primary-side
  // lookup has to yield at most one row or the question is scored twice.
  assert(
    /SELECT pq\.id[\s\S]{0,400}LIMIT 1/.test(SQL),
    "the config lookup must be a single-row subquery, not a fan-out join"
  );
});

test("marks are computed in the grading transaction, unguarded", () => {
  const fn = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.submit_exam_attempt"));
  assert(
    /PERFORM public\.compute_attempt_marks\(p_attempt_id\)/.test(fn),
    "the grader must score marks itself"
  );
  assert(
    !/BEGIN[\s\S]{0,200}compute_attempt_marks[\s\S]{0,200}EXCEPTION WHEN/.test(fn),
    "swallowing a marks failure would leave a graded attempt with no placement"
  );
});

test("an unscored paper leaves marks NULL rather than ranking everyone on zeros", () => {
  assert(
    /IF v_scored = 0 THEN[\s\S]{0,200}RETURN jsonb_build_object\('scored', false/.test(SQL),
    "with no config anywhere, marks_score must stay NULL so rank falls back to the correct-count"
  );
});

// ─── [5] The client defers ──────────────────────────────────────────────────

test("the browser skips its marks pass once the server owns it", () => {
  assert(
    EXAM_SVC.includes("serverScoredMarks"),
    "examService must read the marks_scored flag"
  );
  assert(
    /if \(serverScoredMarks\) return finalAttemptId;/.test(EXAM_SVC),
    "without this the browser recomputes the same numbers and then fails on a locked column"
  );
  assert(
    SQL.includes("'marks_scored', true"),
    "the grader must advertise that it scored marks"
  );
});

test("a database without this migration keeps the browser path", () => {
  // The old grader returns no marks_scored key, so the flag is false and the
  // client marks module runs exactly as it does today.
  assert(
    /serverScoredMarks = \(graded as any\)\.marks_scored === true;/.test(EXAM_SVC),
    "the flag must default to false on an older grader, or marks silently stop being written"
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
