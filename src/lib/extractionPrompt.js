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
 */

/** Schema version the prompt emits; the parser rejects anything else. */
export const EXTRACTION_PROMPT_VERSION = "1.0";

export const EXTRACTION_PROMPT = String.raw`You are converting an exam paper (PDF or scanned document) into a strict
JSON object that will be uploaded into MockSetu's exam builder.

Your job is ONLY to CONVERT what exists in the source — never to invent.
If something is not in the document, leave it null or omit it. If you
genuinely cannot read something, skip that question and log it.


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
      // Reserve for questions you literally could not read (page damaged,
      // stem illegible). v1-unsupported types (numeric, TITA, sequence-
      // input, etc.) go into sections.questions as placeholders, NOT here.
      { "reason": "<short label>", "page": <int, optional>, "q_no": <int, optional> }
    ],
    "needs_manual_review": [
      // Every placeholder MUST appear here. Reason starts with "placeholder — …".
      { "section": "<exact section name>", "q_no": <int>, "reason": "<short label>" }
    ],
    "marks_source":  "found_in_pdf" | "not_present",
    "answers_source": "found_in_pdf" | "not_present"
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
          "q_no": <int, optional — parser renumbers anyway>,
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
"tags" field. Anything that doesn't fit the schema must live INSIDE
the "text" field (or "passage" field) of the question(s) it applies to.


═══════════════════════════════════════════════════════════════════
SECTION NAMES — I provide these to you
═══════════════════════════════════════════════════════════════════

I will tell you the EXACT section names my exam expects, in the
order they appear in my exam. Use those exact strings as each
section's "name" field — character-for-character. Do not paraphrase,
do not change capitalisation, do not translate, do not add or
remove words or punctuation.

If the source PDF's section names differ from mine, MAP by order:
the PDF's first section → my first section, etc. If the order is
ambiguous (PDF has 4 sections, I gave you 3), STOP and ask me which
to drop. Do not guess.


═══════════════════════════════════════════════════════════════════
RULES — non-negotiable
═══════════════════════════════════════════════════════════════════

1. CONVERT, NEVER INVENT.
   • No answer in the PDF → "correct_answer": null (or omit).
   • No marks scheme in the PDF → omit "marks_config" entirely.
     Do not guess based on the exam name.
   • Question damaged / unreadable → skip; append to
     _extraction_summary.skipped with a short reason.

2. answer_type is EXCLUSIVELY "single" or "multi".
   single = exactly one correct option (regular MCQ).
   multi  = two or more correct options (rare; the PDF will say so).

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

3. correct_answer encoding is ZERO-BASED INDEX, AS A STRING.
   • "single" → one string. If option B in ["A","B","C","D"] is
     correct, emit "correct_answer": "1".
   • "multi"  → array of strings. If A and C are correct → ["0","2"].
   • The PDF's labels (a/b/c/d, A/B/C/D, 1/2/3/4, i/ii/iii/iv,
     क/ख/ग/घ) all map to 0/1/2/3 regardless of the label style.

4. SKIP-AND-CONTINUE at the question level. One bad question does
   NOT halt the batch. The bar for using _extraction_summary.skipped
   is now HIGH — reserve it for questions where the stem itself is
   unreadable (page damaged, OCR illegible). For unsupported
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

9. MODEL TIER. This prompt assumes you are GPT-5 / Claude Opus 4+ /
   Gemini 2.5 Pro or equivalent multi-modal frontier model. If you
   are a smaller / older model, STOP and tell me to switch — do not
   silently produce a degraded JSON.

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
into a sentinel — the creator must type real options in the
MockSetu editor.

ALSO log each placeholder in _extraction_summary.needs_manual_review
with one of these reason strings:

  • "placeholder — numeric/TITA unsupported in v1"
  • "placeholder — sequence-input unsupported in v1"
  • "placeholder — true/false unsupported in v1"
  • "placeholder — fill-in unsupported in v1"
  • "placeholder — descriptive unsupported in v1"
  • "placeholder — match unsupported in v1"
  • "placeholder — options malformed in PDF"

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
    "correct_answer": "..."
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
   N times. That is correct. If the resulting JSON file exceeds
   10 MB, the user will be told to split sections across files.

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
     20, 32, 26, 40, 24". If values are unreadable, SKIP that
     question and log "graph values unreadable".
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

INLINE math (within a sentence): wrap in single dollar signs.
  • "If $x^2 + y^2 = 25$, find $x + y$."
  • "The probability is $\frac{3}{7}$."
  • "Solve $\log_2(x+1) = 3$."

DISPLAY math (own line, larger): wrap in double dollar signs.
  • "$$\int_0^{\pi} \sin x \, dx = 2$$"
  • "$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$"

JSON ESCAPING — CRITICAL: every backslash in LaTeX must be DOUBLED
inside the JSON string (because JSON itself treats \ as an escape
character). So:

  LaTeX command       →  JSON string literal
  ─────────────────────────────────────────────
  \frac{a}{b}         →  "\\frac{a}{b}"
  \sqrt{x}            →  "\\sqrt{x}"
  \int_0^1            →  "\\int_0^1"
  \sin x              →  "\\sin x"
  \log_2              →  "\\log_2"
  \alpha + \beta      →  "\\alpha + \\beta"

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
ANSWERS — extracting correct_answer reliably
═══════════════════════════════════════════════════════════════════

WHERE ANSWERS LIVE in typical exam PDFs:
  • A consolidated answer key at the end of the paper.
  • Inline after each question ("Ans.(b)").
  • A separate "Solutions" section ("S25. Ans.(d)").
  • A grid / table of answer letters per question number.

ENCODE the answer as the zero-based index into YOUR options
array. If the PDF says the answer is "(c)" and your options are
in the order ["a-text","b-text","c-text","d-text","e-text"], then
"(c)" → "2".

If the PDF's answer letter doesn't correspond to any of your
options (you reordered, or there's a typo in the PDF), SKIP the
question and log "reason": "answer / option mismatch".

If NO answers appear ANYWHERE in the PDF → set
_extraction_summary.answers_source: "not_present" and leave every
correct_answer as null. The creator will fill them manually.

If SOME answers appear and others don't → set answers_source to
"found_in_pdf" and emit correct_answer: null only for the
specific questions whose answers were missing.


═══════════════════════════════════════════════════════════════════
WORKED EXAMPLES — copy these patterns
═══════════════════════════════════════════════════════════════════

EXAMPLE 1 — Simple MCQ with answer key
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
  "correct_answer": null,
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
  "correct_answer": null,
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
  "correct_answer": null,
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
  □ Every section name matches mine character-for-character.
  □ Every question has non-empty text, valid answer_type,
    options array (≥ 2 entries), and (where the PDF supplied it)
    a correct_answer.
  □ Every correct_answer index is in 0 … options.length-1.
  □ For answer_type: "single", correct_answer is a single
    string (not an array of multiple indices).
  □ For answer_type: "multi", correct_answer is an array of
    two or more distinct indices.
  □ No two questions in the same section share a q_no (or omit
    q_no entirely and let the parser number them by position).
  □ No two options in the SAME question are identical strings
    (if you see duplicates, you probably dropped a LaTeX
    backslash that distinguished them — fix and re-emit).
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

FINAL PASS — before emitting, read your JSON ONE MORE TIME,
character by character. Specifically grep for:
  • Any " inside a "..." string value → must be \" or curly quote
  • Any \ not followed by \ " / b f n r t u → must be doubled
  • Any "Ã" "Â" "â€" sequence → fix encoding to native Unicode
  • Any passage shorter than 5 sentences (likely summarised) →
    expand to full source text
  • Any image_region with x_min=0, y_min=0, x_max=1000, y_max=1000
    → replace with page-only (omit x/y) or estimate a real bbox
  • Any essential figure WITHOUT an image_region → add one
Catching these now saves a round-trip with the user.


═══════════════════════════════════════════════════════════════════
YOUR CONTEXT — fill these in, then attach the PDF and send
═══════════════════════════════════════════════════════════════════

  Language code:   ______           (use "en" or "hi")

  Section names from MY exam, in the order they appear:
    1. ______
    2. ______
    3. ______
    (add more lines if needed)

Now read the attached PDF and emit the JSON between
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
