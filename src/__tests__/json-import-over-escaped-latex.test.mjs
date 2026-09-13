/**
 * JSON IMPORT — a paper whose LaTeX was escaped one level too many.
 *
 * Run with: node src/__tests__/json-import-over-escaped-latex.test.mjs
 *
 * The display layer can rescue over-escaped LaTeX (see
 * math-over-escaped-latex.test.mjs), but it should never have to. The model
 * applies JSON's backslash-doubling rule to LaTeX it has already doubled, and
 * the result is stored and then re-read by the editors, the PDF export and the
 * answer key alike — so the repair belongs at the front door too.
 *
 * A single `\\begin` proves nothing on its own: `\\` is a legitimate row
 * separator inside `cases` and `matrix`. What is decisive is the RATIO over a
 * whole paper, which is why this repair runs on the parsed document rather
 * than on one string. Both directions are asserted below — a doubled paper is
 * collapsed, and a correct paper comes back byte-for-byte.
 *
 * parseExamJson is TypeScript, so it is bundled on the fly here. esbuild
 * arrives with vite; if it is somehow missing the file reports a skip instead
 * of failing the suite, because this is the only test that needs a build step.
 */

import { rmSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, ".json-import-test-bundle.mjs");

let build;
try {
  ({ build } = await import("esbuild"));
} catch {
  console.log("\n  ⏭  esbuild unavailable — skipping (parseExamJson needs a bundle step)");
  process.exit(0);
}

await build({
  entryPoints: [resolve(ROOT, "src/services/jsonImportParser.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: OUT,
  alias: { "@": resolve(ROOT, "src") },
  logLevel: "error",
});
const { parseExamJson } = await import(pathToFileURL(OUT).href);

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
const eq = (got, want, msg) => {
  if (got !== want)
    throw new Error(
      `${msg}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`,
    );
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const ctx = {
  language: "en",
  selectedLanguage: "en",
  isPrimary: true,
  supportedLanguages: ["en"],
  examSectionsForLanguage: [{ id: "s1", name: "Mathematics", sort_order: 0 }],
};

// NOTE ON LAYERS. These are the PARSED values — parseExamJson receives
// JSON.stringify(paper(...)), so what is written here is what the model's JSON
// decoded to. In this source "\\" is ONE literal backslash.
//
// Over-escaped, as reported: every command carries TWO backslashes, and the
// cases row separator carries FOUR.
const OVER_ESCAPED =
  "If $f(x) = \\\\begin{cases} x-2 & 0 \\\\le x \\\\le 2 \\\\\\\\ -2 & x < 0 \\\\end{cases}$ " +
  "and $h(x) = f(|x|) + |f(x)|$ then $\\\\int_0^k h(x)dx$ is equal to $(k > 0)$";
// Correct: commands carry ONE backslash, the row separator TWO.
const CORRECT =
  "If $f(x) = \\begin{cases} x-2 & 0 \\le x \\le 2 \\\\ -2 & x < 0 \\end{cases}$ " +
  "and $\\int_0^k h(x)dx$ is equal to $(k > 0)$";

const paper = (text, options) =>
  JSON.stringify({
    schema_version: "1.0",
    language: "en",
    sections: [
      {
        name: "Mathematics",
        questions: [
          { q_no: 1, text, answer_type: "single", options, correct_answer: 0 },
        ],
      },
    ],
  });
const firstQuestion = (report) => {
  const q = report.perSection[0]?.accepted[0];
  if (!q)
    throw new Error(
      `no question was accepted: ${JSON.stringify(report.perSection[0]?.skipped ?? report.fatalReason)}`,
    );
  return q;
};

console.log("\n[1] a double-escaped paper is repaired on import");

const over = parseExamJson(
  paper(OVER_ESCAPED, ["$\\\\frac{1}{2}$", "$\\\\sqrt{7}$", "3", "4"]),
  ctx,
);

test("the repair is reported to the creator", () => {
  ok(over.ok, over.fatalReason);
  ok(
    over.repairCategories.includes("latex_over_escaped_fixed"),
    `categories were: ${over.repairCategories.join(", ") || "(none)"}`,
  );
  ok(over.repairApplied, "repairApplied must be set so the dialog surfaces it");
});

test("every command drops to a single backslash", () => {
  const q = firstQuestion(over);
  ok(q.text.includes("\\begin{cases}"), `\\begin not collapsed: ${q.text}`);
  ok(q.text.includes("\\le x"), `\\le not collapsed: ${q.text}`);
  ok(q.text.includes("\\end{cases}"), `\\end not collapsed: ${q.text}`);
  ok(!/\\\\[A-Za-z]/.test(q.text), `a doubled command survived: ${q.text}`);
});

test("the cases row separator keeps its two backslashes", () => {
  // Four in, two out. Collapsing it to one would merge the rows and silently
  // change the maths, which is the whole reason the collapse halves runs
  // rather than deleting backslashes.
  ok(firstQuestion(over).text.includes("\\\\ -2"), "the row separator was damaged");
});

test("the silent case — \\int — is repaired", () => {
  const q = firstQuestion(over);
  ok(q.text.includes("\\int_0^k"), `no integral command: ${q.text}`);
  ok(!q.text.includes("\\\\int"), `still doubled: ${q.text}`);
});

test("options are repaired alongside the question text", () => {
  const q = firstQuestion(over);
  eq(q.options[0], "$\\frac{1}{2}$", "option 1 not repaired");
  eq(q.options[1], "$\\sqrt{7}$", "option 2 not repaired");
});

test("the repaired text equals what a correct upload would have produced", () => {
  // Same paper, same bytes, whichever way the model escaped it.
  const good = parseExamJson(paper(CORRECT, ["$\\frac{1}{2}$", "$\\sqrt{7}$", "3", "4"]), ctx);
  ok(firstQuestion(over).text.includes(firstQuestion(good).text.slice(0, 60)), "the two forms diverged");
});

console.log("\n[2] a correctly-escaped paper is never touched");

const goodOptions = ["$\\frac{1}{2}$", "$\\sqrt{7}$", "3", "4"];
const good = parseExamJson(paper(CORRECT, goodOptions), ctx);

test("the repair does not fire", () => {
  ok(good.ok, good.fatalReason);
  ok(
    !good.repairCategories.includes("latex_over_escaped_fixed"),
    `a correct paper was rewritten: ${good.repairCategories.join(", ")}`,
  );
});

test("question text comes back byte-for-byte", () => {
  eq(firstQuestion(good).text, CORRECT, "a correct formula was altered");
});

test("options come back byte-for-byte", () => {
  const q = firstQuestion(good);
  for (let i = 0; i < goodOptions.length; i++) eq(q.options[i], goodOptions[i], `option ${i + 1} altered`);
});

test("a paper carrying a legitimate unspaced row break survives", () => {
  // `\begin{matrix}a\\b\end{matrix}` has the `\\`+letter signature, so only
  // the whole-document ratio keeps it safe.
  const matrix = "$\\begin{matrix}a\\\\b\\end{matrix}$ and $\\frac{1}{2}$ and $\\sqrt{7}$";
  const r = parseExamJson(paper(matrix, goodOptions), ctx);
  ok(
    !r.repairCategories.includes("latex_over_escaped_fixed"),
    "the ratio test was too eager on a legitimate matrix",
  );
  eq(firstQuestion(r).text, matrix, "a legitimate matrix was rewritten");
});

console.log("\n[3] the under-escaped repair still works alongside it");

test("a paper with bare LaTeX backslashes is still doubled, not collapsed", () => {
  // autoFixLatexEscapes runs on the SOURCE text; the new collapse runs on the
  // parsed values. They must not fight: the result is single backslashes.
  const raw =
    '{"schema_version":"1.0","language":"en","sections":[{"name":"Mathematics",' +
    '"questions":[{"q_no":1,"text":"Find $\\sqrt{7}$ and $\\frac{1}{2}$.",' +
    '"answer_type":"single","options":["1","2","3","4"],"correct_answer":0}]}]}';
  const r = parseExamJson(raw, ctx);
  ok(r.ok, r.fatalReason);
  const q = firstQuestion(r);
  ok(q.text.includes("\\sqrt{7}"), `\\sqrt lost: ${q.text}`);
  ok(q.text.includes("\\frac{1}{2}"), `\\frac lost: ${q.text}`);
  ok(!/\\\\[A-Za-z]/.test(q.text), `the two repairs fought and doubled it: ${q.text}`);
});

rmSync(OUT, { force: true });
console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
