# SSC MTS content cluster — 47 articles (COMPLETE)

**Status: all 47 written**, each passing `scripts/generate-blog-index.mjs` with zero
warnings, and each linking back to the `/ssc-mts` hub.

**One planned article was substituted.** `ssc-mts-age-limit-and-relaxation` was dropped
because age limit and category relaxation are already a full section of
`ssc-mts-eligibility-criteria` — a separate article would have targeted the same head
term and cannibalised it, which is exactly what the rule below forbids.
`ssc-mts-vacancies-and-selection-process` was written in its place: a distinct intent
(the end-to-end stage sequence) with no overlap.


Hub-and-spoke. The hub is **`/ssc-mts`** (targets `SSC MTS previous year question paper`,
`SSC MTS PYQ`, `SSC MTS last year paper`). Every article below links back to the hub,
so the cluster funnels topical authority into the one page that must rank.

## Verified facts (checked against sources 2026-08-16)

The scoring structure was **corrected after publication** — the original draft treated
the paper as a combined 270-mark score. It is not:

| Fact | Value |
|---|---|
| Session I role | **Qualifying only.** Its 120 marks never enter the merit list. |
| Session I minimum | 30% UR/EWS · 25% OBC · 20% SC/ST/PwBD/ESM |
| If Session I not cleared | **Session II is not evaluated at all** |
| Merit basis | **Normalised Session II marks, out of 150** |
| Negative marking | None in Session I · −1 per wrong answer in Session II |
| Paper structure | 90 Q · 270 marks · 45 + 45 min · 20/20/25/25 · 3 marks each |
| Eligibility | Matriculation; age 18–25 MTS, 18–27 Havaldar (some MTS posts 18–27) |
| Pay | Level-1, ₹18,000 basic |

Confirmed via SSC final-result write-ups (MTS 2023 and MTS 2024) plus multiple
independent secondary sources. **Re-verify each cycle** — SSC can revise any of it,
and the merit basis in particular inverts the strategy advice if it changes.

## The anti-cannibalisation rule

**One article = one query intent.** Two articles may never target the same head term.
Where a topic overlaps an existing site-wide post, the SSC MTS article must be
*narrower* and link **up** to the general one rather than repeat it.

Known overlaps to respect:

| New article | Existing post it must NOT duplicate | How it differs |
|---|---|---|
| `ssc-mts-negative-marking-strategy` | `/blog/negative-marking-strategy` | MTS-only: Session I has none, Session II is −1. Session-asymmetry maths, not general theory. |
| `ssc-mts-maths-preparation` | `/blog/quantitative-aptitude-for-government-exams` | MTS Session I difficulty band and 20-question scope only. |
| `ssc-mts-reasoning-preparation` | `/blog/reasoning-preparation-for-competitive-exams` | MTS non-verbal weight; no banking-style puzzles. |
| `ssc-mts-general-awareness-preparation` | `/blog/general-awareness-preparation-for-exams` | MTS static-GK band, Class 6–10 science ceiling. |
| `ssc-mts-english-preparation` | `/blog/english-preparation-for-competitive-exams` | MTS 25-question scope, no descriptive paper. |

## Status

Legend: ☐ pending · ☑ written

### A. Previous-year-paper cluster (8) — highest priority, supports the hub
- ☑ `ssc-mts-previous-year-paper-analysis`
- ☑ `how-to-solve-ssc-mts-previous-year-papers`
- ☑ `ssc-mts-pyq-topic-wise-weightage`
- ☑ `ssc-mts-2024-question-paper-analysis`
- ☑ `ssc-mts-2023-question-paper-analysis`
- ☑ `ssc-mts-repeated-questions-and-patterns`
- ☑ `ssc-mts-previous-year-paper-in-hindi`
- ☑ `ssc-mts-mock-test-vs-previous-year-paper`

### B. Exam fundamentals (7)
- ☑ `ssc-mts-exam-pattern`
- ☑ `ssc-mts-syllabus`
- ☑ `ssc-mts-eligibility-criteria`
- ☑ `ssc-mts-vacancies-and-selection-process` *(substituted — see note below)*
- ☑ `ssc-mts-application-process`
- ☑ `ssc-mts-notification-and-exam-dates`
- ☑ `ssc-mts-admit-card-and-exam-day`

### C. Scoring, cutoff, result (6)
- ☑ `ssc-mts-cutoff-analysis`
- ☑ `ssc-mts-normalisation-explained`
- ☑ `ssc-mts-negative-marking-strategy`
- ☑ `ssc-mts-good-score`
- ☑ `ssc-mts-result-and-merit-list`
- ☑ `ssc-mts-tie-breaking-rules`

### D. Subject strategy (8)
- ☑ `ssc-mts-maths-preparation`
- ☑ `ssc-mts-reasoning-preparation`
- ☑ `ssc-mts-general-awareness-preparation`
- ☑ `ssc-mts-english-preparation`
- ☑ `ssc-mts-session-1-strategy`
- ☑ `ssc-mts-session-2-strategy`
- ☑ `ssc-mts-speed-and-accuracy`
- ☑ `ssc-mts-time-management`

### E. Study plans (6)
- ☑ `ssc-mts-study-plan-30-days`
- ☑ `ssc-mts-study-plan-60-days`
- ☑ `ssc-mts-study-plan-90-days`
- ☑ `ssc-mts-preparation-without-coaching`
- ☑ `ssc-mts-preparation-with-a-job`
- ☑ `ssc-mts-daily-timetable`

### F. Resources (3)
- ☑ `ssc-mts-best-books`
- ☑ `ssc-mts-free-preparation-resources`
- ☑ `ssc-mts-online-vs-offline-coaching`

### G. Havaldar and post-exam (5)
- ☑ `ssc-mts-havaldar-pet-pst`
- ☑ `ssc-mts-document-verification`
- ☑ `ssc-mts-salary-and-job-profile`
- ☑ `ssc-mts-promotion-and-career-growth`
- ☑ `ssc-mts-posting-and-transfer-policy`

### H. Comparison and decision (4)
- ☑ `ssc-mts-vs-ssc-chsl`
- ☑ `ssc-mts-vs-ssc-gd-constable`
- ☑ `ssc-mts-vs-railway-group-d`
- ☑ `is-ssc-mts-a-good-job`

## Hard constraints (enforced by `scripts/generate-blog-index.mjs`)

Errors — build fails: `content.length >= 8` · block types only `p|h2|ul|quote` ·
`faqs.length >= 3` · `slug` matches filename · `publishedAt` ISO ·
`category` in the allowed set · internal links resolve.

Warnings — fix anyway: `>= 5` h2 · `>= 1200` body words · `metaTitle <= 68` chars ·
`metaDescription` 120–180 chars · `>= 3` tags · `>= 3` internal links ·
`hero.h1 === title` · no absolute URLs in body.

Run `node scripts/generate-blog-index.mjs` after every batch.
