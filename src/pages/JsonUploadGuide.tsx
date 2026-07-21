import { useEffect, useState } from "react";
import { FileJson, ChevronRight, ArrowUp, Copy, Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";

const tocSections = [
  { id: "before-you-start", label: "Before you start" },
  { id: "step-1-copy", label: "Step 1 — Copy the prompt" },
  { id: "step-2-run", label: "Step 2 — Run it in your AI" },
  { id: "step-3-save", label: "Step 3 — Save the JSON" },
  { id: "step-4-upload", label: "Step 4 — Upload to MockSetu" },
  { id: "step-5-review", label: "Step 5 — Review & confirm" },
  { id: "step-6-repeat", label: "Step 6 — Repeat per language" },
  { id: "step-7-publish", label: "Step 7 — Publish" },
  { id: "passage-questions", label: "Passage-based questions" },
  { id: "sample-json", label: "Sample JSON" },
  { id: "fixing-errors", label: "Fixing errors" },
  { id: "fix-invalid-json", label: "→ Invalid JSON syntax" },
  { id: "fix-schema-version", label: "→ Wrong schema version" },
  { id: "fix-language-mismatch", label: "→ Language mismatch" },
  { id: "fix-missing-sections", label: "→ No sections" },
  { id: "fix-file-too-large", label: "→ File too large" },
  { id: "fix-file-read", label: "→ Couldn't read file" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const EXTRACTION_PROMPT = String.raw`You are converting an exam paper (PDF or scanned document) into a strict
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

const FIX_INVALID_JSON_PROMPT = String.raw`The JSON file you generated for me is structurally invalid —
MockSetu's parser failed because of a syntax error somewhere in
the file.

Please:
1. Re-emit the FULL JSON between the literal delimiters
   <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.
2. Make the JSON STRICTLY valid:
   - All strings double-quoted
   - No trailing commas
   - No comments and no shell-style ## headers
   - All braces { } and brackets [ ] balanced
   - Every " INSIDE a string value either escaped as \" or
     converted to a Unicode curly quote (“ ” ‘ ’). This is the
     #1 cause — check book / essay titles in passages first
     (e.g. "Writing Ocean Worlds", "The Affluent Society").
   - No other unescaped double-quotes inside string values
   - Every LaTeX backslash DOUBLED inside JSON strings
     (e.g. LaTeX \frac{a}{b} becomes "\\frac{a}{b}" in JSON;
     \sqrt{7} becomes "\\sqrt{7}")
3. Do NOT change any content — questions, options, answers, marks,
   section names, passages, and math must be preserved exactly.
4. Mentally parse the JSON before emitting; make sure it would
   parse with a strict parser.

Here is the broken JSON to fix — paste it below this prompt:`;

const FIX_SCHEMA_VERSION_PROMPT = `The JSON you produced has an unsupported or missing
schema_version. MockSetu only accepts schema_version "1.0".

Please re-emit the FULL JSON with:
  "schema_version": "1.0"
as the first field after the opening brace.

Do NOT change anything else — keep questions, options, answers,
marks, and section names exactly as they are.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.

Here is the JSON to fix — paste it below this prompt:`;

const FIX_LANGUAGE_PROMPT = `The JSON's "language" field doesn't match the language slot I
am uploading to in MockSetu.

The correct language code for this upload is: "______"
(use "en" for English, "hi" for Hindi).

Please re-emit the FULL JSON with that exact value in the
"language" field. Do NOT change anything else — keep questions,
options, answers, marks, and section names exactly as they are.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.

Here is the JSON to fix — paste it below this prompt:`;

const FIX_MISSING_SECTIONS_PROMPT = `The JSON you produced is missing the "sections" array (or it is
empty). MockSetu requires at least one section, and every question
must live inside a section.

Please re-extract from the original PDF, making sure to group all
questions into "sections", each with a "name" field that matches
my exam's section names exactly.

My exam's section names, in order:
  1. ______
  2. ______
  3. ______
  (add more lines if your exam has more sections)

For each section, put its questions inside a "questions" array.
Follow the schema in my original prompt.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.`;

const PASSAGE_EXAMPLE_JSON = String.raw`{
  "schema_version": "1.0",
  "language": "en",
  "sections": [
    {
      "name": "Verbal Ability and Reading Comprehension",
      "questions": [
        {
          "q_no": 1,
          "passage": "The Indian Ocean world is a term used to describe the very long-lasting connections among the coasts of East Africa, the Arab coasts, and South and East Asia. These connections were made possible by the geography of the Indian Ocean — for much of history, travel by sea was much easier than by land.",
          "text": "According to the passage, what made the Indian Ocean connections possible?",
          "answer_type": "single",
          "options": [
            "Advances in shipbuilding technology",
            "The geography of the Indian Ocean",
            "Colonial trading policies",
            "Religious pilgrimage routes"
          ],
          "correct_answer": "1"
        },
        {
          "q_no": 2,
          "passage": "The Indian Ocean world is a term used to describe the very long-lasting connections among the coasts of East Africa, the Arab coasts, and South and East Asia. These connections were made possible by the geography of the Indian Ocean — for much of history, travel by sea was much easier than by land.",
          "text": "Which of the following is NOT mentioned in the passage as part of the Indian Ocean world?",
          "answer_type": "single",
          "options": [
            "East Africa",
            "Arab coasts",
            "Western Europe",
            "South Asia"
          ],
          "correct_answer": "2"
        }
      ]
    }
  ]
}`;

const SAMPLE_JSON = String.raw`{
  "schema_version": "1.0",
  "language": "en",
  "_extraction_summary": {
    "source_pdf": "sample-exam.pdf",
    "model": "gpt-5",
    "total_in_pdf": 3,
    "extracted": 3,
    "skipped": [],
    "needs_manual_review": [],
    "marks_source": "not_present",
    "answers_source": "found_in_pdf"
  },
  "sections": [
    {
      "name": "Verbal",
      "questions": [
        {
          "text": "Passage:\n\nThe Indian Ocean world is a term used to describe the very long-lasting connections among the coasts of East Africa, the Arab coasts, and South and East Asia. These connections were made possible by the geography of the Indian Ocean — for much of history, travel by sea was much easier than by land.\n\nQuestion: According to the passage, what made the Indian Ocean connections possible?",
          "answer_type": "single",
          "options": [
            "Advances in shipbuilding technology",
            "The geography of the Indian Ocean",
            "Colonial trading policies",
            "Religious pilgrimage routes"
          ],
          "correct_answer": "1"
        }
      ]
    },
    {
      "name": "Quantitative",
      "questions": [
        {
          "text": "If $\\sqrt{5x+9} + \\sqrt{5x-9} = 3(2+\\sqrt{2})$, then $\\sqrt{10x+9}$ is equal to:",
          "answer_type": "single",
          "options": ["$3\\sqrt{7}$", "$4\\sqrt{5}$", "$3\\sqrt{31}$", "$2\\sqrt{7}$"],
          "correct_answer": "1"
        },
        {
          "text": "A rectangle has length-to-width ratio 5:3. If twice the perimeter is 96 cm, find the area (in $\\text{cm}^2$).",
          "answer_type": "single",
          "options": ["225", "135", "196", "180", "154"],
          "correct_answer": "1"
        }
      ]
    }
  ]
}`;

const SectionHeading = ({ id, title, sub }: { id: string; title: string; sub?: string }) => (
  <div id={id} className="scroll-mt-24 pt-10 pb-3 border-b border-border/50 mb-6">
    {sub && <p className="text-xs font-bold tracking-widest text-primary uppercase mb-1">{sub}</p>}
    <h2 className="text-[22px] font-bold text-foreground tracking-tight">{title}</h2>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] text-muted-foreground leading-[1.85] mb-4">{children}</p>
);

const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="mb-5 space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-[14.5px] text-muted-foreground leading-[1.75]">
        <ChevronRight className="h-4 w-4 mt-[3px] flex-shrink-0 text-primary/50" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const OL = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="mb-5 space-y-2 list-decimal pl-5">
    {items.map((item, i) => (
      <li key={i} className="text-[14.5px] text-muted-foreground leading-[1.75]">
        {item}
      </li>
    ))}
  </ol>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 rounded bg-secondary text-[12.5px] font-mono text-foreground">
    {children}
  </code>
);

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: label ? `${label} copied to clipboard.` : "Copied to clipboard.",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the text manually and copy it.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative mb-6 group">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="bg-[#0c0f1a] text-slate-100 text-[12.5px] leading-[1.6] p-5 pr-28 rounded-lg overflow-x-auto whitespace-pre font-mono max-h-[520px]">
        {text}
      </pre>
    </div>
  );
}

const JsonUploadGuide = () => {
  const [activeSection, setActiveSection] = useState("before-you-start");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowTop(window.scrollY > 400);
      const ids = tocSections.map((s) => s.id);
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = document.getElementById(ids[i]);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(ids[i]);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Honor #anchor in the URL on mount and on hash changes. The browser's
  // built-in hash scroll fires before this React tree has painted, so the
  // target element doesn't exist yet and the page lands at the top. We
  // re-run scrollIntoView after paint (via rAF) so deep links from the
  // upload dialog's "See how to fix this →" link land on the right section.
  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      // Wait one frame so SectionHeading nodes are mounted.
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          setActiveSection(hash);
        }
      });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="JSON Upload Guide | MockSetu"
        description="Step-by-step guide for creators: convert your exam PDF into JSON using your own AI, then upload to MockSetu in a few minutes."
        path="/json-upload-guide"
      />
      <Navbar />

      {/* Hero */}
      <div className="bg-[#07091A] pt-32 pb-16 px-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#6C3EF4]/15 border border-[#6C3EF4]/25 mb-6">
          <FileJson className="h-7 w-7 text-[#6C3EF4]" />
        </div>
        <h1 className="text-[36px] sm:text-[48px] font-black text-white tracking-[-0.03em] leading-tight">
          JSON Upload Guide
        </h1>
        <p className="mt-3 text-white/40 text-[15px] max-w-xl mx-auto">
          Convert your exam PDF into JSON using your own AI, then upload it to MockSetu. About 5 minutes per language.
        </p>
      </div>

      {/* Body */}
      <div className="container mx-auto max-w-6xl px-5 py-16">
        <div className="flex gap-12">
          {/* Sticky ToC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground/60 uppercase mb-4">
                Contents
              </p>
              <nav className="space-y-0.5">
                {tocSections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`block px-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                      activeSection === s.id
                        ? "bg-primary/8 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    } ${s.label.startsWith("→") ? "pl-6" : ""}`}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 max-w-3xl">
            {/* Before you start */}
            <SectionHeading id="before-you-start" title="Before you start" />
            <P>You need three things to use this feature:</P>
            <UL
              items={[
                <>
                  <strong>An exam already created in MockSetu</strong>, with{" "}
                  <strong>sections</strong> added. Write down each section's exact name — they
                  must match the section names inside your JSON.
                </>,
                <>
                  <strong>A PDF</strong> of your exam paper (the source you want to convert).
                </>,
                <>
                  <strong>A frontier-AI account</strong>: ChatGPT (GPT-5), Claude (Opus 4 or
                  newer), or Gemini (2.5 Pro). Older or smaller models will hallucinate answers
                  — do not use them for this.
                </>,
              ]}
            />
            <P>Typical time: about 5 minutes per language.</P>

            {/* Step 1 */}
            <SectionHeading id="step-1-copy" title="Step 1 — Copy the prompt" sub="Step 1 of 7" />
            <P>
              Click the Copy button at the top-right of the block below. You'll paste this into
              your AI in Step 2.
            </P>
            <CopyBlock text={EXTRACTION_PROMPT} label="Prompt" />
            <P>
              What this prompt does: it instructs the AI to read your PDF and produce JSON in
              the exact format MockSetu expects, and to <strong>never invent</strong> answers or
              marks — only convert what's actually in the PDF.
            </P>

            {/* Step 2 */}
            <SectionHeading id="step-2-run" title="Step 2 — Run it in your AI" sub="Step 2 of 7" />
            <OL
              items={[
                "Open ChatGPT, Claude, or Gemini in a new tab and start a fresh chat.",
                "Paste the prompt from Step 1.",
                <>
                  <strong>Before sending</strong>, fill in the placeholders at the bottom of the
                  prompt: the language code (<Code>en</Code> or <Code>hi</Code>) and your exam's
                  section names in the order they appear in MockSetu.
                </>,
                "Attach your PDF to the chat.",
                "Send.",
              ]}
            />
            <P>
              The AI replies with a JSON block wrapped between{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_START&gt;&gt;&gt;</Code> and{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_END&gt;&gt;&gt;</Code>.
            </P>

            {/* Step 3 */}
            <SectionHeading id="step-3-save" title="Step 3 — Save the JSON" sub="Step 3 of 7" />
            <OL
              items={[
                "Select everything between the delimiters in the AI's reply (including or excluding the delimiter lines — both work; the parser strips them).",
                "Copy.",
                "Open Notepad, TextEdit, or VS Code.",
                "Paste.",
                <>
                  Save the file with a <Code>.json</Code> extension <strong>and with UTF-8
                  encoding</strong>. In Notepad: <em>Save As → Encoding dropdown → UTF-8</em>.
                  In VS Code: confirm the bottom-right status bar reads <Code>UTF-8</Code>.
                  Avoid <em>ANSI</em> or <em>Western (Windows-1252)</em> — those mangle
                  accented letters and em-dashes into <Code>LozÃ¨re</Code>, <Code>â</Code>,
                  <Code>Â°</Code>, and friends.
                </>,
                <>
                  Tip: include the language code in the filename, e.g.{" "}
                  <Code>my-exam-en.json</Code>.
                </>,
              ]}
            />

            {/* Step 4 */}
            <SectionHeading id="step-4-upload" title="Step 4 — Upload to MockSetu" sub="Step 4 of 7" />
            <OL
              items={[
                "Open your exam's edit page.",
                <>
                  Click the <strong>⋮</strong> menu in the top-right corner.
                </>,
                <>
                  Click <strong>Upload JSON</strong>.
                </>,
                "In the modal, click the Upload JSON button next to the language you just generated.",
                <>
                  Pick your <Code>.json</Code> file.
                </>,
              ]}
            />

            {/* Step 5 */}
            <SectionHeading id="step-5-review" title="Step 5 — Review & confirm" sub="Step 5 of 7" />
            <P>The preview shows you exactly what will happen if you confirm:</P>
            <UL
              items={[
                "Per-section match status: ✓ matched in your exam, ✗ not in this exam.",
                "How many questions are valid vs skipped, with the reason for each skip.",
                "AI-flagged questions that need your eyes (math, images, ambiguity).",
                "Placeholder questions (numeric / TITA / sequence-input rows the AI emits at the right q_no with sentinel options — they show as warnings; open each in the editor and fill the real options before publishing).",
                "Whether a marks scheme was found in the PDF.",
              ]}
            />
            <P>
              <strong>If section names don't match</strong>: a guided-fix panel appears at the
              top of the preview, with a one-click Copy prompt. Paste it into your AI along
              with the JSON — the AI returns a renamed version you can re-upload. Or rename your
              exam's sections in MockSetu to match.
            </P>
            <P>
              <strong>If the language already has questions</strong>, you'll pick one of:
            </P>
            <UL
              items={[
                <>
                  <strong>Replace</strong> — deletes every question in this language and inserts
                  fresh ones. Destructive. Blocked if any student has already submitted attempts
                  on this language.
                </>,
                <>
                  <strong>Append</strong> — adds the new questions after the existing ones in
                  each matched section. Safe; the default.
                </>,
              ]}
            />
            <P>
              Click <strong>Confirm Upload</strong>. In a few seconds your questions are
              created.
            </P>

            {/* Step 6 */}
            <SectionHeading
              id="step-6-repeat"
              title="Step 6 — Repeat for other languages"
              sub="Step 6 of 7"
            />
            <P>
              If your exam supports more than one language (for example, English + Hindi),
              upload one JSON per language:
            </P>
            <OL
              items={[
                <>
                  Upload the <strong>primary</strong> language first — the one marked with the
                  PRIMARY badge in the modal.
                </>,
                "Then upload each secondary language. The system pairs its questions to primary by order.",
              ]}
            />
            <P>For secondary-language uploads:</P>
            <UL
              items={[
                <>
                  The AI's <Code>correct_answer</Code> is <strong>ignored</strong> — primary is
                  the source of truth for correct answers.
                </>,
                <>
                  The AI's <Code>marks_config</Code> is <strong>ignored</strong> — marks are
                  managed on the primary language only.
                </>,
                "Empty text, missing options, and count mismatches are allowed at upload time, but they will block publishing of that secondary language until you fix them.",
              ]}
            />

            {/* Step 7 */}
            <SectionHeading id="step-7-publish" title="Step 7 — Publish" sub="Step 7 of 7" />
            <P>When you publish your exam:</P>
            <UL
              items={[
                "The primary language publishes independently — your existing rules still apply (each section has at least one question, no blank stems, etc.).",
                "Each secondary language is checked against primary: same section count, same question count per section, every question linked back to primary, non-empty text, matching option counts, matching answer types.",
                "If a check fails, the Publish dialog lists exactly what to fix. Primary still publishes — secondary failures only block that secondary language.",
              ]}
            />

            {/* Passage-based questions */}
            <SectionHeading id="passage-questions" title="Passage-based questions" />
            <P>
              Reading-comprehension clusters, case studies, and shared-context sets are
              supported via an <strong>optional <Code>passage</Code> field</strong> on each
              question. The parser wraps it using the same HTML markup the manual-add flow uses,
              so the simulator renders the familiar <strong>two-column layout</strong>: passage
              on the left, question + options on the right.
            </P>
            <P>
              <strong>Rules:</strong>
            </P>
            <UL
              items={[
                <>
                  When N questions share a passage, emit the <Code>passage</Code> string on{" "}
                  <strong>each</strong> of those N questions — with identical content. This
                  duplication is intentional and matches how the editor already stores manual
                  passages.
                </>,
                <>
                  The <Code>text</Code> field holds only the question stem when{" "}
                  <Code>passage</Code> is present — no <Code>Passage:</Code> prefix needed.
                </>,
                <>
                  Plain text is best. Simple HTML allowed inside <Code>passage</Code>:{" "}
                  <Code>&lt;p&gt;</Code>, <Code>&lt;br&gt;</Code>, <Code>&lt;em&gt;</Code>,{" "}
                  <Code>&lt;strong&gt;</Code>, <Code>&lt;ul&gt;</Code>, <Code>&lt;li&gt;</Code>,{" "}
                  <Code>&lt;blockquote&gt;</Code>. The parser strips <Code>&lt;div&gt;</Code>{" "}
                  and <Code>&lt;script&gt;</Code> tags for safety.
                </>,
                <>
                  If the passage is genuinely image-only (chart, diagram, scanned figure the AI
                  can't transcribe), <em>omit</em> the <Code>passage</Code> field and add the
                  affected <Code>q_no</Code>s to{" "}
                  <Code>_extraction_summary.needs_manual_review</Code> with reason{" "}
                  <Code>"passage image required"</Code>. After import, open the question in the
                  editor and use the existing <strong>Passage Image</strong> uploader.
                </>,
                <>
                  Multi-language: emit the translated passage on each question in the secondary
                  JSON, exactly the same way. Primary and secondary stay paired by{" "}
                  <Code>question_group_id</Code>.
                </>,
              ]}
            />
            <P>Example — 2 questions sharing one passage:</P>
            <CopyBlock text={PASSAGE_EXAMPLE_JSON} label="Passage example" />
            <P>
              <strong>Fallback (single-column):</strong> if you'd rather not use a separate
              field, you can still embed the passage inline in <Code>text</Code> using a{" "}
              <Code>Passage:\n\n…\n\nQuestion: …</Code> pattern. Renders as a single column —
              the two-column layout requires the <Code>passage</Code> field.
            </P>

            {/* Sample JSON */}
            <SectionHeading id="sample-json" title="Sample JSON" />
            <P>The smallest valid example — one section with one question:</P>
            <CopyBlock text={SAMPLE_JSON} label="Sample JSON" />
            <P>
              For the full schema (marks config, multi-section, per-question marks overrides),
              look at the SCHEMA block inside the prompt in Step 1.
            </P>

            {/* Fixing errors */}
            <SectionHeading id="fixing-errors" title="Fixing errors" />
            <P>
              When an upload fails, the dialog shows the exact error and links you here. Each
              section below covers one error type, what causes it, and a Copy-able prompt you
              can paste into your AI to fix the JSON without re-extracting from the PDF.
            </P>
            <P>
              Workflow for AI-fix-prompts: copy the prompt, open the same chat where you
              originally extracted the JSON (so the AI still has the PDF context), paste the
              prompt, then paste your broken JSON below it. The AI returns a corrected version
              between <Code>&lt;&lt;&lt;EXAM_JSON_START&gt;&gt;&gt;</Code> and{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_END&gt;&gt;&gt;</Code> — save it as <Code>.json</Code>{" "}
              and re-upload.
            </P>

            {/* Fix: Invalid JSON */}
            <SectionHeading id="fix-invalid-json" title="Invalid JSON syntax" sub="Error type" />
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 mb-5">
              <p className="text-[13.5px] text-blue-900 dark:text-blue-200 leading-[1.7]">
                <strong>Before this error reaches you, MockSetu auto-repairs common AI mistakes.</strong>{" "}
                The parser silently fixes unescaped quotes inside strings, trailing commas,
                markdown code fences, smart quotes, Python <Code>True</Code> /{" "}
                <Code>False</Code> / <Code>None</Code>, missing commas, and explanatory prose
                around the JSON. If you're seeing this error, even auto-repair couldn't
                recover the file — usually the AI's reply was truncated mid-output, or the
                content is genuinely corrupted. Either re-extract from the PDF or fix
                manually using the steps below.
              </p>
            </div>
            <P>
              <strong>What it looks like:</strong> a red toast or banner like{" "}
              <Code>{`"Couldn't parse JSON: Expected ',' or '}' after property value..."`}</Code>{" "}
              with a line-and-column reference and a few lines of context around the broken
              spot.
            </P>
            <P>
              <strong>What happened:</strong> the AI's output isn't valid JSON. Common causes
              are a missing comma, a stray quote, an unescaped character inside a string value,
              or extra prose the AI added outside the delimiters.
            </P>
            <P>
              <strong>Fix it manually (faster for one stray character):</strong>
            </P>
            <OL
              items={[
                <>
                  Open the <Code>.json</Code> file in VS Code or Notepad++ (not Word — Word
                  will introduce smart quotes that break JSON).
                </>,
                "Jump to the line and column shown in the error message.",
                <>
                  Fix the issue: add the missing comma, escape the stray quote (
                  <Code>\"</Code> inside strings), or remove the trailing comma.
                </>,
                "Save and re-upload.",
              ]}
            />
            <P>
              <strong>Or have your AI fix it</strong> — copy this prompt and paste it into the
              same chat where you originally extracted the JSON:
            </P>
            <CopyBlock text={FIX_INVALID_JSON_PROMPT} label="Invalid-JSON fix prompt" />

            {/* Fix: Schema version */}
            <SectionHeading
              id="fix-schema-version"
              title="Wrong or missing schema version"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"Unsupported schema_version "X" — this builder supports "1.0""</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the AI emitted a different version (or no version
              at all). MockSetu's parser is strict about this so old / future-incompatible JSONs
              can't sneak in.
            </P>
            <P>
              <strong>Fix it</strong> — copy this prompt and paste it into your AI chat:
            </P>
            <CopyBlock text={FIX_SCHEMA_VERSION_PROMPT} label="Schema-version fix prompt" />

            {/* Fix: Language mismatch */}
            <SectionHeading
              id="fix-language-mismatch"
              title="Language mismatch"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong> any of —
            </P>
            <UL
              items={[
                <>
                  <Code>"Missing 'language' field"</Code>
                </>,
                <>
                  <Code>"Language 'fr' is not supported by this exam"</Code>
                </>,
                <>
                  <Code>"JSON is for 'hi' but you clicked Upload on 'en'"</Code>
                </>,
              ]}
            />
            <P>
              <strong>What happened:</strong> the JSON declares a language that doesn't match
              the row you clicked in the upload modal, or doesn't declare one at all.
            </P>
            <P>
              <strong>Fix it (option 1):</strong> upload the file to the right language slot —
              the modal shows one row per language; click the button next to the one whose code
              matches the JSON.
            </P>
            <P>
              <strong>Fix it (option 2):</strong> ask your AI to change the language in the
              JSON to match the slot you want to upload to. Fill the underscore in the prompt
              with <Code>en</Code> or <Code>hi</Code>:
            </P>
            <CopyBlock text={FIX_LANGUAGE_PROMPT} label="Language fix prompt" />

            {/* Fix: No sections */}
            <SectionHeading
              id="fix-missing-sections"
              title="No sections in JSON"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"JSON has no 'sections' — nothing to import"</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the JSON is missing the <Code>"sections"</Code>{" "}
              array or it's an empty array. MockSetu requires every question to live inside a
              section, and every JSON to declare at least one.
            </P>
            <P>
              <strong>Fix it</strong> — copy this prompt, fill in your exam's section names,
              and paste into your AI chat:
            </P>
            <CopyBlock
              text={FIX_MISSING_SECTIONS_PROMPT}
              label="Missing-sections fix prompt"
            />
            <P>
              If you don't remember your exam's section names, the upload dialog shows them at
              the top — re-open ⋮ → Upload JSON to see the list.
            </P>

            {/* Fix: File too large */}
            <SectionHeading
              id="fix-file-too-large"
              title="File too large"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"File too large — Max 10 MB"</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the JSON is over 10 MB. Most exams should be a
              fraction of this; usually this means the AI duplicated long passages across
              questions, or your exam is genuinely enormous (~5000+ questions).
            </P>
            <P>
              <strong>Fix it</strong>:
            </P>
            <UL
              items={[
                "Check for repeated passages. If you have a comprehension section where each question repeats the full passage in its text, ask your AI to factor the passage out and reference it once per group instead.",
                "Split the JSON. Emit just some sections at a time, save each as a separate file, and upload them one after another. MockSetu's parser commits only the sections it finds in your exam — leaving the others untouched — so you can split safely.",
                "Re-extract on a leaner model setting (no verbose preambles, no explanations).",
              ]}
            />
            <P>
              There is no Copy-prompt for this one because the right fix depends on which
              cause it is.
            </P>

            {/* Fix: File read */}
            <SectionHeading
              id="fix-file-read"
              title="Couldn't read file"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"Couldn't read file"</Code> followed by a browser-specific message.
            </P>
            <P>
              <strong>What happened:</strong> the browser failed to read the file off disk.
              Rare — usually a deleted file, a cloud-sync conflict (OneDrive/Dropbox writing
              the file mid-read), or a permissions issue.
            </P>
            <P>
              <strong>Fix it</strong>:
            </P>
            <UL
              items={[
                <>
                  Re-save the file with a fresh name (e.g. <Code>my-exam-en-fixed.json</Code>).
                </>,
                "Move it out of any cloud-sync folder while uploading.",
                "Try a different browser (Chrome, Firefox, Edge) if one is misbehaving.",
                "If the file genuinely got corrupted on save, paste the AI's reply into a fresh editor window and save again.",
              ]}
            />

            {/* Troubleshooting */}
            <SectionHeading id="troubleshooting" title="Troubleshooting" />
            <div className="overflow-x-auto mb-6 rounded-lg border border-border/50">
              <table className="w-full text-[14px] border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border/50">
                    <th className="text-left py-3 px-4 font-semibold text-foreground w-2/5">
                      Symptom
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Fix</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground leading-[1.65]">
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "Couldn't parse JSON"</td>
                    <td className="py-3 px-4">
                      The file isn't valid JSON. Open it in VS Code; look for missing commas or
                      stray characters.{" "}
                      <a
                        href="#fix-invalid-json"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "Unsupported schema_version"</td>
                    <td className="py-3 px-4">
                      The AI didn't emit <Code>"schema_version": "1.0"</Code>. Re-run with the
                      exact prompt above on a frontier model.{" "}
                      <a
                        href="#fix-schema-version"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "JSON is for X but you clicked Upload on Y"</td>
                    <td className="py-3 px-4">
                      Wrong file for this language slot. Pick the right one for the row you
                      clicked, or ask your AI to change the JSON's <Code>language</Code> field.{" "}
                      <a
                        href="#fix-language-mismatch"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "JSON has no 'sections'"</td>
                    <td className="py-3 px-4">
                      The AI's output is missing the <Code>sections</Code> array.{" "}
                      <a
                        href="#fix-missing-sections"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "File too large"</td>
                    <td className="py-3 px-4">
                      Max upload is 10 MB.{" "}
                      <a
                        href="#fix-file-too-large"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Preview shows ✗ next to a section</td>
                    <td className="py-3 px-4">
                      The JSON's section name doesn't match your exam. Use the in-app rename
                      prompt that appears in the preview — click its Copy button, paste into
                      your AI along with the JSON, then re-upload.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Many questions show as "skipped"</td>
                    <td className="py-3 px-4">
                      Check the reasons in the preview. The current prompt only routes
                      questions to "skipped" when the stem is genuinely unreadable. If an
                      older or alternate prompt dropped many numeric / TITA / sequence-input
                      questions into "skipped", re-run with the Step 1 prompt: it now emits
                      those as placeholder MCQs at the correct q_no so the JSON's numbering
                      stays aligned with the PDF.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      Question count is lower than the PDF / numbering skips
                    </td>
                    <td className="py-3 px-4">
                      Same root cause: the AI dropped unsupported types instead of
                      emitting placeholders. Re-run Step 1 with the current prompt — for
                      every numeric / TITA / sequence-input it should emit a placeholder
                      MCQ at the right q_no with the sentinel options
                      <Code>[Manual entry needed — unsupported type in v1]</Code> and
                      <Code>[See PDF Q&lt;n&gt; for the actual answer]</Code>. The
                      upload preview flags each placeholder so you can fill them in.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      A placeholder lost its passage / diagram
                    </td>
                    <td className="py-3 px-4">
                      Placeholders in a shared-context cluster MUST carry the same
                      <Code>passage</Code> and same <Code>image_region</Code> as their
                      MCQ siblings. If the AI omitted them, ask it to re-emit the cluster
                      and copy the passage / image_region from the sibling MCQs onto every
                      placeholder in the group.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      Text shows <Code>LozÃ¨re</Code>, <Code>Â°</Code>, <Code>â€™</Code>,{" "}
                      <Code>â</Code>, or similar garbage
                    </td>
                    <td className="py-3 px-4">
                      UTF-8 mojibake — the file was saved (or the AI emitted) in
                      Windows-1252 instead of UTF-8. Open in VS Code, change the
                      bottom-right encoding indicator to <Code>UTF-8</Code>, Save, re-upload.
                      The parser also tries to auto-repair common mojibake; if it succeeded,
                      you'll see <Code>mojibake_fixed</Code> in the preview's repair list.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      Math options render as the literal words "frac" or "sqrt"
                    </td>
                    <td className="py-3 px-4">
                      LaTeX backslashes weren't doubled. The parser auto-fixes most cases
                      (look for <Code>latex_escapes_fixed</Code> in the preview); if some
                      slipped through, ask the AI to re-emit with every <Code>\</Code> in
                      LaTeX replaced by <Code>\\</Code> and re-upload.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      Imported questions have no <Code>correct_answer</Code>
                    </td>
                    <td className="py-3 px-4">
                      The AI couldn't find the answer in the PDF. Fill in the answers manually
                      in the editor after upload.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">AI's reply isn't wrapped in delimiters</td>
                    <td className="py-3 px-4">
                      Older or weaker model. Switch to GPT-5, Claude Opus 4 (or newer), or
                      Gemini 2.5 Pro.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="py-3 px-4">Cannot publish a secondary language</td>
                    <td className="py-3 px-4">
                      Open the Publish dialog — it lists the exact parity failures (missing
                      section, wrong question count, empty text, option-count mismatch, etc.).
                      Fix each item and retry.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 z-30 inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      <Footer />
    </div>
  );
};

export default JsonUploadGuide;
