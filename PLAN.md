# Live Exam Analytics — Tier 0 + Tier 1 Implementation Plan

## Problem

Creators cannot see analytics for a live exam after it ends. A session report
already exists (`src/pages/LiveExamReport.tsx`, built by `end_live_session`),
but:

1. **It is unreachable** once the creator navigates away — the Dashboard's
   ended live-exam cards and the editor's "This session has ended" banner have
   no link to it (Tier 0).
2. **It is a recap, not analytics** — it shows the 5 hardest questions and a
   rank table, while per-question time profiles, option distributions for every
   question, the student × question matrix, and the pacing log are all sitting
   in the database unrendered (Tier 1).

## Key architectural fact: no migration needed

Creator-scoped RLS SELECT policies already exist on every table Tier 1 needs:

| Table | Policy (migration) |
|---|---|
| `live_responses` | "Creator can view all responses for own exams" (20260729000000) |
| `live_participants` | "Creator can view all participants" (20260729000000) |
| `live_question_analytics` | "Creator can manage analytics for own exams" (20260729000000) |
| `live_unlock_log` | "Creator can read unlock log for own exams" (20260802000000) |
| `live_confusion_signals` | "Creator can read confusion for own exams" (20260802000000) |
| `live_questions` | creator policies (20260729000000) |

The whole deep dive is therefore client-side queries — no manual migration to
paste, no PostgREST schema-cache risk. Raw `live_responses.is_correct` is the
true graded value (masking only happens in the student RPC paths), so
after-the-fact analytics read clean data.

## Decisions

- **One page, tabs — not a second page.** `/live-exam/:creatorId/:liveExamId/report`
  gains tabs: **Overview | Questions | Students | Pacing**. One URL to remember,
  one entry point to link.
- **The public token view (`/live-report/:token`) stays recap-only.** The
  deep-dive queries are RLS-gated to the creator anyway; student-level detail
  must not travel on a shareable link. No tabs render on the public path.
- **Names**: the creator view keeps using `report.names` (already resolved
  server-side with `reveal=true` — the one screen allowed real names).
- **Pure math lives in `src/lib/live/reportInsights.js`** (same pattern as
  `classifyDistribution.js` / `moments.js`) so it is testable with the repo's
  plain-node test style.
- **Charts**: recharts is already a dependency (used by Analytics.tsx). Used
  for the difficulty curve; small inline visuals (time histogram sparkline,
  heatmap) are plain divs, matching the live pages' chart-free idiom.

## Changes

### Tier 0 — discoverability + render what's stored

1. **Dashboard live tab** (`src/pages/Dashboard.tsx`): ended exams get a
   primary **Report** button (`/live-exam/{user.id}/{exam.id}/report`); Edit
   drops to outline for ended cards.
2. **LiveExamDetail ended banner** (`src/pages/LiveExamDetail.tsx`): add a
   **View session report** button when `status === "ended"`.
3. Stored-but-unrendered payload fields (`median_time_ms`, fast/slow splits,
   `joined_at`, per-question pacing) get rendered by the Tier 1 tabs below.

### Tier 1 — the analytics tabs

**New service fetchers** (`src/services/liveExamService.ts`):
- `fetchAllLiveResponses(examId)` — every response row (creator RLS).
- `fetchLiveUnlockLog(examId)` — pacing log, undone rows included (flagged).
- `fetchLiveConfusionSignals(examId)` — per-student per-question taps.
- `fetchLiveDeepDive(examId)` — bundles the above + existing
  `fetchAllLiveQuestions(primary lang)`, `fetchAllAnalytics`,
  `fetchLeaderboard` in one `Promise.all`.

**New pure lib** (`src/lib/live/reportInsights.js`):
- `askedQuestionCount({unlockLog, analyticsCount, responses})` — how many
  questions actually ran (not authored count; supports pre-v2 sessions).
- `buildQuestionRows({questions, analytics})` — ordinal-ordered rows joining
  question text/options to analytics (accuracy, times, histogram, confusion).
- `accuracyByOrdinal(questionRows)` — difficulty-curve points.
- `buildStudentRows({participants, responses, confusion, askedCount})` — per
  student: accuracy, avg time, last-answered ordinal, dropped-off flag,
  confusion count.
- `buildHeatmap({studentRows, responses, askedCount})` — student × question
  cells: correct / wrong / skipped.
- `studentsToCheckOn(studentRows)` — low accuracy, repeated confusion, or
  drop-off, with human-readable reasons.
- `overviewExtras({studentRows, askedCount})` — median score, participation
  rate, drop-off count.
- `pacingRows({unlockLog, questions, endedAt})` — per question: planned vs
  granted/cut time, talk gap before the next unlock, undo count.

**Page** (`src/pages/LiveExamReport.tsx`):
- **Overview** = existing recap + 3 new stat tiles (median score,
  participation rate, drop-off) — public view shows this tab only.
- **Questions** = difficulty curve (recharts line) + every question with
  OutcomeBar, option distribution with the correct option highlighted, median
  time, fast/slow × correct/wrong quadrant, impulsive count, confusion count,
  12-bucket time-histogram sparkline, misconception classification.
- **Students** = "check in on" cards → student table (rank, name, accuracy,
  avg time, confusion, joined, drop-off badge) with expandable per-student
  question detail → student × question heatmap grid.
- **Pacing** = existing summary sentence + per-question table (planned time,
  extra granted / closed early, talk gap, undos).

### Tests

`src/__tests__/live-analytics-page.test.mjs` (repo's plain-node style):
imports `reportInsights.js` with synthetic data (empty session, drop-offs,
flushed questions, undone unlocks) + source-inspection checks (public view
renders no deep tabs; Dashboard/Detail link to the report; deep fetchers are
creator-path only).

### Verification

`npm run typecheck`, `npm run lint` (changed files), `node src/__tests__/live-analytics-page.test.mjs`
plus the existing phase6 report tests, then an adversarial multi-agent review
of the full diff.

## Out of scope (deliberately)

- Anything needing a migration (presence history, points, exports, cross-session
  trends — Tier 2).
- Changes to the stored report payload or the share-link surface.
- The rebuilt page keeps the existing recap content and sharing panel intact.
