# Live Exam v2 — Implementation Plan

**Scope:** A1, A2, A3, A8, A9, A10, B4, B6, B9, B12, B14, C1, C7, C10, D1, E1, E2, E3, E4
**Non-goals (explicitly excluded by decision):** A4 pause, A5 auto-advance, A6 re-ask, A7 skip, A11 pacing bar as a standalone, B1 roster grid, B2/B3 watchlists, B5, B7, B8, B10, B11 confidence, B13 late-joiner ledger, C2–C6, C8, C9, C11–C13, D2–D7, CSV export, student report cards, a live version of the report page.

Decisions taken in the Q&A that this plan is built on are recorded in **§12 Decision log**.

---

## 0. Read this first — the scale problem

Two of your answers pull in opposite directions, and there is an existing defect that turns the gap into a wall.

### 0.1 The N² fan-out defect (exists today, in both pages)

`live_participants` is in the realtime publication. `compute_live_rankings` **UPDATEs every participant row after every question**. Every student subscribes to those UPDATEs:

- [`LiveExamStudent.tsx:516`](../src/pages/LiveExamStudent.tsx#L516) — `onParticipantUpdated`
- [`LiveExamControl.tsx:349`](../src/pages/LiveExamControl.tsx#L349) — `onParticipantUpdated`
- [`useLiveExamRealtime.ts:132-145`](../src/hooks/useLiveExamRealtime.ts#L132-L145) — the binding

Messages per question = `participants × subscribers`.

| Students | Messages / question | Messages / 20-question session |
|---|---|---|
| 30 | 900 | 18,000 |
| 200 | 40,000 | 800,000 |
| 1,000 | 1,000,000 | **20,000,000** |

The Supabase free tier includes **2,000,000 realtime messages/month**. One 20-question session with 1000 students would consume **10× the entire monthly quota**, and would lag catastrophically long before it hit the cap.

**The fan-out delivers zero value.** Ranks only change when `compute_live_rankings` runs — once per question — and both pages *already* refetch the leaderboard at that moment ([`LiveExamControl.tsx:417`](../src/pages/LiveExamControl.tsx#L417), [`LiveExamStudent.tsx:481`](../src/pages/LiveExamStudent.tsx#L481)). The realtime path is pure redundant cost. Removing it is a strict win at every class size.

### 0.2 After the Phase 0 fix

Publication reduced to `live_exams` + `live_question_analytics` only.

| Students | Messages / 20-question session | vs today |
|---|---|---|
| 30 | 1,950 | 9× less |
| 200 | 13,000 | 61× less |
| 1,000 | 65,000 | **307× less** |

At 1000 students that is ~30 sessions/month inside the free message quota, instead of 0.1.

### 0.3 The connection cap — the honest verdict

Free tier allows **200 concurrent realtime connections**. 1000 students = 1000 connections. No architecture fixes that; it is a plan limit.

So the transport is designed in **two lanes** (§2.3):

- **Lane A — push (realtime).** Sub-second. Used whenever the client subscribes successfully.
- **Lane B — pull (one sync RPC, adaptive server-driven interval).** Used when subscription is refused or fails, and always as a slow safety net + presence heartbeat.

| Students | Behaviour on free tier |
|---|---|
| ≤ 180 | All on Lane A. Sub-second unlocks. Ideal. |
| 180 – 400 | First ~180 on Lane A, rest on Lane B at 2s. Unlock felt within ~2s. Fine. |
| 400 – 1000 | Mostly Lane B, server raises the interval to 4–6s. Unlock felt within ~6s. Usable, not crisp. |
| 1000+ | Lane B at 6–8s. Works, but the room will notice the lag between "next question!" and phones updating. |

**Recommendation:** build for this exactly as described. It is genuinely smooth to ~200 on free, degrades gracefully rather than breaking, and **scales to 1000+ with zero code changes the day you move to Pro** (500 concurrent connections included, expandable to 10,000). The plan does not require the upgrade — it just stops being the bottleneck.

I am not going to claim 1000 concurrent students will feel lag-free on the free tier. It will not. Everything under our control will be.

### 0.4 Three client-side lag sources found in the current code

These are fixed in Phase 0 because "lag-free is P0" and they are the actual causes today.

1. **The 250ms tick re-renders the entire control room.** [`useCountdown`](../src/pages/LiveExamControl.tsx#L97-L126) calls `setRemaining` 4×/second in the *top-level* component. Every tick re-renders the leaderboard, the question rail, the preview pane and all four stat tiles. Fix: isolate ticking into the leaf timer components via an external store subscription, so a tick touches ~2 DOM nodes.
2. **Two realtime channels per control room, 12 bindings.** `useLiveExamRealtime` is called directly *and* again inside `useLiveParticipantCount` ([`useLiveExamRealtime.ts:303`](../src/hooks/useLiveExamRealtime.ts#L303)), and the hook deliberately makes a unique topic per instance. Fix: one channel per page, one subscriber, fan out internally.
3. **`renumberLiveGlobalIndexes` does one UPDATE per question from the browser.** [`liveExamService.ts:479-520`](../src/services/liveExamService.ts#L479-L520) — a 200-question bilingual exam is up to 400 sequential round trips. Fix: move to a single server-side transaction (needed for C7 anyway).

### 0.5 Two correctness landmines

**A3 must not be a UI change.** The question deadline is derived independently in **five** places:

| Where | Line |
|---|---|
| `submit_live_response` | [security.sql:225](../supabase/migrations/20260729020000_live_exam_security.sql#L225) |
| `get_revealed_live_answers` | [security.sql:137](../supabase/migrations/20260729020000_live_exam_security.sql#L137) |
| `get_my_live_responses` | [security.sql:305](../supabase/migrations/20260729020000_live_exam_security.sql#L305) |
| Control room | [LiveExamControl.tsx:321](../src/pages/LiveExamControl.tsx#L321) |
| Student | [LiveExamStudent.tsx:323](../src/pages/LiveExamStudent.tsx#L323) |

Miss one and you get a question that looks open but rejects answers, or an answer revealed while the clock still runs. Phase 0 collapses all five onto one shared helper *before* A3 exists.

**E1 cannot be done in the UI.** `"Participants can view leaderboard"` grants students SELECT on `live_participants` for any live/ended exam, and `live_question_analytics.fastest_user_name` is a denormalized name students can also read. UI masking is cosmetic — devtools defeats it. Phase 1 enforces masking in the database.

---

## 1. Architecture at a glance

```
                     ┌──────────────────────────────────────────┐
                     │  live_exams  (realtime: UPDATE)          │  ← the only broadcast
                     │  live_question_analytics (realtime)      │     that scales
                     └──────────────────────────────────────────┘
                                     │
        ┌────────────────────────────┼─────────────────────────────┐
        │                            │                             │
  ┌─────▼──────┐              ┌──────▼──────┐              ┌──────▼───────┐
  │ CONTROL    │◄─BroadcastCh─►│  PRESENT    │              │  STUDENT ×N  │
  │ (creator)  │  same browser │ (creator)   │              │              │
  └─────┬──────┘              └─────────────┘              └──────┬───────┘
        │                                                          │
        │ live_open_question_tally()  every 750ms while open        │ live_session_sync()
        │  → answered · option river · confusion · undo guard       │  adaptive 1.5–8s
        │                                                          │  → state + heartbeat
        │ get_live_exam_report()  once, on End                     │
        ▼                                                          ▼
                        ┌─────────────────────────┐
                        │  useLiveSession()       │  one hook, one clock,
                        │  ├ realtime lane        │  one deadline, one
                        │  ├ poll lane            │  transport decision
                        │  └ clock offset         │
                        └─────────────────────────┘
                                    ▲
                        RehearsalDriver (C1) injects here — no supabase reachable
```

**Three principles that everything obeys:**

1. **One clock.** Every deadline in the app derives from `unlocked_at + time_seconds + extra_seconds`, using a server-time offset measured by the sync RPC. No component ever trusts raw `Date.now()`.
2. **One creator, many pulls; many students, few pushes.** Anything high-frequency happens in the *single* creator browser via polling (cheap). Anything fanned out to N students is a single row update (rare).
3. **The present window is a real page, not a mirror.** It reads the DB itself, so closing the control room cannot blank the projector. BroadcastChannel carries only *intents* (celebrate, reveal now, toggle), never state.

---

## 2. Phase 0 — Foundations

> No new features ship in this phase. The session gets measurably faster, the fan-out defect is gone, and every later phase becomes small. **This phase is worth shipping on its own.**

### 2.1 Migration `20260802000000_live_v2_foundations.sql`

**Shared deadline helper**

```
live_question_deadline(unlocked_at, time_seconds, extra_seconds) → timestamptz   IMMUTABLE
  = unlocked_at + (time_seconds + coalesce(extra_seconds,0) + 2) seconds
```

Rewrite `submit_live_response`, `get_revealed_live_answers`, `get_my_live_responses` to call it. Behaviour is byte-identical while `extra_seconds = 0`, so this migration is a no-op change for existing sessions — deliberately, so it can be verified in isolation.

**New columns on `live_exams`** (all with defaults; no backfill needed)

| Column | Type | Purpose |
|---|---|---|
| `current_question_extra_seconds` | `int not null default 0` | A3 |
| `scheduled_start_at` | `timestamptz` | A9 / C10 |
| `auto_start` | `boolean not null default false` | C10 |
| `privacy_mode` | `boolean not null default false` | E1 |
| `leaderboard_visibility` | `text not null default 'full'` check `('full','private','off')` | E3 |
| `present_show_leaderboard` | `boolean not null default true` | Q3 |
| `present_show_river` | `boolean not null default true` | Q6 |
| `celebrate_seq` | `int not null default 0` | B14 |
| `report_share_token` | `text unique` | D1 |
| `report_public` | `boolean not null default false` | D1 |
| `origin_exam_id` | `uuid references live_exams(id) on delete set null` | D1 run-to-run comparison |

**New columns on `live_question_analytics`** — B6 computed once, arriving free on the existing analytics realtime event

`median_time_ms int`, `fast_correct int`, `slow_correct int`, `fast_wrong int`, `slow_wrong int`, `impulsive_wrong int`, `time_histogram jsonb default '[]'`, `confusion_count int not null default 0`

**New tables** — none in the realtime publication

```
live_presence(live_exam_id, user_id, last_seen_at)         pk (exam,user)
  index (live_exam_id, last_seen_at desc)

live_confusion_signals(live_exam_id, live_question_id, user_id, created_at)
  unique (live_question_id, user_id)
  index (live_exam_id, live_question_id)

live_unlock_log(live_exam_id, question_ordinal, unlocked_at, extra_seconds, undone_at)
  unique (live_exam_id, question_ordinal)      -- A10 restore + D1 pacing timeline
```

`live_moments` (B14) and `live_exam_reports` (D1) are **deliberately not created here** — no Phase 0 code references them, and their shape is better decided while writing the feature. They arrive in Phases 4 and 6 as purely additive migrations.

**New index on `live_responses`** — required for B14 streaks and B6 at 20k rows
`(live_exam_id, user_id, question_ordinal)`

**Publication surgery**

```
ALTER PUBLICATION supabase_realtime DROP TABLE live_participants;
ALTER PUBLICATION supabase_realtime DROP TABLE live_responses;
```

`live_responses` goes too: the creator's counter is replaced by the 750ms tally poll (§2.4), which is 1 request/750ms instead of up to 1000 events/question, and which additionally powers B9, B12 and A10's guard from the same round trip.

**`unlock_next_live_question`** — also write a `live_unlock_log` row and reset `current_question_extra_seconds = 0`.

### 2.2 `live_session_sync(p_live_exam_id uuid, p_beat boolean default false)` → jsonb

One round trip does everything a student needs. Returns:

```
status, current_question_index, current_question_unlocked_at,
current_question_extra_seconds, scheduled_start_at, auto_start,
leaderboard_visibility, privacy_mode, celebrate_seq,
server_now,            -- clock-offset anchor
next_poll_ms,          -- server decides cadence from live participant count
online_count, joined_count,
my_rank, my_total_correct                      (student caller)
confusion_count, open_response_count           (creator caller only)
```

- When `p_beat` is true, upsert `live_presence.last_seen_at = now()`. Client sends `true` at most every 30s. Keeps writes at `N/30` per second, not `N × pollrate`.
- `online_count` = `count(*) where last_seen_at > now() - interval '45 seconds'` — index-only, sub-ms at 1000 rows.
- **`next_poll_ms` is the load governor.** Server-computed:

| Client situation | ≤200 online | 200–600 | 600+ |
|---|---|---|---|
| Waiting for next unlock | 1500 | 2500 | 4000 |
| Question open, >5s left | 5000 | 6000 | 8000 |
| Question open, ≤5s left | *stop* | *stop* | *stop* |
| Grading window | 1000 | 1500 | 2000 |
| Tab hidden | 20000 | 20000 | 20000 |
| Ended | *stop* | *stop* | *stop* |

  "Stop" in the last 5 seconds is safe by construction: A3 is rejected after expiry and A10 after 5s, so nothing that matters can change in that window. Jitter each interval ±15% to avoid a thundering herd on unlock.
- Never returns the leaderboard. Students fetch top-20 only when they open the panel, and at End.

### 2.3 `useLiveSession(examId, { role })` — the single client spine

Replaces the duplicated state machines in both pages. Owns:

- exam row, status, index, `unlocked_at`, `extra_seconds`
- **clock offset** — EWMA of `server_now - clientNow` across sync calls; exposed as `serverNow()`
- **deadline** — one derivation, exported as a value, never recomputed ad hoc
- **transport lane** — starts on realtime; on `CHANNEL_ERROR` / `TIMED_OUT` / never-SUBSCRIBED, flips to poll and keeps a slow re-probe. Poll is *also* always on at the slow cadence for the heartbeat, so a silent realtime death degrades instead of freezing.
- one channel, one set of bindings, internal fan-out to subscribers
- `onReconnect` → full refetch (existing behaviour, preserved)

Exposes an **interface**, not an implementation. This is what makes C1 rehearsal possible without a parallel codebase.

**Tick isolation:** the countdown lives in an external store (`subscribe`/`getSnapshot` via `useSyncExternalStore`). `TimerRing`, `TimerBar` and the "remaining" text subscribe; nothing else does. Page-level re-renders drop from 4/s to ~1 per state change.

### 2.4 `live_open_question_tally(p_live_exam_id uuid)` → jsonb  *(creator only)*

Polled at **750ms** while a question is open, stopped otherwise. One creator browser → 1.3 rps.

```
{ live_question_id, response_count, option_tally: {"0":12,...},
  confusion_count, distinct_responders, first_response_at }
```

Single round trip powers: the Answered meter, B9's river, B12's counter, A10's undo guard, and A8's stall detection. Replaces the `onNewResponse` realtime binding entirely.

### 2.5 Client refactors in Phase 0

| File | Change |
|---|---|
| `src/hooks/useLiveSession.ts` | **new** — the spine |
| `src/lib/liveClock.ts` | **new** — offset store, `serverNow()` |
| `src/lib/liveTimerStore.ts` | **new** — external tick store |
| `src/hooks/useLiveExamRealtime.ts` | reduce to `live_exams` + `live_question_analytics`; drop participant/response bindings; single-channel; keep the self-heal logic verbatim |
| `src/services/liveExamService.ts` | add `syncLiveSession`, `fetchOpenQuestionTally`; delete `fetchResponseCount` usage from the hot path |
| `src/pages/LiveExamControl.tsx` | consume `useLiveSession`; remove local `useCountdown`, timer restoration, `responseCountMap`, participant merge |
| `src/pages/LiveExamStudent.tsx` | same; leaderboard refetch moves to the analytics event |
| `src/integrations/supabase/types.ts` | hand-extend for new columns/tables/RPCs |

### 2.6 Phase 0 — SHIPPED

**Automated, all green:**

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint src --quiet` | 0 errors in touched files (5 pre-existing errors remain in `MarksConfigPanel.tsx` and `jsonImportParser.ts`, untouched) |
| `node src/__tests__/live-v2-phase0.test.mjs` | **49 passed, 0 failed** |
| `node src/__tests__/regression.test.mjs` | 49 passed, 0 failed (no regressions) |
| `npx vite build` | succeeds |

**Files added**

| File | Role |
|---|---|
| `supabase/migrations/20260802000000_live_v2_foundations.sql` | the whole DB side, idempotent, one paste |
| `src/lib/live/deadline.js` | visual end vs server close, grace, extra seconds |
| `src/lib/live/clock.js` | server clock offset (NTP-lite, RTT-gated) |
| `src/lib/live/cadence.js` | client poll adjustment + heartbeat interval |
| `src/lib/live/timerStore.ts` | tick store, `useLiveTimerTarget`, `useLiveTimerExpiry` |
| `src/hooks/useLiveSession.ts` | two-lane transport spine |
| `src/hooks/useOpenQuestionTally.ts` | 750ms creator fast lane |
| `src/__tests__/live-v2-phase0.test.mjs` | 39 cases |

**Files changed:** `useLiveExamRealtime.ts` (bindings cut from 6 to 3, one channel, subscribe-failure reporting), `LiveTimer.tsx` (connected variants), `LiveExamControl.tsx`, `LiveExamStudent.tsx`, `liveExamService.ts`, `types.ts`.

**Verified against the deployed database** (not just statically): all four new RPCs exist and reach their own auth guards; `live_question_deadline(10:00, 60, 30)` returns `10:01:32` on the server, matching `visualEndMs + GRACE_SECONDS` on the client exactly; the new columns on `live_exams` and `live_question_analytics` are selectable; the three new tables exist and return nothing to an anonymous caller (creator-only RLS holding). Run [`supabase/tests/verify_phase0.sql`](../supabase/tests/verify_phase0.sql) for the realtime-publication state, which PostgREST cannot report.

**Three defects found and fixed in a post-implementation audit**
1. **Student rank and score froze at zero.** `participant.rank` / `participant.total_correct` were kept fresh by the participant broadcast this phase removed. Now sourced from `my_rank` / `my_total_correct` on the session sync — which every client already makes for its heartbeat, so it costs no extra request. Answered count is counted locally from the responses the page already holds.
2. **Thundering herd on reveal.** Every student was triggered by the same analytics event at the same millisecond and immediately refetched the top 20 — a spike that scales with class size. Now scattered across a 2.5s window. Their own rank does not wait for it (it rides on the sync), so nothing a student looks at got slower.
3. **Double analytics compute.** The grace timeout cleared its own ref *before* awaiting the RPC, leaving a window in which the missed-expiry sweep saw "nothing pending, no analytics" and started a second compute, racing two ranking recomputes. Now claimed in a `computeStartedRef` before the await, and released on failure so a retry is still possible.

**Render-cost pass (P0)**
The answered-count poll re-renders the control page ~1.3×/s while a question is open — a large improvement on the old 4×/s, but its children were unmemoised, so each tick re-ran a full KaTeX pass over the question and its options, rebuilt all twenty leaderboard rows, and rebuilt every chip in the rail. `LiveQuestionBody`, `LiveOption`, `LiveLeaderboard` and `QuestionRail` are now `memo`-wrapped, and the two props that would have defeated that (the rail's inline `onSelect`, the student's inline `self` object) are stabilised. A poll tick now updates the deck's numbers and nothing else.

**Deviations from the plan above, and why**
- `live_moments` / `live_exam_reports` deferred to Phases 4 / 6 — no Phase 0 code touches them.
- Tally poll made two-speed (750ms while answers can arrive, 3s once settled) and it no longer clears its value when a question closes; a final count must keep showing rather than snapping to zero. Cross-question bleed is prevented by matching the tally's question id at the call site.
- Added a double-unlock guard (`unlockingRef`). The space-bar shortcut plus a network round trip made it genuinely easy to advance twice and skip a question in front of the class.

### 2.7 Phase 0 manual smoke

Run after applying the migration. Two creator windows, two incognito students.

1. Open the control room on a `published` exam. Pre-flight shows **0 students waiting**.
2. Join both students. Within ~2s the count reads **2**. Close one student's tab; within ~45s it reads **1**. *(This number was previously "ever joined" and never went down.)*
3. Go live, unlock Q1. Both students see it in under a second.
4. **Render audit** — React DevTools Profiler, record 5s mid-question. Only the timer bar, the ring and the mm:ss chip should re-render. The leaderboard, question rail and preview must not appear. *(Before: everything, 4×/s.)*
5. Answered meter climbs as students submit, and never exceeds 100%.
6. Let Q1 expire. "Collecting final answers…" appears, then analytics and the leaderboard land ~2.5s later.
7. Reload the control room mid-question — the countdown resumes at the right second, from the server's timestamp.
8. Reload it *after* a question expired but before analytics computed — the missed-expiry sweep computes them once, not twice.
9. **Lane B** — in a student tab, DevTools → block `wss://*`. The student should keep advancing on the poll lane within a few seconds per unlock, not freeze on "waiting for your teacher".
10. Set a student's system clock 5 minutes fast. Their countdown must still be correct. *(Before: the question appeared already expired and they could not answer.)*
11. **Message audit** — Supabase dashboard realtime message count across a 5-question, 3-student session, before vs after. Expect roughly a 4× drop at that size, far more at scale.

### 2.7 Deploy rule (applies to every phase)

**Migration first, then code.** Every migration in this plan is additive and leaves the *previous* client working — except Phase 1's privacy view, which changes what students read. That one is explicitly two-step and called out in §3.6.

---

## 3. Phase 1 — Present mode, HUD, projector safety

**Delivers:** A2, A1, E1, E2, E3, E4, Q2, Q3

### 3.1 New route

`/live-exam/:creatorId/:liveExamId/present` — lazy, `noindex`, creator-authenticated, added to [`App.tsx:93`](../src/App.tsx#L93).

Reads via `useLiveSession` so it is independent of the control window (Q2).

### 3.2 Present screen layout

```
┌────────────────────────────────────────────────────────────┐
│  ●ON AIR   Q7 of 20 · Algebra          ┌──────┐  ⏱ 0:24    │
│                                        │ QR   │            │
│   What is the derivative of x³?        │ CODE │            │
│                                        └──────┘            │
│   A ─────────────  B ─────────────                         │
│   C ─────────────  D ─────────────                         │
│                                                            │
│   ▓▓▓▓▓▓▓▓░░░░░░░░  river (optional)   18 of 34 answered   │
└────────────────────────────────────────────────────────────┘
```

- **Auto-fit typography.** Fluid `clamp()` base, then a measured shrink-to-fit pass per question (binary search on font size, `ResizeObserver`-driven, memoised by question id). Runs once per question — never per tick. The projector must never scroll.
- **Never rendered here:** correct answer while open, toasts, coach line, confusion count, any roster or name list, any private stat.
- **Between questions:** the reveal, the class split, optional leaderboard (Q3), optional Moment of the Round (Phase 4).
- Reduced-motion respected throughout.

### 3.3 Cross-window channel

`BroadcastChannel('live-present-' + examId)` carries **intents only**:

```
{ t:'hello'|'bye'|'ping' }          presence of the other window
{ t:'celebrate', seq }              B14
{ t:'reveal-now' }                  optional manual reveal
{ t:'config', showLeaderboard, showRiver }   instant preview of a toggle
{ t:'rehearsal', frame }            C1
```

State always comes from the DB. If the channel is silent the present screen still works — this is the property that makes Q2 possible.

### 3.4 Q2 — mutual rescue

- Control room header: **Present screen** button. If a `hello` was seen recently → label becomes **Focus present screen** and it re-focuses via `window.open(url, 'live-present-<id>')` (named target = no duplicate window).
- Present screen: a deliberately low-profile **Control room** affordance, bottom-left, opacity 0 after 3s idle, fades in on `pointermove` or `Escape`. Findable by the creator, invisible in a photo of the wall.
- Both persist "the other window was open" in `sessionStorage` so an accidental close is one click away.

### 3.5 A1 — Presenter HUD

- Control room: pin toggle → fixed compact card (QR + **large** share code + online/joined). Position and pinned-state persisted per exam in `localStorage`. Never overlaps the control deck (reserved corner, `pointer-events` guarded).
- Present screen: QR block always available; shrinks to a corner tile after Q1 unlocks, with an "always large" option.
- The share **code** is rendered larger than the QR — a student at the back can type `4F9A2C1B` when the camera can't read the wall.

### 3.6 E1 — privacy mode, DB-enforced (two-step deploy)

**Pseudonyms, Google-Docs style.** Deterministic, stable, collision-free:

- Order participants by `(joined_at, id)` → ordinal `i` (window function).
- `name = ADJ[(i / |ANIM|) % |ADJ|] + ' ' + ANIM[i % |ANIM|]` → e.g. *"Anonymous Aardvark"*, *"Brave Badger"*.
- 48 adjectives × 48 animals = **2304 unique names**; unique for any class ≤ 2304 with no suffix.
- `joined_at` is immutable (protected by [`protect_live_participant_scores`](../supabase/migrations/20260729020000_live_exam_security.sql#L480)), so a name never changes mid-session.
- **Rejected alternative:** hashing `user_id`. At 1000 students in a 2304-name space, collisions are near-certain (birthday problem). The ordinal approach is deterministic *and* unique.

**Enforcement:**

- `live_participants_public` view — masks `display_name` when `privacy_mode`, **and** applies E3: returns only the caller's own row when `leaderboard_visibility` is `private` or `off`.
- `live_question_analytics_student` view — masks `fastest_user_name`. This column is denormalized into the analytics row and is currently readable by students; without this view privacy mode leaks the fastest student's real name every question.
- Drop the student `"Participants can view leaderboard"` policy on the base table; grant the views. Creator keeps full base-table access.
- Client-side masking is added too, purely so the creator's *preview* of the student view is honest — never as the enforcement.

**Two-step deploy (the one exception to §2.7):**
1. Ship the migration creating the views, **keeping** the old base-table policy.
2. Ship the client switched to the views.
3. Ship a tiny follow-up migration dropping the old policy.

Doing it in one step breaks any student tab open at deploy time. This is the only sequencing in the plan that is not safe to collapse.

### 3.7 E3 — leaderboard visibility

`full` / `private` / `off`, set in the editor and changeable mid-session.

- Enforced in `live_participants_public` (above), not in the UI.
- Ranks are **always computed** — the creator always sees them, and D1 needs them.
- Control room: when `off`, the right column shows the insight stack (B4/B6/B12 land there in Phase 3) instead of an empty box.
- Present screen: obeys both E3 and `present_show_leaderboard` (Q3).

### 3.8 E4 — toasts stay creator-side

- The present route mounts **without** the Toaster. Errors there render as a small persistent corner chip, not a popup.
- Control room keeps toasts, but every error *also* writes to a persistent status chip, so a missed toast is not a lost error. This closes an existing gap: today `"Error computing analytics"` is a transient toast and nothing else.
- Any name-bearing or roster-like surface (Phase 3 confusion counts, Phase 4 moment names) renders **only** on the control room.

### 3.9 Phase 1 — SHIPPED

| Check | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint src --quiet` | 0 errors in touched files (5 pre-existing elsewhere) |
| `node src/__tests__/live-v2-phase1.test.mjs` | **31 passed, 0 failed** |
| Phase 0 suite | 49 passed, 0 failed (no regressions) |
| Existing regression suite | 49 passed, 0 failed |
| `npx vite build` | succeeds; present view is its own 10.6 kB chunk |

**Files added:** `20260803000000_live_v2_privacy.sql`, `20260803010000_live_v2_privacy_step3.sql`, `pages/LiveExamPresent.tsx`, `components/live/PresenterHud.tsx`, `components/live/SessionSettingsMenu.tsx`, `lib/live/presentChannel.ts`, `hooks/usePeerWindow.ts`, `hooks/useFitText.ts`, `supabase/tests/verify_phase1.sql`, `__tests__/live-v2-phase1.test.mjs`.

**Files changed:** `App.tsx` (PresentLayout + route), `LiveExamControl.tsx`, `LiveExamStudent.tsx`, `LiveQuestionBody.tsx`, `LiveOption.tsx`, `liveExamService.ts`, `types.ts`.

**The realtime leak that reshaped E1.** `live_question_analytics.fastest_user_name` is a denormalised name in a table that is in the realtime publication, and a `postgres_changes` subscription cannot project columns — so no view, policy or client code can stop that value reaching every student. Masking had to move into the stored value itself: `compute_live_question_analytics` now writes the pseudonym when privacy mode is on, the real identity survives in `fastest_user_id`, and the creator's control room resolves the true name through a `user_id → display_name` map that only it can read. The migration also back-fills rows written before this existed.

**Masking applies to the creator too.** The present window authenticates as the creator but points at a projector, so a creator exemption inside `live_participants_public` would put real names on the wall — the one thing privacy mode exists to prevent. The control room reads the base table instead; that is the only surface allowed to show a real name, and it is never the one being cast.

**A bug caught by inspection, not by tests.** `useFitText` measured a size and set it on the wrapper, but `LiveQuestionBody` hard-coded `text-[15px] sm:text-base`, which beats an inherited `font-size` — so the projector would have rendered every question at fifteen pixels. Both `LiveQuestionBody` and `LiveOption` gained a `display` variant that emits em-based sizing and inherits instead; `.live-prose` and KaTeX are em-based throughout, so one measured size now scales prose, maths, option letters and padding together. A test guards the wiring in both directions.

**Deviations from the plan above**
- The Share dialog was deleted rather than kept alongside the HUD. It was a modal that covered the timer, the unlock control and the leaderboard, which is precisely the interruption A1 removes; leaving both would be dead UI competing with the fix.
- `present_show_river` is stored and settable now but has nothing to draw until B9 lands in Phase 3.
- E2 needed no separate work: the present screen fetches from `live_questions_student`, which has no `correct_answer` column, and pins every option to the neutral visual. There is no code path to leak a key rather than a rule against it.

### 3.10 Phase 1 verification

- Unit: pseudonym generator — stability across recomputation, uniqueness at n = 2304, determinism given the same join order.
- SQL: as a second (student) user, `select * from live_participants` → **0 rows**; via the view with privacy on → animal names only; with `leaderboard_visibility='off'` → own row only.
- Manual: cast to a second monitor; walk 3 questions; confirm no key, no toast, no name on the present window. Close the control window mid-question → present screen keeps ticking. Reopen via the rescue button.
- Auto-fit: a 400-character question and a 6-word question both fill the frame without scrolling.

---

## 4. Phase 2 — Live controls

**Delivers:** A3, A10

### 4.1 A3 — add time

`add_live_question_time(p_live_exam_id uuid, p_seconds int)` → `live_exams`

Guards, all server-side:
- creator only; `status = 'live'`; `current_question_index >= 0`; `unlocked_at not null`
- `p_seconds in (30, 60)` — no arbitrary values
- **`now() <= live_question_deadline(...)`** → never resurrect a closed question. This single guard is what keeps the grading, reveal and analytics paths safe.
- `extra_seconds + p_seconds <= 300` (hard cap per question)
- updates `current_question_extra_seconds` and the `live_unlock_log` row

Client:
- **+30s** / **+60s** buttons beside the timer ring, present only while the timer is running, disabled with a pending flag against double-fire.
- All deadlines recompute from the exam row via `useLiveSession` — no local arithmetic.
- Timer ring **animates** to the new total over ~400ms rather than jumping (a jump reads as a bug).
- `timerExpiredForIndex` is reset when `extra_seconds` increases, so the local expiry latch cannot strand the question. (Cannot occur given the server guard, but cheap insurance.)
- Student: a brief "+30s added" pill; the ring animates identically.
- Present screen: same pill, larger.

**Edge cases enumerated:** add-time landing in the 2s grace (rejected); add-time from a second control tab (server is the arbiter, both tabs converge via the realtime UPDATE); add-time while a student's tab is backgrounded (their next sync picks it up; their deadline was already past on-screen but the server still accepts — handled because the client re-derives from the row, not from a frozen local end time).

### 4.2 A10 — undo unlock

`undo_last_live_unlock(p_live_exam_id uuid)` → `live_exams`

Guards:
- creator only; live; `current_question_index >= 0`
- `now() <= unlocked_at + 5s` → else `raise 'UNDO_WINDOW_EXPIRED'`
- **no response exists** for the canonical question → else `raise 'UNDO_HAS_RESPONSES:<n>'` so the UI can say *"3 students have already answered"*. Responses are never deleted.
- no analytics row for it (belt and braces)

Action:
- mark the current `live_unlock_log` row `undone_at = now()`
- restore `current_question_index -= 1`, and `unlocked_at` / `extra_seconds` from the **previous** log row (this is exactly why `live_unlock_log` exists). At index `-1`, `unlocked_at = null`.

Client:
- An **Undo** pill next to the unlock control for 5s with a thin depleting bar. Disappears immediately when the tally poll first reports `response_count > 0` (750ms granularity is well inside the 5s window).
- Click-only. No keyboard shortcut — `space` unlocks, and a keyboard undo next to it invites a second accident.
- Errors surface as the friendly message, never a raw Postgres string.

Student side:
- Index decreases → `useLiveSession` returns them to waiting.
- Revealed answers for ordinals `>= newIndex` are **purged from client memory**. `get_revealed_live_answers` already re-hides server-side (it gates on `ordinal < current_question_index`), but a student who already fetched the reveal holds it locally.
- Present screen returns to the between-questions state.

### 4.3 Phase 2 verification

- SQL assertions: add-time after deadline rejected; cap enforced; undo after 5s rejected; undo with a response rejected and the count reported; undo at index 0 → index `-1`, `unlocked_at null`; undo then re-unlock produces a fresh log row.
- Unit: deadline recomputation with extra seconds across all five former call sites (now one).
- Manual: student mid-answer when +30s fires — does their submission still land at the *new* deadline? Undo while a student is reading — do they return to waiting cleanly, with no flash of the reveal?

---

## 5. Phase 3 — Insight

**Delivers:** B4, B6, B9, B12, A8

### 5.1 B9 — the live answer river

- Fed by `live_open_question_tally` at 750ms (§2.4). No realtime.
- Multi-select: counts **per option**, labelled *"selections"* not *"students"*, so the numbers can exceed the responder count honestly.
- Neutral palette, fixed option order, **no correct-answer emphasis** — safe on the wall.
- Perf: animate with `transform: scaleX()` (compositor-only), not `width` (layout). 750ms CSS transitions make discrete polls read as continuous motion. `will-change` set only while a question is open.
- Present screen: gated by `present_show_river` (Q6). Control room: always on.

### 5.2 B4 — misconception classifier (pure function)

`src/lib/liveInsight/classifyDistribution.ts`

```
classify({ optionDistribution, correctAnswer, totalResponses, optionCount, answerType })
  → { kind, dominantIndex, topTwo, correctPct, message }
     kind ∈ insufficient | solid | systematic | split | scattered | inconclusive
```

Ordered rules (thresholds documented and tunable in one place):

| Order | Kind | Condition |
|---|---|---|
| 1 | `insufficient` | `total < 10` **or** `total < 0.4 × online` |
| 2 | `systematic` | some wrong option `pct > correctPct` **and** that option `≥ 25%` |
| 3 | `solid` | `correctPct ≥ 70` |
| 4 | `split` | top two within 10pp, both `≥ 25%`, correct is one of them |
| 5 | `scattered` | `maxPct < (100 / optionCount) + 15` |
| 6 | `inconclusive` | fallback |

- **Key normalisation is mandatory.** `option_distribution` keys come from `selected_answer::text`, so they arrive as `"0"`, `0`, `"\"0\""`, or `"[\"0\",\"2\"]"`. The existing code already defends against two of these shapes ([`LiveExamControl.tsx:1051`](../src/pages/LiveExamControl.tsx#L1051)); the classifier gets one hardened normaliser, unit-tested against all four.
- `numeric` / `integer` / `text`: classify on value frequency and surface the **top 3 wrong values** — a shared wrong number (sign error, off-by-one) is one of the highest-value signals in the product.
- `multi` (multi-select): show the tally, label it *combinations*, and return `inconclusive`. Classifying set-answers properly is a v2 problem; guessing would be worse than silence.

### 5.3 B6 — time profile

Computed **inside `compute_live_question_analytics`** (extended in Phase 0's migration), so it:
- costs one extra pass over ≤1000 rows, once per question
- arrives on the existing analytics realtime event — zero new client requests
- is persisted for D1 with no recomputation

Fields: `median_time_ms`, the four buckets (`fast_correct`, `slow_correct`, `fast_wrong`, `slow_wrong`), `impulsive_wrong` (`wrong AND time < 0.2 × allotted`), and a 12-bucket `time_histogram`.

**Threshold is relative, never absolute:** "fast" = below the question's own median (falling back to `0.35 × allotted` when responses < 8). 5s is fast on a 15s question and impossible on a 90s one.

Control room renders a compact 2×2 with a histogram sparkline (recharts is already a dependency). Never on the present screen.

### 5.4 B12 — "I'm lost"

`flag_live_confusion(p_live_exam_id uuid)` → void
- validates live + a question open + participant; resolves the canonical (primary-language) question id exactly as `submit_live_response` does
- `insert ... on conflict do nothing` → one signal per student per question, no rate limiter needed
- returns nothing to the student (no inference about others)

Student UI: a small persistent button, available while a question is open and through the reveal. Becomes "Sent ✓" and disables for that question. Never shows a count.

Creator UI (**control room only**, per E4):
- **0** → the row is not rendered at all
- **1+** → the exact number ("1 student flagged confusion", "6 students flagged confusion")

> **Decided:** exact count from 1, row hidden at 0. Accepted trade-off: in a class of 2–3, a creator who knows who is present could infer who flagged. The signal is worth more than that residual inference at these class sizes, and no name is ever stored against a signal beyond the `user_id` the creator can already see in `live_responses`.

Aggregated into `live_question_analytics.confusion_count` at compute time, for D1.

### 5.5 A8 — the coach line (rules engine)

`src/lib/liveInsight/coachLine.ts` — one pure function, one string table.

```
deriveCoachLine(ctx) → { ruleId, text } | null
```

Context: phase, remaining/allotted, answered, online, joined, `onlineDelta30s`, confusion, classification, timeProfile, index, total, elapsed, paceEstimate, extraUsed.

Priority ladder — **first match wins**, and `null` is a valid, good output:

| # | Rule | Fires when | Says |
|---|---|---|---|
| 1 | `offline-drop` | online fell >20% in 30s | "11 students just went offline — likely wifi, not the question." |
| 2 | `confused` | confusion ≥ 15% of online | "6 students flagged confusion — worth pausing here." |
| 3 | `stalled` | open, <40% answered, <25% time left | "Only 9 of 34 answered with 12s left — most are still reading. +30s?" |
| 4 | `systematic` | post-reveal, kind = systematic | "62% picked B. Ask someone to explain B before you move on." |
| 5 | `split` | kind = split | "A and C are neck and neck — good one to discuss in pairs." |
| 6 | `scattered` | kind = scattered | "Answers are evenly spread — this looks like guessing." |
| 7 | `impulsive` | `impulsive_wrong ≥ 20%` of responses | "9 answered wrong in under 5 seconds — they think they know it." |
| 8 | `cruising` | solid + median < 40% allotted | "Everyone got this quickly. Safe to speed up." |
| 9 | `pace` | projected overrun > 5 min | "About 6 minutes over budget with 8 questions left." |
| 10 | — | nothing matched | *(silent)* |

Rules:
- **Never scolds.** Every string is descriptive, never evaluative of the creator. Copy lives in one module and gets a tone pass.
- **Never flickers.** Debounce 800ms, and re-render only when `ruleId` changes — not when the numbers inside it wiggle. A line that rewrites itself twice a second is unreadable.
- Control room only (E4).
- Rule 1 depends on presence, which is why Phase 0 builds it.

### 5.6 Phase 3 verification

- Unit tests, ~35 cases: classifier across all six kinds × all four key shapes × numeric/text; time-bucket thresholds incl. the <8-response fallback; the coach ladder's precedence (assert that a confused + stalled + systematic context returns `confused`); `insufficient` guard at exactly 9 and 10 responses.
- Manual: 3 students choosing the same wrong answer → does the callout say `systematic`? Two tap "I'm lost" → shows "a few"; a third taps → shows "3".
- Perf: DevTools Performance during an open question — assert zero layout thrash from the river (transform only), and that the 750ms poll does not re-render the leaderboard or rail.

---

## 6. Phase 4 — Engagement (B14)

Derived server-side, because streaks need per-student per-question history — up to 20,000 rows at N=1000, which must never reach the browser.

### 6.1 Moment derivation

Inside the per-question analytics compute (one extra aggregate over `live_responses` for the exam, served by the Phase 0 index):

| Kind | Definition |
|---|---|
| `streak` | ≥3 consecutive correct, ending at this question |
| `comeback` | ≥2 wrong then ≥2 correct — **the one that matters** |
| `lone_correct` | exactly one student correct on this question |
| `most_improved` | biggest accuracy gain, first half → second half (mid-session onward) |
| `class_first_perfect` | first question where everyone answering got it right |
| `perfect_run` | still 100% at question ≥5 |

Rows land in `live_moments` with `user_id` and `value` — **never a name snapshot**, so E1 privacy is applied at render, not baked in at write time.

**Rotation fairness** — the detail that decides whether B14 is delightful or grating: pick the moment whose `user_id` has been featured fewest times this session, tie-broken by kind priority (`comeback` > `lone_correct` > `streak` > rest). The same student is never featured twice in a row while an unfeatured candidate exists.

### 6.2 Two layers (your Q11)

**Layer 1 — automatic, subtle, creator-side.** A "Moment" chip on the control deck: *"Sana: comeback of the round — 4 wrong, then 3 right"*. A suggestion the creator can voice. Never auto-blasted.

**Layer 2 — manual, loud.** A 🎉 **Celebrate** button next to the chip:
- BroadcastChannel `{t:'celebrate'}` → present window fires `canvas-confetti` + `playCelebrate()` from [`liveSounds.ts`](../src/lib/liveSounds.ts) (already dependency-free WebAudio, already mute-aware)
- **and** increments `live_exams.celebrate_seq` → one row update → students' phones fire the same burst. Deliberate and rare, so the fan-out cost is negligible.

**Present screen: "Moment of the Round"** — a between-questions card. This is the engagement peak of the session and the thing people film.

### 6.3 Perf & taste guardrails

- Confetti particle count capped; `disableForReducedMotion: true`; **never** rendered on the control room (which must stay responsive above all else).
- Sounds respect the existing mute flag; new cue added to `liveSounds.ts`, no audio assets.
- `celebrate_seq` is monotonic — clients fire once per increment and ignore replays after a reconnect (guard against a burst on every `onReconnect`).

### 6.4 Phase 4 verification

- Unit: moment detection fixtures (streak boundary at exactly 3, comeback at 2+2, rotation fairness over a 20-question simulated session — assert no student featured twice while a fresh candidate exists).
- Manual: celebrate with a muted student, a reduced-motion student, and a reconnecting student — no double burst.

---

## 7. Phase 5 — Scheduling & authoring

**Delivers:** A9, C10, C7, C1

### 7.1 C10 — scheduled sessions

- Editor: date + time picker (`react-day-picker`, already installed) with the local timezone named explicitly on screen. Stored as `timestamptz`.
- Dashboard live tab: an **Upcoming** grouping.
- `auto_start` default **false**.

### 7.2 A9 — lobby countdown (only when scheduled, per your note)

- Rendered on the student waiting room, the creator pre-live page, and the present screen — **only** when `scheduled_start_at is not null`. Otherwise today's *"Waiting for your teacher to start…"* is unchanged.
- Uses the Phase 0 clock offset, never the device clock. Phones are routinely minutes off.
- At T-0 with `auto_start = false` → *"Starting shortly"*, never a negative counter.
- With `auto_start = true`: the **creator's own control room** performs the start on its first sync past T-0. Nothing starts unattended — that is the honest semantic, and it needs no cron or edge function (both effectively unavailable on free tier). Documented in the UI: *"starts automatically once you have the control room open."*

### 7.3 C7 — within-section drag reorder (your Q13: within-section only)

- `@dnd-kit/sortable` on the question list inside a section, in the **editor only**, disabled when `status` is `live` or `ended` (reordering would silently redefine what `current_question_index` points at).
- New RPC `reorder_live_section_questions(p_section_id uuid, p_ordered_ids uuid[])`, **one transaction**:
  1. validate creator + every id belongs to that section + the set matches exactly
  2. rewrite `q_no` 1..n
  3. apply the same permutation to every language sibling via `question_group_id`
  4. renumber `global_index` across the whole exam, per language, server-side
- This **replaces** the client-side `renumberLiveGlobalIndexes` loop (§0.4 item 3) — one round trip instead of up to 400, and atomic, so a mid-way failure can't leave a corrupt play order.
- Optimistic UI with rollback on error.

### 7.4 C1 — rehearsal mode (zero DB writes, per your Q12)

- `RehearsalDriver` implements the **same interface** `useLiveSession` exposes. Injected through context — the rehearsal path has **no reachable supabase client**, enforced structurally (no import) plus a dev-time assertion.
- Simulated cohort: N configurable (default 24). Each fake student has a skill level; per question, correctness is drawn from skill × question difficulty and time from a plausible right-skewed distribution. Some never answer. A few "go offline". A couple tap "I'm lost". This exercises A8, B4, B6, B9, B12 and B14 for real.
- Speed: 1× / 5× / 10× (scales the timer only).
- Drives the control room **and** a rehearsal present window, over the same BroadcastChannel with `rehearsal: true`.
- **REHEARSAL** watermark on both windows, permanently. Entry from `draft` or `published`, beside **Go Live**. Exit discards everything.

### 7.5 Phase 5 verification

- SQL: reorder with a bad id set → rejected whole; reorder on a bilingual exam → siblings stay paired and `global_index` matches across languages (this is the regression that would silently desync translations).
- Unit: countdown with a ±3-minute device clock skew; the `auto_start` boundary.
- Manual: full 10× rehearsal end-to-end, then query `live_participants` / `live_responses` / `live_question_analytics` / `live_moments` for that exam and assert **zero rows**.

---

## 8. Phase 6 — D1 report

### 8.1 Routes

- `/live-exam/:creatorId/:liveExamId/report` — creator; **auto-navigated on End**, with a clear escape back to the editor.
- `/live-report/:token` — public read-only, gated by `report_public`, respecting E1. No CSV, no student report cards, no live version (your Q14).

### 8.2 One RPC, one document

`get_live_exam_report(p_live_exam_id uuid)` (creator) and `get_live_exam_report_by_token(p_token text)` (public, SECURITY DEFINER, no table exposure).

Computed **once at End** into `live_exam_reports.payload`, so the public link never hammers the database. Payload stores `user_id`s plus a name map; **masking is applied at read time from the current `privacy_mode`**, so toggling privacy after the fact does the right thing without recomputation.

### 8.3 Contents

- Headline: class accuracy, attendance, planned vs actual duration
- **Pacing timeline** from `live_unlock_log` — real per-question durations, including where time was added
- **Hardest 5** questions, each with its B4 classification
- **Misconception list** in plain language (*"48% believe C on Q7"*)
- **Time profile** summary from B6 — including the impulsive-wrong count
- **Confusion hotspots** from B12
- **Moments** from B14
- Attendance from `joined_at` + presence
- **Run-to-run comparison** via `origin_exam_id` (set by `duplicateLiveExam`, added in Phase 0) — *"this class 61%, your previous run 74%"*
- Empty states show **"N/A" / "Nothing to display"** rather than hiding (your Q18)

### 8.4 Phase 6 verification

- SQL: report for an exam with 0 participants → valid document, all sections `N/A`. Token for a `report_public = false` exam → denied.
- Manual: privacy on → animals throughout the public link, including inside moments and fastest-answer callouts.

---

## 9. Performance program (P0, spans every phase)

| Guardrail | Where |
|---|---|
| Countdown ticks re-render ≤2 subtrees | Phase 0 — external tick store |
| One realtime channel per page, ≤4 bindings | Phase 0 |
| Realtime message count is O(questions), not O(students²) | Phase 0 — publication surgery |
| High-frequency work happens in the single creator browser | Phase 0 — tally poll |
| Server governs poll cadence from live load | Phase 0 — `next_poll_ms` |
| No client loop issues >1 write per user action | Phase 5 — reorder RPC |
| Animation is transform/opacity only; never width/top | Phase 3 — river |
| Text auto-fit measured once per question, never per tick | Phase 1 — present |
| Aggregation over >200 rows happens in SQL, never the browser | Phases 3, 4, 6 |
| Lists that can exceed ~200 rows are virtualized | as encountered |
| `content-visibility: auto` on the question rail | Phase 0 |
| Confetti never runs on the control room | Phase 4 |

**Budgets to hold:** unlock → student paint < 1s on Lane A. Control-room interaction to paint < 100ms. No frame > 50ms during an open question. Zero re-renders of the leaderboard or rail from a timer tick.

---

## 10. Testing

**Unit** (extend [`src/__tests__/regression.test.mjs`](../src/__tests__/regression.test.mjs) — pure logic only, ~70 cases total):
deadline math · clock-offset EWMA · `next_poll_ms` table · pseudonym stability & uniqueness at 2304 · distribution key normaliser (4 shapes) · classifier (6 kinds) · time buckets incl. small-n fallback · coach ladder precedence · pace estimator · moment detection & rotation fairness.

**SQL** — a `supabase/tests/live_v2_assertions.sql` you can run in one paste: add-time guards, undo guards, view masking as a second user, reorder atomicity, report-by-token gating.

**Manual smoke script** — a numbered ~30-step two-window + two-incognito walkthrough, delivered with Phase 1 and extended each phase.

**Load sanity (optional tool)** — a small node script that opens K synthetic students against a dev exam, to validate the cadence math and watch the Supabase message counter. Worth having before you decide about Pro.

**Per phase, definition of done:** `npm run typecheck` clean · `npm run lint` clean · new unit cases green · SQL assertions green · manual script walked · realtime message count checked in the dashboard.

---

## 11. Risk register

| Risk | Mitigation |
|---|---|
| Free-tier connection cap at 200 | Two-lane transport; documented degradation; Pro upgrade is a config change, not a rewrite |
| E1 view swap breaks open student tabs | Explicit three-step deploy (§3.6) — the only non-collapsible sequence in the plan |
| A3 desyncs one of five deadline sites | Collapsed to one SQL helper in Phase 0, *before* A3 exists |
| Multi-language sibling desync on reorder | Single-transaction RPC + an explicit bilingual regression test |
| `option_distribution` key shapes | One hardened normaliser, unit-tested against all four observed shapes |
| B14 feels like surveillance | Layer 1 is creator-side only and never auto-blasted; rotation fairness enforced |
| Rehearsal writing real rows | Driver injected, no supabase import on that path, dev assertion, post-rehearsal row-count test |
| `celebrate_seq` double-fires on reconnect | Monotonic sequence; clients ignore non-increasing values |
| Presence heartbeat adds write load | Folded into the sync call, `p_beat` at most every 30s → `N/30` writes/s |

---

## 12. Decision log

| Q | Decision |
|---|---|
| Q1 | A2 = same browser, second window, BroadcastChannel |
| Q2 | Both windows get a rescue button to reopen/focus the other |
| Q3 | Present-screen leaderboard is creator-configurable (`present_show_leaderboard`) |
| Q4 | Target 500–1000+ students, Supabase **free** tier → §0 |
| Q5 | Presence yes, but load-neutral → folded into the sync RPC |
| Q6 | B9 river on control + present only; configurable on present |
| Q7 | Add time only; no reduce |
| Q8 | Undo window = 5s or first response |
| Q9 | A8 = rules engine, no LLM |
| Q10 | B12 persisted, count-only, anonymous |
| Q11 | B14 = subtle creator-side layer + manual loud celebrate |
| Q12 | C1 zero DB writes, includes a rehearsal present window |
| Q13 | C7 within-section only |
| Q14 | Report page + shareable read-only link; **no** CSV, **no** student cards, **no** live version |
| Q15 | E1 DB-enforced, Google-Docs-style anonymous animal names |
| Q16 | Creator always sees ranks; toasts + any roster-like surface stay creator-side |
| Q17 | Supabase CLI; one pasteable idempotent migration per phase |
| Q18 | No probe-gating; show "N/A" / "Nothing to display" |
| Q19 | Test plan per §10 |
| Q20 | 7 phases (0–6) as ordered above |

---

## 13. Phase summary

| Phase | Delivers | Migration | Ships value alone? |
|---|---|---|---|
| **0** Foundations | fan-out fix, sync spine, one clock, tick isolation | `20260802000000_live_v2_foundations.sql` | **Yes** — pure speed + quota fix |
| **1** Present & safety | A2, A1, E1, E2, E3, E4 | `20260803000000_live_v2_privacy.sql` (+ a small step-3 follow-up) | Yes |
| **2** Live controls | A3, A10 | `20260804000000_live_v2_controls.sql` | Yes |
| **3** Insight | B4, B6, B9, B12, A8 | `20260805000000_live_v2_insight.sql` | Yes |
| **4** Engagement | B14 | `20260806000000_live_v2_moments.sql` | Yes |
| **5** Scheduling & authoring | A9, C10, C7, C1 | `20260807000000_live_v2_authoring.sql` | Yes |
| **6** Report | D1 | `20260808000000_live_v2_report.sql` | Yes |

Every phase is independently shippable and leaves the app in a working state. Phase 0 is a prerequisite for all of them and should not be skipped or merged.
