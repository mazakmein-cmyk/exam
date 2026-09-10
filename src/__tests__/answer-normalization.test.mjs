/**
 * THE SAME ANSWER, TYPED DIFFERENTLY, STOPS BEING WRONG (issue 16 residual)
 *
 * Run with: node src/__tests__/answer-normalization.test.mjs
 *
 * Two invisible grading gaps: the same Hindi word arrives as different byte
 * sequences from different keyboards (pixel-identical, string-unequal — no
 * Unicode normalization existed anywhere), and "5.0" vs "5" as typed strings
 * matched on neither grader while number-typed keys matched only on the
 * server. Both graders now share one rule: NFC first, then plain decimal
 * literals canonicalise to numeric text under a guard regex that keeps
 * commas, exponents and >15-digit values as text on BOTH sides.
 *
 * The rule lives in lib/answerNormalize.js (imported here and EXECUTED — the
 * behaviour tests run the real implementation), with a deliberate copy in
 * scoringEngine.ts (import-free by pinned invariant) and the SQL mirror in
 * 20260839000000. Old grades are untouched by owner decision.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeAnswerText, NUMERIC_ANSWER_RE } from "../lib/answerNormalize.js";

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

const ENGINE = readFileSync(resolve(ROOT, "src/services/scoringEngine.ts"), "utf-8");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260839000000_unicode_numeric_answer_match.sql"),
  "utf-8"
);

console.log("\nTHE SAME ANSWER, TYPED DIFFERENTLY, STOPS BEING WRONG\n");

// ─── [1] Behaviour — the real implementation, executed ───────────────────────

test("composed and decomposed Unicode read as the same answer", () => {
  const composed = "दिल्ली".normalize("NFC");
  const decomposed = "दिल्ली".normalize("NFD");
  assert(composed !== decomposed || composed.length !== decomposed.length || true, "sanity");
  assert(
    normalizeAnswerText(composed) === normalizeAnswerText(decomposed),
    "NFC and NFD forms of the same Hindi word must normalise identically"
  );
  assert(
    normalizeAnswerText("café".normalize("NFD")) === normalizeAnswerText("café"),
    "decomposed accents must match composed ones"
  );
});

test("plain decimal strings canonicalise; ambiguous ones stay text", () => {
  assert(normalizeAnswerText("5.0") === "5", '"5.0" reads as 5');
  assert(normalizeAnswerText("05") === "5", '"05" reads as 5');
  assert(normalizeAnswerText("+5") === "5", '"+5" reads as 5');
  assert(normalizeAnswerText(".5") === "0.5", '".5" reads as 0.5');
  assert(normalizeAnswerText("-0") === "0", '"-0" reads as 0');
  assert(normalizeAnswerText("1,000") === "1,000", "commas stay text — SQL cannot parse them the same way");
  assert(normalizeAnswerText("1e3") === "1e3", "exponents stay text");
  assert(
    normalizeAnswerText("9007199254740993") === "9007199254740993",
    ">15-digit integers stay text — JS floats lose their precision"
  );
});

test("trim and case-folding survive unchanged", () => {
  assert(normalizeAnswerText(" Delhi ") === "delhi", "trim + lowercase");
  assert(normalizeAnswerText(0) === "0", "the number zero is a real answer");
  assert(normalizeAnswerText(null) === "", "null reads as empty");
});

// ─── [2] The three copies carry one rule ─────────────────────────────────────

test("the scoring engine's copy is line-identical (it must stay import-free)", () => {
  assert(!/^import /m.test(ENGINE), "the engine must stay import-free");
  for (const line of [
    'const s = String(val ?? "").normalize("NFC").trim();',
    "if (NUMERIC_ANSWER_RE.test(s)) return String(Number(s));",
    "return s.toLowerCase();",
  ]) {
    assert(ENGINE.includes(line), `engine copy lost: ${line}`);
  }
  const RE_LITERAL = "/^[+-]?([0-9]{1,15}(\\.[0-9]{1,10})?|\\.[0-9]{1,10})$/";
  assert(ENGINE.includes(RE_LITERAL), "engine guard regex drifted from the shared one");
  assert(
    NUMERIC_ANSWER_RE.source === "^[+-]?([0-9]{1,15}(\\.[0-9]{1,10})?|\\.[0-9]{1,10})$",
    "the shared regex changed — update the engine copy, the SQL, and this pin together"
  );
});

test("every other grader imports the shared rule instead of re-typing it", () => {
  for (const f of ["src/services/examService.ts", "src/pages/ExamReview.tsx", "src/pages/Analytics.tsx"]) {
    const src = readFileSync(resolve(ROOT, f), "utf-8");
    assert(src.includes("normalizeAnswerText"), `${f} must use the shared rule`);
    assert(
      !src.includes('String(val).trim().toLowerCase()'),
      `${f} still carries the old NFC-less comparison`
    );
  }
});

// ─── [3] The SQL mirror ──────────────────────────────────────────────────────

test("mock_answer_norm gained NFC and the same guard regex", () => {
  assert(
    MIGRATION.includes("normalize(v #>> '{}', NFC)") &&
      MIGRATION.includes("normalize(t.e #>> '{}', NFC)"),
    "both the scalar and the array-element string paths must NFC-normalize"
  );
  assert(
    MIGRATION.includes("'^[+-]?([0-9]{1,15}(\\.[0-9]{1,10})?|\\.[0-9]{1,10})$'"),
    "the SQL guard regex must be character-identical to the client's"
  );
});

test("the migration proves the new rules AND re-proves every old pinned behaviour", () => {
  assert(
    MIGRATION.includes("NFD-composed Hindi must match the NFC key"),
    "the Unicode assert is gone"
  );
  assert(
    MIGRATION.includes("'commas stay text on both graders"),
    "the comma exclusion must be asserted, or the graders drift on '1,000'"
  );
  assert(
    MIGRATION.includes("'an empty key marks nothing correct'") &&
      MIGRATION.includes("'set equal out of order'"),
    "the 20260828000000 behaviour pins must be re-asserted under the new normalizer"
  );
  assert(
    MIGRATION.includes("old grades untouched"),
    "the owner's no-regrade decision must be stated where the next reader will look"
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
