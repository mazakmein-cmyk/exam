# Open issues — handover

Self-contained. Paste into a fresh session; assumes no prior context.

## The project

MockSetu — a mock-exam marketplace. Creators import question papers (PDF/JSON) and
publish them; students sit them. Two exam formats:

- **Practice exams** — self-paced, per-section timers, `ExamSimulator.tsx`.
- **Live exams** — a host drives one question at a time, `LiveExamStudent.tsx` /
  `LiveExamControl.tsx`. Rewritten recently as "live v2"; large surface.

Stack: React + TypeScript + Vite, Supabase (Postgres + RLS + PostgREST).
Audience: Indian competitive exams (JEE/NEET/UPSC/SSC). Leaderboards and ranks
are treated as meaningful by the product owner.

**Migrations are applied BY HAND**, pasted into the Supabase SQL editor in
filename order. There is no CI and no migration runner. Consequences:
- Code can be live before its migration exists. New features must degrade, not
  throw. Precedent: `src/lib/dbFeatures.ts`, `timingGroupSettings.ts`.
- `supabase/APPLY_REMAINING.sql` is a retired stub that exists only to warn you
  not to paste it. Apply files from `supabase/migrations/` directly.
- Every statement should be idempotent, and migrations here end in a `DO $$`
  self-check that raises if the change did not land.

Tests: standalone Node scripts, `node src/__tests__/<name>.test.mjs`. No runner.
Many assert on **source text**, so refactors break them by design — treat a
failure as "confirm the invariant still holds, then update the assertion".

Verify with: `npx tsc -b`, `npx eslint <files>`, and every `src/__tests__/*.test.mjs`.

**Pre-existing test failures: RESOLVED 2026-08-23.** `exam-list-query.test.mjs`
and `exam-paper-type.test.mjs` failed on a clean checkout because one shared
assertion went stale: both grepped `Marketplace.tsx` for the
`queryExamList((columns) =>` fallback pattern, but the published-exams fetch
had been extracted to `src/lib/publishedExams.ts` (so the home page shares its
cache entry). The invariant itself held the whole time — and is now stronger:
Marketplace contains no direct exams read at all. Assertions updated to follow
the fetch, plus a new pin that the library consumes `fetchPublishedExams` and
never grows a bare exams read. **The full suite is green.**

---

## Migrations pending (apply in filename order)

The owner confirmed applying `20260823000000`, `20260823010000`, `20260827000000`,
`20260829000000`. **These may still be unapplied — confirm before assuming:**

| File | What it does |
|---|---|
| `20260828000000_exam_analytics_summary.sql` | Creator dashboard aggregation + `grade_mock_answer` |
| `20260828010000_student_exam_ranks_jsonb.sql` | Ranking, returning one JSON doc |
| `20260830000000_responses_status.sql` | `responses.status` column |
| `20260831000000_submit_exam_attempt.sql` | Server-side marking of practice attempts |
| `20260832000000_hide_practice_answer_key.sql` | Withholds the answer key from students |
| `20260833000000_blank_answers_are_unanswered.sql` | Blank/whitespace/`[]` answers count as unanswered, not wrong (retires issues 1–2's server half) — **applied 2026-08-22** |
| `20260834000000_live_privacy_anonymity.sql` | Privacy mode actually anonymises: de-identified analytics, masked report ids, hidden join times (retires issue 7) |
| `20260835000000_report_tokens_are_secrets.sql` | Report tokens vaulted in `live_report_shares`; shared reports lose answer keys + origin id (retires issue 8) — **applied 2026-08-22** |
| `20260836000000_exam_clock_in_db.sql` | Mock-exam clock persisted on attempts; `start_exam_clock` resumes an unexpired sitting instead of minting a fresh one (kills the refresh exploit; SECURITY INVOKER) — **applied 2026-08-23** |
| `20260837000000_attempts_columns_locked.sql` | Trigger: browsers may update only `marks_score`/`marks_max` on attempts; clock/score/timestamps server-only (retires issue 14) — **applied 2026-08-23** |
| `20260840000000_pyq_grant_enforced.sql` | Trigger: browsers can set `paper_type='pyq'` only with the admin grant; revoke keeps existing marks (retires issue 17) — **applied 2026-08-23** |
| `20260841000000_clock_length_capped.sql` | `start_exam_clock` clamps the requested duration to the paper's own timing data (sections + whole-paper allowance + group overrides), with absent-schema guards |
| `20260839000000_unicode_numeric_answer_match.sql` | NFC + plain-decimal canon in `mock_answer_norm` — Hindi IME variants and "5.0"="5" grade correctly on both graders (retires issue 16) |
| `20260838000000_question_time_stats.sql` | `questions_visited` + `questions_answered` stamped at submit (honest speed tile + true Accuracy/Score split, retires issues 12 & 13) + `get_exam_question_time_stats` ("Avg time to solve correctly" on review). **Amended 2026-08-23 after first shipping — paste the CURRENT file (idempotent; re-paste is safe if an earlier version was applied).** Also requires `20260833000000`. |

`20260831000000` must be applied **before** `20260832000000`.
`20260833000000` requires `20260828000000` first.
`20260834000000` requires `20260803030000`, `20260805000000`, `20260807000000` first.

---

## Already fixed — do not re-report

Client changes are in the working tree (uncommitted alongside unrelated SEO work).

- Student rank was computed against the student's own retakes only (RLS hid
  everyone else). Now a server function, `get_my_exam_ranks`; ranks every
  *sitting* across all students; Analytics and ExamReview share it.
- Creator dashboard showed real students at 0% — answers were fetched in batches
  of 200 attempts but capped at 1000 rows per request. Aggregation moved into
  `get_exam_analytics`; all capped reads paged.
- `responses` had no unique index on `(attempt_id, question_id)`, so the submit
  upsert always fell back to appending. Deduplicated and enforced.
- Answers are now saved during the exam (`src/services/examProgress.ts`), so a
  closed tab no longer loses the sitting.
- Practice marking moved server-side; the answer key is no longer sent to
  students (`parsed_questions_student` view + `get_attempt_answer_key`).
- Re-sitting one section now replaces that section's score instead of adding to
  it, in History and the creator leaderboard.
- History sort no longer re-parses a locale date string; infinite spinner fixed;
  live leaderboard no longer crowns an arbitrary row before ranks exist;
  multi-select option distribution fixed; live client grader matches the server.
- **Was issue 1:** a typed-then-erased text/numeric answer (`""`/whitespace) was
  scored wrong with the negative-marking penalty. The scorer now uses the shared
  no-answer rule (`hasAnswerValue` in `scoringEngine.ts`, a pinned copy of
  `hasAnswer`), and `ExamSimulator` no longer stamps status `attempted` on a
  blank value. Pinned by `src/__tests__/blank-answer-skip.test.mjs`.
- **Was issue 2:** creator analytics called a cleared answer *wrong* while the
  student's review called it *unanswered* — the null-only rule lived in
  `get_exam_analytics` (SQL), not Analytics.tsx. `20260833000000` rebuilds the
  summary on `mock_answer_present` (SQL copy of `hasAnswer`) and keeps blanks
  out of the `most_common_wrong` tally; Analytics.tsx drops legacy blank labels.
  **Dead until `20260833000000` is pasted.**
- Creator HTML is sanitized at render time (DOMPurify inside `renderMathInHtml`,
  commit `d4b15e2`) — issue 4 below is stale. Issue 22's language-ordinal drift
  was fixed by `20260819`–`20260822` (group-id matching + play-ordinal reveal).

---

## HIGH — data correctness, students affected now

### 1. FIXED 2026-08-22 — see "Already fixed". (Blank answer scored as wrong.)

### 2. FIXED 2026-08-22 — see "Already fixed"; **migration `20260833000000` pending.**

### 3. A question typed "single" with two correct answers is impossible to answer
Live exams. The option UI is built from `answer_type`, so such a question renders
as radio buttons and can only submit one value; the server requires the whole
set. Every student loses the mark, and the reveal panel then highlights two green
options they were never allowed to pick. Reachable path: edit a multi-select
question, change its type to single, save — the two-answer key is kept. No
validation anywhere (`QuestionForm.tsx`, `LiveExamDetail.tsx`, no DB check).

### 4. Unsanitized creator HTML rendered into every student's page (live exams)
`src/components/live/LiveOption.tsx`, `LiveQuestionBody.tsx` and
`LiveExamStudent.tsx` use `dangerouslySetInnerHTML`. `renderMathInHtml`
(`src/lib/renderMath.ts`) is a math renderer, not a sanitizer — it returns the
string unchanged when there is no math. No DOMPurify or equivalent in
`package.json`. Any authenticated user can create and publish a live exam, so the
"host" is not trusted. **Status: not re-verified since the live v2 rewrite —
confirm before acting.** Fixing needs a sanitizer plus an allowlist that
preserves the math renderer's output; getting it wrong breaks every question.

### 5. FIXED 2026-08-22 — client-only, no migration. (Auto-start during rehearsal.)
The auto-start effect now HOLDS while a rehearsal runs and shows a banner
("scheduled time passed — the real exam has NOT started"); exiting the
rehearsal fires the held start. `handleEndExam` ends the simulation instead of
the real row, the played-out-rehearsal primary button offers "exit" instead of
the destructive end, and +30s/+60s are SIMULATED during a rehearsal
(`useRehearsal.addTime` grows an in-memory `extraSeconds`; unlock and flush
reset it) so the creator practises the real control without touching the real
exam. Pinned by `src/__tests__/rehearsal-guards.test.mjs`.

### 6. FIXED 2026-08-23 — client-only, no migration. (Mislabelled "Live" — this is the PRACTICE runner.)
Fixed downstream in `timingUnits` rather than in the drag path, because the
pinned design ("drags never touch dormant groups while switching is on") is
deliberate: **a split group now pays its pool exactly once** — the first run
of two-or-more members carries the pool, every later run degrades to solo
per-section clocks, and a lone straggler run does not consume the pool a later
proper run deserves. Runner, intro totals and simulator all consume
`timingUnits`, so all fix at once; no arrangement of rows can double a paper's
time anymore. Pinned by the updated split-run tests in
`src/__tests__/section-timing-groups.test.mjs` (payout asserted with an
explicit 45-minute override).

### 7. FIXED 2026-08-22 — **migration `20260834000000` pending.**
All three leaks closed in `20260834000000_live_privacy_anonymity.sql`:
analytics rows now carry the participant ROW id instead of the auth UUID
(history scrubbed; SELECT policy narrowed to creator + participants), the
report token path masks every id and strips join times via
`live_report_masked_ids` (creator path untouched), and
`live_participants_public` masks `joined_at` like `user_id`. Client: the
creator's deck resolves real names from either id generation
(`fetchParticipantNames` keys both). Pinned by
`src/__tests__/live-privacy-anonymity.test.mjs`. Ordinals deliberately stay
join-ordered (append-only, so pseudonyms never reshuffle mid-session) — with
join times masked they are no longer decodable.

### 8. FIXED 2026-08-22 — **migration `20260835000000` pending** (requires `20260834000000` first).
Tokens moved to `live_report_shares` (creator-only SELECT; writes only via the
definer function), every minted token migrated, the enumerable `live_exams`
column scrubbed and kept NULL on every toggle. The token read path now joins
through the vault and strips `correct_answer` from every question plus
`origin_exam_id` (creator's own path keeps both). Client reads the vault first
and falls back to the legacy columns until the migration is pasted. Zero
hot-path cost — sharing is touched once per toggle and once per link open.
Pinned by `src/__tests__/live-report-token-secrecy.test.mjs`.

---

## MEDIUM

### 9. FIXED 2026-08-23 — client-only, no migration. OWNER DECISION: raw correct count wins.
The owner chose raw correct count (not percentage) as the no-marks ranking
metric everywhere. `get_my_exam_ranks` already ranked that way; the creator's
Top Students (`Analytics.tsx` `rankValueOf`) was moved off its accuracy-ratio
fallback to match. Ties share a rank on both surfaces. Pinned by
`src/__tests__/no-marks-rank-agreement.test.mjs`. Residual (unchanged
inclusion semantics, deliberately): the creator board still lists unsubmitted
attempts scored 0 — they sit at the bottom under count-ranking, and reading
them as "in progress" is issue 33's finalisation work.

### 10. FIXED 2026-08-23 — client-only, no migration. OWNER DECISION: show everywhere, labelled.
Attempts on RLS-hidden (unpublished) exams now stay in History and the "Total
Mock Exams" count, rowed up as "(exam no longer available)" — so all four
surfaces (count, accuracy, avg time, history) are computed from the same pile
and can no longer contradict each other. Hidden attempts take the existing
orphan path (one row per attempt, no rank badge — `get_my_exam_ranks` is only
asked about visible exams, by an existing deliberate design comment). Pinned
by `src/__tests__/unpublished-attempts-visible.test.mjs`.

### 11. MITIGATED 2026-08-23 — client-only, no migration. OWNER DECISION: label, root fix deferred to #31.
(Verification 2026-08-22 corrected the symptom: rank badges go MISSING on
orphan rows, they are never duplicated.) History rows the server left unranked
now show a muted **"Unranked"** chip with a tooltip ("this attempt predates a
change to the paper… your score still counts in your stats") instead of a
silent gap. Rendered only after `ranksResolved`, so it never flashes during
load. Orphans themselves keep being created until #31 stamps sittings at
start — that remains the real fix. Pinned by
`src/__tests__/unpublished-attempts-visible.test.mjs`.

### 12. FIXED 2026-08-23 — **migration `20260838000000` pending** (requires `20260831`, `20260837`, `20260828`).
`submit_exam_attempt` now counts `questions_visited` (time spent, moved
through, or answered) from the rows it grades and stamps it on the attempt
(column added to the `attempts_lock_columns` trigger); the tiles divide by it
and are relabelled "Avg Time / Attempted Question", falling back to
`total_questions` on pre-migration rows. `avg_time_per_question`'s stored base
is deliberately unchanged — consumers reconstruct total time as
avg × total_questions. **Same migration also ships the review-page
"Avg time to solve correctly" per-question comparison** (owner-requested
wording — never "class average"): `get_exam_question_time_stats`, aggregates
over correct answers only, no identities, gated to the exam's participants and
creator, one cold-path call per review open. Pinned by
`src/__tests__/honest-time-numbers.test.mjs`.

### 13. FIXED 2026-08-23 — OWNER DECISION: show both, with explainer tooltips. **Rides migration `20260838000000`.**
`submit_exam_attempt` now also stamps `questions_answered` (the shared
hasAnswer rule via `mock_answer_present` — "" and [] are not answers; column
added to the lock trigger). The student tile shows **Accuracy** =
correct ÷ answered as the big number, with **Score %** = correct ÷ all
questions beside it, each with a tooltip stating its calculation in plain
words. The creator tile "Accuracy / Q" was renamed **Avg Score %** with its
own tooltip. Pre-migration attempts fall back to the full-paper denominator
(i.e. accuracy reads as the old score% until retaken). Pinned by
`src/__tests__/honest-time-numbers.test.mjs`.

### 14. FIXED 2026-08-23 — **migration `20260837000000` pending** (requires `20260836000000` first).
A `BEFORE UPDATE` trigger (`attempts_lock_columns`) closes every column except
`marks_score`/`marks_max` (the marks engine legitimately writes those from the
client) for the browser roles; server functions pass because the gate is
`current_user` — SECURITY DEFINER functions run as their owner, so
`submit_exam_attempt` needed no rewrite. Also protects `clock_deadline_at`
(added by the resume work — without this, a student could PATCH their own
deadline). Pinned by `src/__tests__/attempts-columns-locked.test.mjs`.

**RESIDUAL CLOSED 2026-09-10 by `20260843000000`.** This entry used to end
"marks values stay forgeable until the marks engine moves server-side" — that
day has come and the sentence outlived it, which cost a re-audit on 2026-09-10
that reported a fixed bug as open. `20260843000000` ported the marks engine
into SQL, calls `compute_attempt_marks` inside `submit_exam_attempt`'s
transaction, and adds `marks_score`/`marks_max` to this same lock:

    OR NEW.marks_score IS DISTINCT FROM OLD.marks_score
    OR NEW.marks_max   IS DISTINCT FROM OLD.marks_max
    ...
    RAISE EXCEPTION 'ATTEMPTS_COLUMN_LOCKED: attempt results are written by the server only';

The client degrades coherently in BOTH directions, which is what makes the lock
safe to have: `submit_exam_attempt` returns `marks_scored: true`, and
`examService` does `if (serverScoredMarks) return finalAttemptId;` before the
marks module runs — so the browser never writes into a locked column. On a
database WITHOUT `20260843000000` the flag is absent, the browser scores and
writes as before, and the columns are not locked either.

Note on how the two migrations interlock: `20260843000000` only replaces the
`attempts_lock_columns()` FUNCTION — the trigger on `attempts` is created by
`20260837000000` (which verifies its own existence, line 103), and
`20260843000000`'s self-check inspects the function body. So both must be
applied; 843 alone would leave a correct function with nothing calling it, and
its self-check would not notice.

### 15. The marks gate flips a whole exam on one missing value — MITIGATED at the source 2026-08-23; ranking rule itself left as-is BY OWNER DECISION
`bool_and(has_marks) OVER (PARTITION BY exam_id)` in
`20260828010000_student_exam_ranks_jsonb.sql` (and the mirror in
`Analytics.tsx`) still surveys attempts rather than the exam's scoring
configuration — the owner chose not to change it. Instead, the main way a
mixed cohort gets CREATED is now blocked: **the publish dialog gates on marks
coverage** (client-only, zero extra calls — reuses the marks-warning reads).
Marks on part of the paper blocks Publish with the uncovered sections named
("Either remove marks from every section, or add marks to: …"); all-marks and
no-marks publish as before; subjective questions exempt. Pinned by
`src/__tests__/marks-coverage-gate.test.mjs`. **Residual:** pre-marks-era
attempts on an exam that later gained full marks coverage still flip its
ranking (the gate can't retire history), and a student blanking their own
`marks_score` still can — **no longer true as of `20260843000000`**, which
locks `marks_score`/`marks_max`; see issue 14. The surviving half of this
residual is only the first one: pre-marks-era attempts flipping the ranking
basis of an exam that later gained full coverage. The resume feature's prerequisite note below should be read against
this decision.

### 16. FIXED 2026-08-23 — **migration `20260839000000` pending** (requires `20260828000000`). OWNER DECISION: old grades untouched.
(Trim + case folding were already in place; the residuals are now closed.)
Both graders share one rule: **NFC Unicode normalisation** on every string
path (the Hindi IME NFC/NFD trap), plus a **plain-decimal canon** — "5.0",
"05", "+5" all read as "5" under a guard regex (character-identical in SQL and
JS) that keeps commas, exponents and >15-digit values as text on both sides.
Client rule lives in `src/lib/answerNormalize.js` (executed directly by the
test), with a pinned copy in the import-free `scoringEngine.ts`; SQL mirror
rebuilds `mock_answer_norm` and its self-check re-asserts every behaviour
20260828 pinned. Five scattered client copies were unified (incl. a stray one
in ExamReview's `matchesInSet`). No re-grading of past attempts. Pinned by
`src/__tests__/answer-normalization.test.mjs`.

### 17. FIXED 2026-08-23 — **migration `20260840000000` pending** (requires `20260825000000`). No client changes.
Trigger `exams_enforce_paper_type_grant`: a browser role CHANGING `paper_type`
to `'pyq'` (insert or update) must hold `profiles.can_set_paper_type`; server
functions pass by role (the `attempts_lock_columns` pattern), so
`admin_set_paper_type_access` needed no rewrite. OWNER-CONFIRMED design:
revoke keeps existing marks — only the transition is gated, so a revoked
creator can still save unrelated edits on an already-PYQ exam. Pinned by
`src/__tests__/pyq-grant-enforced.test.mjs`.

### 18. FIXED 2026-08-23 — client-only, no migration, zero extra calls.
The guest queue moved to `localStorage` via `src/lib/pendingSubmissions.js`
(one module owns the keys now; reads drain the legacy `sessionStorage`
locations so a guest mid-flow at deploy loses nothing), and the StudentAuth
replay crosses each section off AS IT SAVES — a mid-loop failure leaves only
the unsaved remainder parked, so retries can no longer duplicate sections 1–2.
The flow itself (park → sign in → replay → review) is unchanged. Executed (not
just source-pinned) by `src/__tests__/guest-exam-queue.test.mjs` against
storage shims. Known limit: browser storage is per-device — finish on the
phone, sign up on the laptop still cannot match.

### 19. FIXED 2026-08-28 — **migration `20260845000000` pending.**
Live: no host-abandonment handling. An abandoned session stayed `live`
indefinitely — admitting joiners, parking students on a question screen with no
message, and producing **no report and no final standings**, because
`end_live_session` is what computes rankings and builds the report.

The blind spot was two individually correct decisions meeting: `joinLiveExam`
never inserts the creator into `live_participants` (a teacher must not appear on
their own leaderboard), and `live_session_sync` recorded presence only
`IF p_beat AND v_is_participant`. So the creator's browser had been sending a
heartbeat every 30s all along and the server was dropping it.

Fixed with **no cron, no scheduled job, no client change and no extra
requests** — `shouldBeat` in `useLiveSession` is not role-gated, so the creator
page was already beating; the server just had to stop ignoring it:

* `live_host_presence` — a table of its own. Not `live_presence` (whose rows are
  counted for "students online", so the host would show up as a phantom), and
  not a column on `live_exams` (published over Realtime, so a 30s write would
  broadcast the whole exam row to the entire room all session).
* `live_session_sync` tests host staleness **before** recording the caller's own
  beat, then auto-ends after 15 quiet minutes. The ordering is the feature: an
  open creator tab beats every 30s so it can never age out, and testing after
  the beat would let a host returning hours later reset the clock on the way in.
  Both creator surfaces count — control page *and* projector.
* `end_live_session_system` holds the ending steps with the ownership test lifted
  out; `end_live_session` now delegates to it, so there is one copy. `REVOKE
  EXECUTE ... FROM PUBLIC` — otherwise any candidate could end their own exam.
* Concurrency: an advisory lock so the room doesn't queue behind the winner's
  report build, plus `AND status = 'live'` on the UPDATE as the real guarantee.

Refuses to close on weak evidence: falls back to `current_question_unlocked_at`
and `started_at` when no heartbeat row exists yet, and does nothing at all on no
evidence — the cost of leaving a session open is an untidy row, the cost of
closing one wrongly is a class cut off mid-paper.

**Known limit:** the check rides a poll, so if the host *and* every student
close their tabs, nothing runs until someone next opens the link. It self-heals
on the next contact from anyone.

Students see no new UI — an auto-closed session is indistinguishable from a
manually ended one, so the existing end-of-session flow fires. Apply
`20260844000000` first; the file raises a clear error if you don't.

### 20. Live: questions are editable mid-session
`handleAddQuestion` / `handleDeleteQuestion` / `handleUpdateQuestion` in
`LiveExamDetail.tsx` have no live guard, though drag-reorder and JSON import do.
Play order is derived on the fly from `global_index`, so deleting at or before
the current question renumbers everything while `current_question_index` stays
put — the pointer then designates a different question than the one on screen.

### 21. FIXED 2026-09-08 — no migration needed (client only).
Answer-key edits were not mirrored to translations. Each language row stores its
own `correct_answer`, and **both** graders mark against the row the student
actually answered — `submit_live_response` looks the question up by the submitted
id; `compute_attempt_marks` resolves `question_group_id` only to find the marks
config. So a key fixed in English left every Hindi student graded on the old one:
right answer, marked wrong, on the leaderboard and in the report, with nothing on
screen suggesting the languages disagreed. Unfixable from the translated view,
which locks the answer fields (correctly — primary owns the key). Re-importing
the whole question set was the only thing that worked.

**The mock side had the same bug**, and worse in one way: of its three edit
paths, only the quick inline "set correct answer" control propagated. Whether a
fix reached the translations depended on which control the creator clicked.

Fixed in two places:

* **Live** — `syncLiveAnswerToTranslations` in `liveExamService.ts`, called from
  `handleUpdateQuestion`. One write, filtered by `question_group_id` and scoped
  to the sibling sections of the section group.
* **Mock** — `ExamDetail.tsx`'s full question editor already mirrored
  `option_image_urls` to siblings and stopped there; the answer key now rides the
  same write. The old guard required an image change to be present, so an
  answer-only edit skipped the block entirely.

Two rules both sides share, and both matter:

* **Primary → translations only.** Both edit forms load whichever row they
  opened, so propagating from a translation would push that row's key — possibly
  the stale one — back over the primary. Same bug, opposite direction.
* **Choice questions only.** A choice key is option *indices*, identical in every
  language. Text and numeric answers can legitimately differ per language and are
  deliberately left alone.

A failed sibling write is surfaced as its own toast rather than swallowed: the
edited row is already saved at that point, so silence would recreate exactly the
split being fixed. Re-saving is idempotent.

**NOT done:** exams that already carry mismatched keys are not repaired — this
fix only stops new ones diverging. A one-off migration to align existing
translations with their primary row is still outstanding. Pinned by
`src/__tests__/answer-key-follows-translations.test.mjs`.

Also still open: `ManualFixEditor.tsx` writes `correct_answer` with no
propagation, but nothing in the app navigates to it (the route exists; no link
does), so it is unreachable in normal use. Wire it up or delete it.

### 22. Live: language variants with different question counts leak answers
`get_revealed_live_answers` computes ordinals per language but compares against
`current_question_index`, which is a primary-language ordinal. A secondary
language with fewer rows shifts its ordinals, so a not-yet-asked question's key
is returned. Reachable with no warning via a Replace-mode JSON import on the
secondary language with fewer accepted questions. The same drift makes
`submit_live_response` store answers against the wrong primary row.

### 23. FIXED 2026-08-28 — **migration `20260844000000` pending.**
Live: the whole paper was sent to the browser at join. `live_questions_student`
gated only on exam status, so the one-question-at-a-time pacing was presentation
only and the paper was readable from *publish*, which is when the link is handed
out. (Answer keys were correctly withheld; this was the paper itself.)

Fixed at **zero extra requests**, which was the constraint — fetching per unlock
would have cost one request per question per student:

* The view now also gates on `current_question_index`, so the single fetch the
  client already makes at join returns only what has been asked.
* A `BEFORE UPDATE` trigger writes the open question (every language, no
  `correct_answer`) onto `live_exams.current_question_payload`, so it rides the
  Realtime row push and the `live_session_sync` poll that both already happen. A
  trigger rather than an edit to `unlock_next_live_question` because two
  functions move that cursor today and a third would be easy to forget.
* `src/lib/live/pushedQuestions.js` files each arrival at its ordinal for both
  the student runner and the projector, and reports a *gap* (missed unlocks)
  rather than leaving the array sparse — the pages address questions by
  position, so a misfiled question shows the wrong one under the host's timer.

Two things this migration deliberately does **not** do: it does not re-grant
`anon` on the view (20260823000000 revoked it and warned that a future recreate
must not re-add it), and it does not touch the answer-reveal timer.

Note the projector reads the same view and fetches once per (exam, language),
so it needed the same wiring — without it a wall opened before the session
starts would have stayed blank all session.

### 24. FIXED 2026-09-08 — no migration needed (client only).
Ending a session early produced an incoherent score card. Stop after 3 of 20 and
a student who answered all three correctly read **"3/20 Correct"** directly
beside **"100% Accuracy"** — two denominators, neither labelled: score out of
every *authored* question, accuracy out of the ones *answered*. Both true alone;
together nonsense. And they were scored against 17 questions nobody showed them.

A score is now out of what was **asked** (`scoreOutOf`), so the two agree —
"3/3" and "100%". Derived from the host's **cursor**, not the student's own list
length, so every language reports the same denominator; clamped so a cursor past
the end cannot exceed the paper. A session that runs to completion is unchanged,
because asked equals authored.

Only the score denominators moved. Mid-session, `Q3 / 20` and `3/20 answered`
are progress *through the paper* and keep the authored total. There are now three
counts on that page answering three different questions, and collapsing any two
is what caused both this bug and the regression below:

| count | answers |
|---|---|
| `exam.total_questions` | how big is this paper (lobby badge, `Q3 / 20`) |
| `askedCount` | what did the host ask (score denominators) |
| `questions.length` | what this browser has received — **never** a total |

**Two of the three symptoms were already gone**, closed as a side effect of
`20260844000000`: section bars are no longer drawn for sections never reached
(the breakdown is built from questions the student actually received), and the
review no longer reveals answers to unasked questions (they don't hold them).

**Regression fixed at the same time, caused by `20260844000000`'s client work:**
the waiting room lists each section with a question count derived from questions
in the browser — which before the host starts is none — so every section read
"0 questions" on a full paper. Now rendered only when known. Deliberately *not*
fixed by fetching the counts: that is one extra request per student at join, the
hottest path there is, to label something the paper-size badge already covers.

Pinned by `src/__tests__/live-score-out-of-asked.test.mjs`.

### 24b. Superseded — original text below for reference
Score is out of every authored question while accuracy is out of those answered,
so "3 / 20 correct" sits beside "100% accuracy". Section bars are drawn for
sections never reached, and the review reveals answers for questions never
asked. `LiveExamStudent.tsx`.

### 25. FIXED 2026-09-08 — **migration `20260846000000` pending.**
Opening the link after the session ended enrolled a phantom participant. A live
link is handed out at *publish* and pasted into class groups, so this fired every
time somebody scrolled back to yesterday's message: a zero-score row in the
standings the class sees, in the creator's participant list, and in the report's
head count.

Now the link expires with the session — the student gets a **"Link expired"**
screen and **no participant row is written**.

Two halves, and the second is the one that is easy to get wrong:

* **Nobody new** once `status = 'ended'`. Enforced in the join policy
  (`status IN ('published','live')`) so it holds against anything calling the API
  directly, and checked in `joinLiveExam` first so the student reads a sentence
  rather than a policy violation.
* **Everybody who was in the room keeps full access** — reopening the link to
  read your own result is the normal way that page is used afterwards. This is
  why `joinLiveExam` must NOT upsert on the ended path: PostgREST's upsert is
  still checked against the INSERT policy even when the row already exists, so a
  returning student would be refused by their own re-join. It reads the existing
  row and returns it, with no write.

Cost: none on the normal path. `status` rides the request `joinLiveExam` already
made for the creator check, and the participant lookup happens only on the ended
branch. A session ending mid-join is mapped from 42501 to the same expiry screen.

`draft` is excluded too — never reachable (no share link), but naming the two
joinable statuses stops a future status being admitted by default. Pinned by
`src/__tests__/live-link-expires-with-session.test.mjs`.

**Not included:** phantom rows already written by this bug are not cleaned up.

### 26. FIXED 2026-09-08 — **migration `20260847000000` pending.**
`skipped_count` counted people who were not in the room. It was
`GREATEST(participants − responses, 0)` with no bound on *when* anyone joined,
so turning up at Q15 recorded you as skipping Q1–Q14 — in the one number a
teacher uses to decide what to reteach.

Mostly invisible in a normal session (a question's numbers are computed as its
timer ends, when the attendee list only holds people who had arrived). It bites
when they are computed **late**: `end_live_session` backfills every unlocked
question that never got analytics, using the *final* head count. That is the
normal path when a host closes their tab, and it is **every question** of a
session that auto-closes under `20260845000000`.

Fix: `live_participants.joined_at_question_index`, stamped by the same trigger
that already server-stamps `joined_at` (a client that could pick its own join
position could exempt itself from every skip count), and the count filtered by
`COALESCE(joined_at_question_index, -1) <= <question's play ordinal>`. The
ordinal comes from `live_primary_questions`, not from a response row — a
question nobody answered has no responses, and that is exactly the question
whose skip count matters.

Rows written before the migration stay NULL and are counted as present
throughout, i.e. today's behaviour, so **no past report silently changes**. Only
sessions from here on get the accurate count. The student page already drew this
distinction ("Missed" vs "Skipped"); this moves the same rule server-side.

**Also fixes a defect in `20260845000000` — the auto-end could not work as
shipped.** `end_live_session_system` backfills analytics via
`compute_live_question_analytics`, whose first act is to raise
`'Access denied: not the exam creator'`. On the auto-end path the caller is a
**student** whose poll noticed the host had gone; `SECURITY DEFINER` changes the
ROLE, not `auth.uid()`, which reads a request GUC and still returns the student.
So the ending raised, the transaction rolled back, the session never ended, and
every subsequent poll repeated it. Guaranteed to be hit, because analytics are
computed from exactly one place — the creator's control room — so an abandoned
session always has an unlocked question with no analytics.

Repaired the same way as `end_live_session`: the work moved to
`compute_live_question_analytics_core` (no ownership test, revoked from
`PUBLIC, anon, authenticated`), and the caller-facing function keeps the test,
the signature, the return type, the exception text and the grant, and delegates.

Pinned by `src/__tests__/live-skipped-only-the-present.test.mjs`.

### 26b. Superseded — original text below for reference
`GREATEST(participants − responses, 0)` with no join-time bound, so a late joiner
is recorded as having skipped every earlier question.

### 27. FIXED 2026-09-10 — no migration needed (client only).
`pdf_url` (the source paper) was sent to every student, on **both** exam types,
because every student-facing sections fetch used `select("*")`:

* `live_sections.pdf_url` — path is `{creator user id}/{exam id}/{section id}/{ts}.pdf`,
  so the URL carries the creator's account UUID.
* `sections.pdf_url` — the mock upload path preserves the **original file name**,
  so the URL can read `.../SSC-MTS-2025-Set-A-FINAL.pdf`.
* `sections.pdf_name` — that file name on its own. Written once by
  `CreateExamDialog`, read by **nothing**. Pure leak.

Nothing student-side ever read any of them. The file stays unreachable (the
`exam-pdfs` bucket is `public = false`), but that single setting is the entire
protection and the project also runs a *public* bucket for question images — the
safety rests on nobody confusing the two.

Live: new `fetchLiveSectionsStudent` with a named column list, used by the
student page and by `fetchAllLiveQuestionsStudent` (which only takes ids).
`fetchLiveSections` is untouched — the creator's editor reads `pdf_url` for PDF
snipping and the download button, and `duplicateLiveExam` copies it forward.

Mock: `studentSectionColumns()` in `src/lib/sectionColumns.ts`, used by
ExamSimulator, ExamIntro, ExamReview **and Analytics**.

**Analytics was missed on the first pass** (found on re-verification the same
day). `/analytics` is a plain student route despite the creator-flavoured page
name, and it carried the identical `select("*")` with the identical
timing_group_id comment as the other three. The test now sweeps every source
file for a wide `sections` read and requires each hit to be on an explicit
creator-only list, rather than checking a hand-written list of student pages —
a fifth page cannot be forgotten the way the fourth was.

**The trap, worth reading before touching this again.** `sections.timing_group_id`
is hand-migrated AND load-bearing on exactly these pages — `resolveTimingGroupIds`
reads it off these rows. Omitting it from a named list does not error: it
silently resolves every section to no group, collapsing multi-section timed
"parts" into per-section timers. Naming it on an un-migrated database fails the
whole query. So the list is resolved at runtime via the existing cached
`tableHasColumn` probe. `Analytics.tsx` still uses `select("*")` for this same
reason and says so.

Two further notes for the next editor: the column list must be a **literal**,
not `[...].join(", ")` — supabase-js infers row shape from the literal type, so a
runtime string types every row as `GenericStringError` and every `section.id`
becomes a compile error. Hence `select(sectionCols as "*")` at the call sites,
which restores the Row type and in exchange claims two fields are present that
will be undefined. Nothing reads them; a test pins that.

Pinned by `src/__tests__/source-pdf-not-sent-to-students.test.mjs`.

### 27b. Superseded — original text below for reference
`fetchLiveSections` does `select("*")`; no student component reads `pdf_url`. The
only protection is the `exam-pdfs` bucket still being private — and this repo has
already flipped a bucket public for convenience once.

### 28. Live: no marks or negative marking, and imported config is dropped silently
Live exams count correct answers only. A paper imported with a marks
configuration has it discarded with no warning, while regular mock exams honour
it. At minimum warn on import.

### 29. FIXED 2026-09-08 — **migration `20260848000000` pending.**
A question nobody answered was labelled "Q1" in the report. `build_live_exam_report`
took each question's number from a lateral join onto `live_responses` — the play
position is stored on the *answer*, not on the question — so a question with zero
responses had no position, the payload carried null, and the page rendered
`Q{(q.ordinal ?? 0) + 1}`, turning "unknown" into **Q1**. Several unanswered
questions all appeared as "Q1" at once, beside the genuine question 1.

Worse than cosmetic: the report answers *"what do I reteach"*, and a question
nobody attempted is the strongest signal in it — the exact kind it could not
name. The teacher re-covers question 1, which was fine.

Fix: read the position from `live_primary_questions`, the single definition of
play order, which answers whether or not anybody responded. Same repair and same
reasoning as the skip count in `20260847000000`. This also retires a quieter
flaw — the old `LIMIT 1` picked an arbitrary response, and after an
undo-and-re-ask the responses to one question can carry different ordinals.

Existing stored reports are rebuilt by the migration (the payload is a snapshot
taken at `end_live_session` and nothing refreshes it), each inside its own
exception block so one unbuildable report cannot abort the rest.

Client: the three copies of `Q{(q.ordinal ?? 0) + 1}` became one `questionLabel`
helper that renders `Q—` for an unknown position. The server no longer sends
null, but the page still renders payloads stored *before* this migration.

**Note for the next person editing that migration:** `prosrc` includes comments,
so the self-check's grep for the removed join would fail against an explanatory
comment quoting it. The old SQL is deliberately paraphrased, not quoted. The
same trap caught the page test, whose assertion strips comments.

Pinned by `src/__tests__/live-report-names-unanswered.test.mjs`.

### 29b. Superseded — original text below for reference
The report derives each question's ordinal from a lateral against
`live_responses`, so a zero-response question yields NULL and renders as
`Q{(ordinal ?? 0) + 1}`. The reteach list then names the wrong question, and two
such questions collide on a null React key.

### 30. FIXED 2026-09-10 — **migration `20260849000000` pending.**
`get_live_moments` ignored the standings-visibility setting. Granted to every
authenticated user, and once inside it asked only "does this exam exist, and is
it live or ended". `leaderboard_visibility` did not appear in the function at
all, and there was no membership test.

So a creator who set standings to **Off** still handed out, per question, who was
on a streak, who came back from a bad run, and who was first in the class to go
perfect — by real name, unless privacy mode also happened to be on. Hiding the
standings does **not** turn privacy mode on. Two settings that read as if they do
the same job; only one was consulted.

No student *page* renders moments, which is small comfort: every student's
browser holds the exam id and the publishable key, which is all it takes to ask
directly — the same argument `20260812000000` made about `my_rank`.

Now:

| caller | sees |
|---|---|
| creator | everything, always |
| `'full'` | everything, names masked when privacy mode is on (unchanged) |
| `'private'` | their own moments |
| `'off'` | their own moments |
| not in the room | nothing |

`'private'` and `'off'` are deliberately identical, taken from
`20260812000000` rather than invented: its floor — which
`live_participants_public` has always applied — is that both collapse the room to
the caller's own row, and `'off'` then additionally strips the *rank*. A moment
carries no rank, so there is nothing extra to remove. Making `'off'` mean "not
even your own" would be a new behaviour invented inside a bug fix.

Moments attached to nobody (`user_id IS NULL`) stay visible — no person in them
to expose. An unrecognised/NULL setting defaults to `'full'`, so a bad column
value cannot blank the creator's projector.

No client change: the control room and the projector both authenticate as the
creator, so neither gate fires for them. Pinned by
`src/__tests__/live-moments-respect-visibility.test.mjs`.

**Adjacent, not fixed:** `build_live_exam_report` selects from `live_moments`
directly, so the stored report payload carries moments regardless of this
setting. That surface is creator- or token-gated (`20260835000000`), so it is a
different question from this one — but worth deciding on.

### 30b. Superseded — original text below for reference
Gated only on exam status and granted to all authenticated users. A creator who
sets standings to "Just me" or "Off" still exposes every classmate's name with
their per-question performance to any caller, participant or not.

---

## Needs a product decision before it can be built

### 31. What counts as one sitting (and the two problems it retires)
Nothing about a sitting is persisted. Every page load re-derives "which attempt
started a sitting" from the sections **as they are ordered right now**.
Consequences:
- Dragging a new section to the top of a published paper retroactively shatters
  every past sitting into per-section rows and changes every affected student's
  rank denominator. They see this with nothing having changed on their side.
- A re-sat section still *joins* the old sitting, so the row keeps the older date
  while containing work from a different day. (Its score no longer
  double-counts — that half is fixed.)
- Analytics and ExamReview can still disagree about half-finished sittings.

**Recommended:** stamp a session id onto each attempt when the student starts an
exam and stop inferring sittings from timestamps. One change, retires all three.

### 32. MITIGATED 2026-08-23 — client-only, no migration. OWNER DECISION: warn-with-count (option A); soft-delete deferred.
The section-delete dialog now counts attempts across every language twin when
it opens (one head-count query, cold path) and, when the count is positive,
shows a red banner with the real number ("N student attempts exist… permanently
erases those results") and a confirm button that says what it does ("Delete
anyway — erase N attempts"). Zero students / unknown / failed count all
degrade to the old quiet dialog — the count informs, it never gates. The
CASCADE itself remains (`attempts.section_id ON DELETE CASCADE`): an informed
creator can still erase, and soft-delete stays the eventual full fix. Exam
deletion keeps its existing unpublish-first guard. Pinned by
`src/__tests__/section-delete-warning.test.mjs`.

### 33. BUILT 2026-08-23 — **migration `20260841000000` pending** (the clock cap only).
The 5-minute resume window. This heading read "designed, not built" until
2026-09-10, by which point it had been shipped for over two weeks — the second
stale entry in this file to make a re-audit report a working feature as broken
(see issue 14). All four pieces are wired and pinned by
`src/__tests__/resume-window-and-filing.test.mjs` (9 assertions, green):

1. **The 5-minute window** — a same-device localStorage heartbeat (~30s, zero
   network). Away longer than 5 minutes and `ExamSimulator` seals the sitting
   via `sealAndFileSections` BEFORE the start call, so the next start is fresh.
   No beat on record falls back to resuming, which grants nothing: the clock ran
   regardless.
2. **Lazy filing** — no scheduler exists on this stack, so expired attempts are
   filed at the first opportunity a device offers: Marketplace/Analytics mount,
   once per tab session, deadline-passed rows only. A sweep can never touch a
   sitting that is live on another device. `src/services/attemptFiling.ts`.
3. **Position restore** — a resume lands on the last-touched question, not Q1.
4. **Clock length cap** — `20260841000000`, the paper bounds the duration a
   browser may request, with absent-schema guards.

Only the clock cap needs a migration; the rest is client-side and live.

The original specification is kept below, because it is the record of what was
agreed and the reasoning ("the clock keeps running" in particular) is not
reconstructable from the code.

Owner's specification, agreed:
1. Student starts an exam; tab closes / network drops / device dies.
2. For 5 minutes they may return and resume — same answers, same position, same
   clock. **The clock keeps running** during the absence (decided; pausing is an
   unbounded exploit because nothing can trust when they left).
3. On return within 5 minutes: prompt *"you have an exam in progress, continue?"*
   — **Yes** resumes; **No** submits the old attempt immediately.
4. Not back within 5 minutes: auto-submit with whatever was answered.
5. Any start after that is a new attempt.

Also decided: a timed-out attempt is a **normal** attempt — it counts in
rankings, counts in lifetime accuracy tiles, takes the skip penalty on
never-reached questions, and covers the whole exam rather than one section. So
**no discriminator column is needed**; nothing treats it differently.

Prerequisites and traps:
- **Saving answers mid-exam is done.** `src/services/examProgress.ts`.
- **The unlimited-time exploit is CLOSED as of 2026-08-22** (migration
  `20260836000000_exam_clock_in_db.sql` + client changes, pinned by
  `src/__tests__/exam-clock-survives-refresh.test.mjs`): the deadline is
  written onto the attempt rows at start, `start_exam_clock` (SECURITY
  INVOKER — the student-only insert policy still applies) returns the
  existing unexpired sitting instead of new rows, the page silently resumes
  clock + saved answers, and a `beforeunload` confirm adds friction. Resume is
  mandatory (no decline path), so a fresh start is impossible while an
  unexpired attempt exists. Remaining for the full feature: the 5-minute
  return window semantics, lazy auto-submit/finalisation of expired attempts,
  restoring position/active section, and a server-validated clock length.
  **UPDATE 2026-08-23 — all four remaining pieces are now built:** the
  5-minute return window (same-device localStorage heartbeat, ~30s beats, zero
  network; away >5 min → the sitting is sealed and FILED via
  `sealAndFileSections`, the next start is fresh; no beat on record falls back
  to resuming, which grants nothing), lazy filing of expired attempts
  (`src/services/attemptFiling.ts` — deadline-passed rows only, filed through
  `saveExamAttempt` so grading/marks/rankings all happen; swept once per tab
  session from Marketplace/Analytics mount; there is no scheduler on this
  stack, so a never-returning student's attempt files when the student next
  appears — creator-dashboard-triggered filing was DEFERRED: filing another
  user's attempt needs a definer function plus marks carried from the
  creator's browser, its own design pass), position restore (resume lands on
  the last-touched question), and the clock-length cap (migration
  `20260841000000`, requires the issue-6 fix which landed the same day).
  Pinned by `src/__tests__/resume-window-and-filing.test.mjs`.
- **Nothing to resume from.** The clock is an in-memory absolute deadline in a
  Web Worker, discarded on unmount, and every mount resets the display to the
  full allowance. Resume must persist: the absolute deadline, the clock scope
  (section / timing-group members / whole paper), `questionStates` including
  per-question time, `activeSectionId`, `indexBySection`, `attemptIdBySection`.
- **No timestamp on `attempts` is trustworthy.** `started_at` and `submitted_at`
  are browser-written; `created_at` is client-overridden in free/group mode. Plus
  issue 14 — the student can PATCH their own row. Any deadline must be written by
  a definer function using `now()`.
- **Nothing can fire the auto-submit.** No scheduler exists. Agreed approach:
  finalise lazily in the browser, hooked to the student opening the app at all
  (not just restarting that exam). Accepted limitation: a student who never
  returns leaves one unfinalised attempt; make the creator dashboard read it as
  in-progress rather than a zero-scoring student.
- **Marks can only be computed in the browser** (`calculateMarks` is TypeScript).
  Combined with issue 15, one attempt missing marks re-ranks a whole exam — so
  **fix 15 first**.
- **Multi-section papers** create an attempt row per section at start. In
  locked-solo mode sections not yet reached have *no* row, so "the whole exam is
  one attempt" means finalisation must materialise the un-entered sections to get
  the full denominator.

### 34. FIXED 2026-08-23 — client-only, no migration, zero extra calls.
All three pages now compare the exam's `user_id` against the locally cached
session and redirect non-owners to `/dashboard` (Analytics sends a student to
`/analytics`). Zero-call construction: ExamDetail and Analytics already
fetched the exam row; ManualFixEditor embeds `exam:exams(user_id)` in its
existing section read; the caller's id comes from `getSession()` (local, no
network). An RLS-hidden exam (PGRST116, zero rows) takes the same redirect
instead of a generic error toast. Pinned by
`src/__tests__/creator-page-ownership.test.mjs`.

### 35. FIXED 2026-09-10 — client-only, no migration.
Question Analysis painted every question in the paper on first paint. A row is
four cells, a ghost button with an icon and an accuracy bar of nested divs —
roughly a dozen DOM nodes — so a 200-question paper is a few thousand nodes to
build, lay out and paint before anything appears. (Not 400: `questionStats` has
been pooled per `question_group_id` since the bilingual fix, so a translated
paper is one row per question. The "400 rows" in the original note was stale.)

Not paged unconditionally — on a machine with room to spare, a control between
a creator and their own numbers is friction with nothing bought. `src/lib/rowBudget.ts`
resolves a **total** row budget from what the device admits about itself, and a
roomy device gets `BUDGET_UNLIMITED`: the full table, no controls, byte-identical
to the old behaviour.

| signal | budget |
|---|---|
| `deviceMemory` ≥ 8 **and** `hardwareConcurrency` ≥ 8 | unlimited |
| `connection.saveData` | 40 (outranks the hardware — the reader asked for less work) |
| `deviceMemory` ≤ 2 **or** `hardwareConcurrency` ≤ 4 | 40 |
| neither reported, viewport ≥ 1024px | unlimited |
| neither reported, narrower | 80 |
| anything else | 80 |

Unknown resolves to *modest, not roomy*: `deviceMemory` and a useful core count
are Chromium-only, and a phone that declines to describe itself is likelier to
be the cheap Android this exists for than a workstation.

A **total**, not a per-section cap, because eight sections of thirty clear any
sane per-section cap and still paint 240 rows. It is spent section by section in
display order; each truncated section gets its own `View N more`, and the header
gets one `View all` while the budget is hiding rows in an *open* section.
Collapsed sections are left out of that count and out of the label: the click
would lift the budget and still paint nothing there, so a header offering to
reveal them would be lying.

Two properties are pinned harder than the tier numbers, which are judgement:
- **stable** — the budget is spent on a baseline pass that *ignores* what the
  reader expanded, so revealing one section can never resize another. Letting an
  expanded section stop paying into the budget frees its slice for whoever is
  below, and the table rearranges itself underneath the tap that asked for one
  more row. Caught by the test, not by review.
- **honest** — a section the budget could not reach still returns 0 rather than
  vanishing, so its heading and question count stay on screen.

`TAIL_SLACK_ROWS = 10`: a hard stop at the budget lands mid-section constantly at
these paper sizes. At 4 a 25-and-20 paper offered "View 5 more" — a control that
costs a tap and buys five rows. Only the section the budget runs out inside can
overspend, and only once, so the table is still bounded by budget + 10.

Also memoised the grouping while in there ([Analytics.tsx](../src/pages/Analytics.tsx)):
the reduce/sort lived inline in the JSX, so every unrelated re-render on the page
re-grouped and re-sorted every question — and it sorted the grouped arrays *in
place* during render. Without the memo, "View more" would re-sort the whole list
and the feature would buy nothing. Pinned by
`src/__tests__/question-analysis-row-budget.test.mjs`.

---

### 36. FIXED 2026-09-10 — **migration `20260851000000` pending.**
`20260845000000` settled what an attempt is for the creator dashboard — answered
at least one question = an attempt, touched nothing = not an attempt. The admin
console never got the rule. Both `exams_attempted` in `admin_get_all_users` and
the "N Attempted" popup from `admin_get_user_attempts` counted raw attempt rows,
so the two screens disagreed about the same student in the same database. A group
link where 25 of 30 recipients bounced off the start screen gave 25 people a
permanent "1 Attempted".

**One shared function, not the same filter twice.** `20260826000000` already
mirrored the count and the popup by hand, and said so in its header, because rows
that do not add up to the number above them is its own bug. Both now select from
`admin_engaged_sittings(uuid)`, so they cannot drift again.

**Engagement is tested across the whole sitting.** A four-section paper writes
four attempt rows per sitting and only the first-section row identifies it —
this schema has no sitting id, and both admin queries already leaned on that
proxy. Testing engagement on that row alone would have been wrong in a new
direction: a student who skipped a hard section 1 outright and answered thirty
questions in section 2 genuinely sat the paper. The sitting's window is
`[this first-section attempt, the next one)`, from `lead()` over the same rows.

**What deliberately did not carry over:** the creator-exclusion
(`a.user_id <> e.user_id`). `get_exam_engaged_attempts` measures the cohort that
sat one exam and the author is not part of it; this answers what a *user* has
done, and a creator who sat their own paper did sit it. Copying it would blank
the activity of every creator who tested their own work. Retakes and language
variants still count separately — both pre-existing, both what the popup shows.

The helper is INTERNAL under R1's classification: it takes any user id and
carries no gate of its own, so it is revoked from `PUBLIC, anon, authenticated`
in one statement and both callers keep their own admin-email gate.

Cost: the count becomes a correlated call, so listing users runs the helper once
per user. At a few hundred users and a few thousand attempt rows that is
milliseconds, on an admin-only screen one person opens occasionally. Nothing on a
student or creator hot path touches it.

The console now says what the number counts, since it is smaller than the raw row
count and that difference is the whole point. Pinned by
`src/__tests__/admin-attempts-are-engaged.test.mjs`.

---

## Where to look

| Area | Files |
|---|---|
| Practice runner | `src/pages/ExamSimulator.tsx`, `ExamIntro.tsx`, `src/services/examService.ts`, `examProgress.ts` |
| Scoring / marks | `src/services/scoringEngine.ts`, `scoringService.ts`, `src/lib/examNavigation.js` |
| Student analytics | `src/pages/Analytics.tsx` (student branch = `examId` absent), `ExamReview.tsx` |
| Live exams | `src/pages/LiveExam*.tsx`, `src/components/live/`, `src/lib/live/` |
| Timing groups | `src/lib/timingGroups.js`, `timingGroupSettings.ts`, `src/components/exam/GroupPoolField.tsx` |
| Server logic | `supabase/migrations/2026082*`, `2026083*` |

---

## Cross-cutting

### R1. FIXED 2026-09-10 — **migration `20260850000000` pending.**
26 `REVOKE EXECUTE ... FROM PUBLIC` statements (20 distinct functions) removed
nothing. Supabase ships default privileges that GRANT EXECUTE on every new
`public` function **directly** to `anon` and `authenticated`, so PUBLIC was
never the grant in use. `20260833000000` even self-checks it with
`has_function_privilege('public', ...)` and passes — it tests a door nobody uses,
which is why the pattern survived 26 repetitions.

Practical exposure was smaller than the count suggests: every sensitive function
checks `auth.uid()` internally (`get_exam_analytics`, `get_attempt_answer_key`,
`live_exam_readiness`, `compute_attempt_marks`, `get_exam_engaged_attempts`,
`live_primary_questions`), and the rest are pure arithmetic. The outer lock was
a second layer. But two functions had **no** inner check and were genuinely
reachable — `end_live_session_system` and `live_question_payload_at`, both fixed
earlier this month.

`20260850000000` re-issues all of them, split by intent because one blanket rule
would 403 the app:

| group | count | action |
|---|---|---|
| internal helpers — no GRANT, no policy reference, only definer callers | 11 | revoke `PUBLIC, anon, authenticated` |
| app RPCs — `GRANT ... TO authenticated`, called over rpc | 8 | revoke `PUBLIC, anon`; **keep authenticated** |
| `get_published_question_ids` | 1 | **untouched** — granted `TO authenticated, anon` on purpose and used inside the "Public read question scoring for published exams" policy; revoking anon silently strips per-question marks from signed-out browsing |

Traced `start_exam_clock` specifically because guests can sit exams here — its
rpc sits inside `if (user && !isPreview)`, so no signed-out path reaches it.

Robust to this project's hand-pasting: the loop is driven off `pg_proc`, so a
function whose own migration is not applied yet is skipped and counted rather
than aborting the script (re-run the file after applying it); roles are checked
against `pg_roles` before being named; signatures come from
`pg_get_function_identity_arguments`, so overloads are exact. Zero cost — one-time
privilege changes, no body/plan/request-count change.

The 26 historical files are left alone: they are already applied, rewriting them
changes nothing in the database, and their self-checks still pass because what
they assert (PUBLIC cannot execute) remains true.

**First paste failed**, fixed 2026-09-10: the self-check passed
`pg_get_function_identity_arguments` output into `has_function_privilege`,
which parses its second argument as a `regprocedure` — that parser takes
argument TYPES and rejects argument NAMES, and identity arguments include the
names (`p_attempt_id uuid`). It raised `invalid type name`, and because the
SQL editor runs a file in one transaction the revokes above rolled back with
it, so the migration appeared to do nothing. Now uses the `oid` overload,
which has no signature parser. Every other `has_function_privilege` call in
the repo passes a hardcoded type-only signature and was never affected.

Pinned by `src/__tests__/revokes-name-the-roles.test.mjs`, whose last assertion
fails any migration **after** `20260850000000` that uses the `FROM PUBLIC`-only
form. Verified to fire by planting a bad migration.
