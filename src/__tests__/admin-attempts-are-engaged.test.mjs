/**
 * THE ADMIN CONSOLE COUNTS THE SAME ATTEMPTS THE DASHBOARD DOES
 *
 * Run with: node src/__tests__/admin-attempts-are-engaged.test.mjs
 *
 * 20260845000000 settled the rule for the creator dashboard — answered at least
 * one question = an attempt, touched nothing = not an attempt. The admin console
 * never got it. `exams_attempted` in admin_get_all_users and the "N Attempted"
 * popup from admin_get_user_attempts both counted raw attempt rows, so the two
 * screens disagreed about the same student in the same database. A group link
 * where 25 of 30 recipients bounced off the start screen gave 25 people a
 * permanent "1 Attempted".
 *
 * Three things are worth pinning, and they are not the same thing:
 *
 *   ONE SOURCE   the count and the rows under it must select from one function.
 *                They were hand-mirrored before, which is how they drifted.
 *   WHOLE SITTING a four-section paper writes four attempt rows per sitting and
 *                only the first identifies it. Testing engagement on that row
 *                alone would drop a student who skipped a hard section 1 and
 *                answered thirty questions in section 2.
 *   NOT A COPY   the creator-exclusion from 20260845000000 must NOT come along.
 *                That function measures the cohort that sat one exam; this one
 *                answers what a USER has done, and a creator who sat their own
 *                paper did sit it.
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
  resolve(ROOT, "supabase/migrations/20260851000000_admin_attempts_are_engaged.sql"),
  "utf-8"
);
const ADMIN = readFileSync(resolve(ROOT, "src/pages/AdminDashboard.tsx"), "utf-8");

/** The body of one CREATE OR REPLACE, so an assertion cannot pass by matching a neighbour. */
function fnBody(name) {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert(start >= 0, `${name} is not defined in this migration`);
  const next = SQL.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return SQL.slice(start, next === -1 ? SQL.length : next);
}

/**
 * Executable SQL only. This file's header explains at length what it does NOT
 * do, so an "is absent" assertion read against the raw text matches the prose
 * describing the absence and fails on a correct migration.
 */
function statements(text) {
  return text.replace(/^[ \t]*--.*$/gm, "");
}

console.log("\nTHE ADMIN CONSOLE COUNTS THE SAME ATTEMPTS THE DASHBOARD DOES\n");

// ─── [1] The definition of "answered" ───────────────────────────────────────

test("engagement is decided by mock_has_answer, not by row existence", () => {
  // The in-exam writer saves a response row as soon as a question is VIEWED,
  // carrying status and time with a null answer. Counting rows counts reading.
  assert(
    /public\.mock_has_answer\(r\.selected_answer\)/.test(SQL),
    "the shared definition of answered must be the test"
  );
  assert(
    !/count\(\*\)::int\s+from public\.attempts/.test(statements(SQL)),
    "the raw first-section row count is what was wrong"
  );
});

test("it refuses to apply before the function it depends on exists", () => {
  // Migrations are pasted by hand, in filename order, with no runner.
  assert(
    /apply 20260843000000_marks_scored_in_db\.sql first/.test(SQL),
    "a missing mock_has_answer must name the file to paste, not fail obscurely"
  );
});

// ─── [2] One source, so the number and the rows cannot disagree ─────────────

test("the popup and the count both read the shared function", () => {
  assert(
    /RETURN QUERY SELECT \* FROM public\.admin_engaged_sittings\(target_user_id\)/.test(
      fnBody("admin_get_user_attempts")
    ),
    "the popup must be a pass-through, not a second copy of the filter"
  );
  assert(
    /count\(\*\)::int from public\.admin_engaged_sittings\(u\.id\)/.test(
      fnBody("admin_get_all_users")
    ),
    "exams_attempted must count the same function the popup lists"
  );
});

test("the popup still returns the columns the dialog reads", () => {
  const helper = fnBody("admin_engaged_sittings");
  for (const column of ["attempt_id", "exam_id", "exam_name", "attempt_language", "attempted_at"]) {
    assert(helper.includes(column), `${column} is read by the dialog and must survive`);
  }
});

test("the rest of the users table is copied forward untouched", () => {
  // It is a document builder whose other numbers this migration is not about.
  const users = fnBody("admin_get_all_users");
  for (const column of [
    "coalesce(nullif(p.phone_number, ''), u.phone::text)",
    "(u.raw_user_meta_data->>'user_type')::text",
    "coalesce(p.is_verified, false)",
    "count(*)::int from public.exams e where e.user_id = u.id",
    "coalesce(p.can_set_paper_type, false)",
  ]) {
    assert(users.includes(column), `a transcription slip dropped: ${column}`);
  }
  assert(/ORDER BY u\.created_at DESC/.test(users), "the row order must not change");
});

// ─── [3] A sitting is more than its first section ──────────────────────────

test("engagement is tested across the whole sitting, not just its first section", () => {
  const helper = fnBody("admin_engaged_sittings");
  assert(
    /lead\(a\.created_at\) OVER \(/.test(helper),
    "the next sitting's start is what bounds this one; there is no sitting id to group on"
  );
  assert(
    /sib\.created_at >= si\.created_at/.test(helper),
    "sibling section attempts of this sitting must be in scope"
  );
  assert(
    /si\.next_started IS NULL OR sib\.created_at < si\.next_started/.test(helper),
    "the most recent sitting has no upper bound and must not be excluded by one"
  );
  assert(
    /coalesce\(ss\.language, 'en'\) = si\.lang/.test(helper),
    "a sitting is per language variant, so the sibling scan must match on it"
  );
});

test("one sitting is still one row", () => {
  assert(
    /DISTINCT ON \(s\.exam_id, coalesce\(s\.language, 'en'\)\)/.test(SQL),
    "the first-section-of-each-variant rule is what keeps a 4-section paper from counting 4 times"
  );
  assert(
    /ORDER BY s\.exam_id, coalesce\(s\.language, 'en'\), s\.sort_order ASC, s\.created_at ASC/.test(SQL),
    "DISTINCT ON needs its ordering, and this one must match what the old queries used"
  );
});

// ─── [4] What deliberately did not carry over ──────────────────────────────

test("the creator-exclusion from the dashboard is NOT copied here", () => {
  // get_exam_engaged_attempts excludes the author because it measures the cohort
  // that sat one exam. This answers what a USER has done. Copying the exclusion
  // would blank the activity of every creator who tested their own work.
  assert(
    !/a\.user_id <> e\.user_id/.test(statements(SQL)),
    "excluding a creator's own sittings would be the wrong answer to this question"
  );
});

test("submission is still not the test", () => {
  // Someone who answered forty questions and lost their connection sat the paper.
  assert(
    !/submitted_at/.test(statements(SQL)),
    "gating on submission would discard real work"
  );
});

// ─── [5] The helper carries no gate, so it must not be reachable ───────────

test("the shared helper is locked to the roles that matter", () => {
  // 20260850000000: a bare REVOKE ... FROM PUBLIC removes a key nobody holds.
  // Supabase grants EXECUTE to anon and authenticated directly.
  // One statement naming all three, which is also what revokes-name-the-roles
  // enforces on every migration after the fix.
  assert(
    SQL.includes(
      "REVOKE EXECUTE ON FUNCTION public.admin_engaged_sittings(uuid) FROM PUBLIC, anon, authenticated;"
    ),
    "anon and authenticated must be named — the helper takes any user id and has no admin gate of its own"
  );
  assert(
    !/GRANT EXECUTE ON FUNCTION public\.admin_engaged_sittings/.test(SQL),
    "nothing in a browser calls this; both callers run as the owner"
  );
});

test("both admin functions keep their own gate", () => {
  for (const name of ["admin_get_user_attempts", "admin_get_all_users"]) {
    assert(
      /auth\.jwt\(\) ->> 'email' NOT IN \('abarnwal3008@mocksetu\.in', 'admin@mocksetu\.in'\)/.test(
        fnBody(name)
      ),
      `${name} must still refuse a non-admin caller`
    );
  }
});

// ─── [6] It checks its own work, and the console says what it counts ───────

test("the migration raises if the change did not land", () => {
  assert(/DO \$\$/.test(SQL), "the repo's migrations end in a self-check");
  for (const guard of [
    "mock_has_answer",
    "next_started",
    "admin_engaged_sittings",
    "Admin privileges required",
  ]) {
    assert(
      SQL.includes(`position('${guard}' IN`),
      `the self-check must verify ${guard} survived`
    );
  }
  assert(
    /has_function_privilege\('authenticated', 'public\.admin_engaged_sittings\(uuid\)', 'EXECUTE'\)/.test(SQL),
    "the self-check must prove a signed-in browser cannot read anyone's activity"
  );
});

test("PostgREST is told to reload, since it caches function signatures", () => {
  assert(/NOTIFY pgrst, 'reload schema'/.test(SQL), "without this the console can keep calling the old definitions");
});

test("the console says what the number counts", () => {
  // It is now smaller than the raw row count, and the difference is the point.
  assert(
    /at least one question was answered/.test(ADMIN),
    "a number a person reads directly should say what it counts"
  );
  assert(
    !/'No attempts found for this user\.'/.test(ADMIN),
    "the empty state must not imply the user never opened anything"
  );
});

test("a missing migration still names the file to paste", () => {
  // The popup RPC and this rule arrive together; pre-migration the old
  // definitions answer, so the only failure mode left is the original one.
  assert(
    /Apply 20260826000000_admin_user_attempts\.sql first/.test(ADMIN),
    "the hand-pasted-migration guidance must survive"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}\n    ${f.error}`);
  console.log("-".repeat(60));
  process.exit(1);
}
console.log("-".repeat(60) + "\n");
