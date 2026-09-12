# Import from PDF (Gemini) — setup and how it works

"Import from PDF" lets a creator upload an exam paper and get sections and
questions filled in automatically. Gemini runs MockSetu's own extraction prompt
(the one on `/json-upload-guide`) with the platform's key; everything after the
reply is the same code the manual JSON upload uses.

The feature is **off for every account**. An admin turns it on per creator.

## Turning it on (one-time, per project)

Do these in order on the project named in `.env` (not the one in
`supabase/config.toml` — they differ, see `docs/open-issues.md`).

1. **Paste the migration** `supabase/migrations/20260912000000_ai_pdf_import.sql`
   into the SQL editor. It needs `20260851000000_admin_attempts_are_engaged.sql`
   to be applied first (it carries that file's `admin_get_all_users` forward).
   The last block raises if anything did not land.
2. **Set the Gemini keys as function secrets** — never in the repo, never in
   `.env`, never in the client:
   ```sh
   supabase secrets set GEMINI_API_KEY=<primary key>
   supabase secrets set GEMINI_API_KEY_FALLBACK=<second key>   # optional
   ```
   A start that Gemini refuses with 403/429/5xx on the primary key is retried
   on the fallback. A background job is always polled with the key that
   created it.
3. **Deploy the function**:
   ```sh
   supabase functions deploy ai-pdf-import
   ```
   `supabase/config.toml` sets `verify_jwt = true` for it (and now also for the
   old `parse-pdf` prototype, which was unauthenticated).
4. **Grant a creator** from Admin → Users → row menu → *Allow AI PDF Import*.
   The row shows an "AI import" badge while granted. Revoking removes the menu
   item on their next page load and makes the function refuse them immediately.

Optional: `AI_IMPORT_THINKING_BUDGET` (a number) caps Gemini 2.5 Flash's
thinking tokens on the live engine. Leave it unset — with thinking off, 2.5
Flash finished in 138 s but left 42 of 100 questions as placeholders.

## What the creator sees

Exam editor → ⋮ menu → **Import from PDF** (only when granted, and only while
the exam is unpublished).

1. **Setup** — drop the PDF, pick the language slot (one run per language, as
   in the manual flow), pick the model, and, if that language already has
   questions, choose add or replace (replace is blocked once students have
   submitted, same rule as Upload JSON).
2. **Running** — six steps tick off: upload → Gemini → parse → sections →
   figures → save. A failed step shows why and a *Retry this step* button; a
   Gemini/parse failure on 2.5 Flash also offers *Switch to Gemini 3.5 Flash*.
   While Gemini works the dialog can be closed; reopening offers to continue.
3. **Done** — what landed per section (new sections are flagged with the time
   they were given: one minute per question, clamped 10–180), figures attached,
   option labels cleaned, and a *Check these before publishing* list built from
   Gemini's own `needs_manual_review` and `skipped` entries.

Sections the paper has and the exam does not are created automatically, in
every supported language (paired by `section_group_id`, like the manual flow's
"Create missing sections"). The PDF is attached to the sections' `pdf_url` so
per-question re-snipping works later.

## The two models

| | Gemini 3.5 Flash (default) | Gemini 2.5 Flash |
|---|---|---|
| Engine | `background` — Gemini runs the job on its side (Interactions API, `background: true`); we poll | `live` — the edge function waits on Gemini inside `EdgeRuntime.waitUntil` |
| Survives closing the tab | yes | yes, but bounded by the function wall clock |
| Wall clock | not a factor | **150 s on the Free plan, 400 s on paid.** The SBI Clerk test paper took 270 s, so on Free this model only suits short papers. `status` marks a job past 7 min as failed with a plain message. |
| Accuracy in the Sept 2026 checks | 100/100 answers over two passes; correct on the maths stems that are images | 92/92 answers, but dropped a digit (4560→450), lost a cube root, rewrote one expression, miswrote one distractor, padded a passage with its own working |
| Cost per 27-page paper | ≈ $0.59 at $1.50/$9 per M tokens | ≈ $0.16 at $0.30/$2.50 per M tokens |

Why 2.5 Flash cannot run in the background: Gemini refuses it
(`Model 'gemini-2.5-flash' does not support background interactions`), and the
Batch API returns `FAILED_PRECONDITION` on this key. Both were tried live.

## Architecture

```
ExamDetail ─ AiPdfImportDialog ─┬─ Storage: exam-pdfs/<uid>/<examId>/ai-import-<lang>-<ts>.pdf
                                ├─ functions/ai-pdf-import  {start | status | cancel | ack}
                                │     ├ auth.getUser  ├ profiles.can_use_ai_import
                                │     ├ exams.user_id ├ path prefix  ├ 12 starts/hour
                                │     ├ prompt = fillExtractionPromptContext(lang, DB section names)
                                │     ├ background → POST /v1beta/interactions (background:true)
                                │     └ live       → generateContent inside waitUntil
                                ├─ ai_import_jobs (status, interaction_id, api_key_slot, raw_output)
                                └─ then, client-side, exactly as Upload JSON:
                                   parseExamJson → buildSectionCreationPlan/createSections →
                                   autoSnip + uploadQuestionImage → commitJson
```

* **One prompt.** `src/lib/extractionPrompt.js` is imported by the guide page
  and by the edge function (relative path — Deno bundles it). The context block
  ("YOUR CONTEXT") is filled server-side from the exam's own section names; the
  client never sends prompt text, so the function is not a general Gemini proxy.
* **Option labels.** `src/lib/optionLabels.js` strips a leaked "(a) " prefix
  only when every option in the question carries the printed sequence. Applied
  to the parse report before commit; the summary reports how many changed.
* **Job rows** are written only by the function (service role). Creators have a
  SELECT policy on their own rows so the dialog can offer to resume. `ack` sets
  `imported_at` and drops `raw_output`.

## Tests

```sh
node src/__tests__/ai-import-prompt.test.mjs
node src/__tests__/option-labels.test.mjs
node src/__tests__/ai-import-gating.test.mjs
```

## Known gaps

* **Mixed-language papers.** The parser ignores `correct_answer` on the
  secondary language. A paper whose Quant/Reasoning exist only in Hindi (the
  SBI Clerk case) imports those sections without an answer key when English is
  primary. This predates the feature; the automatic flow just reaches it faster.
* **No cancel on Gemini's side.** `cancel` only frees the exam+language slot;
  a background interaction runs to completion and is billed.
* **The old `parse-pdf` function** still exists behind the CreateExamDialog
  "upload PDF" path and the "Parse with AI" tab. It now requires a JWT but
  still trusts its caller for `sectionId`. Remove or rewrite it.
* **Per-question numeric cross-check** against the PDF text layer (the check
  used in the September evaluation) is not run in-app yet. It would flag the
  2.5 Flash digit errors automatically.
