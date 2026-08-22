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

**Pre-existing test failures, unrelated to any of the below — do not chase:**
`exam-list-query.test.mjs`, `exam-paper-type.test.mjs`. Both fail on a clean
checkout of `HEAD`.

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

`20260831000000` must be applied **before** `20260832000000`.

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

---

## HIGH — data correctness, students affected now

### 1. Blank text/numeric answer is marked WRONG and takes the negative-marking penalty
`src/services/scoringEngine.ts` — `calculateMarks` treats a question as skipped
only when the answer is `null`/`undefined` or status is `untouched`. An empty
string is none of those. `ExamSimulator` writes `selectedAnswer: ""` with status
`attempted` when a student types then backspaces, so it falls through to
`scoreSCQ` and lands in the wrong-answer branch (`-marks_wrong`). Whitespace-only
does the same. The multi-select scorer already guards this; the single-answer one
does not. `hasAnswer` in `src/lib/examNavigation.js` is the codebase's correct
definition and treats `""` and `[]` as no answer.
Worse: `ExamSimulator`'s "Clear Response" button is disabled once the field is
empty, so the student cannot undo it. ExamReview labels the same question
"Unanswered" — the two surfaces disagree.

### 2. Analytics and ExamReview disagree about "unanswered"
A recent commit taught ExamReview that `null`, `undefined`, `""` and `[]` are all
untouched. `src/pages/Analytics.tsx` still tests `selected_answer === null` only.
So an emptied multi-select or cleared text box is *wrong* on the creator's
analytics and *unanswered* on the student's review of the same sitting. It also
pollutes the "common wrong answers" panel with empty-string entries. Use the
shared `hasAnswer` helper in both.

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

### 5. Live: scheduled auto-start fires during a rehearsal and strands students
`src/pages/LiveExamControl.tsx`. The auto-start effect has no rehearsal guard
(unlike `handleUnlockNext` and `handleEndTime`), and the page forces
`status = "live"` while rehearsing. So the real exam goes live, the screen stays
in rehearsal, and the space bar only advances the simulation — real students sit
in a lobby that never moves with nothing on the host's screen saying so.
Related, same file: "End exam" and the +30s/+60s controls are reachable during a
rehearsal and act on the real exam row.

### 6. Live: a timing group split into two runs grants its whole time pool twice
`src/pages/ExamDetail.tsx` (`processSectionReorder`) skips the membership repair
while whole-paper switching is on, and group containers are hidden in that mode.
Turn switching on, drag a member through the group, turn it off: the group can
end up non-contiguous, and `timingUnits` (`src/lib/timingGroups.js`) gives each
maximal run the group's full `time_minutes`. Needs 4+ members to double.
The migration header of `20260824000000_add_section_timing_groups.sql` claims the
grouped paper is restored as it was; it is not.

### 7. Live: privacy mode does not anonymise anyone
Three independent leaks.
- `live_question_analytics` carries `fastest_user_id` as a raw UUID next to the
  masked pseudonym, and the row is broadcast over realtime. Policy "Anyone can
  view analytics of live exams" keys only on exam status — **any** authenticated
  user, participant or not, can read it for any live/ended exam, then resolve the
  id via `public_profiles`. Also links a person across sessions.
- The public session report embeds a full `{real user_id → pseudonym}` map plus
  each person's rank, join time and score, readable unauthenticated.
- `anon_ordinal` is assigned strictly by join order and the masked leaderboard
  publishes `joined_at`, so the pseudonym is a publicly computable function of
  when you joined.

### 8. Live: public report links are not secret
`report_share_token` is a plain readable column on `live_exams`, whose SELECT
policy has no column restriction. Any signed-in user can list every shared
report token in one request. Every student in a room already holds that room's
token. The payload also contains **every question's `correct_answer`** and the
origin exam id — and live exams are duplicated to re-run, so a shared report is
next period's answer key.

---

## MEDIUM

### 9. Creator leaderboard and student rank badge rank by different metrics
With no marks configured, the creator's Top Students ranks by accuracy ratio
while `get_my_exam_ranks` ranks by raw correct-count. 18/20 tops one list and
loses on the other. Pick one — percentage is fairer when sittings differ in size.
`src/pages/Analytics.tsx` + `20260828010000_student_exam_ranks_jsonb.sql`.

### 10. Attempts on unpublished exams make the student's three stat tiles disagree
Sections RLS hides an unpublished exam, so the joined section comes back null and
those attempts drop out of History and "Total Mock Exams" — but still feed
Overall Accuracy and Avg Time (both computed over the raw attempts array). A
student whose only exam is unpublished sees "Total Mock Exams 0" above a non-zero
accuracy. Decision needed: show them labelled "no longer available", or exclude
them everywhere. `src/pages/Analytics.tsx`.

### 11. Orphan attempts: many History rows share one rank
Attempts occurring before any first-section attempt. `get_my_exam_ranks`
deliberately excludes them from ranking, but History still emits one row per
orphan and `getRankForGroup` can resolve several rows to the same entry. Needs
the render side and the RPC to agree on what an orphan is.

### 12. `Avg Time / Question` improves when a student abandons
Divides total question time by **all** questions including never-opened ones, so
answering 10 of 100 reads ~10× faster than reality. Divide by questions actually
visited and relabel. `src/pages/Analytics.tsx`.

### 13. "Overall Accuracy" is a score percentage, not accuracy
`correct / all questions`, so skipping 80 of 100 and acing 20 shows 20%. Write
and read agree, so it is a naming/product question, not a bug. Suggested: show
both, "Score 20%" and "Accuracy 100% (20 of 20 attempted)".

### 14. Students can still PATCH their own attempt rows
Policy `"Users can update their own attempts"` is `USING (auth.uid() = user_id)`
with no restriction on **which** columns. `score` is now written by
`submit_exam_attempt`, so the practical exposure is smaller, but `marks_score`,
`submitted_at` and any future column remain client-writable. Needs column-level
grants or a trigger.

### 15. The marks gate flips a whole exam on one missing value
`bool_and(has_marks) OVER (PARTITION BY exam_id)` in
`20260828010000_student_exam_ranks_jsonb.sql` (and the mirror in
`Analytics.tsx`). It answers "does this exam use marks?" by surveying every
attempt ever recorded. One attempt without `marks_score` — any pre-marks-module
sitting — silently re-ranks the entire cohort on raw correct-count. Should key on
the exam's scoring configuration (`exam_scoring_defaults` /
`section_scoring_defaults` / `question_scoring_config`) instead.
**This is a prerequisite for the resume feature below.**

### 16. Text and numeric answers are compared byte-for-byte
`grade_mock_answer` (SQL) and the client both compare quote-stripped strings with
no trim, case folding, numeric normalisation or Unicode normalisation. `delhi` vs
`Delhi`, a trailing space from a mobile keyboard, `0.5` vs `.5`, `1000` vs
`1,000` all fail. Hindi is worse: the key is entered via `TransliterateInput`
while students use their own IME, so NFC/NFD or nukta differences fail silently.
Trim and Unicode normalisation are safe wins; **case-insensitivity is a product
decision** (chemistry: `Co` cobalt vs `CO` carbon monoxide).

### 17. `paper_type` permission is enforced only in the UI
`20260825000000_add_exam_paper_type.sql` adds `profiles.can_set_paper_type` and
presents it as an authorization boundary, but nothing server-side consults it —
only a CHECK on the value. Any creator can set `paper_type = 'pyq'` on their own
exam via the API and get the gold PYQ badge, the `?type=pyq` listing and the SEO
shelf. Needs a trigger or a policy referencing the grant.

### 18. Anonymous students' finished exams are already lost on tab close
`pendingExamSubmissions` is held in `sessionStorage`, which the browser destroys
on tab close — so an anonymous student who *completes* a paper and closes the tab
before signing in loses it. One-line fix: `localStorage`. Also, the replay loop
in `src/pages/StudentAuth.tsx` clears the queue only after the whole loop
succeeds, so a partial failure re-saves already-written attempts.

### 19. Live: no host-abandonment handling
No timeout, heartbeat, watchdog or scheduled job anywhere in the repo (no
pg_cron, no scheduled edge function, no CI). Only the creator can move an exam
out of `live`. An abandoned session stays live indefinitely, admitting joiners
and parking students on a question screen with no message. A student presence
heartbeat exists (`live_presence`) but explicitly excludes creators.

### 20. Live: questions are editable mid-session
`handleAddQuestion` / `handleDeleteQuestion` / `handleUpdateQuestion` in
`LiveExamDetail.tsx` have no live guard, though drag-reorder and JSON import do.
Play order is derived on the fly from `global_index`, so deleting at or before
the current question renumbers everything while `current_question_index` stays
put — the pointer then designates a different question than the one on screen.

### 21. Live: answer-key edits are not mirrored to translations
The editor locks the key field on secondary languages (primary is the source of
truth) but `handleUpdateQuestion` writes only the edited row. The JSON import
path does mirror. So every post-import key fix applies to one language only, and
students sitting the other are graded against the old key —
`submit_live_response` grades against the submitted row's own key.

### 22. Live: language variants with different question counts leak answers
`get_revealed_live_answers` computes ordinals per language but compares against
`current_question_index`, which is a primary-language ordinal. A secondary
language with fewer rows shifts its ordinals, so a not-yet-asked question's key
is returned. Reachable with no warning via a Replace-mode JSON import on the
secondary language with fewer accepted questions. The same drift makes
`submit_live_response` store answers against the wrong primary row.

### 23. Live: the whole paper is sent to the browser at join
`fetchAllLiveQuestionsStudent` fetches every question with no unlock predicate,
called once at init — so the one-question-at-a-time pacing is presentation only.
Readable from the moment the exam is *published*, which is when the link is
handed out. (Answer keys are correctly withheld; this is the paper itself.)

### 24. Live: ending a session early produces an incoherent score card
Score is out of every authored question while accuracy is out of those answered,
so "3 / 20 correct" sits beside "100% accuracy". Section bars are drawn for
sections never reached, and the review reveals answers for questions never
asked. `LiveExamStudent.tsx`.

### 25. Live: opening the link after the session ends enrols a phantom participant
`init()` joins with no status check, so any student-type account gets a
`live_participants` row and a "That's a wrap — here's how you finished" card
reporting 0. The row is visible to the rest of the room and to the creator.

### 26. Live: `skipped_count` counts people who were not in the room
`GREATEST(participants − responses, 0)` with no join-time bound, so a late joiner
is recorded as having skipped every earlier question.

### 27. Live: `pdf_url` (the source paper) is sent to every student
`fetchLiveSections` does `select("*")`; no student component reads `pdf_url`. The
only protection is the `exam-pdfs` bucket still being private — and this repo has
already flipped a bucket public for convenience once.

### 28. Live: no marks or negative marking, and imported config is dropped silently
Live exams count correct answers only. A paper imported with a marks
configuration has it discarded with no warning, while regular mock exams honour
it. At minimum warn on import.

### 29. Live: a question nobody answered is labelled "Q1" in the report
The report derives each question's ordinal from a lateral against
`live_responses`, so a zero-response question yields NULL and renders as
`Q{(ordinal ?? 0) + 1}`. The reteach list then names the wrong question, and two
such questions collide on a null React key.

### 30. Live: `get_live_moments` ignores the standings-visibility setting
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

### 32. Deleting a section or exam destroys students' results
`attempts.section_id` is `ON DELETE CASCADE`. A creator tidying up drafts erases
students' records with no warning and no trace; if it was their only exam they
see "No history yet". Partial deletion silently shrinks past scores.
**Recommended:** soft-delete, and warn the creator when students have attempted.

### 33. The 5-minute resume window — designed, not built
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
- **The unlimited-time exploit already exists.** Reloading mid-exam currently
  hands out a brand-new full-length clock plus a second set of attempt rows; the
  only deterrent is losing your answers, which the save-as-you-go work removed.
  So resume must be mandatory and must restore the *original* deadline. A fresh
  start must be impossible while an unexpired attempt exists — otherwise the
  student declines the prompt and takes a clean clock.
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

### 34. Three creator pages have no ownership check
`/exam/:examId` (`ExamDetail`), `/exam/:examId/section/:id/edit`
(`ManualFixEditor`), `/analytics?examId=` (`Analytics` creator branch). None
verifies the caller owns the exam; they relied entirely on RLS. With the answer
key withheld they now degrade to empty rather than leaking it, but they should
redirect. `Analytics`'s only gate is `role === 'creator' && !examId`, so a
student with `?examId=<published>` falls into the creator branch.

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
