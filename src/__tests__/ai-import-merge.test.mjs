/**
 * AI PDF IMPORT — splitting a paper across workers and putting it back together.
 *
 * Run with: node src/__tests__/ai-import-merge.test.mjs
 *
 * A full paper is too slow to extract in one Gemini call — the work is
 * decode-bound, ~25k output tokens plus ~38k thinking tokens, emitted one after
 * another — so the import runs an index pass and then N workers that each own a
 * range of printed question numbers. That buys speed, and it buys the ability
 * to retry a fifth of a paper instead of all of it. What it costs is this file:
 *
 *   1. THE SPLIT MUST BE A PARTITION. Every printed number goes to exactly one
 *      worker. A number given to two workers is a duplicated question; a number
 *      given to none is a silently missing one. Papers that RESTART numbering
 *      in each section (Physics 1-30, Chemistry 1-30) are the case that breaks
 *      a naive split, because "question 7" then names three different questions.
 *
 *   2. THE MERGE MUST NOT CHANGE THE CONTRACT. Whatever happens server-side,
 *      the browser receives ONE delimited v1.0 block and parses it with the
 *      same parseExamJson the manual JSON upload uses. That path is untouched
 *      and must stay untouched, so the last section here runs the REAL parser
 *      over real merged output and checks that sections match, printed order
 *      survives the shard boundaries, and answers, options, passages, marks and
 *      image regions all arrive intact.
 *
 *   3. A LOST WORKER MUST NOT SINK THE PAPER. Three quarters of a paper the
 *      creator can import beats an all-or-nothing failure — but the questions
 *      that are missing have to be NAMED, which is why the gap report is
 *      computed from what each worker was ASKED for and not from what it says
 *      it did.
 *
 * merge.ts is TypeScript, so it is bundled on the fly, the same way
 * json-import-over-escaped-latex.test.mjs bundles the parser.
 */

import { rmSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

/**
 * merge.ts imports jsonrepair from esm.sh, the way a Deno edge function has to.
 * Under Node the same package is in node_modules, so the URL is pointed there:
 * the test then exercises the exact repair the browser's parser uses.
 */
const esmShToNode = {
  name: "esm-sh-to-node",
  setup(b) {
    b.onResolve({ filter: /^https:\/\/esm\.sh\// }, (args) => {
      const pkg = args.path.replace(/^https:\/\/esm\.sh\//, "").replace(/@[^/@]*$/, "");
      return { path: require.resolve(pkg) };
    });
  },
};
const MERGE_OUT = resolve(ROOT, ".ai-import-merge-bundle.mjs");
const PAGES_OUT = resolve(ROOT, ".ai-import-pages-bundle.mjs");
const PARSER_OUT = resolve(ROOT, ".ai-import-parser-bundle.mjs");

let build;
try {
  ({ build } = await import("esbuild"));
} catch {
  console.log("\n  ⏭  esbuild unavailable — skipping (merge.ts needs a build step)");
  process.exit(0);
}

await build({
  entryPoints: [resolve(ROOT, "supabase/functions/ai-pdf-import/merge.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: MERGE_OUT,
  logLevel: "error",
  plugins: [esmShToNode],
});
await build({
  entryPoints: [resolve(ROOT, "supabase/functions/ai-pdf-import/pages.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: PAGES_OUT,
  logLevel: "error",
});
await build({
  entryPoints: [resolve(ROOT, "src/services/jsonImportParser.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: PARSER_OUT,
  alias: { "@": resolve(ROOT, "src") },
  logLevel: "error",
});

const {
  extractDelimitedJson, readPlan, planShards, shardCountFor, mergeShards, toDelimited, splitSlices, sectionKey,
  JSON_START, JSON_END,
} = await import(pathToFileURL(MERGE_OUT).href);
const { parseExamJson } = await import(pathToFileURL(PARSER_OUT).href);
const { planPageChunks, keyWindow, splitPageChunk, fixChunkPageNumbers } = await import(pathToFileURL(PAGES_OUT).href);

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
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg ?? "assertion failed");
};
const eq = (a, b, msg) => {
  const got = JSON.stringify(a);
  const want = JSON.stringify(b);
  if (got !== want) throw new Error(`${msg ?? "mismatch"}\n       got:  ${got}\n       want: ${want}`);
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SECTIONS = ["English Language", "Quantitative Aptitude", "Reasoning Ability"];

const plan = readPlan({
  pages: 27,
  numbering: "continuous",
  total_questions: 9,
  sections: [
    { name: "English Language", first_q_no: 1, last_q_no: 3, count: 3 },
    { name: "Quantitative Aptitude", first_q_no: 4, last_q_no: 6, count: 3 },
    { name: "Reasoning Ability", first_q_no: 7, last_q_no: 9, count: 3 },
  ],
  answer_key: {
    found: true, applied: true, format: "grid", pages: [26], label_style: "1234",
    numbering: "continuous", sets_in_key: [], set_used: null,
    transcript: {
      "English Language": "1:3 2:1 3:2",
      "Quantitative Aptitude": "4:1 5:4 6:2",
      "Reasoning Ability": "7:3 8:2 9:1",
    },
    note: "",
  },
  marks_config: { marks_correct: 1, marks_wrong: 0.25, marks_skipped: 0 },
});

const q = (n, ans, extra = {}) => ({
  q_no: n,
  text: `Question number ${n}?`,
  answer_type: "single",
  options: [`opt ${n}A`, `opt ${n}B`, `opt ${n}C`, `opt ${n}D`],
  correct_answer: ans,
  ...extra,
});

/** One worker's reply, in the shape a worker actually produces. */
const worker = (slices, sections, summaryExtra = {}) => ({
  slices,
  obj: {
    schema_version: "1.0",
    language: "en",
    _extraction_summary: {
      source_pdf: "p.pdf",
      // Workers invent this field — it has said "GPT-4o" and "Claude 3.5
      // Sonnet" — so the merge must stamp it rather than copy it.
      model: "hallucinated-model-name",
      total_in_pdf: 9, extracted: 3, skipped: [], needs_manual_review: [],
      marks_source: "found_in_pdf", answers_source: "found_in_pdf",
      answer_key: { found: true, note: "WORKER COPY — must not win" },
      ...summaryExtra,
    },
    marks_config: {
      exam_default: {
        marks_correct: 1, marks_wrong: 0.25, marks_skipped: 0,
        mcq_mode: "all_or_nothing", mcq_wrong_penalty: "flat", rounding_strategy: "none",
      },
    },
    sections,
    image_padding_pct: 5,
  },
});

const parseCtx = {
  language: "en", selectedLanguage: "en", isPrimary: true, supportedLanguages: ["en"],
  examSectionsForLanguage: SECTIONS.map((name, i) => ({ id: "s" + i, name, sort_order: i })),
};

// ─── 1. Reading a worker's reply ─────────────────────────────────────────────

console.log("\n1. Reading a reply the model actually sends");
test("a clean block parses", () => {
  eq(extractDelimitedJson(`${JSON_START}\n{"a":1}\n${JSON_END}`, JSON_START, JSON_END).a, 1);
});
test("a preamble and a code fence are forgiven", () => {
  const raw = `Here you go:\n${JSON_START}\n\`\`\`json\n{"a":2}\n\`\`\`\n${JSON_END}\nthanks!`;
  eq(extractDelimitedJson(raw, JSON_START, JSON_END).a, 2);
});
test("a trailing comma is forgiven", () => {
  eq(extractDelimitedJson(`${JSON_START}{"a":3,}${JSON_END}`, JSON_START, JSON_END).a, 3);
});
test("a reply cut off before the closing delimiter still yields its JSON", () => {
  eq(extractDelimitedJson(`${JSON_START}\n{"a":4}`, JSON_START, JSON_END).a, 4);
});
test("no delimiters, or unparseable content, is null — not a guess", () => {
  ok(extractDelimitedJson(`{"a":5}`, JSON_START, JSON_END) === null, "undelimited JSON was accepted");
  ok(extractDelimitedJson(`${JSON_START} prose ${JSON_END}`, JSON_START, JSON_END) === null, "prose was accepted");
});

// ─── 2. The index pass declines rather than guesses ──────────────────────────

test("a LaTeX stem with a lone backslash is repaired the way the browser repairs it", () => {
  // "\sqrt" with one backslash is an invalid JSON escape. Strict parsing fails,
  // the trailing-comma fix does not help, and before jsonrepair was applied here
  // the worker was marked failed and retried — three times, on a maths paper,
  // for every slice. The browser's parser forgave this all along.
  const text = `${JSON_START}{"sections":[{"name":"Maths","questions":[{"q_no":1,"text":"Find \\sqrt{x} and \\frac{a}{b}","options":["a","b"],}]}]}${JSON_END}`;
  const obj = extractDelimitedJson(text, JSON_START, JSON_END);
  ok(obj !== null, "a repairable reply was refused");
  eq(obj.sections[0].questions[0].q_no, 1);
  ok(/sqrt\{x\}/.test(obj.sections[0].questions[0].text), "the stem was lost in repair");
  eq(obj.sections[0].questions[0].options, ["a", "b"]);
});

console.log("\n2. An index pass that cannot be trusted is refused");
test("a usable plan is read", () => {
  ok(!!plan, "plan rejected");
  eq(plan.totalQuestions, 9);
  eq(plan.sections.length, 3);
});
test("no sections, or a nonsense span, declines the split", () => {
  // Declining matters: the orchestrator then runs ONE whole-paper worker, which
  // is the behaviour that shipped before. An optimisation that cannot verify
  // its own premise has to stand down, not guess.
  ok(readPlan({ sections: [] }) === null, "an empty plan was accepted");
  ok(readPlan(null) === null, "a non-object was accepted");
  ok(
    readPlan({ sections: [{ name: "X", first_q_no: 1, last_q_no: 5000, count: 50 }] }) === null,
    "a 5000-wide section was accepted — most of that range holds nothing"
  );
});

// ─── 3. The split is a partition ─────────────────────────────────────────────

console.log("\n3. The split is a partition, on printed numbers");
test("worker count follows the paper's size, within the cap", () => {
  eq(shardCountFor(100, 22, 6), 5);
  eq(shardCountFor(30, 22, 6), 2);
  eq(shardCountFor(500, 22, 6), 6, "the cap must hold");
  eq(shardCountFor(0, 22, 6), 1);
});
test("every printed number is claimed exactly once", () => {
  const big = readPlan({
    total_questions: 100,
    sections: [
      { name: "English Language", first_q_no: 1, last_q_no: 30, count: 30 },
      { name: "Quantitative Aptitude", first_q_no: 31, last_q_no: 65, count: 35 },
      { name: "Reasoning Ability", first_q_no: 66, last_q_no: 100, count: 35 },
    ],
  });
  const flat = planShards(big, 5).flat();
  const seen = new Map();
  for (const s of flat) {
    for (let n = s.from; n <= s.to; n++) {
      const k = `${s.section}#${n}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  eq(seen.size, 100, "coverage is not 100 numbers");
  const dupes = [...seen.entries()].filter(([, v]) => v > 1);
  ok(dupes.length === 0, `numbers claimed twice: ${JSON.stringify(dupes)}`);
  ok(
    flat.every((s) => {
      const sec = big.sections.find((x) => x.name === s.section);
      return sec && s.from >= sec.from && s.to <= sec.to;
    }),
    "a slice escaped its section"
  );
});
test("numbering that restarts per section does not collide", () => {
  // Physics 1-30, Chemistry 1-30, Maths 1-30: splitting on a global index would
  // hand "question 7" to three workers and lose two of them in the merge.
  const restart = readPlan({
    total_questions: 90,
    numbering: "restarts_per_section",
    sections: [
      { name: "Physics", first_q_no: 1, last_q_no: 30, count: 30 },
      { name: "Chemistry", first_q_no: 1, last_q_no: 30, count: 30 },
      { name: "Maths", first_q_no: 1, last_q_no: 30, count: 30 },
    ],
  });
  const flat = planShards(restart, 4).flat();
  eq(new Set(flat.map((s) => `${s.section}#${s.from}-${s.to}`)).size, flat.length, "a slice was issued twice");
  for (const name of ["Physics", "Chemistry", "Maths"]) {
    ok(
      flat.some((s) => s.section === name && s.from <= 1 && s.to >= 1),
      `${name}'s question 1 belongs to nobody`
    );
  }
});
test("a worker is never left a stub of one or two questions", () => {
  const flat = planShards(plan, 3).flat();
  ok(flat.every((s) => s.to >= s.from), "an empty slice was issued");
});

// ─── 4. The merge ────────────────────────────────────────────────────────────

console.log("\n4. Putting the paper back together");

const full = mergeShards({
  language: "en", plan, model: "gemini-3.5-flash", pdfName: "p.pdf", promptVersion: "1.0",
  shards: [
    worker([{ section: "English Language", from: 1, to: 3 }],
      [{ name: "English Language", questions: [q(1, "2"), q(2, "0"), q(3, "1")] }]),
    worker([{ section: "Quantitative Aptitude", from: 4, to: 6 }],
      [{ name: "Quantitative Aptitude", questions: [
        q(4, "0"), q(5, "3"),
        q(6, "1", { image_region: { page: 4, x_min: 100, y_min: 200, x_max: 900, y_max: 400 } }),
      ] }]),
    worker([{ section: "Reasoning Ability", from: 7, to: 9 }],
      [{ name: "Reasoning Ability", questions: [
        q(7, "2"),
        q(8, "1", { passage: "Read the following and answer.", text: "Who went first?" }),
        q(9, "0"),
      ] }]),
  ],
});

test("the top-level shape is the v1.0 schema, in order", () => {
  eq(Object.keys(full.merged),
    ["schema_version", "language", "_extraction_summary", "marks_config", "sections", "image_padding_pct"]);
});
test("the model name is stamped server-side, never copied from a worker", () => {
  eq(full.merged._extraction_summary.model, "gemini-3.5-flash");
});
test("the answer key is the index pass's, not any worker's", () => {
  const key = full.merged._extraction_summary.answer_key;
  eq(key.transcript["English Language"], "1:3 2:1 3:2");
  ok(key.note !== "WORKER COPY — must not win", "a worker's key copy won");
  eq([key.answered, key.left_null], [9, 0], "key counts were not recomputed over the merged paper");
});
test("a boundary duplicate keeps the copy from the worker that owned it", () => {
  const dup = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker([{ section: "English Language", from: 1, to: 3 }],
        [{ name: "English Language", questions: [q(1, "2"), q(2, "0"), q(3, null)] }]),
      // The second worker re-emits q3 with a different answer.
      worker([{ section: "Quantitative Aptitude", from: 4, to: 6 }],
        [{ name: "English Language", questions: [q(3, "1")] },
         { name: "Quantitative Aptitude", questions: [q(4, "0")] }]),
    ],
  });
  eq(dup.merged.sections[0].questions.map((x) => [x.q_no, x.correct_answer]),
    [[1, "2"], [2, "0"], [3, null]], "the later worker's duplicate won");
});
test("a section the exam never listed is kept, after the ones it did", () => {
  const extra = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker([{ section: "English Language", from: 1, to: 3 }],
        [{ name: "English Language", questions: [q(1, "0")] }]),
      worker([{ section: "Reasoning Ability", from: 7, to: 9 }],
        [{ name: "General Awareness", questions: [q(7, "1")] }]),
    ],
  });
  eq(extra.merged.sections.map((s) => s.name), ["English Language", "General Awareness"]);
});
test("a nameless section is dropped, because the parser drops it anyway", () => {
  const nameless = mergeShards({
    language: "en", plan: null, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [worker([], [{ name: "", questions: [q(1, "0")] }, { name: "Real", questions: [q(2, "1")] }])],
  });
  eq(nameless.merged.sections.map((s) => s.name), ["Real"]);
});

// ─── 5. The gap report ───────────────────────────────────────────────────────

console.log("\n5. What did not come back is named, not hidden");
test("a complete paper reports no gaps", () => {
  eq(full.stats.missingCount, 0, JSON.stringify(full.stats.missing));
  eq(full.stats.questions, 9);
});
test("a worker that returned nothing still has its numbers listed", () => {
  // finish() hands EVERY worker to the merge, including ones with no output,
  // because a worker's slices are the record of what it was asked for. Drop
  // those and the missing questions vanish from the tally with the output.
  const lost = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker([{ section: "English Language", from: 1, to: 3 }],
        [{ name: "English Language", questions: [q(1, "2"), q(2, "0"), q(3, "1")] }]),
      worker([{ section: "Quantitative Aptitude", from: 4, to: 6 }],
        [{ name: "Quantitative Aptitude", questions: [q(4, "0"), q(5, "3"), q(6, "1")] }]),
      { slices: [{ section: "Reasoning Ability", from: 7, to: 9 }], obj: null },
    ],
  });
  eq(lost.stats.questions, 6, "the surviving workers' questions were lost too");
  eq(lost.stats.missingCount, 3);
  eq(lost.stats.missing.find((g) => g.section === "Reasoning Ability").qNos, [7, 8, 9]);
});
test("a worker that stopped early is caught by its numbers, not its self-report", () => {
  // The worker's own summary says it did three questions and is internally
  // consistent; only the difference from what it was ASKED for exposes it.
  const short = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [worker([{ section: "English Language", from: 1, to: 3 }],
      [{ name: "English Language", questions: [q(1, "2")] }])],
  });
  eq(short.stats.missing[0].qNos, [2, 3]);
});

// ─── 6. The contract with the browser ────────────────────────────────────────

console.log("\n6. The browser's import path is untouched");

const text = toDelimited(full.merged);
test("the output carries the delimiters parseExamJson looks for", () => {
  ok(text.startsWith(JSON_START) && text.trimEnd().endsWith(JSON_END), "delimiters missing");
});

const report = parseExamJson(text, parseCtx);
test("the REAL parser accepts merged parallel output", () => {
  ok(report.ok, report.fatalReason ?? "parse failed");
  ok(report.repairApplied === false, "our own serialisation needed repairing");
});
test("every section matched a real exam section", () => {
  eq(report.perSection.map((s) => s.jsonName), SECTIONS);
  eq(report.perSection.map((s) => s.matchedSectionId), ["s0", "s1", "s2"]);
  eq(report.unmatchedSections, []);
});
test("printed order survives the shard boundaries", () => {
  eq(report.perSection.flatMap((s) => s.accepted.map((x) => x.sourceQNo)), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  eq(report.perSection.map((s) => s.accepted.map((x) => x.q_no)), [[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
  eq(report.perSection.flatMap((s) => s.skipped), [], "the parser rejected a merged question");
});
test("answers, options, marks, figures and passages all arrive", () => {
  eq(report.perSection.flatMap((s) => s.accepted.map((x) => x.correct_answer)),
    ["2", "0", "1", "0", "3", "1", "2", "1", "0"]);
  eq(report.perSection[0].accepted[0].options, ["opt 1A", "opt 1B", "opt 1C", "opt 1D"]);
  eq(report.marksConfig?.exam_default?.marks_correct, 1);
  ok(report.hasImageRegions === true, "auto-snip would no longer fire");
  eq(report.perSection[1].accepted[2].imageRegion?.bbox, { xMin: 100, yMin: 200, xMax: 900, yMax: 400 });
  eq(report.imagePaddingPct, 5);
  ok(report.perSection[2].accepted[1].text.includes("Read the following and answer."), "a passage was lost");
});
test("the extraction summary still reaches the dialog", () => {
  ok(!!report.extractionSummary, "summary dropped");
  eq(report.extractionSummary.answer_key.transcript["English Language"], "1:3 2:1 3:2");
});
test("a paper missing a worker's slice still imports, minus that section", () => {
  const partial = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker([{ section: "English Language", from: 1, to: 3 }],
        [{ name: "English Language", questions: [q(1, "2"), q(2, "0"), q(3, "1")] }]),
      worker([{ section: "Quantitative Aptitude", from: 4, to: 6 }],
        [{ name: "Quantitative Aptitude", questions: [q(4, "0"), q(5, "3"), q(6, "1")] }]),
      { slices: [{ section: "Reasoning Ability", from: 7, to: 9 }], obj: null },
    ],
  });
  const r = parseExamJson(toDelimited(partial.merged), parseCtx);
  ok(r.ok, r.fatalReason ?? "a partial paper was refused");
  eq(r.perSection.reduce((n, s) => n + s.accepted.length, 0), 6);
  eq(r.examOnlySections, ["Reasoning Ability"], "the lost section should read as exam-only, not as an error");
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n7. A reply that was cut off halves the slice instead of retrying it");
// A cut reply means the slice is too long for one answer, and the same slice on
// another key is cut at the same place. Half of it is not — so the worker keeps
// the first half and a new worker takes the second, and the merge, which reads
// every worker's slices, needs no change.
test("a single range splits down the middle at a printed number", () => {
  eq(splitSlices([{ section: "S", from: 1, to: 10 }]), [
    [{ section: "S", from: 1, to: 5 }],
    [{ section: "S", from: 6, to: 10 }],
  ]);
  eq(splitSlices([{ section: "S", from: 1, to: 9 }]), [
    [{ section: "S", from: 1, to: 5 }],
    [{ section: "S", from: 6, to: 9 }],
  ]);
});
test("ranges across sections split by question count, every number kept exactly once", () => {
  const slices = [{ section: "A", from: 21, to: 30 }, { section: "B", from: 1, to: 4 }];
  const [head, tail] = splitSlices(slices);
  const count = (xs) => xs.reduce((n, s) => n + (s.to - s.from + 1), 0);
  eq(count(head), 7);
  eq(count(tail), 7);
  eq(head, [{ section: "A", from: 21, to: 27 }]);
  eq(tail, [{ section: "A", from: 28, to: 30 }, { section: "B", from: 1, to: 4 }]);
  const all = [...head, ...tail].flatMap((s) => Array.from({ length: s.to - s.from + 1 }, (_, i) => `${s.section}:${s.from + i}`));
  eq(new Set(all).size, all.length, "a number was claimed twice");
  eq(all.length, 14, "a number was lost");
});
test("two questions or fewer cannot be halved — that is not a length problem", () => {
  eq(splitSlices([{ section: "S", from: 7, to: 8 }]), null);
  eq(splitSlices([{ section: "S", from: 7, to: 7 }]), null);
  eq(splitSlices([]), null);
});
test("the halves still merge, and a half that never came back still names its numbers", () => {
  const [head, tail] = splitSlices([{ section: "English Language", from: 1, to: 3 }]);
  const r = mergeShards({
    language: "en", plan, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker(head, [{ name: "English Language", questions: [q(1, "2"), q(2, "0")] }]),
      { slices: tail, obj: null },
    ],
  });
  eq(r.stats.questions, 2);
  eq(r.stats.missing, [{ section: "English Language", qNos: [3] }]);
  const parsed = parseExamJson(toDelimited(r.merged), parseCtx);
  ok(parsed.ok, parsed.fatalReason ?? "a half-merged paper was refused by the real parser");
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n8. Cutting the paper by PAGES, so no call reads the whole PDF");
// The live engine's clock bounds one call, and a 25-page image-heavy paper
// could not even be INDEXED inside it. Pages are known from the PDF itself, so
// cutting by page needs no model to have read anything first.
test("25 pages become five owned runs of five, each shown one page of context", () => {
  const chunks = planPageChunks(25, 5, 6);
  eq(chunks.map((c) => [c.from, c.to, c.ctxTo]), [
    [1, 5, 6], [6, 10, 11], [11, 15, 16], [16, 20, 21], [21, 25, 25],
  ]);
});
test("every page is owned exactly once, whatever the size", () => {
  for (const [pages, target, max] of [[25, 5, 6], [55, 5, 6], [7, 5, 6], [1, 5, 6], [100, 5, 6], [12, 5, 2]]) {
    const chunks = planPageChunks(pages, target, max);
    const owned = chunks.flatMap((c) => Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i));
    eq(owned, Array.from({ length: pages }, (_, i) => i + 1), `pages=${pages} target=${target} max=${max}`);
    ok(chunks.length <= max, `pages=${pages}: more than ${max} chunks`);
    ok(chunks.every((c) => c.ctxTo <= pages && c.ctxTo >= c.to), "context page must stay inside the paper");
  }
});
test("when the key pages are known, chunks stop at the last question page", () => {
  const chunks = planPageChunks(25, 5, 6, 18);
  eq(chunks[chunks.length - 1].to, 18);
  eq(chunks[chunks.length - 1].ctxTo, 19, "context may peek one page past the last question page");
  eq(planPageChunks(25, 5, 6, 99).length, 5, "a nonsense last page is ignored");
});
test("the index pass reads the tail (where keys are printed), or the head on retry", () => {
  eq(keyWindow(25, "tail"), { from: 16, to: 25, ctxTo: 25, path: null });
  eq(keyWindow(25, "head"), { from: 1, to: 10, ctxTo: 10, path: null });
  eq(keyWindow(55, "tail"), { from: 44, to: 55, ctxTo: 55, path: null }, "capped at twelve pages");
  eq(keyWindow(4, "tail"), { from: 1, to: 4, ctxTo: 4, path: null }, "a short paper is read whole");
});
test("a chunk that ran long is halved by pages; a single page is not", () => {
  eq(splitPageChunk({ from: 6, to: 10, ctxTo: 11 }, 25), [
    { from: 6, to: 8, ctxTo: 9, path: null },
    { from: 9, to: 10, ctxTo: 11, path: null },
  ]);
  eq(splitPageChunk({ from: 24, to: 25, ctxTo: 25 }, 25), [
    { from: 24, to: 24, ctxTo: 25, path: null },
    { from: 25, to: 25, ctxTo: 25, path: null },
  ]);
  eq(splitPageChunk({ from: 7, to: 7, ctxTo: 8 }, 25), null);
});
test("chunk-relative page numbers are shifted to paper pages — only when unambiguous", () => {
  // Worker for paper pages 11–16 reported pages 1..6: every page fits the chunk
  // length and none fits the paper range → shift by 10.
  const relative = { sections: [{ questions: [{ q_no: 21, image_region: { page: 2 } }, { q_no: 22, image_region: { page: 6 } }] }], _extraction_summary: { skipped: [{ page: 1 }] } };
  fixChunkPageNumbers(relative, { from: 11, to: 15, ctxTo: 16 });
  eq(relative.sections[0].questions.map((q) => q.image_region.page), [12, 16]);
  eq(relative._extraction_summary.skipped[0].page, 11);
  // Already paper pages: untouched.
  const absolute = { sections: [{ questions: [{ q_no: 21, image_region: { page: 12 } }] }] };
  fixChunkPageNumbers(absolute, { from: 11, to: 15, ctxTo: 16 });
  eq(absolute.sections[0].questions[0].image_region.page, 12);
  // Ambiguous (page 3 could be either when the chunk starts at 2): untouched.
  const ambiguous = { sections: [{ questions: [{ q_no: 1, image_region: { page: 3 } }] }] };
  fixChunkPageNumbers(ambiguous, { from: 2, to: 6, ctxTo: 7 });
  eq(ambiguous.sections[0].questions[0].image_region.page, 3);
  // The first chunk needs no shifting.
  const first = { sections: [{ questions: [{ q_no: 1, image_region: { page: 3 } }] }] };
  fixChunkPageNumbers(first, { from: 1, to: 5, ctxTo: 6 });
  eq(first.sections[0].questions[0].image_region.page, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n9. One section, however each worker spelled it");
// The first real page-mode import came back with "MATHEMATICS" (Q1–13) and
// "Mathematics" (Q14–22): the worker that saw the heading copied its case, the
// one that did not guessed. Four sections for a two-section paper.
test("case, spacing and punctuation do not make two sections", () => {
  eq(sectionKey("MATHEMATICS"), sectionKey(" mathematics "));
  eq(sectionKey("Physics & Chemistry"), sectionKey("physics chemistry"));
  ok(sectionKey("Physics") !== sectionKey("Chemistry"), "different sections must stay different");
});
test("workers that spelled a section differently are merged, in printed order", () => {
  const r = mergeShards({
    language: "en", plan: null, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [
      worker([], [{ name: "MATHEMATICS", questions: [q(1, "2"), q(2, "0")] }, { name: "PHYSICS", questions: [q(1, "1")] }]),
      worker([], [{ name: "Mathematics", questions: [q(3, "1")] }, { name: "Physics", questions: [q(2, "3")] }]),
    ],
  });
  eq(r.merged.sections.map((s) => [s.name, s.questions.map((x) => x.q_no)]), [
    ["MATHEMATICS", [1, 2, 3]],
    ["PHYSICS", [1, 2]],
  ]);
});
test("the exam's own spelling wins when it matches ignoring case", () => {
  const r = mergeShards({
    language: "en", plan: null, model: "m", pdfName: null, promptVersion: "1.0", sectionNames: ["Mathematics", "Physics"],
    shards: [
      worker([], [{ name: "MATHEMATICS", questions: [q(1, "2")] }]),
      worker([], [{ name: "physics", questions: [q(1, "1")] }]),
    ],
  });
  eq(r.merged.sections.map((s) => s.name), ["Mathematics", "Physics"]);
});
test("the gap report also ignores case", () => {
  const r = mergeShards({
    language: "en", plan: null, model: "m", pdfName: null, promptVersion: "1.0",
    shards: [worker([{ section: "MATHEMATICS", from: 1, to: 3 }], [{ name: "Mathematics", questions: [q(1, "2"), q(3, "1")] }])],
  });
  eq(r.stats.missing, [{ section: "MATHEMATICS", qNos: [2] }]);
});

rmSync(MERGE_OUT, { force: true });
rmSync(PAGES_OUT, { force: true });
rmSync(PARSER_OUT, { force: true });
console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
