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
2. **Paste** `supabase/migrations/20260916000000_ai_import_parallel.sql` — the
   two columns and two functions that parallel extraction plans with. This one
   is **not** required for the feature to work: without it the function keeps
   importing, one Gemini call for the whole paper, exactly as it did before. It
   is what makes the import two to four times faster, so paste it, but a
   deploy that gets ahead of it breaks nothing.

   The function probes for both the columns and the functions once per worker
   and logs `running single-pass imports: migration 20260916000000 is not
   applied` when either is missing. It re-probes every five minutes, so the
   import speeds up on its own a few minutes after the SQL lands — no redeploy.
3. **Set the Gemini keys as function secrets** — never in the repo, never in
   `.env`, never in the client:
   ```sh
   supabase secrets set GEMINI_API_KEY=<primary key>
   supabase secrets set GEMINI_API_KEY_FALLBACK=<second key>    # optional
   supabase secrets set GEMINI_API_KEY_FALLBACK2=<third key>    # optional
   supabase secrets set GEMINI_API_KEY_FALLBACK3=<fourth key>   # optional
   ```
   A call Gemini refuses with 403/429/5xx moves to the next key in that order,
   skipping slots with no secret set, so one key or all four both work. The
   point of the extra slots is a **separate Google account per key**: the free
   tier's daily cap is per project, so four keys on one project all run out
   together and buy nothing. Once every configured key has said no, the creator
   is told exactly that rather than "retry in a minute".

   A background job is always polled with the key that created it — the slot
   lands in `ai_import_jobs.api_key_slot` at start, and Gemini will not show an
   interaction to a different key.

   Secrets are read per invocation, so adding a key is `supabase secrets set`
   plus nothing: no redeploy, no restart.
4. **Deploy the function** — to the project in `.env`, which is **not** the one
   `supabase/config.toml` names:
   ```sh
   supabase functions deploy ai-pdf-import --project-ref <the ref in your .env URL>
   ```
   A bare `supabase functions deploy` uses `config.toml`'s `project_id`, and on
   this repo those two are different projects. Deploying to the wrong one looks
   like a successful deploy that changes nothing.

   **No CLI? Let GitHub deploy it.** `.github/workflows/deploy-ai-pdf-import.yml`
   deploys the function on every push to `main` that touches it (or on the
   *Run workflow* button in the Actions tab), with the project ref pinned, and
   then reads the live version header and fails if it does not match the code.
   One-time setup, all in the browser: Supabase dashboard → account menu →
   *Access Tokens* → generate one; GitHub → repo → *Settings → Secrets and
   variables → Actions* → add it as `SUPABASE_ACCESS_TOKEN`. Add
   `SUPABASE_ANON_KEY` (the `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`, a
   public key) as a second secret so the verify step can get past the gateway.
   Gemini keys are not part of this — they stay in *Edge Functions → Secrets*
   and are read per invocation.

   **Check which build is live** — no import needed, but the request has to get
   past the gateway first: `verify_jwt = true` means a request with no JWT is
   answered by the gateway itself (`{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`) and
   never reaches the function or its header. The project's anon key is a valid
   JWT, so use that:
   ```sh
   curl -s -D - -o /dev/null -X POST https://<project>.supabase.co/functions/v1/ai-pdf-import \
     -H "Authorization: Bearer <VITE_SUPABASE_PUBLISHABLE_KEY from .env>" \
     -H "Content-Type: application/json" -d '{}' \
     | grep -i x-ai-import-version
   ```
   The function's own 401 (`sign_in_required`) carries `x-ai-import-version`. If
   the header is absent on *that* response, the deployed build predates it and
   the parallel importer is not live however many times the SQL has been pasted.

   **Found on 2026-09-23:** exactly that. The database had both parallel columns
   and both RPCs (probed through PostgREST with the anon key: the columns select
   as `[]`, the RPCs answer "permission denied" — which means they exist and are
   correctly locked to the service role), but the live function answered with no
   version header. The September 13 single-pass build was still deployed, so
   every "Split into parts" import had actually been one long request on the
   primary key with no timeout. Nothing in this document is live until step 4 is
   run against the `.env` project.

   **Found later the same day, after deploying:** every job *still* ran the
   single pass — `orchestration` was `null` on every row. The two RPCs existed
   and were correctly locked to the service role, but *calling* them raised
   `22P02 malformed array literal: "status"`. The bodies appended untyped
   literals to a `text[]` (`target || 'status'`); Postgres resolves that as
   array ‖ array and tries to read the word `status` as an array literal, at
   plan time, even on the `CASE` branch not taken. The probe saw the error,
   logged "running single-pass imports" where nobody looks, and degraded. The
   file now casts every literal (`'status'::text`) and ends with a `DO` block
   that **calls** both functions, so a broken body fails the paste itself.
   **Re-paste `20260916000000_ai_import_parallel.sql`** — `CREATE OR REPLACE`
   swaps the bodies in place. The function re-probes every minute, `status`
   replies carry `splitBlockedBy` with the exact database error, and the dialog
   prints it next to "all in one go". A degraded path that says why it degraded
   is a bug report; one that does not is a week.

   A signed-in, granted creator can also POST `{"action":"health"}` to the
   function and get back the version, whether the split can run on this
   database, the model list, and which keys are resting and why.

   `supabase/config.toml` sets `verify_jwt = true` for it (and now also for the
   old `parse-pdf` prototype, which was unauthenticated).
5. **Grant a creator** from Admin → Users → row menu → *Allow AI PDF Import*.
   The row shows an "AI import" badge while granted. Revoking removes the menu
   item on their next page load and makes the function refuse them immediately.

Optional: `AI_IMPORT_THINKING_BUDGET` (a number) caps Gemini 2.5 Flash's
thinking tokens on the live engine. Leave it unset — with thinking off, 2.5
Flash finished in 138 s but left 42 of 100 questions as placeholders.

## What the creator sees

Exam editor → ⋮ menu → **Import from PDF** (only when granted, and only while
the exam is unpublished).

1. **Setup** — drop the PDF, pick the language slot (one run per language, as
   in the manual flow), pick the model, pick **how to read the paper**, and, if
   that language already has questions, choose add or replace (replace is
   blocked once students have submitted, same rule as Upload JSON).

   *How to read the paper* is **Split into parts** (default — the parallel
   pipeline) or **All in one go** (the original single request). "All in one go"
   is honoured absolutely: it is the escape hatch for a paper the split gets
   wrong, so it never silently becomes a parallel run. The reverse can degrade —
   asking for the split on a database without migration 20260916000000 gets a
   single pass — and the running step then says "all in one go" so the creator
   is never shown a story that isn't what happened.
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
| Engine | **`live` since 2026-09-23** (was `background`, see below) | `live` — the edge function waits on Gemini inside `EdgeRuntime.waitUntil` |
| Survives closing the tab | yes | yes, but bounded by the function wall clock |
| Wall clock | not a factor | **150 s on the Free plan, 400 s on paid** — but it now bounds one WORKER, not the paper. A slice of ~22 questions fits comfortably where the whole 27-page paper (270 s) never did, so this model is no longer short-papers-only once migration 20260916000000 is applied. Without it, the old limit stands. |
| Accuracy in the Sept 2026 checks | 100/100 answers over two passes; correct on the maths stems that are images | 92/92 answers, but dropped a digit (4560→450), lost a cube root, rewrote one expression, miswrote one distractor, padded a passage with its own working |
| Cost per 27-page paper | ≈ $0.59 at $1.50/$9 per M tokens | ≈ $0.16 at $0.30/$2.50 per M tokens |

Why 2.5 Flash cannot run in the background: Gemini refuses it
(`Model 'gemini-2.5-flash' does not support background interactions`), and the
Batch API returns `FAILED_PRECONDITION` on this key. Both were tried live.

## Architecture

```
ExamDetail ─ AiPdfImportDialog ─┬─ Storage: exam-pdfs/<uid>/<examId>/ai-import-<lang>-<ts>.pdf
                                ├─ functions/ai-pdf-import  {start | status | cancel | ack}
                                │     index.ts        front door: auth, gating, the four actions
                                │       ├ auth.getUser  ├ profiles.can_use_ai_import
                                │       ├ exams.user_id ├ path prefix  ├ 12 starts/hour
                                │     gemini.ts       key chain + a deadline on every fetch
                                │     prompts.ts      the index-pass prompt, the shard scope
                                │     orchestrator.ts the state machine every poll advances
                                │     merge.ts        split the paper, put it back together
                                │     legacy.ts       the single pass, for a DB without the migration
                                ├─ ai_import_jobs (status, api_key_slot, orchestration,
                                │                  shard_results, raw_output)
                                └─ then, client-side, exactly as Upload JSON — UNCHANGED:
                                   parseExamJson → buildSectionCreationPlan/createSections →
                                   autoSnip + uploadQuestionImage → commitJson
```

* **One prompt.** `src/lib/extractionPrompt.js` is imported by the guide page
  and by the edge function (relative path — Deno bundles it). The context block
  ("YOUR CONTEXT") is filled server-side from the exam's own section names; the
  client never sends prompt text, so the function is not a general Gemini proxy.
  The parallel path **appends** its scope to that prompt and never edits it, so
  the in-app flow and the manual flow cannot drift.

### 2026-09-23: why 3.5 Flash runs live now

The background engine (Interactions API, `background: true`, polled by id)
worked — two jobs completed that way on 2026-09-17 in under three minutes.
On 2026-09-23 every `GET /v1beta/interactions/{id}` came back `400`, the
message alternating between `Request contains an invalid argument` and
`API key not valid` on *identical* requests, on every key, while the `POST`
that created the interaction succeeded each time. The function tried seven
request shapes (with/without `Api-Revision`, with/without `Content-Type`, key
in header or query); all refused. The interactions ran and finished on
Google's side and nothing could ever see them, so every attempt ran to its
deadline and every import failed — including the whole-paper fallback.

`generateContent` never stopped working, so 3.5 Flash now runs on it, exactly
like 2.5 Flash, and the split is what makes that fit the 150 s wall clock:
twelve-question slices instead of a whole paper, a low-thinking index pass,
and a slice that runs out of time is halved like a cut-off one. The background
path is intact: `AI_IMPORT_35_ENGINE=background` switches it back (no
redeploy), and its poll now self-heals its request shape and records what
Gemini says on every attempt, so if Google fixes the endpoint the row will
show it.

Because the engine is live, **the dialog must stay open**: its 4-second poll
is what launches parts, retries them and merges — closing it pauses the job
until it is reopened. The copy says so.

### 2026-09-23, later: the PDF itself is cut into pages

Moving to the live engine exposed the next wall. The index pass over the whole
25-page JEE paper ran out its 110 s three times on three keys — even with low
thinking, even though it emits only a few hundred tokens — because that PDF
carries ~2,600 embedded images and Gemini has to look at every one before it
can say anything. No prompt or thinking setting changes how long a model takes
to look at 25 image-heavy pages. Showing each call fewer pages does.

So the paper is now **cut by pages, not by question numbers** (`pdf.ts`,
`pages.ts`):

* `start` reads the page count with pdf-lib and the job gets a chunk folder
  under the creator's own storage path.
* The **index pass reads only the last pages** (`keyWindow`: 6–12 pages, where
  keys are printed) and is told so. If it finds no key there it is retried on
  the *first* pages. If neither has one, the paper still imports — without
  answers, and the summary says so. **No index pass is required to split.**
* Each **worker gets its own small PDF**: about five owned pages plus one page
  of context so a question running over the boundary is seen whole. It is told
  "attached page 1 is paper page N" and asked for paper page numbers; a worker
  that reports chunk-relative pages anyway is corrected before the merge so
  figures are cut from the right page of the real PDF.
* **One chunk is cut per tick.** pdf-lib costs about 0.7 s of CPU for a load
  plus a save on this paper and the platform caps CPU at 2 s per request.
  Workers therefore start four seconds apart, which also spares the free tier's
  per-minute request limit.
* A chunk whose reply is cut off or times out is **halved by pages**, not
  retried whole.
* Chunk files are removed when the job completes, fails, is cancelled or is
  acknowledged.
* PDFs over 15 MB, or ones pdf-lib cannot read, run as one PDF the way they did
  before.

Question-number slicing (`planShards`, `splitSlices`) is still there for that
whole-PDF path.

### 2026-09-23, evening: the first import that finished, and what it taught

The first page-mode run completed: 48 questions from six of seven page parts
in 15.9 minutes — on an evening when **Gemini 3.5 Flash never answered once**
(timeouts on a ten-page chunk, then "busy" on all four keys). What carried it:

* **Model chain.** A worker whose model times out or says "busy" retries on
  the next model in `AI_IMPORT_MODEL_CHAIN` (default `gemini-3.5-flash,
  gemini-2.5-flash, gemini-3.8-flash, gemini-3-flash-preview`; a secret, no
  redeploy). A model that stalled in the last ten minutes is skipped for new
  work, so a fresh job does not spend 110 s rediscovering it.
* **Model availability is per key.** 2.5 Flash answered 404 "not available"
  on three keys and worked on the fourth — the oldest Google project. A 404
  now walks to the next key and is remembered for that (model, key) pair only;
  retries pick a key that has the model. 2.5 Flash delivered five of the six
  parts that landed.
* **Sections are merged ignoring case.** The first result had "MATHEMATICS"
  (Q1–13) and "Mathematics" (Q14–22) as two sections, because one worker saw
  the heading and one guessed. `sectionKey()` folds case, spacing and
  punctuation; the exam's own spelling wins when it matches.
* **Five attempts per part, not three.** Pages 21–25 were lost after three
  "busy"/"not available" answers with six minutes still on the clock.

Still true after that run: no answer key landed because both index-pass
attempts were on 3.5 Flash before the chain existed (the chain now covers the
index pass too), and JEE numeric questions come through as placeholders —
that is the v1 parser, not the import.

The second run (8.3 min, seven of seven parts, answer key found, 18 answers)
exposed the last trap: **the index pass reads only the last pages, so its
section list is partial**, and a worker told to file questions "by printed
number" against a partial list filed twenty-two Mathematics questions
numbered 1–22 under "CHEMISTRY 1–24" — where they collided with the real
chemistry questions and the real ones were dropped as duplicates. Number
ranges now carry the pages the index pass saw them on and apply **only** to
questions on those pages; everything else is named from the page's own heading
or content. A paper whose numbering restarts per section is the normal case,
not the edge case.

The third run (Replace) landed pages 1–15 with correct section labels and
lost pages 16–25 to a Google-side outage that hit all four Flash models at
once — "busy", 404 and timeouts across up to eight attempts per part. Two
behaviours were added under it: **a pause between attempts** (20/40/60/90 s)
so retries are spread across minutes instead of all falling in the same bad
one, and **rotation even when memory says every model is dead**, because a
stale memory is likelier than a dead chain. The gap report named the 33
missing questions exactly.

Note on **Replace**: the manual-import `commitJson` deletes only questions in
the sections the new import writes to, not every section of the language.
Sections left untouched by a partial run keep their old questions.

## Why it is fast now (parallel extraction)

The old shape was one Gemini call for the whole paper, and it was slow for a
reason no amount of retrying could fix: the work is **decode-bound**. The
measured SBI Clerk run produced ~25k output tokens plus ~38k thinking tokens,
and a model emits those one after another. 126 s on 3.5 Flash, 270 s on 2.5
Flash — and while that was happening nothing had failed, so nothing retried. It
was simply still typing.

A job is now three stages:

1. **Index pass** — one small call that reads the paper's shape (sections,
   printed question ranges, page count) and transcribes the answer key. Output
   is a few hundred tokens. It runs on the same engine as the workers: in the
   background for 3.5 Flash, so a 60-page paper is not raced against the
   platform's 150 s wall clock, and live for 2.5 Flash. (The first cut ran it
   live regardless, which a long paper lost twice before falling back to a
   single pass that took 25 minutes on the same paper.)
2. **Extraction workers** — N calls in parallel, each told to emit only its own
   ranges of printed question numbers, each opening on a **different key** in
   the chain. Default is one worker per 22 questions, capped at 6.
3. **Merge** — deterministic and server-side: parse each worker's JSON,
   concatenate in shard order, keep the first copy of a boundary duplicate,
   re-emit one delimited v1.0 block. **No model is asked to stitch anything
   together** — a model that could be trusted to merge reliably could have been
   trusted to emit the whole paper in one pass, which is the thing being avoided.

Two things fall out of this that matter as much as the speed:

* **The answer key stops being a lottery.** It is transcribed once, by the pass
  whose only job is to read it, and handed to every worker as *input*. Workers
  are told not to go looking for the key pages at all. They cannot disagree
  about a key none of them read.
* **A failure costs a slice, not a paper.** A worker that stalls, 429s or
  replies without JSON is retried on the next key — one fifth of the work,
  not all of it. If it never comes back, the other workers' questions still
  import, and the exact question numbers that are missing are listed in
  *Check these before publishing*.

### Nothing runs for thirty minutes any more

Three deadlines, each enforced by a poll rather than hoped for:

| | Default | Override |
|---|---|---|
| One Gemini request | aborted on timeout, reported as a retryable 408 | — |
| One worker | 300 s background / 140 s live, then retried on the next key, up to 3 attempts — but never a retry that cannot finish before the job deadline. The whole-paper fallback is not a slice and gets the single pass's 25 min instead | `AI_IMPORT_SHARD_DEADLINE_MS`, `AI_IMPORT_MAX_ATTEMPTS`, `AI_IMPORT_SINGLE_DEADLINE_MS` |
| The index pass | 300 s background / 120 s live per attempt, up to 2 attempts on 2 keys, then one whole-paper pass — with the job deadline re-armed for it | `AI_IMPORT_PLAN_ATTEMPTS` |
| The whole job | **12 minutes**, then whatever finished is merged and imported; it only *fails* if nothing came back at all | `AI_IMPORT_JOB_DEADLINE_MS` |

Running out of time is not a reason to throw the paper away. Three of four
workers finishing is three quarters of a paper the creator can import and finish
by hand, and it is already in `shard_results` — so the deadline writes off what
is still in flight and merges the rest, naming the missing question numbers in
*Check these before publishing*. The first cut of this failed the job outright
and stranded those rows where nothing could ever read them again; `ai-import-gating`
now guards against that regressing.

The old code's only backstop was a 45-minute staleness check and no timeout on
any `fetch`, which is exactly how an import could sit on "running" long past
the point of being worth waiting for. The single-pass fallback in `legacy.ts`
now writes a background job off after 25 minutes, not 45
(`AI_IMPORT_SINGLE_DEADLINE_MS`).

That number is deliberately generous. The first cut was 12 minutes, which would
have been a regression: a real 55-page, ~90-question paper was observed still
running at 21 minutes on this path and finishing afterwards. The single pass is
inherently slow — one model emitting ~18k tokens in one serial stream — so
capping it tightly does not make it fast, it only breaks big papers. Speed is
the parallel path's job; this cap exists solely so an *abandoned* job is not
polled forever.

### How it is driven

The dialog already polls `status` every 4 s, so **every poll is a scheduler
tick**: reap finished workers, fail and relaunch ones past their deadline,
start what is queued, merge when the last part lands. No cron, no queue
service, and no client change — the exam page still receives one `rawOutput`
string and still parses it with `parseExamJson`.

Concurrency safety, since several workers finish independently:

* `ai_import_record_shard` stores a worker's output **and** stamps its status in
  one SQL statement, so two workers landing together cannot lose each other.
* A tick's own writes are a compare-and-swap on `updated_at`; a tick that loses
  the race drops its write and re-decides four seconds later, which is always
  safe because a tick's decisions come from the row, never from memory.
* A short lease stops two overlapping polls from launching the same worker.
* Polling is spread across time slots — at most one Gemini request per tick
  whatever the paper's size, because on the free tier *requests* are the scarce
  thing and a six-worker job polled on every tick would rate-limit itself.

### Keys

Work is **spread from the start** rather than piled onto the primary until it
refuses, and since 2026-09-23 the chain has a memory. In plain terms:

* **Every job opens one key on from the previous job** (round-robin). The first
  cut used a random offset, which spreads load on average and still put two
  consecutive imports on the same key often enough to notice. The single pass
  rotates too — it used to open on `primary` every single time, so one key
  carried every import of the day and the others only ever saw a request after
  it had already refused.
* **Worker *i* gets the slot after worker *i-1***, so four workers run on four
  accounts and the free tier's per-project quota is four times as far away. A
  retry moves on again.
* **A key that refuses is remembered.** A 429 rests the key for as long as
  Google's `RetryInfo.retryDelay` says (at least a minute); a 429 whose quota id
  names a *daily* window rests it for four hours; a 403 or "API key not valid"
  rests it for thirty minutes. A resting key is handed no new work while any
  other key is healthy, is still tried last when every key is resting (a wrong
  guess about a quota must never empty the chain), and is healthy again the
  moment it answers a request. The memory lives in the warm isolate — the 4 s
  polling keeps it warm for the length of an import session — and an empty
  memory is simply the old behaviour.
* **A refusal at the door is routed around inside the same call.** Starting a
  worker or the index pass may walk the chain: a worker that opened on a resting
  key moves to the next one in about a second instead of failing and waiting for
  the next poll to relaunch it. The slot that *accepted* the work is what gets
  recorded, because a background interaction can be polled only by the key that
  created it — and polling never walks.
* **One call, one deadline, however many keys.** Walking the chain does not
  multiply the timeout: a key that sat silent until the deadline has spent the
  budget, and the live engine must not be carried past the platform's wall clock.

With one key configured, everything behaves exactly as before.

### When the split cannot be had

* **The index pass gets two tries, not three** (`AI_IMPORT_PLAN_ATTEMPTS`). Each
  can take two minutes; three of them spent six of the job's eight minutes
  learning that the paper could not be indexed and left the fallback no time.
* **The whole-paper fallback gets the single pass's clock.** It *is* the single
  pass, and it was being handed a slice's four-minute deadline — reaped,
  relaunched on the next key, paid for three times and then failed, on the one
  path that exists so the import works no matter what. It now gets
  `AI_IMPORT_SINGLE_DEADLINE_MS` (25 min) per attempt and the job deadline is
  re-armed from that moment.
* **A reply that was cut off is not retried — the slice is halved.** A cut
  reply means the slice is too long for one answer, and the same slice on
  another key is cut at the same place. The worker keeps the first half, a new
  worker takes the second, and the merge — which reads every worker's slices —
  needs no change. A slice of two questions or fewer is not halved; that is not
  a length problem, and halving would only hide whatever it is.

### Tuning

| Variable | Default | What it does |
|---|---|---|
| `AI_IMPORT_PARALLEL=off` | on | Kill switch — every job back on the single pass |
| `AI_IMPORT_SHARD_SIZE` | 22 | Questions per worker |
| `AI_IMPORT_MAX_SHARDS` | 6 | Ceiling on workers per job |
| `AI_IMPORT_JOB_DEADLINE_MS` | 720000 | Hard deadline for the whole job (12 min) |
| `AI_IMPORT_SHARD_DEADLINE_MS` | 300000 | One background worker's (or background index pass's) budget per attempt |
| `AI_IMPORT_MAX_ATTEMPTS` | 3 | Attempts per worker, each on the next key |
| `AI_IMPORT_PLAN_ATTEMPTS` | 2 | Attempts for the index pass before falling back to one whole-paper pass |
| `AI_IMPORT_SINGLE_DEADLINE_MS` | 1500000 | The single pass's clock (25 min) — also what the whole-paper fallback gets per attempt |
| `AI_IMPORT_LAUNCH_BUDGET_BYTES` | 40 MB | Base64 held in flight while launching; a bigger PDF launches its workers over consecutive ticks instead of OOM-ing |

## The answer key (prompt revision 2, 2026-09-13)

Creators reported questions importing with no correct answer marked. The cause
was structural, not a bad model: answer keys live on the **last pages** of an
exam paper, and a model reading front to back reaches them only after it has
already written the questions. The old `ANSWERS` section was 25 lines, sat 70%
of the way through the prompt (after the images chapter), listed four key
formats with no procedure, and told the model to **skip** a question whose key
did not match — which deleted readable questions instead of importing them
unanswered.

The prompt now works in four passes, stated at the top and enforced by a
chapter placed before the rules:

1. **Read the whole PDF, last pages first** — find the key, this paper's
   Set / Series / Shift, whether numbering restarts per section, and whether
   the file holds more than one paper.
2. **Transcribe the key** into `_extraction_summary.answer_key.transcript`,
   verbatim, as `"<printed q_no>:<answer as printed>"` tokens. Because
   `_extraction_summary` is emitted before `sections`, the key is written down
   before the first question and every later answer is a lookup into the
   model's own output rather than a memory of a page it read once.
3. **Join** by (section, printed `q_no`) and convert **label → index**. The
   off-by-one is the expensive failure: JEE/NEET/RRB/CTET keys print `(3)` for
   the third option, so `(3)` is `"2"`. Nothing downstream can detect that
   mistake, which is why the prompt carries an explicit WRONG/RIGHT pair.
4. **Reconcile**: `answered + left_null + placeholders === extracted`.

Behaviour changes worth knowing:

* **A readable question is never skipped over its answer.** It imports with
  `correct_answer: null` plus a `needs_manual_review` reason starting
  `answer key — ` that quotes what the PDF printed. Those reasons already
  render in the import dialog's *Check these before publishing* list, so a
  missed key is now visible instead of silent.
* **Both "STOP and ask me" instructions are gone** (ambiguous section mapping,
  and the model-tier rule that told anything below Gemini 2.5 Pro to refuse).
  The in-app flow has no human to answer and a reply without the JSON block is
  a failed job, which the temperature-0 retry would reproduce exactly.
* **Never solve.** Reading a stated answer is transcription and is required;
  deriving one from the working, or from the model's own knowledge, is
  forbidden. A silently wrong answer is worse than a null.
* **Sets.** A key with Set A/B/C/D columns is only applied when the paper's
  own set is printed. Otherwise every answer stays null with one note — the
  old behaviour of taking the first column marks a wrong answer on nearly
  every question.
* **The key is language-neutral.** A `hi` pass now uses an English-only key
  page, which matters for bilingual banking and SSC papers.
* **`q_no` is required** and must be the number printed in the PDF — it is the
  only join key to a consolidated grid. The parser still renumbers by position.

`answer_key` rides inside `_extraction_summary`, which `jsonImportParser.ts`
stores as an opaque pass-through, so no parser change was needed for it. Two
parser changes were needed elsewhere:

* `Number("")` is `0`, so a blank `correct_answer` silently marked the
  **first** option correct. A blank now means "not marked", like `null`.
* Every review note is keyed on the number **printed in the PDF**, but the
  parser renumbers each section's questions by position. On a paper numbered
  straight through its sections (Physics 1-30, Chemistry 31-60) a note saying
  "Q35" pointed 30 slots away from the question it meant, or at one that does
  not exist. `NormalisedQuestion.sourceQNo` now keeps the printed number, and
  the import summary shows where the question actually landed, with the PDF's
  number beside it.

Guarded by section 5 and 6 of `src/__tests__/ai-import-prompt.test.mjs`.
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
node src/__tests__/ai-import-merge.test.mjs
```

`ai-import-merge` is the one that matters most for parallel extraction. It
bundles `merge.ts` and the **real** `parseExamJson` and checks that the split is
a partition (every printed number claimed exactly once, including on papers that
restart numbering per section), that the merge rebuilds a v1.0 block the browser
parser accepts unchanged — order, answers, options, marks, figures, passages —
and that a worker which never came back has its question numbers *named* rather
than quietly dropped.

`ai-import-gating` reads every `.ts` file in the function directory rather than
just `index.ts`, so an invariant stays covered when code moves between modules.

## Known gaps

* **Mixed-language papers.** The parser ignores `correct_answer` on the
  secondary language. A paper whose Quant/Reasoning exist only in Hindi (the
  SBI Clerk case) imports those sections without an answer key when English is
  primary. This predates the feature; the automatic flow just reaches it faster.
* **No cancel on Gemini's side.** `cancel` only frees the exam+language slot;
  a background interaction runs to completion and is billed. With parallel
  extraction that is now up to six interactions rather than one.
* **A retried worker is billed twice.** The first attempt may still be running
  on Gemini's side when its deadline passes and the replacement starts. Nothing
  double-imports — only the first result recorded for a worker index is used —
  but the abandoned call is paid for.
* **The dialog's copy is now pessimistic.** It still says 3.5 Flash takes
  "usually 2–3 min" and that 2.5 Flash is for short papers. Both were true of
  the single pass. The frontend was deliberately left untouched.
* **The old `parse-pdf` function** still exists behind the CreateExamDialog
  "upload PDF" path and the "Parse with AI" tab. It now requires a JWT but
  still trusts its caller for `sectionId`. Remove or rewrite it.
* **Per-question numeric cross-check** against the PDF text layer (the check
  used in the September evaluation) is not run in-app yet. It would flag the
  2.5 Flash digit errors automatically.
