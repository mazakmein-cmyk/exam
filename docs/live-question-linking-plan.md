# Live Exams: linking translated questions properly

**Status:** proposal — awaiting approval, nothing built yet
**Written:** 2026-08-09

---

## 1. The problem, in plain language

A live exam is host-driven. The host clicks "next", and the server holds one number: `current_question_index` — 0, then 1, then 2.

Students each read from their own language's list of questions. So the server has to answer a question constantly: *"this Hindi student just answered something — which question was that?"*

Today it answers by **counting positions**:

> "Line up all the Hindi questions in order. This one is 5th. Fine — go find the **English** question that is also 5th, and treat them as the same question."

That is a **seat number**, not a **name tag**. It only works if both lists are exactly the same length and in exactly the same order.

### What happens when they aren't

Say English has 30 questions and, while translating, one Hindi question never got added — Hindi has 29.

| Host says | English student sees | Hindi student sees | Server files it as |
|---|---|---|---|
| Q4 | English Q4 | Hindi Q4 ✅ | Q4 ✅ |
| **Q5** | English Q5 | **the translation of Q6** ❌ | Q5 ❌ |
| Q6 | English Q6 | translation of Q7 ❌ | Q6 ❌ |
| … | … | shifted by one, forever | … |

Three things go wrong:

1. **The room splits.** The host says "Question 5, everyone" and puts it on the projector. Half the room reads an algebra question, half reads something else entirely. Nothing on any screen says anything is wrong.
2. **The report blends two questions into one.** Grading is still *fair* — a student is checked against the answer key of the row they actually read — but the response is **stored** under the English question at that position. So "Q5" in the report is a mix of English students answering Q5 and Hindi students answering Q6. One option tally, two unrelated questions. The numbers look completely normal.
3. **The shorter language falls off a cliff.** When the host reaches position 29, Hindi has no position 29. Those students hit *"This question is not currently open for answers"* and cannot submit ([`20260804000000_live_v2_controls.sql:533-535`](../supabase/migrations/20260804000000_live_v2_controls.sql)) — mid-session, in front of the room, with no explanation. If Hindi has *more* questions than English, the extras get filed under themselves and show up as phantom rows in the report.

### Why the mock exam doesn't have this

Mock exams put a **name tag** on both rows — a shared `question_group_id` saying "these two are the same question." Position doesn't matter, order doesn't matter. Delete something in the middle and the remaining links still point at the right twins.

**This plan gives live exams the same name tags.**

---

## 2. What I found when I looked (and what it changes)

Six things came out of the survey that shape the plan. Two of them changed it significantly.

### ✅ The name-tag column already exists — but it's usually empty

`live_questions.question_group_id` exists ([`20260729000000_create_live_exam_tables.sql:72`](../supabase/migrations/20260729000000_create_live_exam_tables.sql)). But it is **NULL for 100% of questions in every single-language live exam**, because both writers only fill it in when the exam has more than one language ([`LiveExamDetail.tsx:541`](../src/pages/LiveExamDetail.tsx#L541) and [`:1285`](../src/pages/LiveExamDetail.tsx#L1285)), and the column has no database default.

There has never been a backfill for it. Confirmed across all 61 migration files.

### ✅ But single-language exams don't need it — and that shrinks the job a lot

A single-language exam has nothing to match *to*. Its "translation" is itself. So an empty name tag there is harmless, as long as the code reads "no name tag" as "this question is its own group."

Better still: **a live exam's language set is frozen at creation.** `supported_languages` is written once and no code path anywhere ever changes it — there is no "add Hindi to an existing live exam" feature ([`liveExamService.ts:298-314`](../src/services/liveExamService.ts), verified by repo-wide grep). So a single-language exam can never *become* multi-language and never retroactively need name tags.

**Consequence: we only backfill multi-language exams.** That is almost certainly a small number of rows, and it takes the riskiest part of the job down to a fraction of its original size.

### ℹ️ Name tags on translations are assigned by position at import — and that is accepted

When you import a translated language via JSON, the code pairs each translated question to a primary one **by position** and copies the name tag across ([`LiveExamDetail.tsx:1374`](../src/pages/LiveExamDetail.tsx#L1374) and [`:1388`](../src/pages/LiveExamDetail.tsx#L1388)).

So the name tag is a *cached position*, decided once at authoring time.

**This change moves the position assumption from run time to authoring time. It does not eliminate it.** That is a deliberate, accepted boundary, not an outstanding risk — *decided 2026-08-10: creators verify translation alignment themselves.*

It works because the two halves land where each is strongest:

| Checked by | What | Why that side |
|---|---|---|
| **The system** (Phase 6) | Does every question have a twin? Do the counts match? Any duplicate tags? Same option count? | Mechanical cross-referencing of 30 questions across two languages — tedious and error-prone for a person, trivial for code |
| **The creator** | Is this Hindi question genuinely the translation of *that* English one? | Requires reading both and understanding them. No amount of code can determine this |

The reason moving the assumption is still a large win:

- An authoring-time pairing happens **once**, in a quiet moment, and can be inspected and corrected before anyone sits the exam.
- A run-time pairing happens on **every single answer**, silently, while a room full of people is watching and nobody can intervene.

**Phase 6's gate remains load-bearing.** It is what makes the authoring-time pairing inspectable — the creator can only sanity-check alignment if the structural mismatches have already been surfaced to them. Skip the gate and the creator is eyeballing a paper with no idea where to look.

### ⚠️ Server-side matching alone does NOT fix the student's screen

This is the finding that most changes the plan.

Matching by name tag on the server fixes **which row the answer is filed under**. It does *not* fix **which question the student is looking at**, because the student's app picks the question by array position ([`LiveExamStudent.tsx:768`](../src/pages/LiveExamStudent.tsx#L768)):

```js
currentQuestion = isLive ? questions[currentQuestionIndex] : null
```

A drifted Hindi student still reads the wrong question. The report gets tidier; the room is still split.

**So the plan must include a client-side change too** — the student's app has to look up "the question whose name tag matches the one the host has open" instead of "the Nth question in my list." That needs the server to broadcast the open question's name tag alongside the index, which is a small addition to `live_session_sync`.

Related, and also worth fixing: when a student's language list is *shorter*, `questions[idx]` is `undefined` and the submit handler silently does nothing — no error, no toast, the button just doesn't work ([`LiveExamStudent.tsx:680-682`](../src/pages/LiveExamStudent.tsx#L680-L682)).

### ✅ Correction: there is NO "drift generator" — renumbering is a mirror, not a cause

An earlier draft of this plan claimed the deprecated client-side `renumberLiveGlobalIndexes` was actively manufacturing misalignment because it "walks each language independently." **That was wrong, and it is worth recording why.**

Reading both implementations side by side:

| | Partition | Order within |
|---|---|---|
| Client (deprecated) | per language | section `sort_order`, section id, `q_no`, question id |
| Server RPC `renumber_live_global_indexes` | `PARTITION BY s.language` | `s.sort_order, s.id, q.q_no, q.id` |

**They compute the same order.** Neither consults `section_group_id`. The RPC's own header comment — *"Every language is walked with the same section-group order"* ([`20260806000000_live_v2_authoring.sql:159-162`](../supabase/migrations/20260806000000_live_v2_authoring.sql)) — overstates what the SQL beneath it does.

So **renumbering does not create drift. It faithfully reflects whatever structure it is given.** The actual sources of misalignment are structural: a language with a different number of questions, sections with different `sort_order` per language, or a question added in one language only. Those are exactly what Phase 6's gate catches — which makes the gate more load-bearing, not less.

The server RPC is still the right thing to call, for a different and smaller reason: **atomicity**. The client version issued one UPDATE per question and could die partway, leaving a play order matching neither the old arrangement nor the new one. That is corruption, and play order *is* the exam.

### ⚠️ Two deployment landmines

- **`live_session_sync` has six different versions** scattered across migrations. `CREATE OR REPLACE` doesn't merge — only the last-applied one exists. Edit the wrong copy and the change silently does nothing.
- **`supabase/APPLY_REMAINING.sql` is out of date.** Its header stops at `20260812000000` and it does not contain `20260815000000`. Re-pasting that file *reverts* the window-nesting fix. Since hand-pasting is how migrations actually get applied here, this is a live hazard that will bite during a rollback at the worst possible moment.

---

## 3. What gets built

Seven phases. Each is independently shippable and independently revertible. **Phases 1 and 2 are safe to ship on their own** and are worth doing regardless of whether you approve the rest.

---

### Phase 0 — Look before touching *(read-only, no changes)*

**New file:** `supabase/tests/verify_live_group_ids.sql`

A plain read-only query that reports, per live exam:

- How many questions have no name tag, by language
- Which questions have a name tag that **disagrees** with their position (these are the exams where this change alters the meaning of existing data)
- Whether the same name tag appears twice inside one language (would make lookups ambiguous)
- Which languages have a different question count from the primary

**Why first:** this is the only failure this design cannot absorb. If an exam's existing name tags already disagree with its positions, then switching to name tags changes which question yesterday's answers belong to. We need to know that *before* deploying, not after.

> ⚠️ Before running it, confirm which database we're actually pointed at. `config.toml` names a different project than `.env`, and "applied but nothing changed" has meant the wrong DB before.

---

### Phase 1 — ✅ SHIPPED 2026-08-10 *(client only, no DB change)*

Planned as four edits. On reading the code, **three of them were wrong** and were dropped. What shipped:

**Done — make renumbering atomic**

- [`LiveExamDetail.tsx`](../src/pages/LiveExamDetail.tsx) section-reorder path now calls `renumberLiveGlobalIndexesRpc` instead of the client loop.
- The deprecated `renumberLiveGlobalIndexes` was **deleted** from [`liveExamService.ts`](../src/services/liveExamService.ts) — it had exactly one caller, and leaving a non-atomic version exported is how that path would quietly regress.
- **Ordering is unchanged** (see the correction in §2). The win is that a renumber can no longer half-apply.

**Dropped — `duplicateLiveExam` re-minting name tags**

The current code is already correct. It remaps non-NULL tags consistently (siblings sharing a tag get the same new tag) and leaves NULL as NULL. Minting a fresh tag per row where the source was NULL would give each row *its own* group — turning "visibly unlinked" into "looks linked, isn't." That is the same fail-open failure this plan rejects the column `DEFAULT` for. **Propagating NULL is the honest behaviour.**

**Dropped — the `?? null` writes at the two primary-import sibling branches**

Unreachable. `siblingSections` is only non-empty when the exam is multi-language, and in that case `groupId` is always a real UUID — so the `?? null` never fires. It also serves a typing purpose (`string | undefined` → `string | null`). Changing it would be churn.

**Dropped — the secondary-import write where primary's tag is NULL**

If the primary row has no tag, writing NULL to the translation honestly records "these two are not linked." Silently minting one during an import would hide a real problem, and it would violate the stated contract that a secondary import never writes to primary rows. **Repairing this belongs in Phase 6's "Link translations" button**, as an explicit action the creator takes.

*Verified: `tsc -b` clean, all 24 test files pass.*

---

### Phase 2 — Give existing multi-language exams their name tags

**New migration:** `supabase/migrations/20260816000000_live_question_group_backfill.sql`

For each multi-language live exam, pair each language's questions to the primary's **using exactly the same position rule the system uses today**, and stamp a shared name tag on each pair.

Three deliberate choices:

- **Only multi-language exams.** Single-language exams are left completely alone — nothing to match, and they can never become multi-language.
- **Only fills blanks** (`WHERE question_group_id IS NULL`). It can never move a question that's already linked, and it's safe to re-run.
- **No column default.** The design draft proposed `DEFAULT gen_random_uuid()`, and I'm rejecting that: three parts of the codebase read "no name tag" as "this question is unlinked, leave it alone." A default would make a broken orphan look like a healthy link — failing open in exactly the way we're trying to fix.

**Why pair on position when position is the thing we distrust?** Because the backfill must be **behaviour-preserving** — after it runs, the system must behave *identically* to before. That's what makes rollback safe. The backfill freezes today's behaviour into name tags; the *gate* in Phase 6 is what then catches the ones that were wrong.

---

### Phase 3 — ✅ WRITTEN 2026-08-14 *(zero behaviour change, not yet applied)*

**New migration:** [`20260817000000_live_primary_questions_helper.sql`](../supabase/migrations/20260817000000_live_primary_questions_helper.sql)

Adds `live_primary_questions(exam) RETURNS TABLE(id, ordinal)` — one definition of "the primary language's play order" — and repoints four callers at it.

**Set-returning, not scalar.** Three callers want *the row at ordinal N*; `end_live_session` wants *every row up to ordinal N*. A scalar helper would have served three and left the fourth with its own private copy of the ordering — the exact problem being removed.

**Scope narrowed to four of the nine, deliberately.** Converted: `flag_live_confusion`, `live_open_question_tally`, `undo_last_live_unlock`, `end_live_session` — all pure position lookups whose semantics nothing later changes. **Not** converted: `submit_live_response`, `get_revealed_live_answers`, `live_ordinal_min_seconds`, `live_ordinal_max_seconds` (rewritten in Phase 4) and `live_session_sync` (gains a field in Phase 5). Rewriting a 180-line body twice doubles transcription risk for no gain.

**Two safety corrections from the design draft, applied:**

- Returns `(id, ordinal)` only. The draft returned `public.live_questions`, which as a `SECURITY DEFINER` function would have handed `correct_answer` to any caller — reopening the hole `20260729020000` closed by removing students' direct table read.
- `REVOKE EXECUTE ... FROM PUBLIC`, with **no** `GRANT`. Every caller is itself `SECURITY DEFINER`, so the owner's implicit privilege suffices and the helper never becomes reachable from PostgREST.

**Verification — proven, not reviewed.** Two independent checks:

1. A **body diff against the originals** shows the only lines that differ in all four functions are the inline subquery (removed) and the helper call (added). Nothing else moved.
2. The migration ends with a `DO` block that **runs the helper against every exam in the database** and set-compares its output with the inline expression in both directions. It `RAISE`s on any difference. This is the one part of the claim that can be proven rather than argued, so it is.

**No inverse helper added.** Nothing here needs question→ordinal; it belongs in the phase that first uses it, and `live_primary_questions` stays the single definition either way.

---

### Phase 4a — ✅ WRITTEN 2026-08-14: submit matches by name tag

**New migration:** [`20260819000000_live_group_id_matching_submit.sql`](../supabase/migrations/20260819000000_live_group_id_matching_submit.sql)
*(`20260818000000` was taken by an unrelated `public_profiles` view.)*

Adds `live_canonical_for(exam, question) RETURNS UUID` — "which row is this a translation of" — and rewrites `submit_live_response` to gate on it.

**Provably identical on a well-formed exam.** Where the languages hold the same questions in the same order, the row at own-ordinal N carries the tag of primary ordinal N, so `accept iff own_ordinal = current_index; file under primary[current_index]` and `accept iff tag_of(X) resolves to primary[current_index]; file there` reduce to the same condition and the same row.

**Deliberately different on a drifted exam.** Today the mismatched submission is accepted and mis-filed silently. Now it is refused with the error the function already raises. A refusal is visible and recoverable; a silent mis-attribution is discovered weeks later, if ever.

> ⚠️ **Do not apply 4a without Phase 5.** Until the client picks its question by tag, a drifted exam's non-primary students would be handed a question whose tag doesn't match the open one — turning silent mis-attribution into "cannot submit at all". Once the client selects by tag the mismatch stops occurring. **Well-formed exams are safe to apply alone; drifted ones are not.** The migration's self-check names every affected exam in the database at apply time, so this is decidable on facts rather than on this warning.

**Verified:** body diff against the original shows only the gate region changed, plus an explicit invariant check for all eight things whose loss would be silent — the deadline block above all, since the design's original edit range would have swallowed it. New test at [`live-group-id-matching.test.mjs`](../src/__tests__/live-group-id-matching.test.mjs), 19 assertions.

---

### Phase 4b — ✅ WRITTEN 2026-08-14: reveal and timer bounds

**New migration:** [`20260822000000_live_reveal_and_bounds_by_group.sql`](../supabase/migrations/20260822000000_live_reveal_and_bounds_by_group.sql)

The last three functions that matched across languages by counting. All three now key on **play ordinal** — where a question is actually played, in the host's numbering: a tagged row plays where its primary twin plays, an untagged row plays where it sits.

**The reveal bug was not what it looked like.** It is *not* mis-grading — `id` and `correct_answer` come from the same row, so a student can never be shown another question's key. The fault is **disclosure timing**: revealability was decided by a row's own-language ordinal, and on a drifted language that number describes a different question. A Hindi row at own-ordinal 4 that is really the translation of primary question 5 sits *below* the cursor, so its answer is published to every Hindi student while the host still has that question open and the room is answering it.

**The bound functions would have got worse under the obvious fix.** `live_ordinal_min_seconds` bounds a session-wide extension by the *shortest* translation. A naive "MIN over the name-tag group" drops unlinked siblings out of the set, so the bound **rises** and a host can extend past a language's real end — the exact opposite of the function's purpose. Play ordinal avoids this by construction: an untagged row keeps its own ordinal and stays in the set, so every row lands in exactly one bucket.

**Kept deliberately:**
- The deadline is still computed from each emitted row's **own** `time_seconds` — it is a property of the paper in front of the student, not of the twin. Only *which questions are eligible* moved.
- `MIN(t.time_seconds)` and `PARTITION BY ls.language` remain literally in the body, so `verify_phase2.sql` checks 15/16 keep passing. They are body-text assertions, and a red check treated as "expected" is how a real failure gets waved through. The play-ordinal computation is repeated in all three functions rather than factored into a helper, precisely to keep those spellings where the verification looks for them — eight duplicated lines is the cheaper mistake.
- Both bound functions keep their signatures, so `add_live_question_time` and `end_live_question_time` need no change.

*Verified: 41 assertions, full sweep green. The migration executes all three functions before finishing — plpgsql does not parse a statement until control reaches it, and two broken bodies in this project survived eight migrations for exactly that reason — then names any exam whose reveal timing changes.*

---

### ~~Phase 4 — The actual change: match by name tag~~ *(superseded by 4a/4b above)*

Only **four** functions do genuine cross-language matching. Those four switch from position to name tag:

| Function | What it does | What changes |
|---|---|---|
| `submit_live_response` | Files a student's answer | Resolve the canonical question by name tag |
| `get_revealed_live_answers` | Publishes answers after the timer | Reveal by name-tag group, not by position |
| `live_ordinal_min_seconds` | Bounds a time extension by the shortest translation | Take the minimum across the name-tag group |
| `live_ordinal_max_seconds` | Same, for the longest | Same |

**Everything else stays a position lookup, on purpose.** `current_question_index` remains an integer. Changing that would re-key two primary keys, every frozen report, and the entire client — a completely different project. This plan does not do that.

**Fallback rule:** no name tag → the question is its own group, resolve to itself. That's exactly today's behaviour, so single-language exams and any unlinked row keep working untouched.

Three specific hazards the critique caught, which this phase must handle:

- **Don't delete the deadline check.** The edit range overlaps the "Time is up for this question" block. Postgres won't warn you — `plpgsql` doesn't parse a statement until it runs it. Dropping it would mean answers accepted after the clock, passing every test.
- **`live_ordinal_min_seconds` can get *worse*.** Its whole purpose is to bound a time extension by the *shortest* translation. Today the minimum always includes a row from every language. Under name-tag matching it would exclude unlinked siblings — raising the bound and letting the host extend past a language's real end. It needs an explicit fallback.
- **Actually run each rewritten function inside the migration.** Two broken function bodies have already survived eight migrations here because nothing executed them.

---

### Phase 5a — ✅ WRITTEN 2026-08-14: the server names the open question

**New migration:** [`20260820000000_live_session_sync_group_id.sql`](../supabase/migrations/20260820000000_live_session_sync_group_id.sql)

`live_session_sync` now returns `current_question_group_id` — the name tag of the open question. **Purely additive:** no existing key changes, is removed, or changes meaning, so a client that ignores it behaves identically. Safe to apply alone.

The app can't solve this by itself: it knows the host is on position 5, but only the server holds the primary-language list that `current_question_index` indexes, so only the server can say *which question that is*.

NULL when nothing is open, when the open question has no tag (every single-language exam), or when the primary language has no row at that position — in all of which the client correctly falls back to counting.

Also folds this function's inline lookup into `live_primary_questions`. That was deliberately deferred out of Phase 3 so a 180-line body with **six historical definitions** gets rewritten once rather than twice.

**Verified:** body diff against the `20260812000000` original shows only the lookup swap, the new variable, and the new key. Plus a self-check that asserts all 25 pre-existing payload keys survive and the E3 rank gate is still present — rebuilding from the wrong one of those six bodies would silently revert the `present_*` flags.

---

### Phase 5b — ✅ WRITTEN 2026-08-14: the student reads the right question

**Client only, no migration.** [`useLiveSession.ts`](../src/hooks/useLiveSession.ts), [`LiveExamStudent.tsx`](../src/pages/LiveExamStudent.tsx), [`liveExamService.ts`](../src/services/liveExamService.ts)

`myQuestionIndex` finds the question whose tag matches the open one. No tag → count, exactly as before. **This is the line the whole project exists for** — it is what stops half the room reading a different question.

**Three things that needed care:**

**A stale tag is worse than no tag.** The Realtime lane receives the exam *row*, which carries no tag (the tag is derived from the question list). Merging it like the projector settings — `next.x ?? cur.x`, "keep what we had" — would hold the previous question's tag across an unlock and point every client at the question the room just left. So the tag is kept only while the index is unchanged, and otherwise drops to null: clients match by position for the 750ms–8s until the next sync, which is today's behaviour, not something wrong.

**`undefined` and `null` mean different things here.** From the sync lane a missing key means the database predates the migration — that's `null`, "match by position". Left `undefined` it would mean "unknown", and the merge would keep a stale tag. The lane sends `?? null` deliberately.

**A missing counterpart resolves to −1, not to `sessionIndex`.** Falling back to whatever sits at that position would be the original bug wearing a new hat. It now renders a named panel instead of the old blank card with a submit button that silently returned.

**`currentQuestionIndex` deliberately stays the host's cursor.** The timer key, analytics map, responses map and chip strip are all keyed on the canonical position the server returns — re-pointing it at the student's own list would break four things to fix one.

**Known remainder:** the chip strip and the "previous questions" review list still index the student's list by canonical position. On a drifted exam that list can be off by one. Cosmetic and display-only, unlike reading the wrong question live — recorded rather than fixed, because correcting it means re-keying several maps.

*Verified: `tsc -b` clean, 26 assertions in [`live-group-id-matching.test.mjs`](../src/__tests__/live-group-id-matching.test.mjs), full sweep of 25 test files green.*

---

### ~~Phase 5 — Fix the student's screen~~ *(superseded by 5a/5b above)*

**Files:** [`LiveExamStudent.tsx`](../src/pages/LiveExamStudent.tsx), `live_session_sync`

Everything above tidies the *data*. This is the part that stops the room from splitting.

1. `live_session_sync` starts broadcasting the open question's **name tag** alongside `current_question_index`.
2. The student's app picks its question by matching that name tag, instead of counting to the Nth item in its own list.
3. If no question in the student's language matches the open one, show a clear **"this question isn't available in your language"** state — instead of today's blank screen and a submit button that silently does nothing.

**Without this phase, the headline symptom is unfixed.** The report gets accurate; the person in the chair is still reading the wrong question. This is what "do the same `question_group_id` thing for live exam" actually means from a candidate's point of view.

---

### Phase 6 — ✅ WRITTEN 2026-08-14: the readiness gate

**New migration:** [`20260821000000_live_exam_readiness_gate.sql`](../supabase/migrations/20260821000000_live_exam_readiness_gate.sql)
**Client:** [`liveExamService.ts`](../src/services/liveExamService.ts), [`LiveExamDetail.tsx`](../src/pages/LiveExamDetail.tsx)

`live_exam_readiness(exam)` returns every reason an exam should not run. **One definition, two callers:** `start_live_session` refuses on its blockers, and the creator's publish action renders the same rows. A checklist that disagrees with the gate is worse than none — the creator fixes what it lists and is still refused.

**Enforcement is server-side, in `start_live_session`.** Publishing is a plain `UPDATE` permitted by the creator's own RLS policy, and questions can be added *after* publishing (`handleAddQuestion` has no status guard), so a client check is skippable three ways. The check sits **before** the `UPDATE`, so a refused start leaves the exam exactly as it was.

| Blockers | |
|---|---|
| `question_count_mismatch` | the check position-matching structurally cannot make |
| `missing_answer` | `grade_live_answer` returns false for NULL — marks the whole room wrong at once |
| `blank_question`, `invalid_question` | no text; no type or fewer than 2 usable options |
| `section_missing_in_lang`, `not_linked_to_primary`, `orphan_translation`, `duplicate_group_in_language` | cross-language structure |
| `no_sections`, `no_questions` | nothing to play |

**Warning only:** `option_count_mismatch` — makes the creator's tally meaningless, but the session runs and every student is still graded against the paper in front of them.

**Three details that matter:**

- **The language list comes from the exam**, not from observed questions. Driving it off question rows makes a language with *zero* questions vanish — the default shape of a half-authored bilingual exam, so the check that matters most would silently pass.
- **Unpublishing is never gated.** It is the way *out* of a broken state; gating it would trap a creator whose exam fails.
- **A database without the RPC does not block publishing.** Migrations here are hand-applied, so a client can outrun the database. An absent check leaves the creator where they were rather than refusing them.

**Not built:** the "Link translations" repair button. Currently unreachable — a creator can only hit `not_linked_to_primary` on a bilingual exam, and there are none. Recorded as the remaining piece.

*Verified: `tsc -b` clean, 35 assertions, full sweep of 25 files green. The migration's self-check names any existing exam the new gate would block, so it can be read before anyone tries to go live.*

---

### ~~Phase 6 — The gate: stop a broken exam from ever going live~~ *(superseded)*

Remember the caveat from §2 — name tags are decided at authoring time. **This phase is what makes that acceptable.**

Today the entire live publish check is one line ([`LiveExamDetail.tsx:844`](../src/pages/LiveExamDetail.tsx#L844)):

```js
if (sections.length === 0) { toast("Add at least one section with questions."); return; }
```

It doesn't even look at a question. Add a real check — mirroring the mock exam's, minus marks:

- A primary section with no counterpart in language L
- **Question count differs from primary** ← the check position-matching structurally cannot make
- A primary question whose name tag has no match in L
- The same name tag twice in one language
- A translated question whose name tag matches nothing in primary
- Different option counts between a question and its translation
- Missing answer key, blank question, no answer type, fewer than 2 options *(the same checks I added to the mock publish gate)*

**Two things the draft design got wrong here, which this phase corrects:**

**(a) A client-side check is advisory, not a gate.** Publishing is a plain table update, not a server call — anyone can bypass it. And questions can be added *after* publishing: `handleAddQuestion` has no status guard at all. So the real enforcement has to be **server-side inside `start_live_session`**, which is the one door everyone must pass through to actually go live. The client check stays, as fast feedback.

**(b) Ship a "Link translations" repair button.** Otherwise a creator whose exam fails the gate has a broken exam and no way to fix it in the app — possibly minutes before a class. The button runs the same pairing the backfill uses.

---

### Phase 7 — ✅ DONE 2026-08-14: retired the paste-once file

**[`supabase/APPLY_REMAINING.sql`](../supabase/APPLY_REMAINING.sql)** — 3,659 lines of duplicated function bodies, replaced with a header and an ordered index. The original is in git history.

**Why it had to go.** Its content ended at `20260812000000`. Pasting it after `20260815000000` re-ran the *old* bodies of `build_live_exam_report` and `compute_live_moments` and reverted that fix — no error, because the functions still exist and still return JSON. Same failure mode its own header warned about for `live_session_sync`, turned on the file itself. A consolidated file has to be maintained in lockstep with the directory it duplicates, and the moment it falls one migration behind it becomes a device for reverting work — most likely during a rollback, which is exactly when you can least afford it.

The replacement keeps what was genuinely valuable: the ordered list, and the warning that **seven** migrations now rewrite `live_session_sync` whole with only the last one surviving.

**New:** [`verify_live_group_matching.sql`](../supabase/tests/verify_live_group_matching.sql) — 19 checks against the **installed** state, not file contents. Migrations are pasted by hand, so "the file is in the repo" and "the database does that" are different claims, and only the second matters to a student sitting an exam. Includes the `live_primary_questions` equivalence proof and a check that no existing exam is blocked by the new gate.

**Three existing tests had to change**, and that is worth recording rather than hiding: `live-v2-answer-reveal`, `live-v2-flush-time` and `live-v2-focus-screen` each asserted that `APPLY_REMAINING.sql` *contained* their migration — they encoded the old deployment model. Their intent was preserved by re-pointing them at `supabase/migrations/` read in filename order, which **is** apply order. The focus-screen check came out stronger for it: it now finds the last `live_session_sync` definition across every migration rather than within one hand-maintained file.

*Verified: full sweep of 25 files green, `tsc -b` clean.*

---

### ~~Phase 7 — Tests, and the `APPLY_REMAINING.sql` decision~~ *(superseded)*

- Extend the existing `.test.mjs` suite (these read migration files as text and assert on their contents — same idiom as the rest of the repo).
- New `supabase/tests/verify_live_group_matching.sql`.
- Check `verify_phase2.sql` checks 15/16 — they assert on exact SQL text and will report a *correct* rewrite as a regression unless we keep the specific spellings or update the check.
- **Decide `APPLY_REMAINING.sql`'s fate before shipping, not after.** My recommendation: retire it, replace it with a header pointing at the ordered migration list. Keeping it means mirroring every change in this plan into a 3,660-line file that is *already* missing a migration.

---

## 4. What this fixes, and what it doesn't

**Fixes:**

- ✅ The room no longer splits — everyone sees the same question *(Phase 5)*
- ✅ Reports stop blending two different questions into one row *(Phase 4)*
- ✅ Students in a shorter language no longer get silently locked out *(Phase 5)*
- ✅ A mismatched exam can't go live in the first place *(Phase 6)*
- ✅ New drift stops being manufactured *(Phase 1)*

**Out of scope by design — the creator's job, not the system's:**

- **Whether a translation is genuinely the right twin.** Name tags are assigned by position at import, so a misaligned JSON freezes in the wrong pairing. Phase 6 catches *structural* mismatches (missing questions, wrong counts, unequal option counts) but cannot tell that Hindi Q7 is really the translation of English Q8 when both lists are 30 long. *Decided 2026-08-10: creators verify this manually.*
- **Option order within a question.** Answer tallies key on the option *index*, so a translation that reorders its options corrupts the tally. Phase 6 checks option *count*; checking *order* would need a product decision about what "same order" even means for a translation. Same division of labour — the creator eyeballs it.

**Still genuinely unfixed:**

- ❌ Nothing outstanding at this scope. Everything above is either built in a phase below or explicitly assigned to the creator.

---

## 5. What I need you to decide

| # | Decision | My recommendation |
|---|---|---|
| 1 | **Which database?** `config.toml` and `.env` name different projects. | Confirm before Phase 0, or every number the audit returns is meaningless. |
| 2 | **What if existing name tags disagree with positions?** (a) trust the tags, (b) rewrite tags to match positions, (c) refuse and surface to the creator. | **(b)** — preserves history and keeps rollback honest. But this is the only decision that can silently change the meaning of existing data, so it's yours. Phase 0 tells us if it even occurs. |
| 3 | **Should the gate block go-live, or only warn?** Blocking is safer but could strand a creator minutes before a class. | **Block, with the repair button.** A stranded creator with a one-click fix beats a corrupted session. |
| 4 | **Retire `APPLY_REMAINING.sql`?** | **Retire it.** It's already missing a migration and is a live revert hazard. |
| 5 | **Scope — all seven phases, or start smaller?** | Ship **Phase 1 alone first** (no DB change, stops active drift). Then decide on the rest. |

---

## 6. Risk and rollback

**Rollback is safe if and only if the Phase 2 backfill is behaviour-preserving** — i.e. it pairs on exactly today's position rule and never touches a response row. Both are true by construction, but this should be *tested on a copy*, not assumed.

Each phase reverts independently:

| Phase | Rollback |
|---|---|
| 1 | Plain code revert |
| 2 | Name tags are additive; nothing reads them until Phase 4 |
| 3 | Re-paste the previous function bodies |
| 4 | Re-paste the previous function bodies — behaviour identical on backfilled data |
| 5 | Code revert; server keeps sending the index either way |
| 6 | Code revert + drop the server-side check |

**Deliberately NOT in this plan:** `SET NOT NULL` on `question_group_id`. Adding it would make a client rollback impossible, because the current client sends nothing for single-language exams. It can come later, once everything has soaked.

---

## 7. Rough effort

| Phase | Size |
|---|---|
| 0 — Audit | Small — one read-only SQL file |
| 1 — Stop the drift | Small — ~4 client edits |
| 2 — Backfill | Medium — one migration, needs care |
| 3 — Helpers | Medium — mechanical, 9 functions, zero behaviour change |
| 4 — Name-tag matching | **Large** — 4 function rewrites, the riskiest part |
| 5 — Student screen | Medium — client + one server field |
| 6 — The gate | **Large** — validator + server check + repair button |
| 7 — Tests | Medium |

---

**Nothing has been built. Tell me which phases to proceed with and how you want decisions 1–5 resolved.**
