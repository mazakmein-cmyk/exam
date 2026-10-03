/**
 * THE SECTIONS LIST SAYS HOW MANY QUESTIONS EACH SECTION HOLDS
 *
 * Run with: node src/__tests__/section-question-counts.test.mjs
 *
 * The editor's `questions` state is only ever the OPEN section, so a per-row
 * count cannot be read off it — every other row needs a number from the DB.
 * The rules this pins:
 *
 *   1. One query for the whole exam, paged. N sections must not mean N round
 *      trips on a free-tier project, and PostgREST's 1000-row cap must not
 *      silently undercount a big paper.
 *   2. The open row reads off `questions`, so adding or deleting a question
 *      moves its number with no refetch.
 *   3. A count we do not have yet renders NOTHING — never a 0 we are guessing
 *      at, and never the previous section's number on a row we just opened.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \u274c ${name}`);
    console.log(`     \u2192 ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const SRC = readFileSync(resolve(ROOT, "src/pages/ExamDetail.tsx"), "utf-8");

const COUNTER = SRC.slice(
  SRC.indexOf("const refreshQuestionCounts"),
  SRC.indexOf("const refreshSectionsFromDb")
);

console.log("\nTHE SECTIONS LIST SAYS HOW MANY QUESTIONS EACH SECTION HOLDS\n");

test("one query for every section, not one per section", () => {
  assert(COUNTER.includes('.in("section_id", ids)'), "all section ids in a single filter");
  assert(!COUNTER.includes("for (const id of ids) {"), "no per-section query loop");
  assert(COUNTER.includes('.select("section_id")'), "only the column being counted travels");
});

test("the count is paged, so a big paper is not silently truncated", () => {
  assert(COUNTER.includes("const PAGE = 1000"), "PostgREST's default cap");
  assert(COUNTER.includes(".range(from, from + PAGE - 1)"), "paged range");
  assert(COUNTER.includes("rows.length < PAGE"), "stops on a short page");
  assert(COUNTER.includes('.order("id")'), "a stable order, or paging repeats rows");
});

test("a failed count leaves the last known numbers standing", () => {
  assert(COUNTER.includes("catch (err)"), "the fetch is guarded");
  const catchBlock = COUNTER.slice(COUNTER.indexOf("catch (err)"));
  assert(
    !catchBlock.includes("setQuestionCountsBySection"),
    "a flaky fetch must not wipe the numbers already on screen"
  );
});

test("the recount fires when the section list changes, and on import", () => {
  assert(SRC.includes("const allSectionIdsKey"), "keyed on the set of section ids");
  assert(
    SRC.includes('refreshQuestionCounts(allSectionIdsKey ? allSectionIdsKey.split(",") : [])'),
    "the effect recounts on add / delete / new language"
  );
  // An import adds questions to sections that already exist: the id list does
  // not change, so the effect alone would never fire.
  const refresh = SRC.slice(
    SRC.indexOf("const refreshSectionsFromDb"),
    SRC.indexOf("const handleSaveExam")
  );
  assert(
    refresh.includes("refreshQuestionCounts(allSecs.map((s) => s.id))"),
    "refreshSectionsFromDb recounts explicitly"
  );
});

test("the open section's number comes from state, not a round trip", () => {
  assert(
    SRC.includes("questionsSectionIdRef.current === sectionId"),
    "the open row is answered from `questions`"
  );
  assert(SRC.includes("? questions.length"), "which is the live count");
});

test("switching sections cannot credit the new row with the old count", () => {
  // setSection runs before fetchQuestions resolves, so the ref — not `section`
  // — is what says which section `questions` belongs to.
  assert(
    SRC.includes("questionsSectionIdRef.current = sectionId;"),
    "the ref is stamped when the fetch lands"
  );
  assert(
    SRC.includes("questionsSectionIdRef.current = null;"),
    "and cleared when there is no section to show"
  );
});

test("an uncounted section shows no chip at all", () => {
  assert(SRC.includes("qCount !== undefined &&"), "undefined renders nothing");
  assert(SRC.includes('"No questions"'), "a counted zero says so in words");
  assert(SRC.includes('{qCount === 1 ? "question" : "questions"}'), "singular reads right");
});

test("the chip sits beside the clock, outside the timing ternary", () => {
  // A grouped member has no clock of its own — the group header owns it — so a
  // count nested in the timing branches would vanish exactly where the row has
  // nothing else to show.
  const row = SRC.slice(SRC.indexOf("const renderSectionRow"), SRC.indexOf("if (!run.group) {"));
  const ternary = row.slice(
    row.indexOf("{allowSectionSwitching ? ("),
    row.indexOf("qCount !== undefined")
  );
  assert(!ternary.includes("ListChecks"), "the count is not inside the timing ternary");
  assert(row.includes("const qCount = sectionQuestionCount(s.id);"), "one lookup per row");
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
