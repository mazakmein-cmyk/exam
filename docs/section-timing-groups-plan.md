# Section Timing Groups ("merge sections' time") — Implementation Plan

## Problem

Real exams sit multiple subjects on one shared clock while scoring each subject
separately. TSPSC-style example:

- **Session I (45 min, shared):** Numerical & Mathematical Ability (20 Q) + Reasoning
  Ability & Problem Solving (20 Q)
- **Session II (45 min, shared):** General Awareness (25 Q) + English Language &
  Comprehension (25 Q)
- Time does **not** carry over between sessions; marks stay per subject.

Today the app has exactly two timing modes, hard-wired as a binary everywhere:

| Mode | Column | Clock |
|---|---|---|
| **locked** (default) | `allow_section_switching = false` | one clock per section (`sections.time_minutes`), sat in order, submitted sections stay closed |
| **free** | `allow_section_switching = true` | one clock for the whole paper (`exams.total_time_minutes`, else section sum) |

The feature is the missing middle: **group 2..x sections into a shared time pool**,
while ungrouped sections keep their own clock. Scoring, marks, analytics, and
question organization stay per-section (they already are — `attempts.section_id`
is NOT NULL and all marks are written per section, so this requirement falls out
of the existing data model for free).

## The unifying model: "timing units"

A grouped paper is a sequence of **timing units**, derived by walking sections in
`sort_order` and coalescing contiguous runs that share a group:

```
unit = { kind: 'solo' | 'group', name, sectionIds[], minutes }
```

- **Between units:** locked semantics — sat in order, one at a time, a submitted
  unit cannot be reopened, time never carries over.
- **Within a unit:** free semantics — one clock, move freely among the unit's
  sections (the existing free-mode machinery, scoped to the unit).

This *generalizes* both existing modes (locked = all-solo units; free = one unit
containing every section), which is exactly why almost all player machinery can
be reused rather than invented.

**Mode interplay (PM decision):** `allow_section_switching = true` (whole-paper
free mode) continues to mean "the whole paper is one clock" and **suppresses
groups** — the builder hides group UI behind a note and the player ignores
`timing_group_id`, but group rows are kept, symmetric with how per-section
`time_minutes` is kept (not zeroed) when switching is on today. Grouping is a
refinement of locked mode only.

## Naming — three collisions to avoid

1. `sections.section_group_id` is **taken**: it links language twins of one
   logical section (multi-language). Never overload it.
2. "Session" is **taken twice**: live-exam sessions (`start_live_session`,
   `useLiveSession`, SessionSettingsMenu) and the results-side "session" = one
   chronological sitting (ExamReview/Analytics reconstruction).
3. Internal name therefore: **timing group** (`section_timing_groups` table,
   `sections.timing_group_id` column). User-facing label: **"Group"** — the
   creator names each group themselves ("Session I", "Part A"), and students see
   that name, so the product never hardcodes contested vocabulary.

## Data model & migration (hand-pasted, per project convention)

One migration file modeled on `20260814000000_add_section_navigation_mode.sql`
(IF NOT EXISTS, CHECK constraints, RLS, `NOTIFY pgrst, 'reload schema'`,
self-verifying DO block):

```sql
CREATE TABLE IF NOT EXISTS public.section_timing_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- creator-facing, e.g. "Session I"
  name_translations jsonb,                 -- same pattern as exam_instruction_translations
  time_minutes integer,                    -- NULL = pool is the sum of member minutes
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stg_time_minutes_positive CHECK (time_minutes IS NULL OR time_minutes > 0)
);

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS timing_group_id uuid
  REFERENCES public.section_timing_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sections_timing_group ON public.sections(timing_group_id);
```

- **RLS:** copy the `sections` policy shape (creator manages via exam ownership;
  public/student read for published exams).
- **`ON DELETE CASCADE` via `exam_id`** means the two hand-rolled cascade-delete
  flows (`Dashboard.tsx:446-492`, `ExamDetail.tsx:1012-1058`) need **no edits**:
  deleting the exam row cascades groups, and `SET NULL` on the section FK never
  blocks section deletes. Verify both flows in testing anyway.
- **Pool semantics:** group pool = `time_minutes` if set, else sum of member
  sections' positive `time_minutes` (mirrors `totalExamMinutes`' override-or-sum
  rule). Members keep their individual `time_minutes` — it feeds the default sum
  and is restored intact if the group is disbanded.
- **Language twins — grouping lives on the PRIMARY language only.**
  `timing_group_id` is written **only on primary-language section rows**;
  secondary-language rows keep it NULL and *derive* their grouping through the
  twin link at read time (`section_group_id` → primary twin → its
  `timing_group_id`). This is the marks-module precedent exactly
  (`examService.ts:183-248` resolves secondary submissions to primary scoring
  config the same way), and it makes an entire bug class impossible: a partial
  fan-out failure can never leave Hindi and English sittings with *different
  timing structures*, because there is only one copy of the structure. Sort
  order already fans out across twins on reorder, so contiguity holds in every
  language for free.
- **Group name is the one localized thing:** `name` holds the primary-language
  label, `name_translations` (jsonb, keyed by language) the rest — the
  `exam_instruction_translations` pattern. One shared resolution rule used by
  every surface (player, intro, review, instruction facts):
  `groupDisplayName(group, lang) = name_translations[lang] ?? name`. Falling
  back to the primary name is deliberate: a real label in the wrong language
  beats an invented placeholder, and the instruction text must match whatever
  the player screens actually show.
- **If `exams.primary_language` is later changed**, grouping follows the new
  primary the same way marks config does today — same exposure, same behavior,
  documented rather than special-cased.
- **Defensive reads (non-negotiable, per project memory):** absent
  `timing_group_id` in a response = "no groups" = today's behavior, byte for
  byte. All writes gated on `tableHasColumn('sections','timing_group_id')` /
  `tableHasColumn` for the new table, returning the existing
  `"missing-column"` result shape so the builder shows "apply the migration
  first" instead of losing the save (PGRST204). PostgREST/Realtime stale caches
  are a known failure mode here.
- `src/integrations/supabase/types.ts` is stale-by-convention (marks columns are
  already cast `as any`); follow the same cast-tolerant read pattern rather than
  regenerating.

## Pure model layer (Phase 0)

New `src/lib/timingGroups.js` — plain JS + JSDoc, dependency-free, node-testable,
same idiom as `examNavigation.js`:

- `resolveTimingGroupIds(allSections, primaryLanguage)` → `Map<sectionId,
  timingGroupId>` covering **every language**: primary rows read their own
  column; secondary rows resolve through their `section_group_id` twin. A
  secondary row with no twin link (legacy data) or no primary counterpart
  resolves to "ungrouped" — defensive, never a crash.
- `groupDisplayName(group, lang)` — `name_translations[lang] ?? name`. The one
  shared localization rule (player, intro, review, instruction facts all call
  this so their labels can never disagree).
- `timingUnits(exam, sections, groups, resolvedIds)` → ordered units for the
  sitting language. Rules:
  - free mode → one unit of all sections (so every caller can speak one
    vocabulary);
  - a group id appearing in two non-contiguous runs (corrupt data) coalesces per
    maximal contiguous run — never crashes;
  - groups reduced to one member render as solo behavior (a 1-member group is
    still labeled, but timing is identical to solo);
  - question-less sections drop from units the same way free mode drops them;
  - absent/unknown group data → all-solo units.
- `unitMinutes(unit, sections)` — override-or-sum.
- `unitContaining(units, sectionId)`.
- `hasTimingGroups(sections)` — strict, absent-key-safe (the `=== true` idiom).

`examNavigation.js` keeps its exports untouched (its tests pin behavior);
`sumSectionMinutes` gains no new semantics — paper totals become
"sum of unit minutes" via the new module.

## Builder UI/UX (the Sections panel in the screenshot)

**Language rule first:** group structure (create, ungroup, membership, pool
time) is editable **only on the primary-language tab**. On secondary-language
tabs the same containers render **read-only** — members shown, pool chip shown,
grips and checkboxes absent — with a caption: "Grouping is managed in
{primary language}". The only thing editable per language is the **group's
display name**, which writes to `name_translations[activeLang]` (primary tab
writes `name`), exactly like section names are per-language today. This matches
the request "grouping happens in primary language only and reflects in
secondary", and it matches how the marks module already scopes its config UI to
primary-language sections (`MarksConfigPanel.tsx:794-806`).

**Creating a group** — v1 interaction: a `Group sections` button in the panel
header (primary tab only) toggles select mode; each section card shows a
checkbox; selecting ≥ 2 enables a floating **"Group 2 sections"** CTA. On
create:

- non-adjacent members are reordered to be contiguous (anchored at the first
  selected member's position) — contiguity is a builder invariant;
- the group gets a default name ("Group 1"), immediately editable inline
  (SectionNameEditor pattern, transliteration-aware).

**Rendering** — contiguous grouped rows render inside one bordered container
card in the existing flat list:

```
┌─ ⋮⋮ ▾ Session I ─────────────── 🕐 45 min pool ─ ⋯ ┐
│   ⋮⋮ SECTION 1  Numerical and Mathematical  25 min │
│   ⋮⋮ SECTION 2  Reasoning Ability            20 min │
└────────────────────────────────────────────────────┘
   ⋮⋮ SECTION 3  General Awareness            🕐 20 min
```

- Group header: drag grip (moves the whole group as a block), editable name,
  pooled-time chip, overflow menu (Rename / Set pool time / Ungroup).
- Pool chip shows the live sum; tapping opens a MinutesField to set an explicit
  override, with an "auto (sum)" reset. Member minutes stay editable inside the
  group and drive the default sum.
- **dnd:** the outer SortableContext's items become mixed (solo section ids +
  group container ids); a nested SortableContext orders members inside the
  container. Dragging a solo section over a container adds it; dragging a member
  out removes it. dnd-kit supports this; the page already runs two DndContexts.
  If nested-drag polish drags on, v1 fallback: membership changes via the
  overflow menu ("Add to group ▸ …" / "Remove from group") and dnd stays
  order-only — ship the model, polish the gesture.
- **Auto-disband** when a group falls to ≤ 1 member (removal or section delete),
  with a toast.
- **Section switching toggle interplay:** when the whole-paper toggle is ON, the
  group UI collapses to a note — "Whole-paper switching is on; groups don't
  apply" — mirroring today's "Timed as one paper" pill. Data preserved.
- **Persistence:** same immediate-write style as the rest of the panel (no
  autosave batching exists) — group CRUD writes `section_timing_groups`,
  membership writes `sections.timing_group_id` on **primary rows only** (no twin
  fan-out to keep in sync — that is the point of primary-only storage), all
  behind the `tableHasColumn` gate.
- **Duplication:** a shared `timingGroupsCopyPatch`-style helper (parallel to
  `navigationCopyPatch`) used by **both** duplicate flows. Note: the Dashboard
  flow is already lossy today (drops `language`, `sort_order`,
  `section_group_id` — `Dashboard.tsx:337-344`); fix it to copy full rows while
  in there, or at minimum copy group membership.

## Player (ExamSimulator)

The URL contract `/exam/:examId/section/:sectionId/simulator` stays. The URL
names the **entry section of the current unit**; deep-linking any member loads
its whole unit.

- **Load:** ExamSimulator already fetches **all** sections of the exam (every
  language) before filtering to the sitting language, so primary rows are in
  memory at no extra cost — run `resolveTimingGroupIds` over them, then derive
  `units` + `currentUnit` for the sitting-language sections. A Hindi sitting
  gets exactly the units defined on the English (primary) rows, with Hindi
  section names and `groupDisplayName(group, 'hi')` labels. Fetch all of the
  unit's sections' questions up-front (the existing free-mode prefetch, scoped
  to the unit).
- **Clock:** one worker per active unit, seeded `unitMinutes * 60`. The pinned
  line `clockMinutes = isFreeNav ? totalPaperMinutes : (section?.time_minutes || 0)`
  becomes a three-way (free → paper; unit group → pool; solo → section minutes).
- **Within a unit:** in-memory section switching (`handleSectionSwitch` — never
  navigate; remount restarts the clock), SectionTabs/SectionPicker scoped to the
  unit's sections, Next/Prev walks `flattenPaper(unitSections, …)`.
- **Attempts:** on unit start, one attempt row per member section with
  `staggeredTimestamps` (the existing free-mode fan-out, scoped to the unit).
  This keeps ExamReview/Analytics sitting-reconstruction (created_at walk keyed
  on first-section attempts) working unchanged — later units' attempts attach to
  the same sitting.
- **Submit / expiry:** submitting (or hitting zero on) a unit submits **all its
  member sections** — each via the existing per-section `saveExamAttempt`, with
  per-section `timeSpent = sectionTimeSpentSeconds(...)` (question-time sum;
  there is no wall-clock slice inside a pool). Marks, `question_marks_log`,
  `marks_score` all stay per-section — the "scoring stays individual"
  requirement is satisfied by not touching the submit unit of account.
- **Dialogs:** the Section Completed dialog becomes unit-aware ("Session I
  complete → Start General Awareness"); proceeding navigates to the next unit's
  first section (remount, fresh clock — time provably never carries over). The
  5-minute warning and submit-confirmation copy gain unit wording; the free-mode
  per-section unanswered summary is reused scoped to the unit.
- **Preview mode** (`access === 'preview'`) already tolerates an empty
  `attemptIdBySection`; unit logic must too (it does, by reusing the free path).
- **Anonymous flow:** `pendingExamSubmissions` entries stay per-section and are
  appended at each unit submit — same payload shape, so `StudentAuth` replay and
  `AuthStateListener`'s redirect suppression are untouched.
- **Known inherited limitation (called out, not fixed here):** there is no
  refresh/resume timer persistence anywhere today — refresh grants a fresh
  clock. Groups inherit this. A follow-up hardening item, not v1 scope.

## ExamIntro + instruction engine (the part the user explicitly flagged)

- **PaperTable:** grouped members render under a group subheader row
  ("Session I — 45 minutes, shared") with their own minutes cell showing
  "shared"; solo rows keep their minutes. The total row sums **unit** minutes.
  The current `showTime={!allowSectionSwitching}` binary becomes
  free / grouped / locked.
- **"Exam format" card:** third wording branch ("This paper is sat in N timed
  parts…").
### Instruction engine — full contract change

**1. Facts shape.** `SectionFact` gains `groupId: string|null`; `ExamFacts`
gains `groups: Record<groupId, {name: string, minutes: number|null}> | null`.
The engine derives the unit sequence itself by walking `facts.sections` in
order and coalescing consecutive sections sharing a `groupId` — the same walk
the player does, so prose and player can't disagree on structure.
`groups === null` (caller doesn't know — e.g. un-migrated DB, create dialog) or
no section carrying a `groupId` ⇒ every existing output stays **byte-identical**
(the current engine tests assert real output strings; they must keep passing
untouched — that is the regression guarantee).

**2. Language flow (the "primary-only, reflected in secondary" rule).** Facts
are always built *per display language*, and grouping facts follow the same
rule as everything else the engine is handed:

- **Structure** (which sections form which group, pool minutes) comes from the
  primary rows via `resolveTimingGroupIds` — identical for every language.
- **Section names** come from the display-language twin rows (already how every
  collectFacts works).
- **Group names** come from `groupDisplayName(group, lang)` —
  `name_translations[lang] ?? name`. The fallback-to-primary is intentional and
  safe *because the player uses the same helper*: the engine's rule is
  "instruction agrees with the screens", not "instruction is fully translated".
  A Hindi instruction naming an untranslated group "Session I" matches a Hindi
  player screen labeling the tab strip "Session I". The engine therefore never
  receives a null group name and never invents a label.

**3. New line logic.** `timingLine` becomes four-way: mode-null and free
branches unchanged; locked splits on "any grouped section present":

- `groupedKnown` (all unit clocks known), composing per-unit clauses —
  `groupPart(name, memberNames, m)` → "Session I (Numerical and Mathematical
  Ability, Reasoning Ability and Problem Solving) — 45 min shared" and solo
  units reuse the existing `sectionClock` — joined "; " with the unit-sum total:

  > "Each part is timed separately: Session I (Numerical and Mathematical
  > Ability, Reasoning Ability and Problem Solving) — 45 min shared; General
  > Awareness — 20 min (65 minutes in all). Within a shared part you may move
  > freely between its sections; parts are sat in order, a submitted part cannot
  > be reopened, and unused time does not carry over."

- `groupedUnknown` (any unit clock unset — a member with no positive
  `time_minutes` and no pool override): the grouped analog of `lockedUnknown`,
  mode sentences without numbers. Listing three pools and omitting a fourth is
  a claim, not an omission — same rule the locked branch already follows.

`expiryLine` gains `expiryPart`: "When a part's time is up it is submitted
automatically and you move on to the next one; a warning appears when 5 minutes
remain in a part." (Chosen only when mode is locked and a real group exists.)

**4. Copy packs.** Every new key (`groupPart`, `groupedKnown`,
`groupedUnknown`, `groupedMove`/`groupedOrder` clauses, `expiryPart`) lands in
**both `en` and `hi`** — a missing key is a bug by design, there is no
English-for-gaps path. Hindi constraints already documented in the pack apply:
pick ONE Hindi noun for "part" (proposal: भाग) and use it identically in the
engine copy, the player's unit dialogs, the 5-minute warning, and the intro
format card — the pack's own comment demands one thing, one name (the टाइमर
precedent). Number-verb agreement uses the कटौती-style constructions where
inflection would break on 1/fractions.

**5. Self-healing (`reconcileTimingLine`) — the critical correctness point.**
`timingShapes()` gains the two grouped composites, so reconciliation heals every
transition in both directions: locked→grouped (old "Each section is timed
separately…" sentence is engine-authored, matches an old shape, gets replaced by
the true grouped sentence), grouped→locked/free, and pool-value changes. All
three fact-building call sites MUST pass group facts —
`ExamIntro.tsx:491-504` (candidate view), the editor drift audit
(`ExamDetail.tsx:291-326`), and `GenerateExamInstruction`'s collectFacts in
ExamDetail (CreateExamDialog stays `groups: null`; no groups exist at create
time). If even one site omits them, the self-healer "corrects" a true grouped
sentence into a false locked one — the single place this feature could actively
lie to candidates. A wiring test pins all three.

**6. Timing audit (`instructionTimingAudit.js`).** `effectivePaperMinutes`
becomes sum-of-unit-minutes when groups exist. The expected-numbers allowlist
gains each unit's pool and the unit-sum total — and deliberately does **not**
allowlist grouped members' individual `time_minutes`: those numbers are shown to
candidates nowhere (the intro table says "shared"), so a member-minute figure in
prose is stale by definition and should be flagged. Grouped vocabulary joins the
FREE/LOCKED phrase regexes so mode-mismatch detection covers the third mode.

**7. Standard template (`instructionTemplates.ts`).** Clause 10 hard-codes the
two-mode dichotomy as a literal sentence in both languages — add the grouped
conditional clause to both full-text literals (en + hi).

**8. Engine tests** (extend `exam-instruction-engine.test.mjs` /
`exam-instruction-permutations.test.mjs`, same real-output style): grouped
known/unknown in en AND hi; mixed solo+group ordering; TSPSC shape end-to-end;
reconcile transitions locked↔grouped↔free; audit allowlist including the
member-minutes-are-stale rule; a Hindi-parity test for every new key; and the
no-groups byte-identity regression.

## Review & Analytics (display only — scoring untouched)

- **ExamReview:** resolves grouping the same way the player does (it already
  fetches all language rows to compute `firstSectionIds` per variant, so
  `resolveTimingGroupIds` is free); member section cards group under a header
  showing the pool ("Session I — spent 41m of 45m shared"); member headers drop the misleading
  `spent / {section.time_minutes}m` denominator (a student may legitimately
  spend 40 of 45 pooled minutes in one section). Sitting reconstruction, rank,
  and marks totals are unchanged by design.
- **Analytics:** `sectionPerformance`'s `timeLimit` (line 1044 → table at 1557)
  shows the pool with a "shared" marker for grouped sections, or omits the
  denominator. Everything else (per-question times, marks sums, leaderboards)
  reads per-section data that this feature does not alter.

## Explicitly out of scope (named so nobody assumes them in)

1. **Qualifying/merit cutoffs** (Session I qualifying, Session II merit): no
   cutoff concept exists anywhere in the codebase today; this plan adds the
   *timing* structure only. A future `is_qualifying` flag on the group is the
   natural extension point — the ranking logic is duplicated in ~5 places and
   deserves its own plan.
2. **Scribe extended durations** (45 → 60 min variants) — creators can duplicate
   the exam with different pool values.
3. **JSON import of groups** — v1 imports create ungrouped sections (grouping is
   a builder action on "already created sections", matching the request);
   optional `timing_groups` block in the JSON schema is a fast follow.
4. **Live exams** — verified untouched: `live_sections` has no time column;
   live timing is per-question. Only care: don't disturb the shared
   `jsonUploadSources` abstraction or language-twin matching.
5. **Refresh/resume timer persistence** — pre-existing gap, inherited, tracked
   separately.

## Test plan (repo convention: plain-node .mjs, pure units + pinned wiring)

- **New `src/__tests__/section-timing-groups.test.mjs`:** timingUnits derivation
  (coalescing, contiguity, override vs sum, 1-member groups, question-less
  drops, absent-column ⇒ all-solo, free-mode ⇒ one unit), migration-text pins,
  builder/player wiring pins. Plus the language-resolution rules:
  `resolveTimingGroupIds` gives a secondary language identical units to the
  primary; a secondary row with no twin resolves ungrouped; `groupDisplayName`
  falls back to the primary name; a missing secondary twin (parity gap) shrinks
  the unit without crashing.
- **Instruction tests:** grouped timingLine/expiryLine real-output tests in en
  AND hi; reconcileTimingLine healing across locked↔grouped↔free transitions;
  audit vocabulary.
- **Deliberate updates to pinned source strings** (they exist to force exactly
  this review): `section-switching.test.mjs:495` (clockMinutes line), `:849`
  ("Time Limit" line), `regression.test.mjs:212-246` (handleStartSection
  internals). Update the assertions to pin the new three-way lines, preserving
  their intent.
- **Manual QA matrix:** un-migrated DB (feature invisible, saves fail politely),
  migrated + no groups (byte-identical behavior), TSPSC shape (2 groups),
  mixed (1 group + 2 solo), multi-language exam, anonymous sitting, preview
  mode, duplicate from both flows, delete exam/section.

## Phasing & estimates

| Phase | Scope | Size |
|---|---|---|
| 0 | Migration SQL + `timingGroups.js` + unit tests | S — half day |
| 1 | Builder panel (select→group, container render, pool chip, twins fan-out, toggle interplay, duplication helper) | L — 2–3 days; ExamDetail.tsx is 4,771 lines, highest UI risk |
| 2 | Player unit clock + in-unit switching + unit submit/expiry + dialogs + tab scoping | L — 2–3 days; ExamSimulator.tsx is 1,983 lines, highest correctness risk |
| 3 | ExamIntro + instruction engine + audit + template (en+hi) + shape registration | M — 1–2 days; bilingual copy needs care |
| 4 | ExamReview + Analytics display roll-ups | S–M — 1 day |
| 5 | Pinned-test updates, QA matrix, docs | S — half day |

Each phase lands independently and safely: until Phase 2 ships, groups created
in Phase 1 simply don't change the player (units derive but locked mode ignores
them), and the absent-column path keeps every un-migrated environment on
today's behavior throughout.

## Decision points (recommendations inline, proceed unless overridden)

1. **User-facing label** — recommended: generic "group" in builder chrome,
   creator-chosen display name shown to students. Avoids the double "session"
   collision.
2. **Pool override in v1** — recommended: yes (schema + chip tap-to-override);
   it's symmetric with `total_time_minutes` and exam bodies publish session
   times that need not equal subject sums.
3. **Nested drag-and-drop vs menu-based membership in v1** — recommended: build
   container dnd, fall back to menu-based membership if the gesture work
   overruns; the data model is identical either way.
