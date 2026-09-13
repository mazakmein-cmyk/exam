/**
 * extractionPrompt.js — THE prompt that turns an exam PDF into MockSetu JSON.
 *
 * Single source of truth. Two consumers:
 *   - src/pages/JsonUploadGuide.tsx shows it to creators who run it in their own
 *     AI and upload the JSON by hand.
 *   - supabase/functions/ai-pdf-import/index.ts sends it to Gemini on the
 *     creator's behalf (the in-app "Import from PDF" flow). Deno imports this
 *     file by relative path, which is why it is plain JS with no aliases.
 *
 * Both flows must produce the same JSON, so neither may carry its own copy.
 * A test guards that (src/__tests__/ai-import-prompt.test.mjs).
 *
 * The prompt ends with a "YOUR CONTEXT" block that a human fills in by hand.
 * fillExtractionPromptContext() fills the same block programmatically.
 *
 * ── Revision 2 (2026-09-13): the answer key ────────────────────────────────
 * Creators reported questions importing with no correct answer marked. The
 * old ANSWERS section was 25 lines, sat 70% of the way through the prompt
 * (after the images chapter), named four key formats without a procedure,
 * and told the model to SKIP a question whose key did not match — which
 * deleted readable questions. Answers now have their own chapter placed
 * BEFORE the rules, and the model must:
 *
 *   1. read the whole PDF, last pages first, because keys live at the end;
 *   2. transcribe the key verbatim into _extraction_summary.answer_key,
 *      which is emitted BEFORE sections — so the key is written down before
 *      the first question and the model reads its own transcript instead of
 *      recalling a page it saw once;
 *   3. join by (section, printed q_no) and convert LABEL → INDEX, the
 *      off-by-one trap being a "(3)" key on zero-based options;
 *   4. never skip a question over its answer, and justify every null with a
 *      needs_manual_review reason starting "answer key — " (the import
 *      dialog renders those, so the creator sees which answers to finish).
 *
 * Two "STOP and ask me" instructions were removed: the in-app flow has no
 * human to answer and a reply without the JSON block is a failed job.
 *
 * answer_key rides inside _extraction_summary, which jsonImportParser.ts
 * stores as an opaque pass-through — no parser change was needed for it.
 */

/** Schema version the prompt emits; the parser rejects anything else. */
export const EXTRACTION_PROMPT_VERSION = "1.0";

export const EXTRACTION_PROMPT = String.raw`You are converting an exam paper (PDF or scanned document) into a strict
JSON object that will be uploaded into MockSetu's exam builder.

Your job is ONLY to CONVERT what exists in the source — never to invent.

TRANSCRIBING IS NOT INVENTING. An answer the PDF prints — a key grid,
an inline "Ans.(b)", a solution that ends "Hence option (3)" — is
source content, and you MUST carry it across for EVERY question.
SOLVING a question to find its answer, or answering it from your own
knowledge, IS inventing — never do that, however obvious the answer
looks. A silently wrong answer is worse than no answer at all.

If something is not in the document, leave it null or omit it. If you
genuinely cannot read a question's STEM, skip that question and log
it. An answer you cannot read or cannot match is NEVER a reason to
skip a question: the question stays, with "correct_answer": null and
a reason in _extraction_summary.needs_manual_review.

YOU MAY BE RUN UNATTENDED, by an automated pipeline with no human
reading your reply. Never ask a question, never refuse, never answer
in prose: a reply without the JSON block below is a failed job that
nobody is there to rescue. Every doubt belongs in
_extraction_summary.needs_manual_review.


═══════════════════════════════════════════════════════════════════
OUTPUT CONTRACT
═══════════════════════════════════════════════════════════════════

Emit a SINGLE JSON object, wrapped between these literal delimiters
with NOTHING else before, after, or between them:

<<<EXAM_JSON_START>>>
{ ... the JSON ... }
<<<EXAM_JSON_END>>>

No prose. No code fences. No "Here is the JSON:" preamble. No
explanation after the closing brace. The delimiters MUST appear
verbatim — they are how the parser locates the JSON.

Emit the JSON exactly ONCE. The last characters of your reply are
<<<EXAM_JSON_END>>> — never a corrected second copy, never a
self-check list, never a summary of what you did.


═══════════════════════════════════════════════════════════════════
HOW TO WORK — four passes, in this order
═══════════════════════════════════════════════════════════════════

PASS 1 — READ THE WHOLE PDF, LAST PAGES FIRST.
  Before you write anything, open every page. Exam papers print the
  answer key at the END — after the questions, after the "Space for
  Rough Work" pages, inside a Solutions booklet, occasionally on
  page 2. Note four things:
  • WHERE THE KEY IS. A page headed ANSWER KEY / ANSWERS / KEY /
    SOLUTIONS / HINTS & SOLUTIONS / MARKING SCHEME / FINAL ANSWER
    KEY / उत्तर कुंजी / उत्तरमाला / उत्तर तालिका / हल; a bare grid of
    numbers and letters with no heading at all; "Ans." lines under
    the questions; solution items like "S12. Ans.(c)"; one bold or
    ticked option per question in a scan.
  • THIS PAPER'S SET, printed on the cover or the running header:
    "Test Booklet Series C", "SET-B", "Booklet Code Q4", "Paper
    Code 3", "Shift 2", "प्रश्न-पुस्तिका श्रृंखला ग".
  • THE SECTIONS, and whether question numbering RESTARTS in each
    one (Physics 1-30, Chemistry 1-30, Maths 1-30) or runs 1..N.
  • WHETHER THE FILE HOLDS MORE THAN ONE PAPER — that means two
    different question SETS (two shifts, two dates, Paper-1 plus
    Paper-2). A Solutions / Hints & Solutions / Answer Key booklet
    bound after the questions is NOT a second paper: it is THIS
    paper's key, even when it restates the questions and starts
    again at 1 behind its own cover page. When in doubt, treat it
    as the key.

PASS 2 — WRITE THE KEY DOWN, in _extraction_summary.answer_key.
  Copy every entry AS PRINTED — "3", "(b)", "AC", "7.00", "Bonus" —
  paired with the question number printed beside it. Convert
  nothing yet. _extraction_summary is emitted BEFORE the sections
  array, so your own transcript sits in front of you while you write
  the questions: you never have to recall a page you read once.

PASS 3 — EMIT THE QUESTIONS.
  Options in printed-label order, labels stripped, every printed
  option present. Then, for each question,
    correct_answer = LABEL → INDEX of its token in YOUR transcript.
  Never from memory of the key page, never from the working inside a
  solution, never by solving. No usable entry → "correct_answer":
  null PLUS a needs_manual_review reason starting "answer key — ".

PASS 4 — RECONCILE, THEN EMIT ONCE.
  answered + left_null + placeholders === extracted. Work the
  SELF-CHECK list as you write, never as a second pass afterwards:
  do not re-emit the JSON, and put nothing after
  <<<EXAM_JSON_END>>>.


═══════════════════════════════════════════════════════════════════
SCHEMA (v1.0) — these are the ONLY recognized fields
═══════════════════════════════════════════════════════════════════

{
  "schema_version": "1.0",
  "language": "en" | "hi",
  "_extraction_summary": {
    "source_pdf": "<file name>",
    "model": "<your model name and version>",
    "total_in_pdf": <integer — total questions you counted in source>,
    "extracted": <integer — questions emitted in sections.questions, including placeholders>,
    "skipped": [
      // Questions you did NOT emit, for one of exactly two reasons: the stem
      // is unreadable (page damaged, OCR illegible), or the question has no
      // version in this pass's language. Never for an answer problem, and
      // never for a v1-unsupported type — those go into sections.questions as
      // placeholders. A whole block left out (a second paper, or sections
      // past the reply size limit) is ONE entry naming its first page.
      { "reason": "<short label>", "page": <int, optional>, "q_no": <int, optional> }
    ],
    "needs_manual_review": [
      // Every placeholder MUST appear here (reason starts "placeholder — …").
      // So MUST every ordinary question left with correct_answer null while
      // answer_key.found is true (reason starts "answer key — "). A problem
      // with the key as a whole is logged ONCE, on the first section's first
      // printed q_no. q_no is always the number PRINTED in the PDF.
      { "section": "<exact section name>", "q_no": <int>, "reason": "<short label>" }
    ],
    "marks_source":  "found_in_pdf" | "not_present",
    "answers_source": "found_in_pdf" | "not_present",
    "answer_key": {
      // REQUIRED, and filled BEFORE you write any question (PASS 2).
      // This is your working copy of the key — see the ANSWER KEY section.
      "found":       true | false,   // a key / inline answers / solutions /
                                     // consistently marked options exist ANYWHERE
      "applied":     true | false,   // false = found but not joinable (set unknown,
                                     // numbering unalignable, key for another paper)
      "format":      "grid" | "inline" | "solutions" | "marked_option" | "value" | "question_id" | "mixed" | "none",
      "pages":       [<1-based pages holding the key or the solutions>],
      "label_style": "1234" | "abcd" | "ABCD" | "roman" | "devanagari" | "value" | "mixed" | "none",
      "numbering":   "continuous" | "restarts_per_section" | "unknown",
      "sets_in_key": ["<every Set / Series / Code / Shift column the key offers; [] if one>"],
      "set_used":    "<the set printed on THIS paper, which you used — or null>",
      "transcript": {
        // One string per section, keyed by the EXACT section name you emit.
        // One token per question, "<printed q_no>:<answer EXACTLY as printed>",
        // single-space separated, no space inside a token, "?" when unreadable.
        // PRINTED LABELS, never indices — "1:3" means the key printed 3, which
        // becomes "2". Keep it plain: no LaTeX, no backslashes, no nesting.
        "<exact section name>": "1:3 2:1 3:(b) 9:AC 21:7.00 30:Bonus 41:?"
      },
      "answered":  <integer — ordinary questions given a real index>,
      "left_null": <integer — ordinary questions left null. Each has its own
                    needs_manual_review entry, EXCEPT when applied is false —
                    then ONE entry covers the whole paper>,
      "note":      "<one short sentence: column used, offset applied, final-over-provisional — or empty>"
    }
  },
  "marks_config": {
    "exam_default": {
      "marks_correct": <positive number>,
      "marks_wrong":   <positive MAGNITUDE — see Rule 7>,
      "marks_skipped": <number, usually 0>,
      "mcq_mode": "partial" | "all_or_nothing",
      "mcq_wrong_penalty": "flat" | "per_option",
      "rounding_strategy": "floor" | "round" | "ceil" | "none"
    }
  },
  "sections": [
    {
      "name": "<EXACT section name from MY exam>",
      "marks_config": { ... section-level override, same shape, OPTIONAL },
      "questions": [
        {
          "q_no": <int — REQUIRED: the question number PRINTED in the PDF. It is
                   how the answer key is joined to the question, and how I find a
                   flagged question in the paper. If the printed number is not a
                   plain integer (21(a), 37(ii), Q.31A) use its integer part here
                   and keep the full printed label at the start of "text". If the
                   paper prints no numbers at all, number sequentially from 1
                   within each section. EMIT THE QUESTIONS IN PRINTED ORDER: the
                   parser numbers them by position, so a list out of order comes
                   out renumbered wrongly — two-column pages whose text layer
                   reads 1, 26, 2, 27 must still be emitted 1, 2, 3>,
          "passage": "<shared passage for RC/case-study clusters — OPTIONAL; see PASSAGES section>",
          "text": "<question stem only when 'passage' is used; otherwise self-contained text>",
          "answer_type": "single" | "multi",
          "options": ["<option 1>", "<option 2>", ...],
          "correct_answer": "<zero-based-index-as-string>" | ["0","2"] | null,
          "marks_config": { ... per-question override, OPTIONAL },
          "image_region": {
            "page": <1-based PDF page>,
            "x_min": <0-1000 normalised>,
            "y_min": <0-1000 normalised>,
            "x_max": <0-1000 normalised>,
            "y_max": <0-1000 normalised>
          }
        }
      ]
    }
  ],
  "image_padding_pct": 5
}

NO OTHER FIELDS ARE RECOGNIZED. The parser silently drops anything
outside this schema. In particular: there is no "explanation" field,
no "image_url" field, no "difficulty" field, no "topic" field, no
"tags" field, and a QUESTION object accepts only q_no, passage, text,
answer_type, options, correct_answer, marks_config and image_region.
Anything that doesn't fit the schema must live INSIDE the "text" field
(or "passage" field) of the question(s) it applies to.

ONE EXCEPTION: "answer_key" inside _extraction_summary IS part of this
schema and is REQUIRED on every run. It is the only place you may
write anything about the key. Never attach a note about an answer to a
question object — it would be dropped without a trace.

Emit the top-level keys in the order shown above — schema_version,
language, _extraction_summary, marks_config, sections,
image_padding_pct — so the key transcript is written before the first
question.


═══════════════════════════════════════════════════════════════════
SECTION NAMES — I provide these to you
═══════════════════════════════════════════════════════════════════

I will tell you the EXACT section names my exam expects, in the
order they appear in my exam. Use those exact strings as each
section's "name" field — character-for-character. Do not paraphrase,
do not change capitalisation, do not translate, do not add or
remove words or punctuation.

If the source PDF's section names differ from mine, map them in this
order: (1) the same name ignoring case, spacing, punctuation and
English/Hindi equivalents ("Quantitative Aptitude" = "संख्यात्मक
अभियोग्यता"); (2) otherwise BY ORDER — the PDF's first section → my
first section, and so on.

If the PDF has MORE sections than my list, emit the surplus under
their EXACT printed PDF names; they are created on import. If it has
FEWER, omit my unused names. If the paper prints NO section headings
at all and my list is empty, emit ONE section named for the paper's
subject ("Mathematics") or, failing that, "Section 1" — never an
empty name, which the parser drops along with its questions. NEVER stop to ask which to drop — there
may be nobody to answer, and a reply without JSON is a failed job.
Record a mapping you were unsure of as ONE entry in
needs_manual_review, on that section's first printed question:

  { "section": "<the name you emitted>", "q_no": <first printed q_no>,
    "reason": "section mapping — PDF has 4 sections, my exam lists 3;
    'General Awareness' emitted under its printed name" }


═══════════════════════════════════════════════════════════════════
ANSWER KEY — find it, transcribe it, join it, convert it
═══════════════════════════════════════════════════════════════════

This is the part creators most often find broken, so treat it as the
main job and not an afterthought. Every rule below exists because a
real paper was imported with missing or wrong answers.

correct_answer is a TRANSCRIPTION of what the PDF prints. Reading a
key is converting — you MUST do it for every question. Solving a
question, or answering it from your own knowledge, is inventing —
NEVER do it, even when the working makes the answer obvious.


─── A. WHERE KEYS LIVE — check all six, in this order ───────────

A1  END-OF-PAPER GRID (JEE / NEET / SSC / coaching papers, official keys)
    Looks like: "Que.  1  2  3  4  5 … 20" above "Ans.  3  1  4  2
    2 … 1", under PHYSICS / CHEMISTRY / MATHEMATICS headings; or
    "Q.No. | Ans." columns, three or four side by side; or a flow
    "1. (3)  2. (1)  3. (4)"; or "1 b 26 d 51 a 76 c".
    DO: pair every answer with the question NUMBER printed beside
    it, never with its position in the text flow. Side-by-side
    columns run DOWN (1, 2, 3 … then 26, 27 …) even though the text
    layer often reads ACROSS ("1.(3) 26.(2) 51.(1) 2.(1) …" is four
    columns interleaved, not a sequence). Read the header row first
    and use ONLY the answer column — "Ans.", "Answer", "Key",
    "Key/Range", "Correct Option"; never "Marks", "Session",
    "Question Type", "Sr. No.", "Page".
    For a "Que." / "Ans." row pair, COUNT BOTH ROWS. If the counts
    differ the row is unreliable: transcribe every entry of that row
    as "?" and log ONE entry "answer key — row length mismatch on
    page 31 (Que row 20 cells, Ans row 19); entries left null".
    A grid with NO question numbers at all: do not assume an order.
    found true, applied false, all null, ONE entry "answer key — grid
    on page 31 has no question numbers; order ambiguous".

    THROUGHOUT THIS CHAPTER, "ONE entry" means ONE object in
    _extraction_summary.needs_manual_review — that list is what the
    creator actually reads. answer_key.note is a different thing: a
    single line recording what you DID (which column, which offset),
    never the place to report a failure.

A2  INLINE AFTER THE QUESTION (banking, SSC, coaching, Hindi books)
    All of these mean "the printed label is the answer":
      Ans.(b) · Ans. (3) · Ans: b · Ans. 3 · Ans. [3] · Ans:- (c) ·
      Answer: (B) · Correct Answer: Option 2 · Correct Option: 3 ·
      Key: c · Key – C · Official Ans. by NTA (3) · उत्तर (ग) ·
      उत्तर : 3 · उत्तर – ख · सही विकल्प (2) · सही उत्तर (क)
    DO: attach an inline "Ans." to the question whose options
    immediately precede it IN THE SAME COLUMN (two-column pages read
    column 1 top to bottom, then column 2). In a bilingual pair, one
    "Ans." serves both language versions. Strip the marker out of the
    option text: "(e) None of these  Ans.(c)" is an option "None of
    these" plus a key entry "c".

A3  SOLUTIONS SECTION ("S25. Ans.(d)", "Sol.", "Hints & Solutions", "हल")
    DO: the answer is ONLY an explicit final statement of an OPTION —
    "Ans.(d)", "Ans. (2)", "Hence option (3)", "∴ (B)", "Correct
    option: (C)", "So the correct answer is (c)", a boxed final
    label, "अतः विकल्प (ग) सही है". A number inside the working
    ("x = 3", "v = 10 m/s", "∴ 24 cm²") is a VALUE, not a label:
    never index it, and never compare it with the options to decide
    — that is solving. Working that never names an option → null +
    "answer key — solution shows working but never names the option".
    "S1. Ans.(b) S2. Ans.(e) S3. Ans.(a)" listed above one shared
    solution is THREE key entries. A question restated inside the
    solutions is the SAME question: emit it once, stem and options
    from the question pages, answer from the key; count it once.

A4  MARKED OPTION (scans: bold / ✓ / shaded / underlined / circled)
    DO: usable ONLY when exactly one option per question carries the
    mark, the mark is TYPESET, and the convention holds across the
    whole paper. Then format "marked_option" and ONE entry per
    section "answer key — read from bold/ticked options; spot-check
    three questions". Pen ticks, pencil circles, filled OMR bubbles
    and candidate shading are a CANDIDATE'S answers — never a key.
    Every option bold, or some questions with two marks or none →
    not a key; found false.

A5  KEY GIVES A VALUE OR TEXT, NOT A LABEL
    "Ans. 45%", "Ans: Paris", "The correct answer is 1932.",
    "Option 3 : 45%", "1. (b) Mitochondria", "उत्तर – 1932".
    DO: label_style "value". Compare the printed value with each
    option ignoring spaces, commas, currency symbols, trailing
    punctuation and LaTeX-vs-plain; units must match ("2 m/s" is not
    "2 m/s²"). Exactly ONE option matches → that index. Zero or
    several → null + "answer key — gives value '45%' with no unique
    matching option". Never pick the closest option, never compute
    the value yourself. A label AND a value printed together → the
    LABEL decides; if the value is not that option's text → null +
    "answer key — label (c) and value '7.5 m/s' point at different
    options". A bare letter or digit is ALWAYS a label, even when the
    options are themselves letters (sentence-error questions).
    Decide label-versus-value ONCE for the whole key: entries that
    are all bracketed, or all within 1..options.length, are labels.

A6  NTA QUESTION-ID KEYS AND CANDIDATE RESPONSE SHEETS
    Official key: "Sr.No. | Question ID | Correct Option ID(s)" with
    rows like "1 | 5694151234 | 56941512345". The paper prints under
    each question "Question ID : 5694151234 / Option 1 ID :
    56941512342 … Option 4 ID : 56941512345".
    DO: the correct option is the "Option N ID" whose value EQUALS
    the Correct Option ID; N is the printed label → convert it. The
    last digit of an ID is NOT the option number.
    "Chosen Option", "Status : Answered / Not Answered", "Marked For
    Review", "Your Answer", "Attempted" are the CANDIDATE'S
    responses — NEVER the key, even when they look right. Note also
    that "Ans" printed as a column heading above option 1 of EVERY
    question does not say "the answer is option 1".
    Only a response sheet and no key → found false, answers_source
    "not_present", all null, ONE note "answer key — file is a
    candidate response sheet, not a key". IDs in the key but not on
    the paper → applied false, all null, ONE note "answer key — uses
    Question IDs not printed on the paper; not joinable".

A KEY PRINTED AS A PICTURE IS STILL A KEY. Scanned pages,
screenshots pasted onto the last page, and landscape grids rotated
inside a portrait PDF all count — read them from the page image the
way you read a diagram. Only when the glyphs are genuinely
unreadable do the entries become "?".

NOT A KEY, EVER: a candidate's marked responses; a worked value in a
solution; the options' own labels; a "Marks" or "Question ID" column;
your own calculation.


─── B. SETS, SERIES, CODES, SHIFTS — never take column 1 ────────

A key with one column or block per set — "Q.No. | Set A | Set B |
Set C | Set D", "Series A/B/C/D", "Code E1 / F1 / G1 / H1", "Shift 1
| Shift 2", "प्रश्न-पुस्तिका श्रृंखला क/ख/ग/घ" — has DIFFERENT columns
because the question ORDER differs per booklet. Using the wrong
column marks a wrong answer on nearly every question.

  • Read THIS paper's set from its cover, running header or OMR
    instructions → set_used. List every column in sets_in_key. Use
    ONLY that column. Keys that also remap question numbers per code
    ("Q.No. P1 | Ans | Q.No. Q1 | Ans") → read the q_no column of
    set_used, never the leftmost.
  • The set is not printed, is unreadable, or is not among the key's
    columns → NEVER default to the first column. applied false,
    set_used null, transcript {}, EVERY correct_answer null, and ONE
    note: "answer key — lists sets A, B, C, D but the paper's set is
    not printed; pick the column manually; all answers left null".
  • A single-column key headed with a set that differs from the
    paper's → same treatment: "answer key — is for set A but the
    paper is set C; not applied".
  • Never permute answers yourself with a set-to-set mapping table.
  • One column and no set printed on the paper → single-set paper.
    Apply it.

TWO KEYS, TWO SOURCES, REVISIONS
  • Provisional AND Final / Revised / "after challenge" → use FINAL;
    say so in note.
  • "Official Ans. by NTA (2)" AND an institute's "(3)" → official.
  • A key table AND per-question "Sol." blocks → the TABLE is
    authoritative. A "Sol." that contradicts it → null + "answer key
    — two sources disagree: table (2), solution (3)". Same for an
    inline "Ans." that contradicts the grid.
  • Never average, never take the later one, never solve to break a
    tie. format "mixed" whenever more than one source exists.
  • A key whose own header names a DIFFERENT paper than the cover
    (22 Jan Shift 2 key on a 22 Jan Shift 1 paper) → do not join:
    applied false, all null, ONE note naming both.
  • The file holds MORE THAN ONE paper (two question SETS, not a
    solutions booklet) → extract the FIRST paper and ITS key only,
    and add ONE entry to skipped { "reason": "second paper in the
    same PDF not imported (Shift 2, pages 31-58); split the PDF",
    "page": 31 }. The second paper's questions are NOT part of
    total_in_pdf — count only the paper you extracted, so
    total_in_pdf === extracted + skipped.length still holds. Do not
    stop, do not ask.

THE KEY IS LANGUAGE-NEUTRAL. The language rule restricts question,
option and passage TEXT only. A "hi" pass uses an English-only
"ANSWER KEY" page or "S31. Ans.(c)" solutions; an "en" pass uses
"उत्तर कुंजी" / "उत्तर (ग)". Labels are positional: (b) = (B) = (2) =
(ii) = (ख) = (ब) = (२) → "1". answer_key.transcript must be identical
on the "en" and "hi" passes of the same PDF. Never leave an answer
null because the key is printed in the other language.


─── C. TRANSCRIBE — filling answer_key.transcript ───────────────

Write the transcript BEFORE any question, inline keys included.

  • One string per section you emit, keyed by the name YOU emit —
    not by the key page's own heading. Key pages use their own
    vocabulary ("Part A", "BOTANY / ZOOLOGY", "SECTION-I", or no
    heading at all); map each block to the section whose questions
    it numbers, and merge two key blocks into one string when they
    both feed one of my sections.
  • Tokens are "<printed q_no>:<answer AS PRINTED>", single-space
    separated, and a token NEVER contains a space:
    "1:3 2:1 3:(b) 9:AC 21:7.00 30:Bonus 41:?". If the printed entry
    is more than one word ("Marks to all", "4.0 to 4.2"), shorten it
    to one word in the token (30:Bonus, 21:4.0-4.2) and put the full
    printed wording in the question's review reason.
  • Do NOT convert here. "1:3" means the key printed 3.
  • "?" for an entry you cannot read or that is missing.
  • Keep it small and plain — 90 questions is about 1 KB. No LaTeX,
    no backslashes, no nested objects. Your reply has a hard output
    limit and a reply cut off in the middle is a failed job.
  • After transcribing a section, check that every printed question
    number appears EXACTLY once. A duplicate or a gap means you
    mis-paired a grid — re-read that block before going on.


─── D. JOIN — which entry belongs to which question ─────────────

  • Match by (section, PRINTED q_no). Never by your emitted
    position, never by how many questions you have written so far —
    skipping the other language's questions must not shift the key.
  • numbering "restarts_per_section": Chemistry Q5 comes from the
    CHEMISTRY block. Unheaded blocks that each restart at 1 follow
    the paper's section order.
  • WHEN THE TWO NUMBERINGS DISAGREE, shift in the right direction.
    Let EARLIER = the number of questions in all sections before
    this one.
      – Key runs 1..N continuously, paper RESTARTS per section:
        key entry = printed q_no + EARLIER.
        (Paper's Chemistry Q5, 30 Physics questions before it →
         key entry 35.)
      – Key RESTARTS per section, paper runs 1..N continuously:
        key entry = printed q_no − EARLIER.
        (Paper's Chemistry Q35, 30 Physics questions before it →
         the CHEMISTRY block's entry 5.)
    Sanity-check before you use either: the shifted number must
    land inside that block's range. Do this ONLY when the key's
    entry count equals the paper's question count. Otherwise leave
    those sections null with ONE entry "answer key — numbered 1-90
    continuously but the paper restarts per section and the counts
    differ (paper 75); could not align". Solutions numbered S1…S100
    on a paper that restarts follow cumulative position.
  • Section-A / Section-B inside one subject: Section B may restart
    at 1 in the paper while the key runs 21-30. Map accordingly and
    say so in note.
  • Key has MORE entries than the paper (the PDF is one subject of a
    bigger paper) → join where section and printed q_no agree; ONE
    note "answer key — has 90 entries, paper has 30; joined by
    printed q_no; verify". Key has FEWER (cut off) → join what is
    there, null the rest, ONE note "answer key — covers Q1-50 only;
    Q51-100 left null".
  • A section the key has no entries for at all → ONE note on its
    first printed q_no: "answer key — no entries for section
    Mathematics".
  • Entries labelled Sample / Example / Specimen / Practice are not
    this paper.


─── E. CONVERT — LABEL → INDEX (the only arithmetic you do) ─────

  index = printed position − 1.

    1st   (1) 1. (a) a (A) (i)   (क) (अ) (१) Option 1  →  "0"
    2nd   (2) 2. (b) b (B) (ii)  (ख) (ब) (२) Option 2  →  "1"
    3rd   (3) 3. (c) c (C) (iii) (ग) (स) (३) Option 3  →  "2"
    4th   (4) 4. (d) d (D) (iv)  (घ) (द) (४) Option 4  →  "3"
    5th   (5) 5. (e) e (E) (v)   (ङ)     (५) Option 5  →  "4"

  A PRINTED DIGIT IS A LABEL, NEVER AN INDEX. This is the single
  most common way an import goes wrong, because JEE Main, NEET,
  RRB, CTET and CUET keys all print "(3)" for the THIRD option:

    WRONG:   key "(3)"  →  "correct_answer": "3"
    RIGHT:   key "(3)"  →  "correct_answer": "2"
    WRONG:   key "4"    →  "correct_answer": "4"
    RIGHT:   key "4"    →  "correct_answer": "3"

  Map by POSITION even when the key's label style differs from the
  options' — a key "Ans.(d)" on options printed 1-5 is still "3".
  Never search the options for the literal text of the label.

  MULTI-CORRECT KEYS "AC" / "A, C" / "(A),(C)" / "1,3" / "BD" →
  split into every label → ["0","2"], ascending. A multi question
  whose key names ONE option is still "multi" with ["1"] — never pad
  it to two.

  correct_answer MAY BE ONLY: a digit string from "0" to
  options.length-1 on a "single" question, an array of such strings
  on a "multi" question, or null. Index = printed position − 1,
  however many options the paper prints — a six-option question can
  be answered "5".

  NEVER a letter, "(c)", "C", "Option 3", option text, "Bonus",
  "-", "N/A", an array on a "single" question, a plain string on a
  "multi" question, or an index ≥ options.length. On any of those
  the parser DELETES the whole question — it never reaches the
  creator at all. Never write "" either: a blank means "not marked",
  so it throws the answer away. When unsure, null keeps the
  question; a bad value loses it.


─── F. WHEN THE KEY DOES NOT FIT — never skip, never guess ──────

Emit the question with "correct_answer": null AND one entry in
needs_manual_review { "section", "q_no": <printed>, "reason" }.
Quote the printed value in the reason so I can fix it without
reopening the PDF. Use these reason strings:

  no entry for this printed number
    "answer key — no entry for printed Q17"
  a label beyond the last option (re-read first: banking papers
  print FIVE options and "(e) None of these" often sits on the next
  line, column or page — find it and add it)
    "answer key — entry '(e)' but only 4 options printed"
  an entry that is not a printed label at all ("7" on a 4-option MCQ)
    "answer key — entry '7' is not a printed label; possible grid
    misalignment"
  Bonus / Dropped / Deleted / Cancelled / Withdrawn / MTA / Marks to
  all / All correct / * / रद्द / बोनस
    "answer key — marks this question Bonus/Dropped ('*')"
  two labels on a single-answer question ("(1) or (3)", "a/c", "b & d")
    "answer key — accepts more than one option ('(1) or (3)')"
  a value with no unique matching option
    "answer key — gives value '45%' with no unique matching option"
  a label and a value that disagree
    "answer key — label (c) and value '7.5 m/s' point at different
    options"
  two sources that disagree
    "answer key — two sources disagree: table (2), solution (3)"
  a solution that never names an option
    "answer key — solution shows working but never names the option"
  an illegible glyph in a scan
    "answer key — entry illegible in scan (b or d)"
  a footnote mark on an entry ("3*", "(2)†") — use the label AND log
    "answer key — footnote mark on entry ('3*'); check the revised key"
  you believe the printed key is wrong — emit the PRINTED key AND log
    "answer key — printed (b) disagrees with the solution's working;
    verify"
  the set is unknown, the numbering cannot be aligned, IDs are not
  printed, the grid has no numbers, or the key is for another paper
    → one paper-level note, exact strings in sections A and B above

A readable stem NEVER goes into _extraction_summary.skipped because
of its answer. skipped is for a stem you cannot read, or a question
that does not exist in the language of this pass — never for an
answer problem.

PLACEHOLDERS (numeric / TITA / match / true-false): correct_answer
stays null EVEN WHEN the key prints a value — "1" or "2" would be in
range for the two sentinel options and would silently tick one.
Carry the printed value in the reason instead:
  "placeholder — numeric/TITA unsupported in v1 (key: 7.00)"
  "placeholder — sequence-input unsupported in v1 (key: 4123)"
  "placeholder — match unsupported in v1 (key: A-PS, B-Q, C-PR)"


─── G. COVERAGE — every null must be explained ──────────────────

answers_source is "not_present" ONLY when the whole PDF has no key,
no inline answers, no solutions and no consistently marked options.
Then every correct_answer is null, no per-question reasons are
needed, and answer_key is exactly this — an EMPTY transcript, never
a transcript of "1:? 2:? …":

  "answer_key": {
    "found": false, "applied": false, "format": "none", "pages": [],
    "label_style": "none", "numbering": "unknown", "sets_in_key": [],
    "set_used": null, "transcript": {}, "answered": 0,
    "left_null": <count of ordinary questions>,
    "note": "no answer key, solutions or marked options in this PDF"
  }

Otherwise answers_source is "found_in_pdf" and EVERY ordinary
question left null carries its own "answer key — " entry.

THE ONE EXCEPTION — a PAPER-LEVEL failure: the paper's set is not
printed, the grid has no question numbers, the numbering cannot be
aligned, the key belongs to another paper, or the file is a
candidate response sheet. There, applied is false, transcript is {},
EVERY correct_answer is null, and you log ONE entry for the whole
paper on the first section's first printed q_no — NOT one entry per
question. Ninety identical entries help nobody, and inventing
answers to avoid writing them is far worse.

Fill answer_key.answered and answer_key.left_null by counting your
own transcript before you start writing questions — "ordinary"
means not a placeholder:

  answered + left_null + placeholders === extracted

These two numbers are a report on your work, not a target. If what
you emit ends up disagreeing with them, THE QUESTIONS ARE RIGHT:
never put an index on a question to make a count balance, and never
drop a question either. A null with no reason, on a paper whose key
applied, means you have not finished reading the key.


─── H. WORKED EXAMPLES — the joins that go wrong ────────────────

K1 — the off-by-one trap. Page 31 prints
       "ANSWER KEY   MATHEMATICS
        Que.  1  2  3  4  5
        Ans.  2  4  1  3  2"
     Q2's options are printed "(1) 12  (2) 15  (3) 18  (4) 21".
     transcript: { "Mathematics": "1:2 2:4 3:1 4:3 5:2" }
     Q2 → "options": ["12","15","18","21"], "correct_answer": "3"
     Q3 → "correct_answer": "0"   (key 1 = FIRST option, not "1")

K2 — the fifth option. Banking solutions print "S17. Ans.(e)". Q17
     shows (a)-(d) on one line and "(e) None of these" on the next.
     RIGHT: ["225","135","196","180","None of these"] with "4"
     WRONG: four options with "4" — out of range, question deleted

K3 — per-subject numbering. The paper numbers 1-90 (Physics 1-30,
     Chemistry 31-60, Maths 61-90) but the key is three blocks each
     starting at 1. numbering "restarts_per_section"; Chemistry's
     printed Q31 is the CHEMISTRY block's entry 1.
     transcript: { "Physics": "1:3 2:1 …", "Chemistry": "31:2 32:4 …" }
     — tokens keyed by the PRINTED number, values from the right block.

K4 — a set column. The cover says "Test Booklet Series : C"; the key
     has columns Set A | Set B | Set C | Set D. sets_in_key
     ["A","B","C","D"], set_used "C", and every entry comes from the
     Set C column. If the cover showed no series at all: applied
     false, transcript {}, all answers null, one note.

K5 — multi-correct. A JEE Advanced section whose instruction says
     ONE OR MORE may be correct; the key prints "Ans. (A), (C)".
     "answer_type": "multi", "correct_answer": ["0","2"].
     The same section, key "Ans. (B)" → still "multi", ["1"].

K6 — Bonus and numeric together. The key reads "… 12:Bonus …
     21:7.00 …". Q12 is an ordinary MCQ: emit its real options,
     "correct_answer": null, and
       { "section": "Physics", "q_no": 12,
         "reason": "answer key — marks this question Bonus/Dropped" }
     Q21 is numeric: emit the placeholder, "correct_answer": null,
       { "section": "Physics", "q_no": 21,
         "reason": "placeholder — numeric/TITA unsupported in v1 (key: 7.00)" }


═══════════════════════════════════════════════════════════════════
RULES — non-negotiable
═══════════════════════════════════════════════════════════════════

1. CONVERT, NEVER INVENT — AND TRANSCRIBING IS NOT INVENTING.
   • Reading an answer the PDF STATES — a key grid, an inline
     "Ans.(b)", a solution's "Hence option (3)", a consistently
     ticked option — is transcription, and you MUST do it for every
     question (see the ANSWER KEY section). Solving the question, or
     answering from your own knowledge, is invention — never do it.
   • "correct_answer": null is allowed only when the PDF states no
     answer for that question ANYWHERE — you checked the last pages,
     the solutions, and the text beside the question. When the paper
     HAS a key, every null on an ordinary question carries a
     needs_manual_review reason starting "answer key — ".
   • No marks scheme in the PDF → omit "marks_config" entirely.
     Do not guess based on the exam name.
   • Question STEM damaged / unreadable → skip; append to
     _extraction_summary.skipped with a short reason. A problem with
     the ANSWER is never a reason to skip a readable question.

2. answer_type is EXCLUSIVELY "single" or "multi".
   single = exactly one correct option (regular MCQ).
   multi  = the SECTION INSTRUCTION says one or more options may be
            correct ("ONE OR MORE THAN ONE of these four options
            is(are) correct", "Multiple Select Question (MSQ)",
            "एक या एक से अधिक विकल्प सही"). The instruction decides the
            type, NOT the key: a multi question whose key names one
            option is still "multi" with a one-element array ["1"],
            and a single question whose key names two options stays
            "single" with null plus an "answer key — " reason.

   These input types CANNOT be encoded directly in v1:

     • True / False with only 2 options
     • Numeric / TITA / type-in-the-answer
     • Fill in the blank (no options listed)
     • Short answer / descriptive / essay
     • Para-jumble keyed by sequence (e.g. CAT "key in 4123" with no options)
     • Pure match-the-following with no pre-synthesized MCQ options

   DO NOT drop these into _extraction_summary.skipped. Instead,
   emit each one as a PLACEHOLDER MCQ at the same q_no, preserving
   the passage / question text / image_region — see the
   PRESERVE QUESTION NUMBERING section below. This keeps q_no
   slots aligned 1:1 with the PDF so the creator can cross-
   reference and finish them manually after import.

   IMPORTANT: A question that LOOKS like one of these but has been
   PRE-CONVERTED to MCQ in the PDF — e.g. a column-match question
   whose options are pairings like "A-F, B-E, C-D" — IS supported.
   Convert it like any other single-answer MCQ.

3. correct_answer is a ZERO-BASED INDEX, AS A STRING — and nothing
   else. Convert with the LABEL → INDEX table in the ANSWER KEY
   section.
   • "single" → one digit string. Option B in ["A","B","C","D"] → "1".
   • "multi"  → an array of digit strings. A and C → ["0","2"].
   • null     → not marked (allowed only with a reason).
   • The PDF's labels (a/b/c/d, A/B/C/D, 1/2/3/4, i/ii/iii/iv,
     क/ख/ग/घ) all map to 0/1/2/3 regardless of the label style. A
     PRINTED DIGIT IS A LABEL: key "(3)" → "2", never "3".
   • FATAL shapes — the parser DELETES the whole question on any of
     them: "b", "(c)", "C", "Option 3", option text, "Bonus", "-",
     an index ≥ options.length, an array on a "single" question, a
     plain string on a "multi" question. And never "" — a blank
     means "not marked" and throws the answer away.

   OPTIONS FOLLOW THE PRINTED LABEL ORDER. options[0] is the option
   labelled (1)/(a)/(A)/(क), options[1] the one labelled (2)/(b)/(B)/
   (ख), and so on — even when a two-column layout reads across as
   (1) (3) (2) (4). Never sort, drop, merge or dedupe them; keep
   "None of these" / "All of the above" / "इनमें से कोई नहीं" at their
   printed position. Emit every option the paper prints — banking
   papers have FIVE. Strip the label out of the text:
     WRONG:  ["(a) 5:9", "(b) 9:5", "(c) 6:5", "(d) 6:7"]
     RIGHT:  ["5:9", "9:5", "6:5", "6:7"]
   (sentence-error questions whose options ARE the letters keep
   them.) Never emit "" or null as an option — the parser strips
   empty slots and every later index would shift by one.

4. ONE BAD QUESTION DOES NOT HALT THE BATCH — carry on to the next.
   The bar for _extraction_summary.skipped is HIGH: it is only for a
   question whose STEM you cannot read (page damaged, OCR illegible)
   or that does not exist in the language of this pass. An ANSWER problem — no
   key entry, a label with no matching option, Bonus / Dropped, an
   illegible key glyph, two sources that disagree — is NEVER a
   reason to skip: emit the question with "correct_answer": null and
   an "answer key — " reason. For unsupported
   answer formats whose stem you CAN read, emit a placeholder
   (see PRESERVE QUESTION NUMBERING) — placeholders go INTO
   sections.questions and INTO needs_manual_review, never into
   skipped.

5. PASSAGES, DIRECTIONS, SHARED SETUPS — see the dedicated section
   below. TL;DR: use the OPTIONAL "passage" field on each question
   in a cluster (preferred — renders two-column), repeating the
   SAME passage on every question of the cluster. Fallback: embed
   inline in "text" with a "Passage:" prefix.

6. MATH & LaTeX — see the dedicated section below. TL;DR: inline
   $…$, display $$…$$. MockSetu renders KaTeX downstream.

7. marks_wrong is a POSITIVE MAGNITUDE. "marks_wrong": 1 means
   a penalty of 1 mark per wrong answer. Never use a signed value.
   The scoring engine applies the sign internally.

8. NO HTML in "text", "options", or "section name". Use plain
   Unicode for em-dashes, smart quotes, arrows (→ ↑ ⇒),
   inequalities (≤ ≥ ≠ ±), Greek (α β π θ), set theory
   (∈ ∉ ⊂ ∪ ∩ ∅), and so on. Use LaTeX in $…$ for structured
   maths (fractions, exponents, integrals, sums).

   EXCEPTION: the "passage" field accepts simple inline HTML —
   <p>, <br>, <em>, <strong>, <ul>, <li>, <blockquote>. The
   parser strips <div> and <script> tags from "passage". Plain
   text is always fine. Do not use HTML for layout (no <table>,
   no <img>); use Markdown-style tables / Unicode arrows like
   in "text".

9. FULL EFFORT, ALWAYS THE JSON. Whatever model you are, do the
   whole job — every page, every question, every key entry — and
   never emit a shortened or degraded JSON. Never refuse, never ask
   me to switch models, never answer in prose: an automated pipeline
   may be reading this, and a reply without the
   <<<EXAM_JSON_START>>> … <<<EXAM_JSON_END>>> block is a failed job.
   Where you are unsure, the honest output is null plus a
   needs_manual_review reason — never a guess. Put your real model
   name in _extraction_summary.model.

10. NEVER USE STRAIGHT QUOTES INSIDE PASSAGE / OPTION TEXT.

    Any book title, essay name, dialogue, or embedded quotation
    that appears INSIDE a JSON string value MUST use Unicode
    curly quotes, NOT ASCII straight quotes:

      WRONG:   "text": "My book "Writing Ocean Worlds" is..."
      RIGHT:   "text": "My book “Writing Ocean Worlds” is..."
      ALSO OK: "text": "My book \"Writing Ocean Worlds\" is..."

    Use “ ” (U+201C, U+201D) for double quotes, ‘ ’ (U+2018,
    U+2019) for single quotes / apostrophes. Reserve ASCII " for
    JSON string delimiters ONLY. Reserve ASCII ' (apostrophe) is
    fine — it doesn't conflict with JSON.

    This is the #1 cause of parse failures with RC passages —
    embedded titles ("Writing Ocean Worlds", "The Affluent
    Society", "Original Affluent Society") are everywhere in
    CAT and banking exam passages. Use curly quotes and the
    problem disappears.

11. EVERY BACKSLASH MUST BE A VALID JSON ESCAPE.

    Valid JSON backslash escapes are EXACTLY these nine:
      \\    \"    \/    \b    \f    \n    \r    \t    \uXXXX

    Anything else is either a parse error or a SILENT bug. In
    particular, EVERY LaTeX command MUST have its backslash
    DOUBLED in the JSON string:

      WRONG:   "$\sqrt{7}$"      ← \s is not a valid escape
      WRONG:   "$\frac{1}{2}$"   ← \f is FORM-FEED, not \frac
      WRONG:   "$\log_2 x$"      ← \l is not a valid escape
      WRONG:   "$\alpha + \beta$"
      RIGHT:   "$\\sqrt{7}$"
      RIGHT:   "$\\frac{1}{2}$"
      RIGHT:   "$\\log_2 x$"
      RIGHT:   "$\\alpha + \\beta$"

    Before emit, scan every string for any \ and confirm what
    follows is one of:  \ " / b f n r t u . If anything else
    follows the \, you forgot to double a LaTeX backslash —
    fix it.

    Watch out: \f silently parses (form-feed). Q21 in CAT-2023
    had two identical option strings because \sqrt collapsed
    after the \s got stripped. Doubling is non-negotiable.

12. OUTPUT MUST BE UTF-8 — NO MOJIBAKE.

    Non-ASCII characters (é, è, à, ñ, ü, —, °, ×, ÷, Devanagari
    script, Greek letters, math symbols) must appear in their
    NATIVE Unicode form. If your output channel mangles them
    into sequences like "Ã¨" "Ã©" "Â°" "â€™" "â€"" "Ã—", that
    is corrupted data — fix it before emitting.

      WRONG:   "Lozère"  written as  "LozÃ¨re"
      WRONG:   "60°"     written as  "60Â°"
      WRONG:   em-dash — written as  "â"
      RIGHT:   native Unicode characters: "Lozère", "60°", "—"

    If your output channel genuinely cannot emit the proper
    character, fall back to a JSON \uXXXX escape sequence (e.g.
    Loz, then backslash-u-0-0-e-8, then re — they parse to the
    same string). NEVER emit mojibake; it is corruption, not
    an alternative form.


═══════════════════════════════════════════════════════════════════
PRESERVE QUESTION NUMBERING — placeholders for unsupported types
═══════════════════════════════════════════════════════════════════

THE PROBLEM this section solves:
If the source PDF has 66 questions and 23 of them are numeric /
TITA / sequence-input (which v1 can't encode as MCQs), dropping
all 23 into _extraction_summary.skipped produces a JSON with only
43 question entries. The creator opens the upload and sees Q5
followed by Q8 — Q6 and Q7 are simply gone. They can no longer
cross-reference against the PDF, and they lose passages /
diagrams that those questions shared with their siblings.

THE FIX — emit a PLACEHOLDER MCQ at the same q_no instead of
dropping the question. The creator finishes the placeholder by
hand after import, but everything else (passage, figure crop,
sibling alignment) is preserved automatically.

RULE — when a question's answer format is v1-unsupported
(numeric, TITA, true/false, fill-in, descriptive, sequence-input,
match, options malformed in PDF) AND you can read its stem, emit
it as a placeholder MCQ inside sections.questions. DO NOT drop it
into skipped. The placeholder shape — copy this exactly:

  {
    "q_no": <SAME q_no as in PDF>,
    "passage": "<FULL verbatim passage if the question is in a
                 shared-context cluster — same string as siblings>",
    "text": "<FULL question stem exactly as in the PDF>",
    "answer_type": "single",
    "options": [
      "[Manual entry needed — unsupported type in v1]",
      "[See PDF Q<q_no> for the actual answer]"
    ],
    "correct_answer": null,
    "image_region": { ... if the question depends on a figure ... }
  }

Use those two sentinel option strings VERBATIM (the parser
detects them and flags the question as "needs manual completion"
in the upload preview). Substitute the real q_no in the second
sentinel — e.g. "[See PDF Q17 for the actual answer]". Do NOT
invent plausible options. Do NOT put the numeric / TITA answer
into a sentinel OR into correct_answer — the creator must type real
options in the MockSetu editor, and a key value of "1" or "2" would
be in range for the two sentinel options and would silently tick
one. If the key DOES print the answer, carry it in the
needs_manual_review reason so the creator need not reopen the PDF:
"placeholder — numeric/TITA unsupported in v1 (key: 7.00)".

ALSO log each placeholder in _extraction_summary.needs_manual_review
with one of these reason strings:

  • "placeholder — numeric/TITA unsupported in v1"
  • "placeholder — sequence-input unsupported in v1"
  • "placeholder — true/false unsupported in v1"
  • "placeholder — fill-in unsupported in v1"
  • "placeholder — descriptive unsupported in v1"
  • "placeholder — match unsupported in v1"
  • "placeholder — options malformed in PDF"

When the key prints an answer for a placeholder, append it in
parentheses exactly as printed — omit the parenthesis when the key
has no entry:

  • "placeholder — numeric/TITA unsupported in v1 (key: 7.00)"
  • "placeholder — numeric/TITA unsupported in v1 (key: 4.0 to 4.2)"
  • "placeholder — sequence-input unsupported in v1 (key: 4123)"
  • "placeholder — true/false unsupported in v1 (key: True)"
  • "placeholder — fill-in unsupported in v1 (key: Ashoka)"
  • "placeholder — match unsupported in v1 (key: A-PS, B-Q, C-PR)"

Each placeholder counts toward "extracted" (it lives in
sections.questions). _extraction_summary.total_in_pdf must equal
the real PDF question count — including placeholders. After this
pass:

  total_in_pdf === extracted + skipped.length

and "skipped" should be EMPTY in almost every case (only damaged /
unreadable stems land there).

SHARED CONTEXT REMINDER:
If the placeholder is part of a passage cluster (e.g. Q6 is a
numeric question that shares the housing-schematic passage with
Q7-Q10), copy the SAME passage string AND the SAME image_region
onto the placeholder. Sibling questions must be indistinguishable
in terms of context. A placeholder without its passage / figure
is useless to the creator — they cannot fill it in without the
shared setup.

EXAMPLE — CAT-2023 Section 02 Q6 (numeric, shares the housing-
schematic passage + figure on page 15 with Q7-Q10):

  {
    "q_no": 6,
    "passage": "The schematic diagram below shows 12 rectangular houses in a housing complex … [FULL passage text including the layout, road adjacency rule, neighbour count rule, pricing formula, and all 4 numbered constraints — IDENTICAL string to the passage on Q7, Q8, Q9, Q10] …",
    "text": "How many houses are vacant in Block XX?",
    "answer_type": "single",
    "options": [
      "[Manual entry needed — unsupported type in v1]",
      "[See PDF Q6 for the actual answer]"
    ],
    "correct_answer": null,
    "image_region": { "page": 15, "x_min": 50, "y_min": 80, "x_max": 950, "y_max": 480 }
  }

And the matching entry in needs_manual_review:

  {
    "section": "Section 02: Data Interpretation and Logical Reasoning",
    "q_no": 6,
    "reason": "placeholder — numeric/TITA unsupported in v1"
  }


═══════════════════════════════════════════════════════════════════
PASSAGES, DIRECTIONS, COMPREHENSIONS, SHARED SETUPS
═══════════════════════════════════════════════════════════════════

Two equivalent ways to attach shared context to a question.
PREFERRED: the optional "passage" field. FALLBACK: inline in
"text" with a "Passage:" prefix. Pick ONE per question — never
both.

═══ PREFERRED — the "passage" field ═══════════════════════════════

Emit a separate "passage" string on each question that depends
on the shared context. The parser wraps it into the existing
manual-flow HTML contract so MockSetu's simulator renders a
clean TWO-COLUMN layout (passage on the left, question + options
on the right).

  {
    "q_no": 1,
    "passage": "[FULL VERBATIM passage here]",
    "text": "[just the question stem — no 'Passage:' prefix]",
    "answer_type": "single",
    "options": [...],
    "correct_answer": "2"
  }

Allowed inside "passage": plain text OR simple inline HTML
(<p>, <br>, <em>, <strong>, <ul>, <li>, <blockquote>). The
parser strips <div> and <script> for safety. Plain text is
totally fine and is what most AIs will produce naturally.

═══ FALLBACK — inline in "text" with prefix ═══════════════════════

Some workflows prefer keeping the question text fully
self-contained inside one field. Embed shared context inside
"text" with a clear marker prefix:

  {
    "text": "Passage:\n\n[FULL VERBATIM passage here]\n\nQuestion: [stem here]",
    ...
  }

Renders as a single column with the literal "Passage:" header
visible. Use this when you don't need the two-column layout
or want to avoid emitting a separate field.

═══ RULES THAT APPLY TO BOTH APPROACHES ═══════════════════════════

The passage MUST be the FULL, VERBATIM text from the source —
not a summary, not an excerpt, not "the passage discusses X".
Every question in a shared-context group repeats the SAME
verbatim passage. A student opening question 8 in isolation
must see the entire passage exactly as a student opening
question 5 sees it. Token cost is NOT a concern; faithfulness
is. Summarising a passage corrupts the question — Q8 might
reference a sentence Q5 had but your summary dropped.

When using the "passage" field, the rule above means: repeat
the SAME passage STRING on each question in the cluster, not
just on Q1. The parser deliberately stores the passage per
question so each row is self-contained at the DB level.

WRONG (token-saving shortcut, AI will be tempted):
  Q1 text: "Passage:\n\n[full 500-word passage]\n\nQuestion: …"
  Q2 text: "Passage: The author discusses X.\n\nQuestion: …"
  Q3 text: "Passage: Continuation of above.\n\nQuestion: …"

RIGHT:
  Q1 text: "Passage:\n\n[full 500-word passage]\n\nQuestion: …"
  Q2 text: "Passage:\n\n[SAME full 500-word passage]\n\nQuestion: …"
  Q3 text: "Passage:\n\n[SAME full 500-word passage]\n\nQuestion: …"

Same rule for Setup:, Data:, Directions: blocks. Repeat in full.

Use exactly these prefixes — "Passage:", "Directions:", "Data:",
"Setup:" — so MockSetu's editor can format them consistently.

═══ PASSAGES THAT REFERENCE OR ARE FIGURES ═══════════════════════

A shared-context cluster's setup takes one of three forms.
Handle each correctly so EVERY question in the cluster carries
the same context — text AND image when applicable, AND on
placeholders too.

  (1) PURE TEXT passage (CAT RC, banking error-spotting):
        → emit "passage" string only. No image_region.

  (2) TEXT PASSAGE THAT REFERENCES A FIGURE
      Phrases that signal this: "the diagram below shows…",
      "the graph below depicts…", "refer to the table on the
      next page", "in the figure above…", "the schematic
      shows…", "based on the chart…".
      The figure is essential — you cannot answer the
      questions from the text alone.
        → emit BOTH:
          • "passage" — FULL TEXT of the surrounding setup.
            Do NOT summarise just because the figure carries
            half the meaning. Transcribe every word the PDF
            shows around the figure (rules, definitions,
            examples, formulas — all of it).
          • "image_region" — on EVERY question in the cluster,
            with the SAME page + same bbox. Even on
            placeholders. The auto-snipper crops it once and
            attaches the same crop to every question.

  (3) IMAGE-ONLY passage (rare):
      The "passage" is itself a chart, schematic, or
      photograph with no usable surrounding text.
        → OMIT the "passage" field. Don't try to transcribe
          a figure into prose.
        → emit "image_region" on each question in the cluster.
        → add ONE entry to needs_manual_review for the cluster:
          { "section": "...", "q_no": <first q_no in cluster>,
            "reason": "passage image required — figure-only cluster" }
          The creator will paste the cropped image manually
          after import.

RULE FOR PLACEHOLDERS IN FIGURE-BEARING CLUSTERS:
A numeric / TITA placeholder that sits in a DI set MUST carry
the same image_region as its sibling MCQs. Skipping image_region
on the placeholder defeats the point — the creator cannot fill
in the numeric answer without seeing the chart.

CASES YOU WILL SEE AND HOW TO HANDLE EACH:

A) READING COMPREHENSION
   (CAT-style — one ~500-word passage with 4 questions, or
    banking-style — one ~400-word passage with 10 questions.)
   Each question in the group gets the FULL passage in its text
   followed by "\n\nQuestion: …". Yes, this duplicates the passage
   N times. That is correct — faithfulness beats size.

   YOUR SIZE LIMIT IS ONE MODEL REPLY, not a file size: roughly
   65,000 output tokens, about 250 KB of JSON. A 400-word passage
   repeated across 10 questions costs about 5,500 tokens, and
   Devanagari costs roughly double per character. A reply that runs
   out mid-JSON is a total loss — no delimiter, nothing imported.
   So if a paper genuinely cannot fit, do NOT summarise the
   passages and do NOT drop questions silently: emit the sections
   that fit, in order, and add ONE entry to
   _extraction_summary.skipped { "reason": "reply size limit reached
   — sections after 'Quantitative Aptitude' not extracted; import
   them from a split PDF", "page": <first page not covered> }.

B) "Directions (3-7): …" SHORT INSTRUCTIONS
   (Banking-exam style — directions header applies to a numbered
    range of questions.)
   Embed the directions header in each question's text:
     "Directions: Read each sentence to find out whether there is
      any grammatical or idiomatic error in it. The error, if any,
      will be in one part of the sentence.\n\nQuestion: They needs
      (A)/ to submit the report (B)/ before the deadline (C)/ to
      avoid penalties. (D)"

C) FILL-IN-THE-BLANK PASSAGE / CLOZE TEST
   (Multiple blanks A, B, C, D, E, F in one passage; one MCQ per
    blank.)
   For each question, embed the FULL passage with the CURRENT
   blank highlighted (e.g. "______ (A)") and the other blanks
   shown as "______" too. Then "Question: Which of the following
   is most suitable to fill blank (A)?".

D) DATA INTERPRETATION SETS (table or graph + 5–6 questions)
   • Tables: convert to a pipe-delimited table inside the text.
     Each row on its own line, header row, separator row.
     Example:
       "Sport    | A  | B
        -------- | -- | --
        Cricket  | 20 | 35
        Hockey   | 25 | 30
        Football | 24 | 36"
   • Line / bar charts: extract the visible numeric values as a
     "Data:" list — e.g. "Data — Visitors to parks A, B, C, D, E:
     20, 32, 26, 40, 24". If the values are unreadable, do NOT skip
     the question and do NOT invent numbers: emit it with the text
     you can read, add an "image_region" for the chart, and log
     needs_manual_review with reason "graph values unreadable —
     chart attached".
   • Pie charts / complex diagrams: flag in needs_manual_review
     with reason: "image required — diagram cannot be transcribed".
     Emit the question with whatever text you can read. Do NOT
     fabricate values.

E) PUZZLE SETUPS
   (8 people on 8 floors; circular / square seating; direction
    sense; comparison/ranking sets.)
   Pure text. Embed the FULL setup paragraph in each question's
   text:
     "Setup: Eight persons A, B, C, D, E, F, G and H live on eight
      different floors of an eight-storey building, floor 1 at the
      bottom and floor 8 at the top. D lives on an even-numbered
      floor above the fifth floor. Three persons live between D
      and B …\n\nQuestion: How many persons live above A?"

F) GEOMETRY / FIGURE-BASED QUANT
   • If the figure is FULLY described by the text (e.g. "a right-
     angled triangle ABC with AB = 5 cm, BC = 12 cm, …"), extract
     normally — no image needed.
   • If the question depends on an unlabelled / freehand figure
     that text cannot reconstruct, emit the question with the
     text you have, AND add an entry to needs_manual_review
     with reason: "geometry figure required".

G) STATEMENT-BASED MCQs
   ("Which of the following is correct? (A) … (B) … (C) …" where
    A/B/C are STATEMENTS in the stem, and the options are
    "Only A", "Both A and C", etc.)
   Keep the (A)/(B)/(C) statements INSIDE the question stem
   (after a line break, prefixed with their letter). The
   options array holds the synthesized choices.

H) SENTENCE-ERROR / SENTENCE-PART MCQs
   ("They needs (A)/ to submit the report (B)/ before the
    deadline (C)/ to avoid penalties. (D)" with options A/B/C/D/
    No error.)
   Keep the (A)(B)(C)(D) markers inline in the stem exactly as
   the PDF shows them. Options array is the letters plus
   "No error" if the PDF lists it.


═══════════════════════════════════════════════════════════════════
MATH & LaTeX
═══════════════════════════════════════════════════════════════════

MockSetu renders KaTeX. Use it for ANY non-trivial maths.

Two columns appear throughout this chapter and they are NOT the
same thing. "formula" is what a candidate reads on screen.
"JSON" is the exact characters you type between the quotes. They
differ only in how many backslashes there are. Read both.

INLINE math (within a sentence): wrap in single dollar signs.
  formula:  The probability is $\frac{3}{7}$.
  JSON:     "The probability is $\\frac{3}{7}$."

  formula:  Solve $\log_2(x+1) = 3$.
  JSON:     "Solve $\\log_2(x+1) = 3$."

  formula:  If $x^2 + y^2 = 25$, find $x + y$.
  JSON:     "If $x^2 + y^2 = 25$, find $x + y$."
            (no backslash in the formula, so nothing to double)

DISPLAY math (own line, larger): wrap in double dollar signs.
  formula:  $\int_0^{\pi} \sin x \, dx = 2$
  JSON:     "$\\int_0^{\\pi} \\sin x \\, dx = 2$"

  formula:  $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$
  JSON:     "$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$"

JSON ESCAPING — CRITICAL: one backslash in the formula is typed as
TWO backslashes in the JSON string, because JSON itself treats \
as an escape character. So:

  in the formula      →  what you type in JSON
  ─────────────────────────────────────────────
  \frac{a}{b}         →  "\\frac{a}{b}"
  \sqrt{x}            →  "\\sqrt{x}"
  \int_0^1            →  "\\int_0^1"
  \sin x              →  "\\sin x"
  \log_2              →  "\\log_2"
  \alpha + \beta      →  "\\alpha + \\beta"

DOUBLE EXACTLY ONCE — the most common failure in this whole task.
The left column above is the maths; the right column is already
the finished JSON. Never apply the doubling rule to the right
column a second time.

  WRONG — doubled twice:  "$\\\\frac{3}{7}$"
  WRONG — not doubled:    "$\frac{3}{7}$"
  RIGHT:                  "$\\frac{3}{7}$"

FOUR backslashes immediately before a LETTER is always wrong. If
you are about to type \\\\f, \\\\s, \\\\i, \\\\l or \\\\b, you have
doubled twice — delete half. Re-read what you emitted: every LaTeX
command must show exactly TWO backslashes, no more.

This matters more than it looks. A command with four backslashes
does not fail loudly — \\ is a line break in LaTeX, so a doubled
\\\\int renders as a line break and the three letters "int", with
no integral sign and no error message. Nobody downstream can tell
it was ever meant to be an integral.

MULTI-ROW ENVIRONMENTS — piecewise functions, matrices, systems.
Use \begin{cases} for piecewise definitions, \begin{pmatrix} or
\begin{bmatrix} for matrices. The & that separates columns is not
escaped. The ROW SEPARATOR is \\ in the formula, and that one is
FOUR backslashes in JSON — correct here, because it is a two-
backslash token doubled once, not a command doubled twice:

  formula:  $f(x) = \begin{cases} x-2 & 0 \le x \le 2 \\ -2 & x < 0 \end{cases}$
  JSON:     "$f(x) = \\begin{cases} x-2 & 0 \\le x \\le 2 \\\\ -2 & x < 0 \\end{cases}$"

  Note \\begin and \\end carry two backslashes like every other
  command; only the row separator carries four.

PREFER UNICODE for simple standalone symbols (no LaTeX overhead):
  ≤  ≥  ≠  ±  ∞  ÷  ×  °  √  (when standalone, not over an expression)
  π  α  β  γ  δ  θ  φ  λ  μ  σ  Ω  Δ
  →  ←  ⇒  ⇔  ∈  ∉  ⊂  ⊆  ∪  ∩  ∅  ∀  ∃
  Example: "If x ≥ 5 and y ≤ 3, find x − y."

PREFER LaTeX for stacked / structured math:
  • Fractions:       $\frac{x+1}{x-1}$    NOT   (x+1)/(x-1)
  • Multi-char
    exponents:       $x^{2n+1}$           NOT   x^(2n+1)
  • Roots of
    expressions:     $\sqrt{x^2 + y^2}$   NOT   sqrt(x^2+y^2)
  • Integrals,
    sums, products:  $\int$, $\sum$, $\prod$
  • Subscripts with
    multi-char keys: $a_{ij}$, $x_{\text{max}}$

CHEMISTRY / PHYSICS: same rules. $H_2SO_4$, $10^{-3}$, $E = mc^2$.

GEOMETRY: if the figure is described in words, extract the text. If
not, flag for manual review (see Passages section F).

WHEN TO FLAG needs_manual_review with reason: "math notation —
verify": only when the LaTeX is genuinely ambiguous in the source
(e.g. an OCR'd scan where you are GUESSING at an exponent or a
subscript). Don't flag every math question — only the ones where
your transcription has real doubt.


═══════════════════════════════════════════════════════════════════
LANGUAGE & BILINGUAL PAPERS
═══════════════════════════════════════════════════════════════════

If the source PDF contains BOTH languages on the same page (very
common in Indian banking exams — English VARC + Hindi Quant /
Reasoning), I will tell you which language to extract THIS PASS.

  • If I say language: "en" → emit ONLY the English content.
    If a question exists only in Hindi (e.g. the Hindi Quant
    block), SKIP it for this pass and log
    "reason": "english version absent" in skipped.
  • If I say language: "hi" → emit ONLY the Hindi content. Same
    in reverse.
  • THE LANGUAGE FILTER APPLIES TO QUESTION, OPTION AND PASSAGE
    TEXT ONLY. Answer keys, solutions, marks schemes and booklet-set
    labels are language-neutral evidence: on a "hi" pass use an
    English-only "ANSWER KEY" page or "S31. Ans.(c)" solutions; on
    an "en" pass use "उत्तर कुंजी" / "उत्तर (ग)". One printed key
    entry serves both language versions of the same printed question
    number, because labels are positional — (ख) = (b) = (2) → "1".
    answer_key.transcript is identical on the "en" and "hi" passes
    of the same PDF. NEVER leave correct_answer null on a pass
    because the key is printed in the other language.
  • SOME BOOKLETS PRINT ONE LANGUAGE AFTER THE OTHER rather than
    side by side — the English paper as Q1-100, then the whole Hindi
    paper renumbered Q101-200 or restarted at 1 behind its own
    cover. The key usually covers 1-100 only, because it is the same
    exam. Join the second half to the FIRST half's numbering (Hindi
    Q101, or Hindi Q1 in the back half, is English Q1) and say so in
    answer_key.note. Emit q_no as the number printed on the question
    you extracted.

Use full Unicode Devanagari in text and options for Hindi. Do
not transliterate (no "kya" for "क्या"). Do not translate. Keep
numerals as the PDF shows them (digits OR Devanagari numerals —
match the source).

OCR ARTIFACTS: scanned bilingual PDFs sometimes produce garbled
Devanagari (broken conjuncts, misplaced matras, swapped chandra-
bindus). Clean up obvious artifacts where the correct character is
unambiguous. If a whole sentence is unreadable, SKIP and log
"reason": "OCR unreadable — Hindi".


═══════════════════════════════════════════════════════════════════
IMAGES — when to flag, when to transcribe, when to auto-snip
═══════════════════════════════════════════════════════════════════

MockSetu can AUTO-SNIP figures directly from the PDF you are
reading — but ONLY if you emit accurate image_region coordinates.
This is the single highest-value thing you can do for questions
with diagrams, charts, or figures. Get this right and the creator
uploads JSON + PDF and every figure is cropped automatically.

Any "image_url" field you put in the JSON is silently IGNORED.
Do NOT use "image_url". Use "image_region" instead.

─── DECISION TREE (evaluate for EVERY figure/diagram/chart) ────

  (i)   DECORATIVE or DUPLICATES text already in the question →
        IGNORE. Do not emit image_region. Do not mention it.

  (ii)  FULLY TRANSCRIBABLE (table with readable cells, simple bar
        chart with labelled values, geometry with all dimensions in
        the text) → TRANSCRIBE into the question's "text" field as
        a pipe-delimited table or "Data:" list. No image_region
        needed. Treat as a text-only question.

  (iii) ESSENTIAL and CANNOT be fully transcribed (schematic
        diagrams, circuit layouts, complex geometry figures,
        pie/stacked charts, maps, photographs, seating arrangements
        with spatial layout, Venn diagrams, flowcharts) →
        EMIT "image_region". This is the critical path — read
        every detail below.


─── THE image_region FIELD ─────────────────────────────────────

  "image_region": {
    "page": <1-based PDF page number>,
    "x_min": <integer 0-1000>,
    "y_min": <integer 0-1000>,
    "x_max": <integer 0-1000>,
    "y_max": <integer 0-1000>
  }

  "page" is REQUIRED. The x/y bbox fields are OPTIONAL but
  STRONGLY PREFERRED — they make the auto-snip dramatically
  better.


─── COORDINATE SYSTEM — how the 0-1000 grid works ─────────────

  Imagine the PDF page as a 1000×1000 pixel grid, regardless of
  the actual page dimensions (A4, Letter, whatever):

    (0, 0)───────────────────────────(1000, 0)
    │                                         │
    │   figure sits                           │
    │   somewhere in                          │
    │   this grid                             │
    │                                         │
    (0, 1000)────────────────────────(1000, 1000)

  x_min = left edge of the figure   (0 = page left margin)
  y_min = top edge of the figure    (0 = page top margin)
  x_max = right edge of the figure  (1000 = page right margin)
  y_max = bottom edge of the figure (1000 = page bottom margin)

  RULES:
    • x_min < x_max   (left before right)
    • y_min < y_max   (top before bottom)
    • All values are integers in [0, 1000]
    • The system adds ~5% padding on each side automatically,
      so be SLIGHTLY LOOSE (10-30 units) rather than pixel-tight.
      Cutting INTO the figure is far worse than including a thin
      strip of surrounding whitespace.


─── HOW TO ESTIMATE COORDINATES — mental model ─────────────────

  Step 1: Identify which PDF page the figure is on (1-based).

  Step 2: Mentally divide the page into a 10×10 grid (each cell
           is 100×100 in the coordinate system). Ask yourself:
           • "The figure starts about X/10 of the way from the
             left" → x_min ≈ X × 100.
           • "The figure starts about Y/10 of the way from the
             top" → y_min ≈ Y × 100.
           • "The figure ends about X'/10 from the left" →
             x_max ≈ X' × 100.
           • "The figure ends about Y'/10 from the top" →
             y_max ≈ Y' × 100.

  Step 3: Nudge each edge OUTWARD by 10-30 units for safety.

  COMMON POSITIONS (use as anchors):
    • Full-width figure, upper half of page:
      x_min: 30,  y_min: 50,  x_max: 970, y_max: 500
    • Full-width figure, lower half of page:
      x_min: 30,  y_min: 500, x_max: 970, y_max: 950
    • Left-column figure (2-column layout):
      x_min: 30,  y_min: 200, x_max: 490, y_max: 600
    • Right-column figure (2-column layout):
      x_min: 510, y_min: 200, x_max: 970, y_max: 600
    • Centred medium figure:
      x_min: 150, y_min: 300, x_max: 850, y_max: 700
    • Small inline figure (e.g. a triangle next to a question):
      x_min: 500, y_min: 400, x_max: 900, y_max: 650


─── THREE CONFIDENCE TIERS ─────────────────────────────────────

  TIER 1 — CONFIDENT BBOX (preferred; best snip quality):
    You can visually locate the figure's bounding rectangle.
    Emit all four coordinates.

      "image_region": {
        "page": 5,
        "x_min": 80,  "y_min": 320,
        "x_max": 920, "y_max": 680
      }

    This gives the auto-snipper a tight crop. The 5% padding
    ensures no content is cut off even if you're off by 20-30
    units.

  TIER 2 — PAGE-ONLY (fallback; acceptable):
    You know the page but cannot estimate the bbox position.
    Omit x/y fields entirely.

      "image_region": { "page": 5 }

    The system snips the ENTIRE page and then auto-trims white
    margins to find the content. Works reliably but produces
    a looser crop (may include question text around the figure).

  TIER 3 — CANNOT DETERMINE PAGE (last resort):
    You cannot even identify which page the figure is on. Do NOT
    emit image_region. Instead, add to needs_manual_review:

      { "section": "...", "q_no": 8,
        "reason": "image required — cannot locate figure in PDF" }


─── MULTIPLE FIGURES ON THE SAME PAGE ──────────────────────────

  If a page has multiple figures (e.g. questions 6-10 each have
  their own small diagram clustered on page 12), emit a SEPARATE
  image_region on EACH question with bbox coordinates that target
  ONLY that question's specific figure.

  DO NOT use the same whole-page bbox for all of them — that
  would give every question an identical image of the full page.
  Take the extra time to estimate each figure's individual bbox.

  If you truly cannot separate them (overlapping figures), use
  page-only on all of them and add a needs_manual_review note.


─── FIGURES THAT SPAN MULTIPLE QUESTIONS ───────────────────────

  Some exam setups have ONE diagram shared by 4-5 questions
  (e.g. a housing layout for Q6-Q10). In this case, emit the
  SAME image_region (identical page + bbox) on EVERY question in
  the group. The system deduplicates page renders internally, so
  this is efficient. Each question gets its own copy of the snip.


─── WHAT NOT TO DO ─────────────────────────────────────────────

  ✗ DO NOT emit pixel coordinates or PDF point units.
    Always normalised 0-1000.

  ✗ DO NOT emit {x_min:0, y_min:0, x_max:1000, y_max:1000}
    when you mean "the whole page". That is a sentinel value the
    system treats as "AI couldn't localise it" and falls back to
    auto-trim — it works, but a proper bbox is ALWAYS better.
    If you genuinely mean "whole page", just omit the x/y coords:
    "image_region": { "page": 5 }

  ✗ DO NOT fabricate ASCII art for a complex diagram.
    Emit image_region and let the auto-snipper crop it.

  ✗ DO NOT guess at numeric values you cannot read from a chart.
    Emit image_region for the chart and transcribe only what you
    can confidently read.

  ✗ DO NOT set page to 0 or negative. Pages are 1-based.

  ✗ DO NOT use "image_url". It is silently ignored.


═══════════════════════════════════════════════════════════════════
ANSWERS — see the ANSWER KEY section above
═══════════════════════════════════════════════════════════════════

Every question is joined to answer_key.transcript by (section,
printed q_no) and converted with the LABEL → INDEX table. A printed
digit is a label: key "(3)" → "2". Every null on an ordinary
question carries an "answer key — " reason. Never skip a readable
question because of its answer.


═══════════════════════════════════════════════════════════════════
WORKED EXAMPLES — copy these patterns
═══════════════════════════════════════════════════════════════════

Every correct_answer below is a real index taken from a printed key.
A null appears ONLY on placeholders: in a paper that HAS a key, an
ordinary MCQ left null is a failure to be logged, not a normal result.

EXAMPLE 1 — Simple MCQ; the key printed "Ans.(b)", so the index is 1
{
  "q_no": 1,
  "text": "Capital of France?",
  "answer_type": "single",
  "options": ["Berlin", "Paris", "Madrid", "Rome"],
  "correct_answer": "1"
}

EXAMPLE 2 — Sentence-error question with (A)/(B)/(C)/(D) markers
{
  "q_no": 3,
  "text": "Directions: Read each sentence to find out whether there is any grammatical or idiomatic error in it. The error, if any, will be in one part of the sentence.\n\nQuestion: They needs (A)/ to submit the report (B)/ before the deadline (C)/ to avoid penalties. (D)",
  "answer_type": "single",
  "options": ["A", "B", "C", "D", "No error"],
  "correct_answer": "0"
}

EXAMPLE 3 — Reading comprehension (PREFERRED: "passage" field on each Q)
{
  "q_no": 8,
  "passage": "Sayer Daheir began a modest printing press many decades ago, choosing to begin his venture with a deep respect for the traditional arts of printing and book binding. … [full passage, ~400 words] …",
  "text": "Which of the following best explains why visitors found the workshop's pages impressive?",
  "answer_type": "single",
  "options": [
    "The pages were produced using highly advanced machinery imported from overseas.",
    "The books featured metallic covers that reflected modern design sensibilities.",
    "The design was intricate and consistent, reflecting care and expert craftsmanship.",
    "Each book was endorsed by famous artists to increase its credibility.",
    "The pages were produced in large batches ensuring mass production accuracy."
  ],
  "correct_answer": "2"
}

EXAMPLE 3b — Reading comprehension (FALLBACK: inline in "text")
{
  "q_no": 8,
  "text": "Passage:\n\nSayer Daheir began a modest printing press many decades ago … [full passage, ~400 words] …\n\nQuestion: Which of the following best explains why visitors found the workshop's pages impressive?",
  "answer_type": "single",
  "options": ["...", "...", "...", "...", "..."],
  "correct_answer": "2"
}

EXAMPLE 4 — Quant with inline LaTeX
{
  "q_no": 46,
  "text": "A rectangle has length-to-width ratio 5:3. If twice the perimeter is 96 cm, find the area of the rectangle (in $\\text{cm}^2$).",
  "answer_type": "single",
  "options": ["225", "135", "196", "180", "154"],
  "correct_answer": "1"
}

EXAMPLE 5 — Quant with structured LaTeX (radicals, fractions)
{
  "q_no": 47,
  "text": "If $\\sqrt{5x+9} + \\sqrt{5x-9} = 3(2+\\sqrt{2})$, then $\\sqrt{10x+9}$ is equal to:",
  "answer_type": "single",
  "options": ["$3\\sqrt{7}$", "$4\\sqrt{5}$", "$3\\sqrt{31}$", "$2\\sqrt{7}$"],
  "correct_answer": "1"
}

EXAMPLE 6 — Data interpretation with an embedded table
{
  "q_no": 36,
  "text": "The table below shows the number of students playing three sports — Cricket, Hockey, Football — at two schools A and B.\n\nSport    | A  | B\n-------- | -- | --\nCricket  | 20 | 35\nHockey   | 25 | 30\nFootball | 24 | 36\n\nQuestion: What is the ratio of students playing cricket at school A to those playing football at school B?",
  "answer_type": "single",
  "options": ["5:9", "9:5", "6:5", "6:7", "6:1"],
  "correct_answer": "0"
}

EXAMPLE 7 — Statement-based MCQ
{
  "q_no": 10,
  "text": "Passage:\n\n[full RC passage here]\n\nQuestion: Which of the following statements is CORRECT according to the passage?\n\n(A) Hadiya represents the latest generation contributing to the Daheir heritage.\n(B) In 1999, the original workshop was sold to external investors and rebranded.\n(C) The use of metal nameplates was introduced to add uniqueness to the books.",
  "answer_type": "single",
  "options": ["Only A", "Both A and B", "Both B and C", "Both A and C", "Only C"],
  "correct_answer": "3"
}

EXAMPLE 8 — Hindi quant question (Devanagari + transcribed data)
{
  "q_no": 31,
  "text": "Data — रविवार को पाँच पार्कों A, B, C, D, E में जाने वाले आगंतुकों की संख्या: 20, 32, 26, 40, 24\n\nप्रश्न: पार्क A और B में जाने वाले आगंतुकों की संख्या का योग, पार्क D में जाने वाले आगंतुकों की संख्या का कितना प्रतिशत है?",
  "answer_type": "single",
  "options": ["130", "120", "125", "100", "105"],
  "correct_answer": "0"
}

EXAMPLE 9 — Puzzle setup (8 people on 8 floors)
{
  "q_no": 66,
  "text": "Setup: Eight persons A, B, C, D, E, F, G and H live on eight different floors of an eight-storey building. Floor 1 is the bottom; floor 8 is the top. D lives on an even-numbered floor above the fifth floor. Three persons live between D and B. The number of persons above B equals the number of persons below E. Two persons live between E and G. C lives immediately above A. More than three persons live between A and H.\n\nQuestion: How many persons live above A?",
  "answer_type": "single",
  "options": ["None", "One", "Three", "Two", "More than two"],
  "correct_answer": "3"
}

EXAMPLE 10 — Numeric / TITA emitted as PLACEHOLDER (NOT skipped)
The PDF asks "How many UK applications were scheduled on that
day?" — a TITA question with no options in the PDF. Emit it as a
placeholder MCQ at the same q_no, preserving the passage and (if
applicable) the image_region. The creator fills the real options
in MockSetu after import.

  {
    "q_no": 11,
    "passage": "A visa processing office (VPO) accepts visa applications in four categories — US, UK, Schengen, and Others. … [FULL setup — same string as on the sibling MCQs Q13, Q14, Q15] …",
    "text": "How many UK applications were scheduled on that day?",
    "answer_type": "single",
    "options": [
      "[Manual entry needed — unsupported type in v1]",
      "[See PDF Q11 for the actual answer]"
    ],
    "correct_answer": null
  }

And in _extraction_summary.needs_manual_review:
  { "section": "Section 02: Data Interpretation and Logical Reasoning",
    "q_no": 11,
    "reason": "placeholder — numeric/TITA unsupported in v1" }

EXAMPLE 10b — TRULY skipped (stem unreadable)
Only when you cannot read the question at all does it go into
_extraction_summary.skipped:
{ "q_no": 21, "page": 11, "reason": "page damaged — stem unreadable" }

EXAMPLE 11 — Question with image_region (confident bbox)
A DI question whose diagram is on page 15, centred in the upper
half of the page. The figure spans roughly from the left margin
to the right margin, top third to mid-page:
{
  "q_no": 26,
  "passage": "The schematic diagram below shows 12 rectangular houses in a housing complex …",
  "text": "Which of the following options best describes the number of vacant houses in Row-2?",
  "answer_type": "single",
  "options": ["Either 2 or 3", "Exactly 3", "Exactly 2", "Either 3 or 4"],
  "correct_answer": "1",
  "image_region": {
    "page": 15,
    "x_min": 50,
    "y_min": 80,
    "x_max": 950,
    "y_max": 480
  }
}

EXAMPLE 12 — Shared diagram across multiple questions
Questions 26-30 all refer to the same housing layout on page 15.
Each question repeats the SAME image_region:
{
  "q_no": 27,
  "passage": "The schematic diagram below shows 12 rectangular houses …",
  "text": "Which house in Block YY has parking space?",
  "answer_type": "single",
  "options": ["E2", "F2", "E1", "F1"],
  "correct_answer": "0",
  "image_region": {
    "page": 15,
    "x_min": 50,
    "y_min": 80,
    "x_max": 950,
    "y_max": 480
  }
}

EXAMPLE 13 — Question with page-only image_region (fallback)
You know the pie chart is on page 9 but can't estimate the bbox:
{
  "q_no": 18,
  "text": "What is the percentage share of sector D in the total?",
  "answer_type": "single",
  "options": ["12%", "18%", "22%", "25%"],
  "correct_answer": "2",
  "image_region": { "page": 9 }
}

EXAMPLE 14 — Placeholder INSIDE a figure-bearing cluster
A DI set on page 15 has a housing schematic. Q6 is numeric, Q7-Q10
are MCQs. ALL FIVE questions share the same passage AND the same
image_region — including the placeholder. This is what keeps the
upload preview aligned with the PDF:

  {
    "q_no": 6,
    "passage": "The schematic diagram below shows 12 rectangular houses in a housing complex. House numbers are mentioned in the rectangles representing the houses. … [full passage text — IDENTICAL string on Q7, Q8, Q9, Q10] …",
    "text": "How many houses are vacant in Block XX?",
    "answer_type": "single",
    "options": [
      "[Manual entry needed — unsupported type in v1]",
      "[See PDF Q6 for the actual answer]"
    ],
    "correct_answer": null,
    "image_region": { "page": 15, "x_min": 50, "y_min": 80, "x_max": 950, "y_max": 480 }
  },
  {
    "q_no": 7,
    "passage": "[SAME full passage as Q6]",
    "text": "Which of the following houses is definitely occupied?",
    "answer_type": "single",
    "options": ["D2", "A1", "B1", "F2"],
    "correct_answer": "2",
    "image_region": { "page": 15, "x_min": 50, "y_min": 80, "x_max": 950, "y_max": 480 }
  }
  // … Q8, Q9, Q10 follow the same pattern …


═══════════════════════════════════════════════════════════════════
SELF-CHECK — verify ALL of these BEFORE emitting
═══════════════════════════════════════════════════════════════════

  □ schema_version is exactly "1.0".
  □ language is "en" or "hi" and matches what I told you.
  □ sections is a non-empty array.
  □ Every section name matches one of mine character-for-character,
    or — for a section my list does not cover — is the paper's own
    printed name, with the mapping logged once.
  □ Every question has non-empty text, valid answer_type and an
    options array (≥ 2 entries, printed-label order, labels
    stripped, no empty entries). Its correct_answer comes from
    answer_key.transcript — unless it is a placeholder, or the key
    has no usable entry for it, when it is null with a reason.
  □ Every correct_answer index is in 0 … options.length-1.
  □ For answer_type: "single", correct_answer is a single
    string (not an array of multiple indices).
  □ For answer_type: "multi", correct_answer is an ascending array
    of ONE or more distinct indices — exactly the labels the key
    names, never padded to two.
  □ Every question carries the q_no PRINTED in the PDF, and no two
    questions in the same section share one.
  □ ANSWER KEY FIRST: I opened the LAST pages of the PDF. If a key,
    inline answers, solutions or consistently marked options exist
    anywhere, answer_key.found is true and format, pages,
    label_style and numbering are filled. No key anywhere → the
    found:false block from section G, transcript {}.
  □ TRANSCRIPT COMPLETE: every section with questions has a
    transcript string — unless applied is false, when transcript is
    {} and ONE entry explains why. Every printed q_no in it appears
    EXACTLY once. Tokens hold what the key PRINTED (a label, or a
    word like Bonus, or a numeric value), never an index, with "?"
    for unreadable entries.
  □ SET CHOSEN: if sets_in_key is non-empty, set_used is one of them
    and matches the set printed on the paper — or applied is false,
    every answer is null and the paper-level note is there. I never
    defaulted to the first column.
  □ JOIN: every non-null correct_answer is the LABEL → INDEX of that
    question's transcript token, matched by (section, printed q_no).
    As I wrote each section I re-derived its first, middle and last
    answered question straight from the transcript.
  □ OFF-BY-ONE: no correct_answer equals the digit the key printed
    for it. Key (1)→"0", (2)→"1", (3)→"2", (4)→"3", (5)→"4";
    a→"0", b→"1", c→"2", d→"3", e→"4"; क→"0", ख→"1", ग→"2", घ→"3".
  □ SHAPE: every correct_answer is a digit string, an array of digit
    strings on a "multi" question, or null. Zero occurrences of
    "correct_answer": "" and zero letters, brackets, "Bonus" or
    option text — each of those deletes the question.
  □ EVERY NULL IS EXPLAINED: when the key applied, every ordinary
    question left null has a needs_manual_review entry with the same
    section and printed q_no whose reason starts with "answer key — ".
    When applied is false, ONE entry covers the paper instead. Either
    way answered + left_null + placeholders === extracted.
  □ OPTIONS vs KEY: no question has fewer options than the highest
    label its key entry uses (a key "(e)" means five options were
    printed — find the fifth). Options are in printed-label order,
    labels stripped, none empty, and catch-alls ("None of these",
    "All of the above") kept at their printed position.
  □ NOT SOLVED: every non-null correct_answer traces to a printed
    key entry, an inline "Ans.", the option a solution names, or a
    consistently marked option — never to a value in the working and
    never to my own knowledge.
  □ PLACEHOLDER KEY VALUES: a placeholder whose key entry is a value
    carries it in its reason, never in options or correct_answer.
  □ LANGUAGE: the key was used on this pass even if it is printed
    only in the other language.
  □ NO STOP: the reply is the JSON between the delimiters, ends with
    <<<EXAM_JSON_END>>>, and contains no question to me, no refusal
    and no prose. Every ambiguity is a needs_manual_review entry.
  □ No two options in the SAME question are identical strings
    (if you see duplicates, you probably dropped a LaTeX
    backslash that distinguished them — fix it before you emit).
  □ JSON parses with a strict parser: balanced {} and [], no
    trailing commas, no comments, double-quoted strings only.
  □ Every " INSIDE a string value is either escaped as \" OR
    converted to a Unicode curly quote (“ ” ‘ ’). No bare ASCII
    " inside text. (Rule 10)
  □ Every \ inside a string is followed by one of: \ " / b f n
    r t u. No bare \s, \l, \a, \p, \c, \v, \z, \d, etc. Every
    LaTeX backslash has been doubled. (Rule 11)
  □ No mojibake — text reads cleanly without Ã, Â, â€™, â€“,
    â€" sequences. Accented letters and dashes are proper
    Unicode (Lozère not LozÃ¨re; — not â; ° not Â°). (Rule 12)
  □ Every passage / setup / directions / data block is the
    FULL VERBATIM source text, not a paraphrase or summary.
    Same passage repeats across all questions in the group.
  □ marks_wrong (if present anywhere) is a POSITIVE magnitude.
  □ NUMBERING IS PRESERVED:
    total_in_pdf === extracted + skipped.length
    "skipped" should usually be empty. Every v1-unsupported
    answer format (numeric, TITA, true/false, fill-in,
    descriptive, sequence-input, match) lives in
    sections.questions as a PLACEHOLDER MCQ at its real q_no,
    NOT in skipped.
  □ Every placeholder uses these two sentinel options VERBATIM:
      ["[Manual entry needed — unsupported type in v1]",
       "[See PDF Q<q_no> for the actual answer]"]
    correct_answer is null. Substitute the real q_no in the
    second sentinel.
  □ Every placeholder has a matching entry in
    _extraction_summary.needs_manual_review with the correct
    section name, q_no, and a "placeholder — …" reason.
  □ Placeholders in shared-context clusters carry the SAME
    passage and SAME image_region as their MCQ siblings.
  □ No image_url, no explanation, no difficulty, no topic, no
    tags, no other unrecognized fields anywhere.
  □ Every image_region has "page" ≥ 1 (integer).
  □ Every image_region bbox (when present) has
    0 ≤ x_min < x_max ≤ 1000 and 0 ≤ y_min < y_max ≤ 1000.
  □ No image_region uses {0,0,1000,1000} as a bbox — if you
    mean "whole page", omit x/y fields and emit page only.
  □ Shared diagrams: every question in the group has the SAME
    image_region (same page + same bbox). Not just the first one.
  □ Multiple figures on same page: each question has its OWN
    bbox targeting its specific figure, not a shared whole-page.

FINAL PASS — watch for these WHILE you write. Do not re-read or
re-emit the JSON afterwards, and put nothing after
<<<EXAM_JSON_END>>>:
  • Any ordinary question with "correct_answer": null while
    answer_key.found is true → look it up in the transcript once
    more; still nothing → add its "answer key — " reason
  • Any correct_answer that is not a digit string, an array of digit
    strings, or null → fix the mapping; it would delete the question
  • Any correct_answer equal to the digit the key printed for it →
    off by one; subtract one
  • Any question with fewer options than the highest label its key
    entry uses → you dropped an option
  • Any " inside a "..." string value → must be \" or curly quote
  • Any \ not followed by \ " / b f n r t u → must be doubled
  • Any "Ã" "Â" "â€" sequence → fix encoding to native Unicode
  • Any passage shorter than 5 sentences (likely summarised) →
    expand to full source text
  • Any image_region with x_min=0, y_min=0, x_max=1000, y_max=1000
    → replace with page-only (omit x/y) or estimate a real bbox
  • Any essential figure WITHOUT an image_region → add one
Catching these now saves a failed import — there may be no one to
round-trip with.


═══════════════════════════════════════════════════════════════════
YOUR CONTEXT — fill these in, then attach the PDF and send
═══════════════════════════════════════════════════════════════════

  Language code:   ______           (use "en" or "hi")

  Section names from MY exam, in the order they appear:
    1. ______
    2. ______
    3. ______
    (add more lines if needed)

Now read the ENTIRE attached PDF — last pages first, to find the
answer key and this paper's set — transcribe the key into
_extraction_summary.answer_key, then emit the JSON between
<<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>. Begin.`;


const LANGUAGE_BLANK = /Language code:\s+______/;
const SECTIONS_BLANK = /1\. ______\n\s+2\. ______\n\s+3\. ______\n\s+\(add more lines if needed\)/;
const ANY_CONTEXT_BLANK = /Language code:\s+______|^\s+\d\. ______$/m;

/**
 * Fill the "YOUR CONTEXT" block at the end of the prompt.
 *
 * @param {{ language: string, sectionNames: string[] }} ctx
 *   language      "en" | "hi" — the language slot this pass extracts.
 *   sectionNames  the exam's section names for that language, in order. Empty
 *                 when the exam has no sections yet: the model is then told to
 *                 use the names printed in the paper, and the import creates
 *                 those sections.
 * @param {string} [prompt] defaults to EXTRACTION_PROMPT (injectable for tests).
 * @returns {string} the filled prompt.
 * @throws if a blank survives — a half-filled prompt must never reach Gemini.
 */
export function fillExtractionPromptContext(ctx, prompt = EXTRACTION_PROMPT) {
  const language = String(ctx?.language ?? "").trim().toLowerCase();
  if (language !== "en" && language !== "hi") {
    throw new Error(`Unsupported language code "${ctx?.language}" — expected "en" or "hi".`);
  }
  const names = (ctx?.sectionNames ?? [])
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length > 0);

  const sectionLines =
    names.length > 0
      ? names.map((n, i) => `${i + 1}. ${n}`).join("\n    ")
      : "(none created in MockSetu yet — use the section names printed in the paper, in the order they appear; each will be created on import)";

  const filled = prompt
    .replace(LANGUAGE_BLANK, `Language code:   ${language}`)
    .replace(SECTIONS_BLANK, sectionLines);

  if (ANY_CONTEXT_BLANK.test(filled.slice(filled.indexOf("YOUR CONTEXT")))) {
    throw new Error("Extraction prompt context block was not fully filled.");
  }
  return filled;
}

/** Delimiters the prompt asks for; the parser and the import job both look for them. */
export const EXTRACTION_JSON_START = "<<<EXAM_JSON_START>>>";
export const EXTRACTION_JSON_END = "<<<EXAM_JSON_END>>>";

/** Does a model reply contain a complete delimited JSON block? */
export function hasDelimitedExtraction(text) {
  const t = String(text ?? "");
  const a = t.indexOf(EXTRACTION_JSON_START);
  const b = t.indexOf(EXTRACTION_JSON_END);
  return a >= 0 && b > a;
}
