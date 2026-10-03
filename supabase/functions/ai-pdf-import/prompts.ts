// supabase/functions/ai-pdf-import/prompts.ts
//
// Two prompts sit on top of the shared EXTRACTION_PROMPT, and neither one
// changes it: the manual "run this in your own AI" flow in JsonUploadGuide must
// keep working character-for-character.
//
//   buildPlanPrompt()    A small, fast INDEX pass. It extracts no questions —
//                        it reports how the paper is laid out and transcribes
//                        the answer key. Small output means it comes back in
//                        seconds, and it is what makes everything after it
//                        parallelisable.
//
//   buildShardPrompt()   The full extraction prompt with an addendum that
//                        scopes one worker to a few question ranges and hands
//                        it the already-transcribed key.
//
// Why the addendum goes LAST, after ~83 KB of shared prompt: a later
// instruction wins when it contradicts an earlier one, and an unchanged prefix
// is what lets Gemini's implicit context caching recognise the second shard on
// a key as a repeat of the first. Prepending the scope would break both.

import {
  EXTRACTION_PROMPT,
  fillExtractionPromptContext,
} from "../../../src/lib/extractionPrompt.js";

export const PLAN_START = "<<<PLAN_START>>>";
export const PLAN_END = "<<<PLAN_END>>>";

/** One worker's share of the paper: a contiguous run of printed q_no in one section. */
export type Slice = { section: string; from: number; to: number };

function sectionList(sectionNames: string[]): string {
  if (!sectionNames.length) {
    return "  (my exam has no sections yet — name them from the paper's own headings)";
  }
  return sectionNames.map((name, i) => `  ${i + 1}. ${name}`).join("\n");
}

/**
 * The INDEX pass.
 *
 * This exists for two reasons, and the second one matters more than the speed.
 *
 * 1. You cannot split a paper into parallel workers without knowing where the
 *    questions are. Guessing "1-25, 26-50, ..." breaks on the very common paper
 *    that restarts numbering in every section, where "question 7" names three
 *    different questions.
 *
 * 2. The answer key is the part that has always been fragile, because it is
 *    printed on the LAST pages and a model writing front-to-back reaches it
 *    after it has already emitted the questions. Transcribing the key HERE, in
 *    a pass whose only job is to read it, means every extraction worker is
 *    handed the finished key as INPUT instead of having to find it again — and
 *    all of them are handed the SAME key, so they cannot disagree about it.
 *
 * Output is a few hundred tokens even for a 200-question paper, so this returns
 * long before a full extraction would have produced its first question.
 */
export function buildPlanPrompt(ctx: {
  language: string;
  sectionNames: string[];
  /** When set, the attached PDF is only these pages of the paper. */
  window?: { from: number; to: number; total: number } | null;
}): string {
  const lang = ctx.language === "hi" ? "hi" : "en";
  const langWord = lang === "hi" ? "Hindi" : "English";
  const w = ctx.window;
  const windowNote = w
    ? `
THE ATTACHED PDF IS NOT THE WHOLE PAPER. It is pages ${w.from} to ${w.to} of a
${w.total}-page paper — attached page 1 is paper page ${w.from}. These are ${
        w.from > 1 ? "the LAST pages, where the answer key is printed" : "the FIRST pages"
      }.
Report every page number as a PAPER page (add ${w.from - 1} to the attached
page number). Report "pages" as ${w.total}. For each section report the
first_q_no / last_q_no the KEY shows for it, even though the questions
themselves are not attached; if a section's pages are outside this window,
report first_page/last_page as null. If NO answer key is printed on these
pages, say so with "found": false and an empty transcript — do not invent one
and do not describe the solutions' working as a key.
`
    : "";
  return `You are INDEXING an exam paper PDF so that several workers can extract it
in parallel. You are NOT extracting questions. Do not emit question text,
do not emit options. An index and the answer key, nothing else.
${windowNote}

You may be run unattended. Never ask a question, never refuse, never reply
in prose: a reply without the block below is a failed job that nobody is
there to rescue. Every doubt goes in "notes".

LANGUAGE FOR THIS PASS: ${lang} (${langWord}).
Count and index ONLY the questions that exist in ${langWord} in this PDF. If
the paper prints a question in the other language only, it is out of scope
for this pass and must not be counted.

THE SECTION NAMES MY EXAM EXPECTS, in order:
${sectionList(ctx.sectionNames)}

Use those EXACT strings as each section's "name" — character for character.
Map the PDF's own sections onto them (1) by the same name ignoring case,
spacing, punctuation and English/Hindi equivalents, then (2) by order. If the
PDF has MORE sections than my list, report the surplus under their exact
printed PDF names. If it has FEWER, omit my unused names. If the paper prints
no headings at all and my list is empty, report ONE section named for the
paper's subject, or "Section 1".

HOW TO WORK
  1. Open EVERY page, LAST PAGES FIRST. Exam papers print the answer key at
     the END — after the questions, after the "Space for Rough Work" pages,
     inside a Solutions booklet, occasionally on page 2. A Solutions / Hints &
     Solutions / Answer Key booklet bound after the questions is NOT a second
     paper: it is THIS paper's key, even when it restates the questions and
     starts again at 1 behind its own cover page.
  2. Note this paper's SET, printed on the cover or the running header
     ("Test Booklet Series C", "SET-B", "Booklet Code Q4", "Shift 2",
     "प्रश्न-पुस्तिका श्रृंखला ग"), and use the matching column of the key.
  3. Note whether question numbering RESTARTS in each section or runs 1..N
     across the whole paper.
  4. Transcribe the key. Copy every entry AS PRINTED — "3", "(b)", "AC",
     "7.00", "Bonus" — paired with the question number printed beside it.
     Never solve a question. Never supply an answer from your own knowledge.
     An entry you cannot read is "?".

OUTPUT — a SINGLE JSON object between these literal delimiters, with nothing
before, after or between them. No prose, no code fences, no preamble.

${PLAN_START}
{
  "pages": <int — pages in the PDF>,
  "numbering": "continuous" | "restarts_per_section" | "unknown",
  "total_questions": <int — questions in ${langWord}, across all sections>,
  "sections": [
    {
      "name": "<exact section name, per the rules above>",
      "first_q_no": <int — the FIRST question number PRINTED in this section>,
      "last_q_no":  <int — the LAST question number PRINTED in this section>,
      "count":      <int — how many questions this section actually has in ${langWord}>,
      "first_page": <int, 1-based>,
      "last_page":  <int, 1-based>
    }
  ],
  "answer_key": {
    "found":       true | false,
    "applied":     true | false,
    "format":      "grid" | "inline" | "solutions" | "marked_option" | "value" | "question_id" | "mixed" | "none",
    "pages":       [<1-based pages holding the key or the solutions>],
    "label_style": "1234" | "abcd" | "ABCD" | "roman" | "devanagari" | "value" | "mixed" | "none",
    "numbering":   "continuous" | "restarts_per_section" | "unknown",
    "sets_in_key": ["<every Set / Series / Code / Shift column the key offers; [] if one>"],
    "set_used":    "<the set printed on THIS paper, which you used — or null>",
    "transcript": {
      "<exact section name>": "1:3 2:1 3:(b) 9:AC 21:7.00 30:Bonus 41:?"
    },
    "note": "<one short sentence: column used, offset applied, final-over-provisional — or empty>"
  },
  "marks_config": <the marks the paper PRINTS, as
                   {"marks_correct": n, "marks_wrong": n, "marks_skipped": n},
                   marks_wrong being a POSITIVE magnitude — or null if the paper
                   prints none>,
  "notes": "<one short sentence, or empty>"
}
${PLAN_END}

RULES FOR "transcript": one string per section, keyed by the EXACT section name
you report. One token per question, "<printed q_no>:<answer EXACTLY as printed>",
single-space separated, no space inside a token, "?" when unreadable. PRINTED
LABELS, never indices — "1:3" means the key printed 3. Keep it plain: no LaTeX,
no backslashes, no nesting. Include EVERY question the key covers, even where
you have not seen the question itself.

RULES FOR THE RANGES: first_q_no and last_q_no are the numbers PRINTED in the
PDF, not positions. If a section's printed numbers are 31..60, say 31 and 60 —
do not renumber to 1..30. "count" may be smaller than last_q_no - first_q_no + 1
when numbers are missing or a question exists in the other language only.

Your reply ends with ${PLAN_END}. Begin.`;
}

function sliceLines(slices: Slice[]): string {
  return slices
    .map((s) => `  • Section "${s.section}" — printed question numbers ${s.from} to ${s.to} inclusive.`)
    .join("\n");
}

/**
 * The full extraction prompt, scoped to one worker's slices and handed the key
 * the index pass already transcribed.
 *
 * `answerKeyJson` is serialised ONCE by the caller and reused for every shard,
 * so every worker converts labels against byte-identical text — the off-by-one
 * on "(1)(2)(3)(4)" keys that nothing downstream can detect cannot differ
 * between shards if the shards were never allowed to read the key themselves.
 */
export function buildShardPrompt(opts: {
  language: string;
  sectionNames: string[];
  slices: Slice[];
  answerKeyJson: string | null;
  totalQuestions: number | null;
  shardIndex: number;
  shardCount: number;
}): string {
  const base = fillExtractionPromptContext(
    { language: opts.language, sectionNames: opts.sectionNames },
    EXTRACTION_PROMPT
  );

  const keyBlock = opts.answerKeyJson
    ? `THE ANSWER KEY IS ALREADY TRANSCRIBED. A first pass over this same PDF
read the key pages and wrote the key down. Here it is:

${opts.answerKeyJson}

USE IT AS GIVEN. Do not go looking for the key pages again, and do not
re-derive it: PASS 1 and PASS 2 of "HOW TO WORK" are already done for you.
Copy this object into _extraction_summary.answer_key UNCHANGED — same
"transcript" strings, same "found", "applied", "format", "set_used", "note" —
and then do PASS 3 exactly as written: for each of your questions,
correct_answer = LABEL → INDEX of its token in this transcript.

Two things still belong to you, because they describe YOUR slice only:
  • "answered" and "left_null" — count them over the questions YOU emit.
  • A question whose token is missing, "?", or does not match any option you
    transcribed still gets "correct_answer": null and its own
    needs_manual_review entry starting "answer key — ".
If this transcript has no token for a question in your range, leave that
question's correct_answer null. Never solve it, and never fill it in from
your own knowledge.`
    : `NO ANSWER KEY WAS FOUND in a first pass over this PDF. Emit the questions
anyway, with "correct_answer": null throughout, "answer_key": {"found": false,
"applied": false, ...} and ONE needs_manual_review entry on your first question
saying the paper prints no key. Do not solve anything.`;

  return `${base}

═══════════════════════════════════════════════════════════════════
ADDENDUM — THIS RUN IS ONE SLICE OF A PARALLEL IMPORT
(everything below overrides anything above it that disagrees)
═══════════════════════════════════════════════════════════════════

This PDF is being converted by ${opts.shardCount} workers at once. You are
worker ${opts.shardIndex + 1} of ${opts.shardCount}. Another worker is
handling every question that is not listed here, so a question outside your
range is NOT missing — it is somebody else's, and emitting it wastes your
output budget and risks a duplicate.

EMIT EXACTLY AND ONLY THESE QUESTIONS:
${sliceLines(opts.slices)}

  • Use the PRINTED question number to decide what is yours. If the paper
    restarts numbering in each section, "31 to 60" means the questions printed
    31 to 60 INSIDE that named section.
  • Your "sections" array contains ONLY the sections named above, in the order
    given, and each one holds ONLY its listed range, in printed order.
  • Emit every question in your range, including ones that need a PLACEHOLDER.
    A number that is simply not printed in the paper is not a gap you fix —
    note it once in needs_manual_review and move on.
  • Do NOT emit a section you were not given, even if the paper has one.
  • Do NOT summarise, and do NOT mention the split anywhere in the JSON.

${keyBlock}

_extraction_summary IS ABOUT YOUR SLICE:
  • "total_in_pdf": ${opts.totalQuestions ?? "<the whole paper's count, as you see it>"}  (the WHOLE paper — use this number)
  • "extracted": how many questions YOU emitted, placeholders included.
  • "skipped" and "needs_manual_review": yours only. Never log a question
    outside your range as skipped — it is not missing, it is another worker's.
  • The reconciliation in PASS 4 is over YOUR questions:
    answered + left_null + placeholders === extracted.

marks_config: emit it as usual from what the paper prints. Every worker reports
the same paper, so agreeing is expected.

The output contract is unchanged: a single JSON object between
<<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>, emitted once, with nothing after
the closing delimiter.`;
}

/**
 * The full extraction prompt scoped to a PAGE RANGE of the paper: the worker
 * is handed a small PDF holding only its pages (plus one page of context) and
 * emits every question that begins on the pages it owns.
 *
 * Why pages and not question numbers: a worker given the whole PDF has to read
 * the whole PDF, and on the live engine that alone can outrun the platform's
 * clock. A worker given five pages cannot. The answer key and the section
 * ranges come from the index pass, which read only the key pages — so this
 * worker never needs to see any page but its own.
 */
export function buildPageShardPrompt(opts: {
  language: string;
  sectionNames: string[];
  pages: { from: number; to: number; ctxTo: number; total: number };
  answerKeyJson: string | null;
  /** Printed question-number range per section, from the key, when known — with the pages the index pass saw them on. */
  sectionRanges: { name: string; from: number; to: number; firstPage?: number | null; lastPage?: number | null }[] | null;
  /** The pages the index pass actually read; its section list covers only sections that appear there. */
  indexedPages?: { from: number; to: number } | null;
  totalQuestions: number | null;
  shardIndex: number;
  shardCount: number;
}): string {
  const base = fillExtractionPromptContext(
    { language: opts.language, sectionNames: opts.sectionNames },
    EXTRACTION_PROMPT
  );
  const p = opts.pages;
  const context = p.ctxTo > p.to ? ` Attached page ${p.ctxTo - p.from + 1} (paper page ${p.ctxTo}) is CONTEXT ONLY: it is there so a question that starts on page ${p.to} and continues onto page ${p.ctxTo} can be read whole. A question that BEGINS on page ${p.ctxTo} belongs to another worker — do not emit it.` : "";
  // The index pass read only some pages, so its section list is PARTIAL: a
  // section whose pages it never saw is simply absent. Telling a worker to file
  // questions by printed number against a partial list is how twenty-two
  // Mathematics questions numbered 1–22 were filed under "CHEMISTRY 1–24" and
  // then thrown away as duplicates of the real chemistry questions. Ranges are
  // therefore scoped to the pages they were read from; everything else is
  // named from the page itself.
  const ip = opts.indexedPages;
  const rangeLines = (opts.sectionRanges ?? []).map((r) => {
    const where =
      r.firstPage && r.lastPage
        ? ` (its questions are on paper pages ${r.firstPage}–${r.lastPage})`
        : ip
          ? ` (seen on pages ${ip.from}–${ip.to}; its own pages are not known)`
          : "";
    return `  • "${r.name}": printed question numbers ${r.from} to ${r.to}${where}`;
  });
  const partial = ip && (ip.from > 1 || ip.to < p.total);
  const ranges = rangeLines.length
    ? `
SECTIONS THE INDEX PASS COULD SEE${partial ? ` — IT READ ONLY PAGES ${ip!.from}–${ip!.to}, SO THIS LIST MAY BE INCOMPLETE` : ""}:
${rangeLines.join("\n")}
${
        partial
          ? `Numbering in this paper may restart in every section, so a printed number
alone does NOT identify a section. Use a range above ONLY for a question that
sits on that section's pages${ip ? ` (or, when its pages are unknown, on pages ${ip.from}–${ip.to})` : ""}.
A question on any other page belongs to a section that is NOT in this list —
name it from the heading on your pages or, failing that, from its content
using my EXACT section names above (a mathematics question in a paper whose
sections include Mathematics belongs to Mathematics). Never file a question
under a listed section just because its number fits the range.`
          : `Put each question in the section its PRINTED NUMBER falls in, even if the
section heading is not on your pages.`
      }`
    : `
Your pages may not include a section heading. Name each question's section
from my list above by the paper's order and content (a physics question in a
paper whose first section is Physics belongs to it). Use my EXACT names.`;

  const keyBlock = opts.answerKeyJson
    ? `THE ANSWER KEY IS ALREADY TRANSCRIBED. A first pass over the key pages of
this same paper wrote it down. Here it is:

${opts.answerKeyJson}

USE IT AS GIVEN for every question that has a token here. Copy this object
into _extraction_summary.answer_key UNCHANGED, and do PASS 3 exactly as
written: for each of your questions, correct_answer = LABEL → INDEX of its
token in this transcript. "answered" and "left_null" count YOUR questions.

THE TRANSCRIPT WAS READ FROM THE LAST PAGES ONLY, so it may have no token for
a question on YOUR pages. In that case — and only then — look on YOUR OWN
pages: a solutions booklet prints the answer beside each question ("Ans.",
"Answer:", a boxed option, a marked option), and a key box or table may sit on
your pages too. If the answer to one of your questions is PRINTED on your
pages, read it exactly as PASS 1–3 of "HOW TO WORK" describe and use it. If it
is not printed anywhere on your pages, "correct_answer": null and a
needs_manual_review entry starting "answer key — ". A "?" token or a token
that matches none of the options you transcribed is also null with a note.
Never solve a question yourself, and never supply an answer from memory.`
    : `NO ANSWER KEY IS AVAILABLE for this run. Emit the questions with
"correct_answer": null throughout, "answer_key": {"found": false,
"applied": false, ...} and ONE needs_manual_review entry on your first
question saying the key could not be read. Do not solve anything.`;

  return `${base}

═══════════════════════════════════════════════════════════════════
ADDENDUM — THIS RUN IS ONE PAGE RANGE OF A PARALLEL IMPORT
(everything below overrides anything above it that disagrees)
═══════════════════════════════════════════════════════════════════

THE ATTACHED PDF IS NOT THE WHOLE PAPER. It is pages ${p.from} to ${p.ctxTo} of
a ${p.total}-page paper — attached page 1 is paper page ${p.from}.${context}

${opts.shardCount} workers are converting this paper at once; you are worker
${opts.shardIndex + 1} of ${opts.shardCount}. Every other page is somebody
else's, so a question that is not on your pages is NOT missing.

EMIT EXACTLY AND ONLY the questions whose statement BEGINS on paper pages
${p.from} to ${p.to} inclusive, in printed order, with their PRINTED question
numbers. A page that holds only instructions, rough work, an answer key or
solutions has no questions to emit — emit none for it, and never turn a
solution's restatement of a question into a question.

EVERY PAGE NUMBER YOU REPORT — "image_region.page", "skipped[].page",
"needs_manual_review[].page" — is a PAPER page number: attached page n is
paper page ${p.from + 0} + n − 1. Get this right; the figure cutter opens the
real paper at the page you name.
${ranges}

${keyBlock}

_extraction_summary IS ABOUT YOUR PAGES:
  • "total_in_pdf": ${opts.totalQuestions ?? "<the whole paper's count if the key told you, else your own count>"}
  • "extracted": how many questions YOU emitted, placeholders included.
  • "skipped" and "needs_manual_review": yours only.
  • PASS 4 reconciles YOUR questions: answered + left_null + placeholders === extracted.

marks_config: emit it as usual from what the paper prints, if your pages print it.

The output contract is unchanged: a single JSON object between
<<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>, emitted once, with nothing after
the closing delimiter. If your pages hold no questions at all, emit the object
with an empty "sections" array.`;
}

/**
 * The unsharded prompt — the exact prompt this function sent before parallel
 * import existed. Kept because the orchestrator falls back to a single
 * whole-paper run whenever planning cannot produce a usable split, and that
 * fallback has to be the behaviour that was already known to work.
 */
export function buildWholePaperPrompt(ctx: { language: string; sectionNames: string[] }): string {
  return fillExtractionPromptContext(
    { language: ctx.language, sectionNames: ctx.sectionNames },
    EXTRACTION_PROMPT
  );
}
