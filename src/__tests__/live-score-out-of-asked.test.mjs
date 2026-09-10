/**
 * LIVE EXAMS — A SCORE IS OUT OF WHAT WAS ASKED
 *
 * Run with: node src/__tests__/live-score-out-of-asked.test.mjs
 *
 * WHAT WAS BROKEN (doc #24)
 * End a session after 3 of 20 questions and a student who answered all three
 * correctly read this, in one card, side by side:
 *
 *     3/20  Correct        100%  Accuracy
 *
 * Two denominators, neither labelled: "correct" was out of every AUTHORED
 * question, "accuracy" out of the ones actually ANSWERED. Both true in
 * isolation; together, nonsense. And the student was being scored against 17
 * questions nobody ever put in front of them.
 *
 * Out of what was asked, the two numbers agree — "3/3" and "100%" — and a
 * session that runs to the end is unaffected, because asked equals authored.
 *
 * THE SECOND HALF: NOT EVERY "TOTAL" IS THE SAME TOTAL
 * There are now three different counts on this page and they answer three
 * different questions. Collapsing any two of them is what caused both this bug
 * and the regression below:
 *
 *   exam.total_questions  how big is this paper          (lobby badge, "Q3 / 20")
 *   askedCount            what did the host ask          (score denominators)
 *   questions.length      what has this browser received (never a total)
 *
 * THE REGRESSION THIS ALSO FIXES
 * The waiting room lists each section with a question count, derived from the
 * questions in the browser. Since 20260844000000 the browser holds only
 * RELEASED questions — which before the host starts is none — so every section
 * read "0 questions" to a student sitting there waiting. Introduced by that
 * migration's client work, not by anything older.
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

const PAGE = readFileSync(resolve(ROOT, "src/pages/LiveExamStudent.tsx"), "utf-8");
const CODE = PAGE.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const JSX = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

console.log("\n══ Live exams: a score is out of what was asked ══");

// ─── [1] The arithmetic ─────────────────────────────────────────────────────
console.log("\n[1] Asked, not authored");

test("the asked count comes from the host's cursor", () => {
  assert(
    /const askedCount = useMemo\(/.test(CODE),
    "the page needs its own notion of 'how many were asked'"
  );
  assert(
    /if \(sessionIndex < 0\) return 0;/.test(CODE),
    "a session that ended before any unlock asked nothing"
  );
  assert(
    /const asked = sessionIndex \+ 1;/.test(CODE),
    "the cursor is 0-based; the count is not. It must also come from the CURSOR rather than this student's list length, so every language reports the same denominator"
  );
});

test("the asked count cannot exceed the paper", () => {
  assert(
    /Math\.min\(asked, totalQuestionCount\)/.test(CODE),
    "a cursor past the end of the paper would otherwise produce a denominator bigger than the exam"
  );
  assert(
    /totalQuestionCount > 0 \?/.test(CODE),
    "clamping against a zero total would collapse every denominator to 0"
  );
});

test("it only replaces the denominator once the session is over", () => {
  assert(
    /const scoreOutOf = isEnded \? askedCount : totalQuestionCount;/.test(CODE),
    "mid-session, 'Q3 / 20' and '3/20 answered' are progress through the paper — exactly what a candidate wants — so those keep the authored total"
  );
});

// ─── [2] Where each number is used ──────────────────────────────────────────
console.log("\n[2] Three counts, three jobs, no crossover");

test("the wrap-up score card divides by what was asked", () => {
  assert(
    /\{myTotalCorrect\}\s*<span[^>]*>\/\{scoreOutOf\}<\/span>/.test(JSX.replace(/\s+/g, " ")),
    "this is the card that showed '3/20' next to '100%'"
  );
});

test("the answered tally divides by the same thing", () => {
  assert(
    /\{answeredCount\}\/\{scoreOutOf\} answered/.test(JSX),
    "'3/20 answered' after an early end has the same contradiction as the score"
  );
});

test("accuracy still divides by what the student answered", () => {
  assert(
    /myAccuracy = answeredCount > 0 \? myTotalCorrect \/ answeredCount : null/.test(CODE),
    "accuracy is a different question from score and must keep its own denominator — the fix is to make the two AGREE, not to make them identical"
  );
});

test("the paper's real size is still what the lobby and the header show", () => {
  assert(
    /\{totalQuestionCount \|\| exam\.total_questions\} questions/.test(JSX),
    "the waiting room must still say how big the paper is"
  );
  assert(
    /Q\{currentQuestionIndex \+ 1\}[\s\S]{0,120}\/ \{totalQuestionCount\}/.test(JSX),
    "'Q3 / 20' is a position in the paper, not a score"
  );
});

test("the authored total still wins over what has been received", () => {
  // Pinned in live-paper-per-question too; repeated here because this file is
  // where someone will come looking after changing a denominator.
  assert(
    /const totalQuestionCount = exam\?\.total_questions \|\| questions\.length \|\| 0;/.test(CODE),
    "questions.length is what this browser has been sent and is never a total"
  );
});

// ─── [3] The waiting-room regression ────────────────────────────────────────
console.log("\n[3] The waiting room no longer claims every section is empty");

test("the per-section count renders only when it is known", () => {
  assert(
    /\(questionCountBySection\.get\(s\.id\) \|\| 0\) > 0 && \(/.test(JSX),
    "before the host starts, the browser holds no questions, so this printed '0 questions' against every section of a full paper"
  );
});

test("no bare zero is printed for a section", () => {
  assert(
    !/\{questionCountBySection\.get\(s\.id\) \|\| 0\} questions/.test(JSX),
    "`|| 0` inside the label is the exact shape of the bug: a missing count rendered as a real zero"
  );
});

test("it was not fixed by adding a request to the join path", () => {
  // The cheap fix would have been to fetch authored counts alongside the
  // sections. On a 500-student room that is 500 extra requests at join, the
  // hottest path there is, to label something the badge above already covers.
  const init = CODE.slice(CODE.indexOf("const init = async"), CODE.indexOf("const handleLanguageChange"));
  const fetches = (init.match(/await supabase|fetch[A-Z]\w+\(/g) || []).length;
  assert(
    fetches <= 12,
    `the join path has grown to ${fetches} calls; a per-section count is not worth a request per student`
  );
  assert(
    /questionCountBySection = useMemo\(\(\) => \{[\s\S]{0,220}questions\.forEach/.test(CODE),
    "the counts must still be derived from what is already in memory, not fetched"
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
console.log("  Nobody is scored against a question they were never shown.\n");
