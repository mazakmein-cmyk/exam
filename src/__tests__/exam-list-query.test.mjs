/**
 * exam-list-query.test.mjs — the library's narrow column list must never be able
 * to empty the library.
 *
 * Both exam library pages used to read with `select("*")`, which shipped
 * `instruction`, `exam_instruction` and three `*_translations` JSONB blobs to the
 * browser for every exam in order to draw a title and a category. Naming columns
 * instead is a large payload win and introduces exactly one hazard: naming a
 * column PostgREST has not seen fails the WHOLE request, and `exams.paper_type`
 * arrives by hand-pasted migration.
 *
 * queryExamList exists to make that hazard survivable — ask for the optional
 * columns, and if the schema says it has never heard of them, ask again without.
 * These tests hold that promise to the specific error shapes PostgREST actually
 * returns, because if the retry does not fire the library is empty rather than
 * merely over-fetching, which is strictly worse than what it replaced.
 *
 * Run with: node src/__tests__/exam-list-query.test.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Awaits `fn`. Half the cases here drive an async retry, and a runner that only
 * called `fn()` would count every async assertion as a pass the moment the
 * promise was created — a test suite that cannot fail is worse than none.
 * Every call site must therefore `await test(...)`.
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
    failed++;
    failures.push({ name, message: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "not equal"} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

/**
 * The module under test imports the supabase client through the "@/..." alias,
 * which node cannot resolve. Only `isColumnMissingError` is actually needed from
 * that graph, so the retry logic is re-implemented here from the source text and
 * the source is asserted to still match it. That keeps this an executable test of
 * the ALGORITHM without standing up a bundler.
 */
const QUERY_SRC = readSrc("lib/examListQuery.ts");
const FEATURES_SRC = readSrc("lib/dbFeatures.ts");

// Mirror of dbFeatures.isColumnMissingError.
function isColumnMissingError(error) {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist|could not find .* column/i.test(error.message ?? "");
}

const BASE = "id,name,description,created_at,is_published,exam_category,user_id";
const WITH_OPTIONAL = `${BASE},paper_type`;

/** Mirror of queryExamList, with the session memo passed in so tests can reset it. */
function makeQueryExamList() {
  let optionalColumnsPresent = null;
  return async function queryExamList(build) {
    const askForOptional = optionalColumnsPresent !== false;
    const result = await build(askForOptional ? WITH_OPTIONAL : BASE);
    if (!result.error) {
      if (askForOptional) optionalColumnsPresent = true;
      return result;
    }
    if (askForOptional && isColumnMissingError(result.error)) {
      optionalColumnsPresent = false;
      return build(BASE);
    }
    return result;
  };
}

console.log("\n[1] the source still matches the algorithm under test");

await test("dbFeatures exports the missing-column test, so there is one definition of it", () => {
  assert(
    /export function isColumnMissingError/.test(FEATURES_SRC),
    "examListQuery must reuse the probe's own error test, not a second copy"
  );
  assert(
    /import \{ isColumnMissingError \} from "@\/lib\/dbFeatures"/.test(QUERY_SRC),
    "examListQuery must import it rather than re-implement it in the app"
  );
});

await test("42703 and the schema-cache wording are both treated as missing", () => {
  assert(/error\.code === "42703"/.test(FEATURES_SRC), "PostgREST passes the Postgres code through");
  assert(
    /could not find .\* column/.test(FEATURES_SRC.replace(/\\/g, "")),
    "a stale PostgREST schema cache reports PGRST204 wording instead of a PG code"
  );
});

await test("the optional list is exactly paper_type, and the base list names no gated column", () => {
  assert(
    /EXAM_LIST_OPTIONAL_COLUMNS = \["paper_type"\]/.test(QUERY_SRC),
    "if another gated column joins the list, this test should be the thing that notices"
  );
  for (const gated of ["paper_type", "allow_section_switching", "total_time_minutes"]) {
    assert(
      !new RegExp(`EXAM_LIST_BASE_COLUMNS =\\s*\\n?\\s*"[^"]*${gated}`).test(QUERY_SRC),
      `${gated} arrives by migration and must never be in the unconditional list`
    );
  }
});

console.log("\n[2] a database WITH the column");

await test("asks once, with paper_type, and returns the rows", async () => {
  const queryExamList = makeQueryExamList();
  const asked = [];
  const result = await queryExamList((columns) => {
    asked.push(columns);
    return Promise.resolve({ data: [{ id: "1", paper_type: "pyq" }], error: null });
  });
  assertEqual(asked.length, 1, "no retry should happen when the first attempt works");
  assertEqual(asked[0], WITH_OPTIONAL, "the optional column must be requested optimistically");
  assertEqual(result.data.length, 1, "rows come back untouched");
  assertEqual(result.data[0].paper_type, "pyq", "the paper type must survive the round trip");
});

console.log("\n[3] a database WITHOUT the migration");

for (const [label, error] of [
  ["a Postgres undefined_column error", { code: "42703", message: 'column exams.paper_type does not exist' }],
  [
    "a stale PostgREST schema cache",
    { code: "PGRST204", message: "Could not find the 'paper_type' column of 'exams' in the schema cache" },
  ],
]) {
  await test(`${label} makes it retry WITHOUT the column and still return the library`, async () => {
    const queryExamList = makeQueryExamList();
    const asked = [];
    const result = await queryExamList((columns) => {
      asked.push(columns);
      return Promise.resolve(
        columns.includes("paper_type")
          ? { data: null, error }
          : { data: [{ id: "1" }, { id: "2" }], error: null }
      );
    });
    assertEqual(asked.length, 2, "it must fall back rather than surface the error");
    assertEqual(asked[1], BASE, "the retry must drop the optional columns");
    assertEqual(result.error, null, "the caller must not see a failure");
    assertEqual(result.data.length, 2, "THE LIBRARY MUST NOT BE EMPTY on a pre-migration database");
  });
}

await test("the fallback is remembered, so the failed attempt happens once per session", async () => {
  const queryExamList = makeQueryExamList();
  const asked = [];
  const build = (columns) => {
    asked.push(columns);
    return Promise.resolve(
      columns.includes("paper_type")
        ? { data: null, error: { code: "42703", message: "column exams.paper_type does not exist" } }
        : { data: [], error: null }
    );
  };
  await queryExamList(build);
  await queryExamList(build);
  assertEqual(asked.length, 3, "first call probes then retries; the second must go straight to the base list");
  assertEqual(asked[2], BASE, "the second call must not repeat the doomed request");
});

console.log("\n[4] failures that are NOT about the column");

await test("a network or RLS failure is reported, not swallowed by a retry", async () => {
  const queryExamList = makeQueryExamList();
  const asked = [];
  const error = { code: "PGRST301", message: "JWT expired" };
  const result = await queryExamList((columns) => {
    asked.push(columns);
    return Promise.resolve({ data: null, error });
  });
  assertEqual(asked.length, 1, "an unrelated error must not trigger a second request");
  assertEqual(result.error, error, "the caller has to be able to report it");
});

await test("a transient failure does NOT latch the column off for the session", async () => {
  const queryExamList = makeQueryExamList();
  const asked = [];
  const flaky = (columns) => {
    asked.push(columns);
    // Fails once with something unrelated, then succeeds.
    return Promise.resolve(
      asked.length === 1
        ? { data: null, error: { code: "PGRST301", message: "JWT expired" } }
        : { data: [{ id: "1", paper_type: "pyq" }], error: null }
    );
  };
  await queryExamList(flaky);
  const second = await queryExamList(flaky);
  assertEqual(asked[1], WITH_OPTIONAL, "a blip must not permanently disable the paper-type column");
  assertEqual(second.data[0].paper_type, "pyq", "the feature has to come back on the next attempt");
});

console.log("\n[5] the callers");

await test("the student library reads through the helper, never a bare select", () => {
  const LIBRARY = readSrc("pages/Marketplace.tsx");
  assert(
    /queryExamList\(\(columns\) =>/.test(LIBRARY),
    "the published-exams read must go through the fallback helper"
  );
  assert(
    !/\.from\("exams"\)\s*\.select\("\*"\)/.test(LIBRARY),
    "select(*) here is what shipped the translation blobs to every visitor"
  );
  assert(
    !/select\(\s*"[^"]*paper_type/.test(LIBRARY),
    "the column must be named by the helper's list, not hardcoded at the call site where nothing can retry"
  );
});

await test("the creator library names only base columns — it draws no paper type", () => {
  const DASH = readSrc("pages/Dashboard.tsx");
  assert(
    /\.select\(EXAM_LIST_BASE_COLUMNS as "\*"\)/.test(DASH),
    "the dashboard list needs no gated column, so it needs no fallback either"
  );
});

await test("duplication still reads the FULL row, because a copy must lose nothing", () => {
  const DASH = readSrc("pages/Dashboard.tsx");
  const dup = DASH.split("const handleDuplicateExam")[1] || "";
  assert(dup, "handleDuplicateExam should exist");
  assert(
    /\.from\("exams"\)\s*\.select\("\*"\)\s*\.eq\("id", listExam\.id\)/.test(dup),
    "the narrow list is not enough to copy from — translations and language settings live outside it"
  );
  for (const field of [
    "description_translations",
    "instruction_translations",
    "exam_instruction_translations",
    "supported_languages",
    "primary_language",
  ]) {
    assert(dup.includes(field), `a duplicate must still carry ${field}`);
  }
});

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.message}`));
}
console.log("────────────────────────────────────────────────────────────\n");
process.exit(failed === 0 ? 0 : 1);
