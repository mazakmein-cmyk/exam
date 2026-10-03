# Creator content cluster — 214 articles that lift `/for-creators`

**Status: Week 0 DONE, Batch 1 in progress.** Drafted and started 2026-10-03. Companion
to `docs/ssc-mts-content-cluster.md` (student side, complete) — same mechanics, opposite
audience. Legend in the inventory: ☐ pending · ☑ written.

### What shipped on 2026-10-03 (Week 0)

- **Step 0, all of it** except the two items deliberately deferred (§6 items 5 and 6).
  The creator CTA funnel, the Hindi link whitelist, the tag-collision test, the pillar
  rebuild and the GA4 content group are live in the working tree.
- **The pillar was rebuilt**, not just retitled — see §5 for what each change was for.
  Its prerendered first byte went from a ~2KB hero stub to ~30KB carrying the capability
  band, every FAQ answer, six guide links and four JSON-LD nodes. Verified: exactly one
  FAQPage and one ItemList on each language, and `/mock-test/jee-main` now links to
  `/for-creators` in the first byte.
- **The four stale JEE files were fixed**, plus a fifth nobody had listed:
  `src/data/blogPosts.ts` (the legacy module) still taught "90 questions, 75 to be
  attempted" and "Section B … no negative marking". An adversarial verification pass
  over each file caught five factual defects the fixes themselves had introduced —
  a mis-numbered ordinal that told readers blanks are now penalised, an overbroad claim
  about which past papers carry ten numericals, a Section B bullet whose rationale
  contradicted the very penalty it had just added, an invented NEET time budget that
  contradicted its own arithmetic, and a broken causal chain on NEET vs JEE pressure.
  All five are fixed. **Lesson for later batches: the verify pass is not optional, and
  it should treat the editing agent as hostile.**
- **New tooling.** `scripts/lib/postRules.mjs` now owns the post validation rules, and
  both `generate-blog-index.mjs` and the new read-only `scripts/check-post.mjs` import
  them. This exists because the generator rewrites three shared files on every run, so
  it cannot be used as a pre-flight by several writers at once — `check-post.mjs <slug>`
  applies the identical rules and writes nothing.

### Known gaps from Week 0

- **`/marketplace` did not get the educator strip.** The page has no footer and ends in
  an infinite-scroll list, so a strip at the bottom would never be reached. The five
  `/mock-test/*` pages and `/ssc-mts` carry it, which is where the authority and the
  audience overlap actually are. Revisit if the library ever grows a footer.
- **The pillar's stat tiles are still unverified.** "2 min", "500+ exams", "10K+
  attempts" were not checked against the database. They are the one claim on the page
  with no evidence behind it. Verify or remove before the next batch.
- **A named author is still not set.** `BlogPosting.author` remains the Organization.
  See §10; this is the cluster's biggest remaining trust lever and a one-line change.

The goal is not 214 pages. The goal is that a coaching owner in Sikar, a tutor in
Patna, a YouTube educator, or a school teacher who types *any* version of "how do I
give my students a real online test" lands on MockSetu, and that every one of those
pages passes its authority to **one** URL: `/for-creators` (Hindi twin
`/hindi/for-creators`). Creator SEO compounds in a way student SEO cannot — one
converted institute publishes 30 papers and brings its own students, who then show
up in the student clusters.

---

## 0. How to use this document

1. Do **§6 Step 0** (five small code changes) before Batch 1 — otherwise the first 25
   articles ship with the wrong CTA.
2. Write in the batch order of **§11**, ticking boxes in **§8** as you go.
3. Every article obeys **§4 claims guardrails** and **§10 the template**. The
   validator (`node scripts/generate-blog-index.mjs`) enforces the hard rules; the
   soft rules are here.
4. After each batch: run the validator, update the pillar's `guides` array
   (§5.4), commit as `content(creators): batch N — <n> articles (<clusters>)`.

---

## 1. Who searches, and what the search is worth

| Segment | What they type | What they actually want | Share of plan |
|---|---|---|---|
| Coaching institute owner / academic head (SSC, bank, railway, JEE/NEET, UPSC; tier-2/3 cities) | "online test series software", "online exam software for coaching", "test series kaise banaye", "how to get students for coaching institute" | Stop sending PDFs on WhatsApp; own-brand test series; see where the batch is weak; not pay ₹2–10k/month for Testpress-class software | ~45% |
| Individual tutor / YouTube educator / Telegram admin | "free online test maker", "how to create mock test for my students", "telegram quiz bot alternative" | A free way to turn their following into attempt data and a brand | ~20% |
| School teacher (CBSE / state board) | "online unit test", "class quiz with phones", "google forms timer", "competency based questions" | Fast class tests, live quizzes, no setup | ~15% |
| College faculty / TPO | "aptitude test for placement online", "campus placement mock test create" | Bulk aptitude practice | ~5% |
| Paper setters of any kind | "how to write MCQ questions", "negative marking schemes", "item analysis" | Craft, references, templates | ~15% |

**Demand reality.** Creator-side head terms in India are an order of magnitude
smaller than student terms (think low thousands/month for "online test maker" and
"how to create online test", hundreds for most long-tails, tens for many of the
PAA-style titles below). The intent, however, is B2B-grade: a single ranking for
"scholarship test for coaching institute" can be worth more than a page-one for a
student query. **Volumes in this plan are directional, not measured.** The Ahrefs
connector is attached to this environment but unauthorised — authorise it in the
claude.ai connector settings and the Tier-1 list can be re-ranked on real KD/volume
in a follow-up. Until then, validate Tier 1 against Google Keyword Planner and
GSC autocomplete before writing Tier 2.

---

## 2. Keyword universe and SERP reality

### 2.1 Head terms the PILLAR must own (not any article)

`online test maker` · `online test maker for coaching institutes` · `create online
test free` · `online exam platform for coaching` · `mock test creator` · `publish
mock test online` · `online test maker for teachers` · (Hindi) `ऑनलाइन टेस्ट कैसे
बनाएं` · `मॉक टेस्ट प्लेटफॉर्म`

Articles target **modifier queries only** — how / what / why / vs / for-&lt;segment&gt; /
for-&lt;exam&gt; — and link up. Never spin up `/online-test-maker` or
`/online-exam-software` as sibling pages; they would split the equity the SSC MTS
pillar proved concentrates well.

### 2.2 Intent classes (every article is exactly one)

| Class | Pattern | Clusters |
|---|---|---|
| Job-to-be-done how-to | "how to create / conduct / share / schedule …" | A, B, C, G, H, N |
| Exam-specific creation | "how to create a &lt;exam&gt; mock test" | E |
| Comparison / alternative / pain | "google forms timer", "kahoot alternative", "whatsapp pdf test" | F |
| Teacher-side analytics | "analyse test results", "item analysis" | D |
| Business / growth | "how to start test series", "scholarship test", "get students" | J |
| School pedagogy | "unit test online", "formative assessment", "exit ticket" | K, C |
| Integrity / operations | "prevent cheating online test", "internet disconnected during exam" | L |
| Templates / references | "exam instructions sample", "mock test format" | M |
| Craft | "how to write MCQ", "distractors", "Bloom's taxonomy MCQ" | I |
| Definitional (PAA) | "what is CBT", "what is test series" | O |

### 2.3 Who ranks today (checked 2026-10-03)

- **Indian B2B exam-software vendors**, mostly feature pages not guides: Testpress,
  Qwiktest, Just Exam, PaperShala, Examin8, SpeedExam, ParikshaDesk, BlinkExam,
  ThinkExam, Eklavvya, Conduct Exam, Rynow; mycbseguide and writebyhand for
  "question paper generator".
- **Global quiz makers** for "how to create online test with timer / negative
  marking": ClassMarker, ProProfs, Jotform, Formester, FormNX, FreeOnlineSurveys;
  Quizizz and Kahoot for live; Testmoz for small tests.
- **Google Forms add-on vendors** (Extended Forms, Quilgo, Qualtir) own the entire
  "google forms timer / negative marking / section timer" long tail — with blog
  posts, which means those queries are winnable with better posts.
- **PDF-to-quiz tools** (PDF2CBT, Scan2Test, PDFQuiz, Taskade) for "convert pdf
  question paper to online test" — generic study-quiz generators, none built around
  an exam paper's structure (sections, keys, set codes, bilingual).

**The gap nobody fills:** content written for the *Indian competitive-exam paper
setter* — CBT fidelity, negative-marking schemes per exam, sectional timing,
Hindi+English, PYQ papers, live classroom mode, and honest tool comparisons. Vendor
blogs sell; Google Forms blogs patch; study-quiz tools ignore exam structure. That
is the lane.

---

## 3. Architecture

```
/for-creators  ◄── pillar (EN)            /hindi/for-creators ◄── pillar (HI)
      ▲                                           ▲
      │  CTA (tag "For Creators") + in-body link  │  (Hindi articles, Phase 3)
      │                                           │
  214 spokes, category "For Educators", 15 clusters A–O
      │
      └──► down-links to student pages where natural:
           /mock-test/{jee-main,neet-ug,cat,gate,upsc-prelims}, /ssc-mts,
           /marketplace, /json-upload-guide, student articles
```

- **Category:** `"For Educators"` (exists; 3 posts today). `relatedPosts()` picks
  the newest 3 in the same category, so with 200 posts it is weak — in-body sibling
  links (§10) carry the cluster, not the "Keep reading" rail.
- **Tag:** every creator article carries `"For Creators"`; `CLUSTER_CTAS` resolves
  it to `/for-creators` (§6). A creator article **never** carries `"SSC MTS"` or
  `"JEE Main"` — those tags route the CTA to the student pillars and the first
  match wins.
- **Mid-tier hubs:** none as new pages in Phase 1. The pillar's `guides` section
  (§5.4) is the hub; optional Phase 2 is an indexable category URL (§6, item 5).
- **Sitemap / prerender / RSS:** automatic for blog posts — `generate-blog-index`
  rewrites the sitemap section and `feed.xml`; `scripts/prerender.mjs` emits the
  static HTML for every post on build. Nothing to add per article.

---

## 4. Claims guardrails — verified against the code on 2026-10-03

Every feature sentence in every article must be derivable from the **CAN** table.
If a claim is not here, it is not written. Re-verify this table before each batch.

### 4.1 CAN (say freely)

| Capability | Evidence | Wording to use |
|---|---|---|
| Create an exam with name, category, description, general + exam instructions (with a generator), languages (English, Hindi, both), sections with per-section minutes | `CreateExamDialog.tsx`, `GenerateExamInstruction.tsx` | "sections with their own timers", "English, Hindi or both" |
| Paper type: Mock or Previous Year | `PaperTypeSelect.tsx`, memory: paper-type feature (migration must be applied) | "mark a paper as a previous-year paper" |
| Add questions manually: rich text, math (KaTeX/LaTeX), images, image options, passages, single-correct, multi-correct, numeric, text | `QuestionForm.tsx` (`single`, `multi`, `numeric`, `text`), `RichTextEditor.tsx` | "numeric answers can be entered in the question form" |
| Snip a question / option / passage straight out of the PDF as an image | `PdfSnipper.tsx`, `SnipOptionDialog.tsx` | "snip it from the PDF instead of retyping" |
| Bulk import via JSON produced by *your own* AI with MockSetu's extraction prompt | `JsonUploadDialog.tsx`, `/json-upload-guide` | "the universal import route" |
| AI "Import from PDF" (Gemini) — **admin-enabled per creator, off by default** | `docs/ai-pdf-import.md`, `ExamDetail.tsx:5697` | "available to selected creators on request" — never "upload a PDF and it converts" as a universal promise |
| Marks per question: correct / wrong / skipped; multi-correct partial credit (part marks vs all-or-nothing), penalty once vs per wrong option, rounding down/nearest/up/exact | `scoringEngine.ts`, `MarksConfigPanel.tsx` | "negative marking per question", "JEE-Advanced-style partial marking" |
| Timing: per-section clocks, shared clock across sections (timing groups), allow or lock section switching, auto-submit on timeout | `timingGroups.js`, `examSettings.ts`, `ExamSimulator.tsx` | "one clock for two subjects", "sectional lock" |
| Instruction-drift audit (flags when instructions disagree with the paper) | `instructionDrift.js`, `instructionTimingAudit.js` | "it warns you when the instructions no longer match the paper" |
| CBT interface for students: palette, mark for review, auto-submit, instructions page with paper table, fullscreen, bilingual toggle | `ExamSimulator.tsx`, `ExamIntro.tsx` | "the same screen as the real CBT" |
| Mock exams: students take them signed-in **or as guests**; creators preview their own exam (nothing recorded); creators cannot take other creators' exams | `examAccess.ts` | "students can start without an account" |
| 5-minute same-device return window if a signed-in student drops | `ExamSimulator.tsx:201` | "a dropped student can return within five minutes on the same device" — verify the exact UX before publishing L3 |
| Publish to the public library in chosen languages; share link; unpublish; duplicate an exam | `PublishExamDialog.tsx`, `Dashboard.tsx` | "publish, share the link, duplicate for the next batch" |
| Published exams are **public** — anyone can attempt | `Marketplace.tsx`, publish copy | never imply private/paid delivery |
| Creator analytics: aggregated, anonymised — no individual student identity | trust copy on pillar, `Analytics` surfaces | "anonymised aggregates" |
| Correcting an answer re-scores existing attempts | `ExamDetail.tsx:5545` | "fix the key and scores update" — confirm scope before D12 |
| Deleting an exam deletes its attempts and responses | `Dashboard.tsx:551-587` | "deleting a test deletes its attempt data" |
| Live exams: join by code from phones (**student account required**), scheduled start with countdown + auto-start, projector view with themes, show options / reveal answer on timeout, live answer bars, standings (everyone / just me / off), hide student names, private "I'm lost" button, creator-only insights, celebrate moments, duplicate a live exam | `LiveExamStudent.tsx:366`, `ScheduleControl.tsx`, `SessionSettingsMenu.tsx`, `AnswerRiver`, `ConfusionButton`, `LiveInsight`, `MomentCard` | "students join with one code" (+ "they sign in once") |
| Live report: class accuracy, participation, drop-off, median score, per-question median answer time, fast/slow × right/wrong, "I'm lost" taps, students tab, shareable report link | `LiveExamReport.tsx`, `report/*.tsx` | "a report you can share by link" |
| Verified Creator badge (blue) granted by MockSetu admin; creator byline on papers | `verification.ts`, `VerifiedBadge.tsx` | "verified by MockSetu on request" — never "automatic" |
| Free, no card | pillar copy | "free" |
| Hindi UI for the paper table and instructions | `ExamIntro.tsx:89-91` | "Hindi instructions page" |

### 4.2 CANNOT (never claim; say the honest alternative)

No webcam/AI proctoring, no secure browser, no tab-switch detection · no payments,
paywall, subscriptions or private paid delivery · no white-label / custom domain ·
no mobile app (responsive web) · no CSV export of live results, no student report
cards · no question shuffling or attempt limits · no Excel/Word import (JSON only;
AI import gated) · no auto-generated questions from a syllabus (the AI only
*extracts* from a PDF you give it) · no certificates, email/SMS/WhatsApp
notifications, Google Classroom/LMS/SCORM · no subjective/essay grading · the JSON
importer leaves numeric/TITA/match questions for manual entry · the live transport
degrades above roughly 180 concurrent students on the current tier (see
`docs/live-exam-v2-plan.md` §0.3) — **any capacity number needs the owner's
sign-off before it is printed**.

### 4.3 Facts that must be verified at writing time

Exam patterns and marking schemes (E and G2) against the current official bulletin —
record "verified on &lt;date&gt;" in the article's FAQ or the facts table below. Known
landmine: four files still teach NTA's removed "any 5 of 10" Section B rule
(`jee-main-exam-pattern-and-marking-scheme.ts`, `jee-main-numerical-value-questions.ts`,
`jee-main-common-mistakes.ts`, `examLandingPages.ts`). **Fix them before E1 ships**, or
the site contradicts itself on the single most-searched fact in the cluster.

| Fact (fill as verified) | Value | Verified on |
|---|---|---|
| JEE Main Paper 1 | 75 Q, 25/subject, 20 MCQ + 5 numerical, all compulsory, +4/−1 both, 300 marks, 180 min | 2026-09-14 (memory) |
| NEET UG | 180 Q compulsory, 720 marks, 180 min | 2026-09-14 (memory) |
| SSC MTS | 90 Q, 270 marks, Session I 45 min qualifying (no negative), Session II 45 min merit (−1), 3 marks each | 2026-08-16 (`ssc-mts-content-cluster.md`) |
| CAT, GATE, UPSC, SSC CGL/CHSL/GD, RRB NTPC/Group D, IBPS/SBI, CUET, CLAT, NDA/CDS/AFCAT, CTET, UGC NET | — | verify before each E article |

---

## 5. Pillar page changes (`/for-creators` and `/hindi/for-creators`)

Do these in the same week as Batch 1. The pillar today has a WebPage and
BreadcrumbList node, no FAQ, no outbound links to any guide, and a title that leads
with "For Educators & Creators" instead of the query.

### 5.1 Head (`src/i18n/pageSeo.ts` → `CREATOR_SEO_BY_LANG`)

- **Title (EN):** `Free Online Test Maker for Coaching Institutes & Teachers | MockSetu`
  (66 chars; query first, brand last; current title is 72 chars and query-free).
- **Description (EN, ≤160):** `Turn a question-paper PDF into a timed online mock test with negative marking, sections, Hindi + English, live classroom exams and batch analytics. Free.`
- **Keywords:** keep, add `online exam software for coaching institutes, free online
  test maker, mock test creator, test series platform, live quiz for classroom,
  online test kaise banaye`.
- **Hindi:** title already Hindi-first; add `ऑनलाइन टेस्ट मेकर` and `टेस्ट सीरीज़
  सॉफ्टवेयर` to the front of the keyword list; description can stay.

### 5.2 Body (copy tables `creatorCopy.en.ts` / `creatorCopy.hi.ts`)

- Keep the H1 ("Stop sharing PDFs. Start giving exams.") — it converts. Add **one
  keyword-bearing H2 directly under the hero**: "A free online test maker built for
  Indian exams" with three bullets (PDF → CBT, negative marking + sectional timing,
  live classroom exams) each linking to its Tier-1 spoke.
- Rename the two hook H2s to carry terms without losing the hook: "Sound familiar?"
  → "Sound familiar? The WhatsApp-PDF problem"; "The upgrade your students deserve."
  → "PDF vs online mock test: the upgrade your students deserve."
- **Stats block** ("2 min", "500+ exams", "10K+ attempts"): verify against the DB
  before Batch 1; stale numbers are an E-E-A-T hit. Update or remove.
- **FAQ section (new, 8 Qs)** rendered on the page and emitted as **one** FAQPage
  node in the page's `jsonLd` array. Put the Q/A pairs in the copy tables so the
  Hindi page gets its own FAQ. Questions, in PAA phrasing:
  1. Is MockSetu free for teachers and coaching institutes?
  2. How do I convert my PDF question paper into an online test?
  3. Can I add negative marking and sectional timing?
  4. Can students take the test on a phone, without an account?
  5. Can I run a live test in class with students' phones?
  6. Can I publish in Hindi and English?
  7. What analytics do I get, and can I see individual students?
  8. Who owns my questions, and can I delete them?
  (FAQ rich results have been restricted to authority sites since 2023 — the value
  here is entity clarity and AI-overview eligibility, not a SERP dropdown.)

### 5.3 Structured data

Add to the page's `jsonLd`: the FAQPage above, and an `ItemList` of the guides
section (same shape as `buildExamLandingJsonLd`). Do **not** add a second
SoftwareApplication node — `index.html` already declares the product entity; a
second one with different properties muddies it. Keep `audience: EducationalAudience`.

### 5.4 Guides section (the hub mechanism)

Add `CREATOR_GUIDES: { slug; label; blurb }[]` in a Node-safe data module
(`src/data/creatorGuides.ts`), rendered under the journey section exactly as
`ExamLandingPage` renders `exam.guides`, 12–18 cards. Seed with Batch 1's Tier-1
posts; rotate per batch so the cards always point at the strongest spokes. The
Hindi page shows the same English guides until Phase 3 lands.

### 5.5 Internal links INTO the pillar (cheapest ranking lift on the site)

- Footer "Become a Creator" — exists on every non-home page. Keep.
- Add a one-line "**Educators:** publish your own &lt;exam&gt; mock free →" strip on the
  five `/mock-test/*` pages, `/ssc-mts` and `/marketplace`. Those pages carry the
  site's strongest authority and the most relevant audience overlap (teachers
  research the exam page too).
- Add the link contextually in existing student posts about coaching:
  `online-coaching-vs-offline-coaching`, `ssc-mts-online-vs-offline-coaching`,
  `how-to-crack-jee-without-coaching`, `ssc-mts-preparation-without-coaching`.
- Update the three existing educator posts to link to their new sub-clusters and
  bump `updatedAt` (real edits only).

---

## 6. Step 0 — code changes before Batch 1

**Items 1-4 and 7 are DONE (2026-10-03).** Item 5 is deferred by design and item 6 is
still the blocker for every Hindi article. The list is kept in full because it records
why each change exists.

1. ☑ **`src/pages/BlogPost.tsx` → `CLUSTER_CTAS`**: append
   `{ tag: "For Creators", to: "/for-creators", blurb: "Reading explains; publishing teaches. Turn your next paper into a timed online exam your students take on the real CBT screen — free.", label: "Create Your First Online Exam — Free" }`.
   Append (not prepend): student articles never carry this tag, so order is moot,
   and appending cannot disturb the two existing funnels.
2. ☑ **`KNOWN_STATIC_PATHS`** (now in `scripts/lib/postRules.mjs`): add
   `"/hindi/for-creators"` and `"/hindi"` (H6 and Phase 3 link there; today that is a
   build error). Do **not** add `/auth` — articles link to the pillar, never to the
   login page (robots disallows it and it has no copy to rank).
3. ☑ **A static test** (`src/__tests__/creator-cluster-tags.test.mjs`, 24 assertions):
   assert no post
   carries both `"For Creators"` and a student cluster tag (`"SSC MTS"`, `"JEE Main"`),
   and that every `category: "For Educators"` post carries `"For Creators"`.
   Normalise CRLF when reading (`.replace(/\r\n/g, "\n")`).
   It immediately caught the three existing educator posts, which had the right
   category but no `"For Creators"` tag and so were funnelling coaching owners to the
   student library. All three now carry it.
4. ☑ **Pillar data module + FAQ + guides** (§5.2–5.4).
5. ☐ **Optional, Phase 2 — indexable category hub**: `/blog/for-educators` listing only
   that category, with its own entry in `staticPageSeo.ts`, `STATIC_ROUTE_KEYS`,
   sitemap and the Blog page's chips. Worth it once ≥60 posts exist; skip for now.
6. ☐ **Phase 3 — Hindi posts** (cluster P) — STILL BLOCKING cluster P: add optional
   `lang?: "hi"` to `BlogPost`;
   thread it into `buildBlogPostJsonLd` (`inLanguage`), `SEO`'s `lang`, BlogPost's
   UI labels ("min read", "Published", "Frequently asked"), the Blog index card,
   `feed.xml` `<language>`, and the prerender shell. Until then **no Hindi body
   copy ships in the blog** — a Hindi article under `en-IN` is a worse signal than
   no article.
7. ☑ **Measurement hook**: `content_group = post.category` now reaches GA4. The page
   writes it via `src/lib/contentGroup.ts` and `GoogleAnalytics.tsx` reads it inside the
   macrotask it already defers `page_view` by — the same channel it uses for the title,
   and for the same reason: the analytics component sits above `<Outlet/>`, so its
   effect runs before the routed page has set anything.

---

## 7. Anti-cannibalisation rules

**One article = one query intent. Two articles never share a head term.** Where a
new article borders an existing one, it is *narrower* and links **up**.

| New article | Must not duplicate | How it differs |
|---|---|---|
| A2, A5, A7 | `/blog/how-to-create-an-online-mock-test` (owns "how to create an online mock test") | A2 = question paper → online delivery; A5 = MCQ format/marking; A7 = paper *design* (difficulty curve, stamina). None repeats the click-by-click steps — they link to it. |
| Whole of B | `/blog/convert-pdf-question-paper-to-online-test` (owns the head) and `/json-upload-guide` (canonical schema + prompt how-to) | B1 is the CBT concept; B4/B5 are tool-specific (ChatGPT, Gemini); B6/B11/B12 are failure modes; B9 is the Excel question. B never re-documents the JSON schema. |
| F11, F17 | `/blog/best-online-test-maker-for-coaching-institutes` (buyer's checklist) | F11 = what paid tiers buy; F17 = hidden limits of free tiers. Tool-specific alternatives (F4–F8) are their own intents. |
| G1, G2 | `/blog/negative-marking-strategy`, `/blog/ssc-mts-negative-marking-strategy` (student strategy) | G1 = how to *set* it; G2 = setter's reference table across exams. |
| G7, O1 | `/blog/jee-main-exam-interface-and-cbt-practice`, `/blog/gate-virtual-calculator-and-exam-interface` (student) | Creator-side: why your paper needs these features. |
| E1, E14 | `/blog/jee-main-exam-pattern-and-marking-scheme`, `/blog/ssc-mts-exam-pattern` | E cites the pattern in one table and links to the student article for the long version; the body is about *building* it. |
| E10 | `/blog/upsc-prelims-test-series-strategy` (student) | Creation, not attempt strategy. |
| J15 | `/blog/online-coaching-vs-offline-coaching` (student decision) | Institute-side competition. |
| D9 vs J18 | each other | D9 = what the product shows; J18 = what the DPDP Act expects of the institute. |
| A12 vs I12 vs O4 | each other | A12 = migration project (people/process); I12 = taxonomy design; O4 = definition. |
| C8 vs K7 | each other | C8 = pre-exam revision; K7 = lesson-opening retrieval. |
| C11 vs D4 | each other | C11 = answer time in live quizzes; D4 = pacing in full-length mocks. |
| B6 vs M6 | each other | B6 = fixing a broken key after extraction; M6 = formatting a key so it never breaks. |

---

## 8. Inventory — 214 English articles in 15 clusters

Columns: slug (filename under `src/data/blog/posts/`), working title (trim to a
≤68-char `metaTitle` at writing time), primary query, tier. **T1** = write first,
**T2** = core breadth, **T3** = long tail / PAA. Every article links to
`/for-creators` once in the body (the CTA adds a second), to 2–3 siblings named in
the cluster header, and to one student-side page where natural.

### A. Create and run an online test — the job to be done (15)

Shared links: up to `/blog/how-to-create-an-online-mock-test`; siblings within A;
down to `/marketplace`. Cluster tag: `"Exam Creation"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| A1 ☐ | `free-online-test-maker-for-school-teachers` | Free Online Test Maker for School Teachers: Set Up a Class Test in 10 Minutes | free online test maker for teachers | T1 |
| A2 ☐ | `how-to-make-a-question-paper-online` | How to Make a Question Paper Online (and Deliver It as a Real Exam) | how to make question paper online | T1 |
| A3 ☐ | `how-to-conduct-an-online-exam-for-students` | How to Conduct an Online Exam for Students: Before, During and After | how to conduct online exam | T1 |
| A4 ☐ | `how-to-create-a-timed-online-test-with-auto-submit` | How to Create a Timed Online Test With Auto-Submit | online test with timer | T1 |
| A5 ☐ | `how-to-create-an-mcq-test-online` | How to Create an MCQ Test Online: Format, Marking and Delivery | create mcq test online | T1 |
| A6 ☐ | `how-to-create-an-online-test-series` | How to Create an Online Test Series: From One Paper to a Full Programme | how to create test series | T1 |
| A7 ☐ | `how-to-design-a-full-length-mock-test-paper` | How to Design a Full-Length Mock Test Paper Students Take Seriously | full length mock test design | T2 |
| A8 ☐ | `how-to-create-an-online-quiz-for-students` | How to Create an Online Quiz for Students (Quiz vs Exam, and When to Use Each) | online quiz for students | T2 |
| A9 ☐ | `how-to-set-up-sections-in-an-online-exam` | How to Set Up Sections in an Online Exam: Names, Order, Timing | sections in online test | T2 |
| A10 ☐ | `how-to-share-an-online-test-with-students` | How to Share an Online Test With Students: Links, QR Codes and WhatsApp | share online test link with students | T1 |
| A11 ☐ | `how-to-create-a-previous-year-paper-mock-test` | How to Create a Previous Year Paper Mock Test (and Why It Draws Students) | previous year paper mock test | T1 |
| A12 ☐ | `how-to-move-your-institutes-paper-archive-online` | How to Move Your Institute's Paper Archive Online: People, Process, Timeline | digitize question papers coaching | T2 |
| A13 ☐ | `how-to-run-a-weekly-online-test-for-your-batch` | How to Run a Weekly Online Test for Your Batch Without Burning Out | weekly test for students | T2 |
| A14 ☐ | `how-to-create-a-chapter-wise-test-online` | How to Create a Chapter-Wise Test Online | chapter wise test online | T1 |
| A15 ☐ | `how-to-create-an-online-test-from-a-word-document` | How to Create an Online Test From a Word Document or Google Doc | word document to online test | T3 |

### B. PDF and JSON import — the product's wedge (12)

Shared links: up to `/blog/convert-pdf-question-paper-to-online-test` and
`/json-upload-guide`; siblings within B; down to N1/N8. Cluster tag: `"PDF Import"`.
Rule: the AI "Import from PDF" is described as available to selected creators; the
prompt-plus-JSON route is the universal path.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| B1 ☐ | `pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test` | PDF to CBT: How a Question Paper Becomes a Computer-Based Test | pdf to cbt | T1 |
| B2 ☐ | `scanned-question-paper-to-online-test` | Scanned Question Paper to Online Test: What OCR Gets Right and Wrong | scanned pdf to online test | T2 |
| B3 ☐ | `handwritten-question-paper-to-online-test` | Handwritten Question Paper to Online Test: A Phone-Camera Workflow | handwritten question paper to online test | T3 |
| B4 ☐ | `how-to-use-chatgpt-to-convert-a-question-paper-into-json` | How to Use ChatGPT to Convert a Question Paper Into Import-Ready JSON | chatgpt question paper to json | T1 |
| B5 ☐ | `how-to-use-gemini-to-extract-questions-from-a-pdf` | How to Use Gemini to Extract Questions From a PDF (Free, Large Files) | gemini extract questions from pdf | T2 |
| B6 ☐ | `fixing-answer-key-errors-after-pdf-extraction` | Fixing Answer Key Errors After PDF Extraction: Set Codes, Last Pages, Labels | answer key wrong after import | T2 |
| B7 ☐ | `how-to-import-math-and-chemistry-equations-from-a-pdf` | How to Import Math and Chemistry Equations From a PDF Without Breaking Them | latex from pdf to online test | T2 |
| B8 ☐ | `how-to-add-diagrams-and-figures-to-online-test-questions` | How to Add Diagrams and Figures to Online Test Questions | add diagram to online quiz question | T2 |
| B9 ☐ | `bulk-upload-questions-to-an-online-test-json-vs-excel` | Bulk Upload Questions to an Online Test: JSON vs Excel, Honestly Compared | bulk upload questions excel online test | T1 |
| B10 ☐ | `how-long-does-it-take-to-convert-a-question-paper-to-an-online-test` | How Long Does It Take to Convert a Question Paper to an Online Test? | how long to digitize a question paper | T3 |
| B11 ☐ | `how-to-map-pdf-sections-to-online-exam-sections-before-import` | How to Map PDF Sections to Online Exam Sections Before You Import | section mismatch on import | T3 |
| B12 ☐ | `post-extraction-review-checklist-before-you-publish` | The Post-Extraction Review Checklist: 12 Checks Before You Publish | review extracted questions checklist | T2 |

### C. Live exams and classroom quizzes (16)

Shared links: siblings within C; up to A8; down to K7/K8. Cluster tag: `"Live Exam"`.
Rule: "students join with one code" always carries "after a one-time sign-in".

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| C1 ☐ | `how-to-conduct-a-live-quiz-in-class-with-students-phones` | How to Conduct a Live Quiz in Class With Students' Phones | live quiz in classroom | T1 |
| C2 ☐ | `how-to-run-a-live-mock-test-for-a-whole-batch` | How to Run a Live Mock Test for a Whole Batch at Once | live mock test for students | T1 |
| C3 ☐ | `how-to-project-a-live-quiz-on-a-classroom-screen` | How to Project a Live Quiz on a Classroom Screen (Join Code, Themes, Reveal) | project quiz on classroom screen | T2 |
| C4 ☐ | `live-leaderboard-in-class-show-it-or-hide-it` | Live Leaderboard in Class: When to Show It, When to Hide It | classroom leaderboard pros and cons | T2 |
| C5 ☐ | `how-to-schedule-a-live-online-test-with-a-countdown` | How to Schedule a Live Online Test With a Countdown and Auto-Start | schedule online test start time | T2 |
| C6 ☐ | `how-to-read-live-answer-bars-and-teach-in-the-moment` | How to Read Live Answer Bars and Teach in the Moment | live poll results teaching | T3 |
| C7 ☐ | `catching-confusion-before-the-wrong-answer-the-im-lost-button` | Catching Confusion Before the Wrong Answer: The "I'm Lost" Button | students afraid to ask questions tool | T3 |
| C8 ☐ | `how-to-use-a-live-quiz-for-revision-before-exams` | How to Use a Live Quiz for Revision in the Last Two Weeks | revision quiz ideas | T2 |
| C9 ☐ | `exit-ticket-quiz-ideas-for-coaching-classes` | Exit Ticket Quiz Ideas for Coaching Classes (5 Minutes, 5 Questions) | exit ticket quiz | T3 |
| C10 ☐ | `how-to-read-a-live-exam-report` | How to Read a Live Exam Report: Class Accuracy, Pacing, Drop-Off | class quiz report analysis | T2 |
| C11 ☐ | `fast-and-wrong-vs-slow-and-right-answer-time-in-live-quizzes` | Fast-and-Wrong vs Slow-and-Right: What Answer Time Reveals in a Live Quiz | answer time analysis quiz | T3 |
| C12 ☐ | `how-to-run-a-live-quiz-on-zoom-or-google-meet` | How to Run a Live Quiz for Online Batches on Zoom or Google Meet | live quiz on zoom class | T1 |
| C13 ☐ | `how-to-reuse-a-live-quiz-with-a-new-batch` | How to Reuse a Live Quiz With a New Batch (Duplicate, Reset, Reshare) | reuse quiz for new class | T3 |
| C14 ☐ | `live-quiz-vs-homework-test-which-to-use-when` | Live Quiz vs Homework Test: Which to Use, and When | live quiz vs assignment | T3 |
| C15 ☐ | `how-to-make-live-quizzes-fair-for-anxious-students` | How to Make Live Quizzes Fair for Slow and Anxious Students | quiz anxiety classroom games | T3 |
| C16 ☐ | `how-many-questions-should-a-live-classroom-quiz-have` | How Many Questions Should a Live Classroom Quiz Have? | how many questions in a class quiz | T3 |

### D. Analytics and results, teacher side (12)

Shared links: siblings within D; down to student `/blog/how-to-take-mock-tests` and
`/blog/how-to-improve-accuracy-in-mcq-exams`. Cluster tag: `"Teacher Analytics"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| D1 ☐ | `how-to-analyse-mock-test-results-as-a-teacher` | How to Analyse Mock Test Results as a Teacher (a 30-Minute Routine) | analyze test results as a teacher | T1 |
| D2 ☐ | `question-level-analytics-what-your-class-got-wrong-and-why` | Question-Level Analytics: Which Questions Your Class Got Wrong, and Why | question wise analysis of test | T2 |
| D3 ☐ | `section-wise-performance-analysis-for-coaching-batches` | Section-Wise Performance Analysis for Coaching Batches | section wise analysis | T2 |
| D4 ☐ | `time-per-question-in-full-length-mocks-coaching-pacing` | Time per Question in Full-Length Mocks: Coaching Pacing, Not Just Accuracy | time per question analysis | T2 |
| D5 ☐ | `how-to-give-feedback-after-a-mock-test` | How to Give Feedback After a Mock Test That Students Actually Use | feedback after mock test | T2 |
| D6 ☐ | `how-to-identify-weak-topics-across-a-batch` | How to Identify Weak Topics Across a Batch (Not Just Weak Students) | identify weak areas of students | T1 |
| D7 ☐ | `item-analysis-for-teachers-difficulty-and-discrimination-index` | Item Analysis for Teachers: Difficulty Index and Discrimination Index, Simply | item analysis difficulty index discrimination index | T2 |
| D8 ☐ | `how-to-track-student-progress-across-a-test-series` | How to Track Student Progress Across a Test Series | track student progress test series | T2 |
| D9 ☐ | `anonymised-student-analytics-what-creators-can-and-cannot-see` | Anonymised Student Analytics: What Creators Can and Cannot See | student data privacy online test platform | T3 |
| D10 ☐ | `how-to-run-a-post-mock-discussion-class-using-analytics` | How to Run a Post-Mock Discussion Class Using Analytics | mock test discussion class | T2 |
| D11 ☐ | `how-to-spot-guessing-patterns-in-mcq-results` | How to Spot Guessing Patterns in MCQ Results | detect guessing in multiple choice tests | T3 |
| D12 ☐ | `how-to-correct-an-answer-key-after-students-have-attempted` | How to Correct an Answer Key After Students Have Attempted the Test | wrong answer key after exam what to do | T2 |

### E. Exam-specific creation guides (36)

Slug pattern `how-to-create-a-<exam>-mock-test-online`. **This is the cluster the
helpful-content system will test.** Each article must carry, uniquely for its exam:
(1) the official pattern in one table — sections, questions, marks, time, negative
marking, question types; (2) which of those MockSetu reproduces and *how* (sectional
lock vs free navigation, shared clock, partial marking, numeric entry); (3) a sample
general-instructions block in the exam's register; (4) three setter mistakes specific
to that exam; (5) what students search for that your paper can rank for; (6) a link
**down** to the student pillar / pattern article. Anything shorter than that is a
template, and templates get demoted as a set.

Tags: `"For Creators"`, `"Exam Creation"`, plus the exam name in a form that is
**not** a student cluster tag (`"JEE"` not `"JEE Main"`, `"SSC"` not `"SSC MTS"`).

| # | exam (slug stem) | working title | down-link | tier |
|---|---|---|---|---|
| E1 ☐ | `jee-main` | How to Create a JEE Main Mock Test Online: Pattern, Marking, Sections | `/mock-test/jee-main` | T1 |
| E2 ☐ | `jee-advanced` | How to Create a JEE Advanced Mock Test Online: Partial Marking Done Right | `/blog/jee-advanced-preparation-strategy` | T2 |
| E3 ☐ | `neet` | How to Create a NEET Mock Test Online: 180 Questions, 720 Marks, One Clock | `/mock-test/neet-ug` | T1 |
| E4 ☐ | `cat` | How to Create a CAT Mock Test Online: Sectional Lock, TITA, DILR Sets | `/mock-test/cat` | T1 |
| E5 ☐ | `xat` | How to Create an XAT Mock Test Online | `/blog/xat-preparation-strategy` | T3 |
| E6 ☐ | `cmat` | How to Create a CMAT Mock Test Online | `/blog/cmat-preparation-strategy` | T3 |
| E7 ☐ | `gate` | How to Create a GATE Mock Test Online: 1-Mark, 2-Mark, NAT and MSQ | `/mock-test/gate` | T2 |
| E8 ☐ | `bitsat` | How to Create a BITSAT Mock Test Online | `/blog/bitsat-preparation-strategy` | T3 |
| E9 ☐ | `viteee-and-srmjeee` | How to Create VITEEE and SRMJEEE Mock Tests Online | `/marketplace` | T3 |
| E10 ☐ | `upsc-prelims` | How to Create a UPSC Prelims Mock Test Online: GS, CSAT and One-Third Negative | `/mock-test/upsc-prelims` | T1 |
| E11 ☐ | `state-psc` | How to Create a State PSC Prelims Mock Test Online | `/blog/state-psc-exam-preparation` | T3 |
| E12 ☐ | `ssc-cgl` | How to Create an SSC CGL Mock Test Online: Tier 1 Pattern and Marking | `/blog/ssc-cgl-preparation-strategy` | T1 |
| E13 ☐ | `ssc-chsl` | How to Create an SSC CHSL Mock Test Online | `/blog/ssc-chsl-preparation-strategy` | T2 |
| E14 ☐ | `ssc-mts` | How to Create an SSC MTS Mock Test Online: Session I and Session II | `/ssc-mts` | T1 |
| E15 ☐ | `ssc-gd-constable` | How to Create an SSC GD Constable Mock Test Online | `/blog/ssc-gd-constable-preparation` | T2 |
| E16 ☐ | `rrb-ntpc` | How to Create an RRB NTPC Mock Test Online | `/blog/rrb-ntpc-preparation-strategy` | T1 |
| E17 ☐ | `rrb-group-d` | How to Create an RRB Group D Mock Test Online | `/blog/rrb-group-d-preparation-strategy` | T2 |
| E18 ☐ | `ibps-po` | How to Create an IBPS PO Mock Test Online: Prelims Sectional Timing | `/blog/bank-po-preparation-strategy` | T1 |
| E19 ☐ | `ibps-clerk` | How to Create an IBPS Clerk Mock Test Online | `/blog/ibps-clerk-preparation-strategy` | T2 |
| E20 ☐ | `sbi-po` | How to Create an SBI PO Mock Test Online | `/blog/bank-po-preparation-strategy` | T2 |
| E21 ☐ | `sbi-clerk` | How to Create an SBI Clerk Mock Test Online | `/blog/ibps-clerk-preparation-strategy` | T3 |
| E22 ☐ | `rbi-grade-b` | How to Create an RBI Grade B Phase 1 Mock Test Online | `/blog/rbi-grade-b-preparation-strategy` | T3 |
| E23 ☐ | `lic-aao-and-ado` | How to Create LIC AAO and ADO Mock Tests Online | `/blog/lic-aao-preparation-strategy` | T3 |
| E24 ☐ | `nabard-grade-a` | How to Create a NABARD Grade A Mock Test Online | `/marketplace` | T3 |
| E25 ☐ | `cuet-ug` | How to Create a CUET UG Mock Test Online: Domain Subjects and the General Test | `/blog/cuet-ug-preparation-strategy` | T1 |
| E26 ☐ | `clat` | How to Create a CLAT Mock Test Online: Passage-Based Sets | `/blog/clat-preparation-strategy` | T2 |
| E27 ☐ | `nda` | How to Create an NDA Mock Test Online: Maths and GAT | `/blog/nda-exam-preparation` | T2 |
| E28 ☐ | `cds` | How to Create a CDS Mock Test Online | `/blog/cds-exam-preparation` | T3 |
| E29 ☐ | `afcat` | How to Create an AFCAT Mock Test Online | `/blog/afcat-preparation-strategy` | T3 |
| E30 ☐ | `ctet-and-state-tet` | How to Create CTET and State TET Mock Tests Online: No Negative Marking | `/blog/ctet-preparation-strategy` | T1 |
| E31 ☐ | `ugc-net` | How to Create a UGC NET Mock Test Online: Paper 1 and Paper 2 | `/blog/ugc-net-preparation-strategy` | T2 |
| E32 ☐ | `cbse-class-10-mcq` | How to Create a CBSE Class 10 MCQ Practice Test Online | `/blog/cbse-class-10-board-exam-preparation` | T2 |
| E33 ☐ | `cbse-class-12-mcq` | How to Create a CBSE Class 12 MCQ Practice Test Online | `/blog/cbse-class-12-board-exam-preparation` | T2 |
| E34 ☐ | `olympiad` | How to Create an Olympiad Practice Test Online (NSO, IMO, NTSE-Style) | `/blog/how-to-prepare-for-olympiads` | T3 |
| E35 ☐ | `campus-placement-aptitude` | How to Create a Campus Placement Aptitude Test Online (for TPOs) | `/blog/aptitude-test-preparation-for-placements` | T2 |
| E36 ☐ | `police-constable` | How to Create a Police Constable Mock Test Online (UP, Delhi, State Police) | `/blog/ssc-gd-constable-preparation` | T2 |

### F. Comparisons, alternatives and the pain they come from (20)

Shared links: up to `/blog/best-online-test-maker-for-coaching-institutes`; siblings
within F; A4/G1 for the fix. Cluster tag: `"Alternatives"`. Rules: name competitors,
never link them (validator warns on external URLs anyway); describe capability
classes, never prices (they change); state plainly what the competitor does better
(proctoring, white-label, payments) — honesty is the ranking strategy here.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| F1 ☐ | `google-forms-for-online-exams-limits-and-alternatives` | Google Forms for Online Exams: Where It Stops, and What to Use Instead | google forms for exams | T1 |
| F2 ☐ | `how-to-add-a-timer-to-google-forms-and-the-better-option` | How to Add a Timer to Google Forms (Add-Ons) and the Better Option | google forms timer | T1 |
| F3 ☐ | `negative-marking-in-google-forms-workarounds` | Negative Marking in Google Forms: Workarounds, and a Way That Just Works | google forms negative marking | T1 |
| F4 ☐ | `kahoot-alternative-for-coaching-institutes-in-india` | Kahoot Alternative for Coaching Institutes in India | kahoot alternative | T1 |
| F5 ☐ | `quizizz-vs-kahoot-for-indian-classrooms` | Quizizz vs Kahoot for Indian Classrooms (and a Third Option Built for Exams) | quizizz vs kahoot | T2 |
| F6 ☐ | `testmoz-alternative-free-for-teachers` | Testmoz Alternative: Free, With Real Exam Timing | testmoz alternative | T2 |
| F7 ☐ | `classmarker-alternative-for-coaching-institutes` | ClassMarker Alternative for Coaching Institutes | classmarker alternative | T2 |
| F8 ☐ | `proprofs-quiz-maker-alternative` | ProProfs Quiz Maker Alternative for Exam Prep | proprofs alternative | T3 |
| F9 ☐ | `whatsapp-pdf-tests-vs-online-mock-tests` | WhatsApp PDF Tests vs Online Mock Tests: What Students Lose With a PDF | whatsapp pdf test | T1 |
| F10 ☐ | `telegram-quiz-bot-vs-exam-simulator` | Telegram Quiz Bot vs a Real Exam Simulator | telegram quiz bot for exam | T1 |
| F11 ☐ | `paid-test-series-software-vs-free-platforms` | Paid Test Series Software vs Free Platforms: What You Actually Pay For | online exam software pricing coaching | T1 |
| F12 ☐ | `white-label-test-platform-vs-shared-library` | White-Label Test Platform vs a Shared Library: The Discovery Trade-Off | white label online test platform | T2 |
| F13 ☐ | `should-a-coaching-institute-build-its-own-exam-app` | Should a Coaching Institute Build Its Own Exam App? Cost, Time, Reality | coaching app development cost | T2 |
| F14 ☐ | `moodle-quiz-vs-exam-simulator-for-coaching` | Moodle Quiz vs an Exam Simulator for Competitive-Exam Coaching | moodle quiz competitive exam | T3 |
| F15 ☐ | `microsoft-forms-quiz-for-exams-limitations` | Microsoft Forms Quiz for Exams: Limitations and Alternatives | microsoft forms quiz timer | T3 |
| F16 ☐ | `online-exam-software-vs-exam-simulator` | Online Exam Software vs Exam Simulator: Why the Difference Matters | exam simulator software | T2 |
| F17 ☐ | `hidden-limits-in-free-online-exam-software` | Hidden Limits in Free Online Exam Software: Attempt Caps, Student Caps, Ads | free online exam software limits | T2 |
| F18 ☐ | `own-test-series-vs-testbook-and-adda247` | Your Own Test Series vs Testbook and Adda247: Why Institutes Publish Their Own | testbook alternative for coaching institutes | T1 |
| F19 ☐ | `omr-tests-vs-computer-based-tests-for-coaching` | OMR Tests vs Computer-Based Tests for Coaching Institutes | omr vs online test | T2 |
| F20 ☐ | `zoom-polls-vs-live-quiz-platforms` | Zoom Polls vs Live Quiz Platforms for Online Classes | zoom poll quiz alternative | T3 |

### G. Marking schemes and timing rules (10)

Shared links: siblings within G; A9; down to student `/blog/negative-marking-strategy`.
Cluster tag: `"Marking & Timing"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| G1 ☐ | `how-to-add-negative-marking-to-an-online-test` | How to Add Negative Marking to an Online Test (per Question, per Section) | negative marking online test | T1 |
| G2 ☐ | `negative-marking-schemes-of-indian-exams-for-paper-setters` | Negative Marking Schemes of Indian Exams: A Reference for Paper Setters | negative marking in exams list | T1 |
| G3 ☐ | `partial-marking-for-multi-correct-mcqs` | Partial Marking for Multi-Correct MCQs: How to Set It Up | partial marking setup | T2 |
| G4 ☐ | `how-to-set-different-marks-per-section-or-question` | How to Set Different Marks per Section or Question | different marks per question online test | T2 |
| G5 ☐ | `shared-clock-across-subjects-timing-groups` | One Clock, Two Subjects: Shared Timing Across Sections (SSC-Style Sessions) | sectional timing shared across sections | T3 |
| G6 ☐ | `auto-submit-on-timeout` | Auto-Submit on Timeout: Why It Matters and How to Set It | auto submit quiz when time ends | T3 |
| G7 ☐ | `question-palette-and-mark-for-review-for-creators` | Question Palette and Mark for Review: Why Your Test Needs Them | mark for review feature online test | T2 |
| G8 ☐ | `how-to-set-the-right-total-time-for-a-mock-test` | How to Set the Right Total Time for a Mock Test | time per question in exams | T2 |
| G9 ☐ | `rounding-rules-in-partial-marking` | Rounding Rules in Partial Marking, Explained With Examples | partial marks rounding | T3 |
| G10 ☐ | `should-you-allow-section-switching-in-your-mock-test` | Should You Allow Section Switching in Your Mock Test? | section switching in online exam | T2 |

### H. Bilingual and Hindi-medium creators (8)

Shared links: `/hindi/for-creators` (needs Step 0 item 2); siblings within H; down to
`/blog/ssc-mts-previous-year-paper-in-hindi`. Cluster tag: `"Bilingual"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| H1 ☐ | `how-to-create-a-bilingual-hindi-english-online-test` | How to Create a Bilingual Hindi-English Online Test | bilingual online test hindi english | T1 |
| H2 ☐ | `how-to-convert-a-bilingual-pdf-question-paper-to-online-test` | How to Convert a Bilingual PDF Question Paper to an Online Test | hindi english pdf question paper to online test | T2 |
| H3 ☐ | `how-to-type-hindi-questions-for-an-online-test` | How to Type Hindi Questions for an Online Test: Transliteration and Unicode | hindi typing for online test | T2 |
| H4 ☐ | `hindi-rendering-problems-in-online-tests-and-fixes` | Hindi Rendering Problems in Online Tests (Broken Matras, Boxes) and Fixes | hindi font problem online test | T3 |
| H5 ☐ | `how-to-publish-an-exam-in-hindi-only-or-english-only` | How to Publish an Exam in Hindi Only, English Only, or Both | publish test in hindi | T3 |
| H6 ☐ | `online-test-platform-for-hindi-medium-coaching-institutes` | Online Test Platform for Hindi-Medium Coaching Institutes | hindi medium coaching online test | T1 |
| H7 ☐ | `how-to-translate-an-english-test-into-hindi` | How to Translate an English Test Into Hindi Without Losing Marks or Meaning | translate question paper to hindi | T2 |
| H8 ☐ | `why-bilingual-mock-tests-draw-more-students` | Why Bilingual Mock Tests Draw More Students to Your Papers | hindi medium students mock test demand | T3 |

### I. Question-writing craft (15)

Shared links: siblings within I; D7 for analysis; down to student accuracy article.
Cluster tag: `"Question Writing"`. Evergreen; the lowest competition in the plan.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| I1 ☐ | `how-to-write-good-multiple-choice-questions` | How to Write Good Multiple-Choice Questions | how to write mcq questions | T1 |
| I2 ☐ | `how-to-write-distractors-that-test-understanding` | How to Write Distractors That Test Understanding, Not Reading Speed | how to write distractors | T2 |
| I3 ☐ | `how-to-calibrate-question-difficulty` | How to Calibrate Question Difficulty: Easy, Medium, Hard That Mean Something | question difficulty level | T2 |
| I4 ☐ | `blooms-taxonomy-for-mcq-writing` | Bloom's Taxonomy for MCQ Writing, With Exam-Style Examples | bloom's taxonomy mcq examples | T2 |
| I5 ☐ | `how-to-write-assertion-reason-questions` | How to Write and Mark Assertion-Reason Questions | assertion reason questions how to make | T2 |
| I6 ☐ | `how-to-write-reading-comprehension-sets-for-online-tests` | How to Write Reading Comprehension Sets for Online Tests | reading comprehension questions making | T2 |
| I7 ☐ | `how-to-write-data-interpretation-sets` | How to Write Data Interpretation Sets for Bank and CAT Mocks | data interpretation questions creation | T3 |
| I8 ☐ | `common-mistakes-in-mcq-writing` | Common Mistakes in MCQ Writing: Ambiguous Stems, Giveaway Options | mcq writing mistakes | T2 |
| I9 ☐ | `how-many-options-should-an-mcq-have` | How Many Options Should an MCQ Have? 4 vs 5, by Exam | 4 options or 5 options mcq | T3 |
| I10 ☐ | `copyright-and-question-banks-what-institutes-should-know` | Copyright and Question Banks: What Coaching Institutes Should Know | copyright on question papers india | T2 |
| I11 ☐ | `how-to-write-questions-in-the-style-of-the-real-exam` | How to Write Questions in the Style of the Real Exam | exam style questions | T2 |
| I12 ☐ | `how-to-organise-a-question-bank-by-topic-and-difficulty` | How to Organise a Question Bank by Topic and Difficulty | question bank organization | T2 |
| I13 ☐ | `how-to-make-a-test-blueprint-before-writing-questions` | How to Make a Test Blueprint Before Writing a Single Question | test blueprint | T2 |
| I14 ☐ | `how-to-write-questions-that-cannot-be-googled` | How to Write Questions That Cannot Be Googled | questions students can't google | T3 |
| I15 ☐ | `how-to-pilot-test-questions-with-a-small-group` | How to Pilot-Test Questions With a Small Group Before the Main Exam | pilot testing questions | T3 |

### J. Growth and the test-series business (20)

Shared links: siblings within J; A6/A11; down to `/ssc-mts` as the proof that
published papers rank. Cluster tag: `"Coaching Growth"`. Rule: MockSetu has no
payments and published papers are public — every "business" article is about using
free, open papers as the funnel for the institute's paid teaching, never about
selling access on MockSetu.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| J1 ☐ | `how-to-start-an-online-test-series-for-your-coaching-institute` | How to Start an Online Test Series for Your Coaching Institute | how to start online test series | T1 |
| J2 ☐ | `free-test-series-as-a-lead-magnet-for-coaching-institutes` | A Free Test Series as a Lead Magnet for Your Coaching Institute | lead magnet coaching institute | T1 |
| J3 ☐ | `how-to-get-students-for-your-coaching-institute-online` | How to Get Students for Your Coaching Institute Online (Without Paid Ads) | how to get students for coaching institute | T1 |
| J4 ☐ | `how-to-market-a-coaching-institute-on-whatsapp` | How to Market a Coaching Institute on WhatsApp Without Spamming PDFs | coaching institute whatsapp marketing | T2 |
| J5 ☐ | `how-to-build-a-brand-as-an-independent-educator` | How to Build a Brand as an Independent Educator With Free Mock Tests | independent teacher online brand | T2 |
| J6 ☐ | `how-youtube-educators-can-add-a-test-series` | How YouTube Educators Can Add a Test Series to Their Channel | test series for youtube channel | T1 |
| J7 ☐ | `telegram-admins-from-pdf-dumps-to-real-mock-tests` | For Telegram Channel Admins: From PDF Dumps to Real Mock Tests | telegram channel mock test | T2 |
| J8 ☐ | `verified-creator-badge-what-it-means-and-how-to-get-it` | The Verified Creator Badge: What It Means and How to Get It | mocksetu verified creator | T3 |
| J9 ☐ | `how-to-name-and-describe-mock-tests-so-students-find-them` | How to Name and Describe Your Mock Tests So Students Find Them | mock test naming | T2 |
| J10 ☐ | `how-publishing-previous-year-papers-brings-students` | How Publishing Previous Year Papers Brings Students to Your Institute | previous year papers coaching marketing | T2 |
| J11 ☐ | `how-to-run-a-free-scholarship-test-online` | How to Run a Free Scholarship Test Online for Admissions | scholarship test for coaching institute | T1 |
| J12 ☐ | `how-to-run-an-all-india-open-mock-test` | How to Run an All-India Open Mock Test | all india mock test organize | T2 |
| J13 ☐ | `how-to-retain-students-with-weekly-tests` | How to Retain Students With Weekly Tests and Visible Progress | student retention coaching institute | T2 |
| J14 ☐ | `how-to-handle-answer-key-disputes-with-students` | How to Handle Answer Key Disputes With Students | answer key dispute | T3 |
| J15 ☐ | `how-small-town-coaching-institutes-compete-with-edtech` | How Small-Town Coaching Institutes Compete With National EdTech Brands | coaching institute vs edtech | T2 |
| J16 ☐ | `how-to-price-coaching-batches-when-tests-are-free` | How to Price Coaching Batches When Your Tests Are Free | coaching fees pricing strategy | T3 |
| J17 ☐ | `google-business-profile-and-free-mock-tests-local-seo` | Google Business Profile and Free Mock Tests: Local SEO for Institutes | coaching institute local seo | T2 |
| J18 ☐ | `student-data-privacy-for-coaching-institutes-dpdp` | Student Data Privacy for Coaching Institutes: What the DPDP Act Expects | dpdp act coaching institute | T3 |
| J19 ☐ | `how-to-onboard-a-batch-onto-an-online-test-platform` | How to Onboard a Batch of 200 Students Onto an Online Test Platform | onboard students online test | T2 |
| J20 ☐ | `test-series-calendar-around-the-notification-cycle` | Planning a Test Series Calendar Around the Notification Cycle | test series schedule planning | T2 |

### K. School teachers and formative assessment (10)

Shared links: siblings within K; C1/C8; E32/E33. Cluster tag: `"School Teachers"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| K1 ☐ | `how-school-teachers-can-create-online-unit-tests` | How School Teachers Can Create Online Unit Tests | online unit test | T1 |
| K2 ☐ | `formative-vs-summative-assessment-with-online-quizzes` | Formative vs Summative Assessment With Online Quizzes | formative vs summative assessment | T2 |
| K3 ☐ | `online-quizzes-for-homework-who-actually-did-it` | Online Quizzes for Homework: Knowing Who Actually Did It | online homework quiz | T2 |
| K4 ☐ | `how-to-run-a-class-test-when-students-share-devices` | How to Run a Class Test When Students Share Devices | one device per two students quiz | T3 |
| K5 ☐ | `online-tests-for-low-bandwidth-classrooms` | Online Tests for Low-Bandwidth Classrooms: What Works | low bandwidth online quiz | T2 |
| K6 ☐ | `how-to-introduce-cbt-practice-in-class-9-and-10` | How to Introduce CBT Practice in Class 9 and 10 | cbt practice for school students | T2 |
| K7 ☐ | `live-quiz-to-open-a-lesson-retrieval-practice` | A Live Quiz to Open a Lesson: Retrieval Practice That Takes 4 Minutes | retrieval practice quiz | T3 |
| K8 ☐ | `inter-house-quiz-competition-online` | How to Run an Inter-House Quiz Competition Online | school quiz competition online | T3 |
| K9 ☐ | `competency-based-questions-for-cbse-pattern` | Competency-Based Questions for the CBSE Pattern: How to Write Them | competency based questions cbse | T1 |
| K10 ☐ | `what-to-share-with-parents-after-an-online-test` | What to Share With Parents After an Online Test | parent communication test results | T3 |

### L. Integrity, operations and troubleshooting (12)

Shared links: siblings within L; D12; `/json-upload-guide` for upload errors (never
re-document them). Cluster tag: `"Operations"`. Rule: no proctoring exists — L1/L2
are honest about that and about when an institute genuinely needs a proctoring
vendor.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| L1 ☐ | `how-to-reduce-cheating-in-online-tests-without-proctoring` | How to Reduce Cheating in Online Tests Without Proctoring Software | prevent cheating online test | T1 |
| L2 ☐ | `should-coaching-institutes-use-online-proctoring` | Should Coaching Institutes Use Online Proctoring for Mock Tests? | online proctoring for coaching | T2 |
| L3 ☐ | `what-happens-when-a-student-loses-internet-during-an-online-test` | What Happens When a Student Loses Internet During an Online Test | internet disconnected during online exam | T2 |
| L4 ☐ | `how-to-handle-late-joiners-in-a-live-exam` | How to Handle Late Joiners in a Live Exam | late students live quiz | T3 |
| L5 ☐ | `online-test-day-checklist-for-teachers` | Online Test Day Checklist for Teachers | online exam checklist for teachers | T2 |
| L6 ☐ | `how-to-run-a-mock-test-for-hundreds-of-students-at-once` | How to Run a Mock Test for Hundreds of Students at Once | online test for large number of students | T2 |
| L7 ☐ | `how-to-edit-a-published-test-without-confusing-students` | How to Edit a Published Test Without Confusing Students | edit quiz after publishing | T3 |
| L8 ☐ | `instruction-drift-when-your-instructions-and-paper-disagree` | Instruction Drift: When Your Instructions and Your Paper Disagree | exam instructions mismatch | T3 |
| L9 ☐ | `what-students-see-after-submitting-an-online-test` | What Students See After Submitting an Online Test (Review, Score, Analytics) | students review answers after quiz | T2 |
| L10 ☐ | `can-students-take-a-mock-test-on-a-phone` | Can Students Take a Mock Test on a Phone? What Changes vs Desktop | mock test on mobile | T2 |
| L11 ☐ | `deleting-old-tests-and-what-happens-to-student-data` | Deleting Old Tests: What Happens to Attempts and Student Data | delete quiz student responses | T3 |
| L12 ☐ | `how-to-duplicate-a-test-for-a-new-batch` | How to Duplicate a Test for a New Batch or Session | copy quiz for another class | T3 |

### M. Templates and references (10)

Shared links: siblings within M; A3; G2. Cluster tag: `"Templates"`. Templates are
plain text inside `p`/`ul` blocks (the blog has no code block type); keep them
copy-pasteable.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| M1 ☐ | `online-exam-instructions-template-for-students` | Online Exam Instructions Template for Students (Copy, Adapt, Publish) | exam instructions sample | T1 |
| M2 ☐ | `mock-test-format-for-competitive-exams-reference` | Mock Test Format for Competitive Exams: A Paper Setter's Reference | mock test format | T1 |
| M3 ☐ | `question-paper-format-for-computer-based-tests` | Question Paper Format for Computer-Based Tests | cbt question paper format | T2 |
| M4 ☐ | `general-instructions-templates-for-ssc-bank-and-railway-mocks` | General Instructions Templates for SSC, Bank and Railway-Style Mocks | general instructions for exam sample | T2 |
| M5 ☐ | `weekly-test-schedule-template-for-coaching-batches` | Weekly Test Schedule Template for Coaching Batches | test schedule template | T2 |
| M6 ☐ | `answer-key-format-that-imports-cleanly` | An Answer Key Format That Imports Cleanly Every Time | answer key format | T3 |
| M7 ☐ | `test-series-announcement-templates-for-whatsapp-and-telegram` | Test Series Announcement Templates for WhatsApp and Telegram | test announcement message sample | T2 |
| M8 ☐ | `result-announcement-and-discussion-class-templates` | Result Announcement and Discussion Class Templates | result announcement message to students | T3 |
| M9 ☐ | `glossary-of-online-exam-terms-for-educators` | Glossary of Online Exam Terms for Educators | online exam terminology | T3 |
| M10 ☐ | `student-briefing-template-before-their-first-online-mock` | Student Briefing Template Before Their First Online Mock | instructions before online exam for students | T3 |

### N. Technical question types and formatting (12)

Shared links: siblings within N; B7/B8. Cluster tag: `"Question Formatting"`.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| N1 ☐ | `how-to-add-math-equations-to-online-test-questions` | How to Add Math Equations (LaTeX) to Online Test Questions | latex in online quiz | T1 |
| N2 ☐ | `how-to-add-chemical-equations-and-structures-to-online-tests` | How to Add Chemical Equations and Structures to Online Tests | chemistry equations online quiz | T2 |
| N3 ☐ | `how-to-add-images-to-mcq-options` | How to Add Images to MCQ Options | image options mcq online | T2 |
| N4 ☐ | `how-to-create-passage-based-question-sets-online` | How to Create Passage-Based Question Sets Online | passage based questions online test | T2 |
| N5 ☐ | `how-to-create-multi-correct-mcqs-online` | How to Create Multi-Correct MCQs Online | multiple correct answers quiz | T2 |
| N6 ☐ | `numerical-value-questions-in-online-tests` | Numerical-Value and Integer Questions in Online Tests: What Works Today | numerical answer type online test | T2 |
| N7 ☐ | `how-to-add-tables-and-charts-to-questions` | How to Add Tables and Charts to Questions | table in quiz question | T3 |
| N8 ☐ | `how-to-snip-questions-from-a-pdf-instead-of-retyping` | How to Snip Questions From a PDF Instead of Retyping Them | crop question from pdf to quiz | T2 |
| N9 ☐ | `diagram-heavy-physics-and-biology-questions-online` | Diagram-Heavy Physics and Biology Questions Online: A Workflow | diagram questions online test | T3 |
| N10 ☐ | `how-to-reorder-and-renumber-questions-and-sections` | How to Reorder and Renumber Questions and Sections | reorder quiz questions | T3 |
| N11 ☐ | `superscripts-subscripts-and-units-in-online-questions` | Superscripts, Subscripts and Units in Online Questions | superscript in quiz question | T3 |
| N12 ☐ | `how-to-preview-a-question-exactly-as-students-see-it` | How to Preview a Question Exactly as Students Will See It | preview quiz as student | T3 |

### O. Definitions (6)

Shared links: the how-to article each definition points to. Cluster tag: `"Basics"`.
Kept deliberately small — definitional pages collide with the how-tos fast.

| # | slug | working title | primary query | tier |
|---|---|---|---|---|
| O1 ☐ | `what-is-a-computer-based-test-cbt-for-teachers` | What Is a Computer-Based Test (CBT)? A Teacher's Explainer | what is cbt exam | T2 |
| O2 ☐ | `exam-simulator-vs-quiz-whats-the-difference` | Exam Simulator vs Quiz: What's the Difference? | what is an exam simulator | T2 |
| O3 ☐ | `what-is-a-test-series-and-how-institutes-run-one` | What Is a Test Series, and How Do Coaching Institutes Run One? | what is test series | T2 |
| O4 ☐ | `what-is-a-question-bank` | What Is a Question Bank, and Why Every Institute Needs One | what is question bank | T3 |
| O5 ☐ | `what-makes-a-mock-test-realistic` | What Makes a Mock Test Realistic? A Fidelity Checklist for Creators | realistic mock test | T2 |
| O6 ☐ | `what-is-a-live-quiz-and-how-does-it-work` | What Is a Live Quiz, and How Does It Work in a Classroom? | what is live quiz | T3 |

**Count:** A15 + B12 + C16 + D12 + E36 + F20 + G10 + H8 + I15 + J20 + K10 + L12 + M10
+ N12 + O6 = **214**.

---

## 9. Cluster P — Hindi articles (12, Phase 3, not counted above)

Blocked on Step 0 item 6 (`lang` field). Devanagari bodies, Hinglish slugs (that is
what the query looks like), `inLanguage: hi-IN`, CTA to `/hindi/for-creators`.
These twelve are the highest-volume Hindi creator queries and the ones the
`/hindi/for-creators` keyword list already promises.

| # | slug | title | query |
|---|---|---|---|
| P1 ☐ | `online-test-kaise-banaye` | ऑनलाइन टेस्ट कैसे बनाएं — कोचिंग और टीचर्स के लिए पूरी गाइड | online test kaise banaye |
| P2 ☐ | `mock-test-kaise-banaye` | मॉक टेस्ट कैसे बनाएं — PDF से CBT तक | mock test kaise banaye |
| P3 ☐ | `test-series-kaise-banaye` | टेस्ट सीरीज़ कैसे बनाएं और चलाएँ | test series kaise banaye |
| P4 ☐ | `pdf-se-online-test-kaise-banaye` | PDF से ऑनलाइन टेस्ट कैसे बनाएं | pdf se online test kaise banaye |
| P5 ☐ | `coaching-ke-liye-free-online-exam-software` | कोचिंग के लिए फ्री ऑनलाइन एग्ज़ाम सॉफ्टवेयर — क्या देखें | online exam software hindi |
| P6 ☐ | `negative-marking-wala-online-test-kaise-banaye` | नेगेटिव मार्किंग वाला ऑनलाइन टेस्ट कैसे बनाएं | negative marking test kaise banaye |
| P7 ☐ | `class-me-live-quiz-kaise-karaye` | क्लास में मोबाइल से लाइव क्विज़ कैसे कराएँ | live quiz kaise karaye |
| P8 ☐ | `ssc-mock-test-kaise-banaye` | SSC मॉक टेस्ट कैसे बनाएं (CGL, CHSL, MTS, GD) | ssc mock test kaise banaye |
| P9 ☐ | `whatsapp-pdf-vs-online-mock-test` | WhatsApp PDF बनाम ऑनलाइन मॉक टेस्ट — स्टूडेंट्स क्या खोते हैं | whatsapp pdf test |
| P10 ☐ | `google-forms-se-test-banane-ki-dikkatein` | Google Forms से टेस्ट बनाने की दिक्कतें और समाधान | google forms se test kaise banaye |
| P11 ☐ | `telegram-quiz-bot-vs-exam-simulator` | Telegram क्विज़ बॉट बनाम असली एग्ज़ाम सिम्युलेटर | telegram quiz bot |
| P12 ☐ | `coaching-ke-liye-students-kaise-laye` | कोचिंग के लिए ऑनलाइन स्टूडेंट्स कैसे लाएँ — बिना ऐड बजट | coaching ke liye students kaise laye |

---

## 10. The article template and quality bar

**Hard constraints** (enforced by `generate-blog-index.mjs`; a build fails):
`content.length >= 8` · block types only `p | h2 | ul | quote` · `faqs >= 3` · slug
= filename · `publishedAt` ISO · category in the allowed set · every internal link
resolves (static paths in `KNOWN_STATIC_PATHS`, blog links to real slugs).

**Soft constraints** (warnings; fix anyway): `>= 5` h2 · `>= 1200` body words ·
`metaTitle <= 68` · `metaDescription` 120–180 · `>= 3` tags · `>= 3` internal links ·
`hero.h1 === title` · no absolute URLs in the body.

**This cluster's bar, on top of that:**

- **Length:** 1,400–2,200 words. E articles ≥1,800 (the rubric in §8-E needs it).
- **Opening:** the first paragraph answers the query in two or three sentences — a
  reader (or a snippet) that stops there still got the answer.
- **Structure:** 6–9 H2s in the reader's order of operations, one `quote` block
  with a line worth remembering, at least one `ul` of concrete steps or checks,
  4–6 FAQs phrased as a teacher would type them.
- **Links:** `/for-creators` once in the body (the tag-driven CTA adds the second);
  2–3 siblings named in the cluster header; one student-side page where natural.
  Anchor text describes the destination, never "click here".
- **Product mentions:** name MockSetu where a step is MockSetu-specific; stay
  generic where any tool would do. Every capability sentence traces to §4.1.
  Every limitation in §4.2 is stated plainly when relevant — the honesty is the
  moat against vendor blogs.
- **Metadata:** `metaTitle` = primary query first, `| MockSetu` last; description
  = query + one concrete promise; `keywords` = 6–10 comma-separated variants;
  `tags` = `["For Creators", "<cluster tag>", 2–4 topical]`; `category:
  "For Educators"`; `hero.eyebrow` = the cluster's label; `readingMinutes` =
  words ÷ 220.
- **Dates:** real `publishedAt` on the day the batch merges, **staggered across the
  batch's days** — 25 posts with one timestamp read as a dump; `updatedAt` moves
  only with a real edit.
- **Voice:** the existing posts — direct, specific, Indian context, numbers over
  adjectives, no "In today's fast-paced world".
- **Author:** `BlogPosting.author` is the Organization today. If the owner is willing
  to put a real name and credentials on the educator cluster, add a `Person` author
  with `sameAs` — a named practitioner is the single biggest E-E-A-T lever this
  cluster has, and it is a one-line change in `buildBlogPostJsonLd`. Optional.

---

## 11. Production schedule

Historical pace in this repo is 10–57 posts per commit; plan on **~25 per batch, one
batch per week, nine weeks**, Tier 1 first, E aligned to the notification calendar.
Each batch: write → `node scripts/generate-blog-index.mjs` (zero warnings) →
`npm run build` (prerender validates every output) → tick §8 → update
`CREATOR_GUIDES` → commit → push as `mazakmein-cmyk` (credential check first).

| Week | Batch | Contents (n) |
|---|---|---|
| 0 | Step 0 + pillar | §5, §6; fix the four stale JEE files; verify pillar stats |
| 1 | Batch 1 — the core | A1 A2 A3 A4 A5 A6 A10 A11 A14 · B1 B4 B9 · G1 G2 · H1 H6 · M1 M2 · N1 · I1 · K1 K9 · L1 · O5 (24) |
| 2 | Batch 2 — alternatives + growth + live | F1 F2 F3 F4 F9 F10 F11 F18 · J1 J2 J3 J6 J11 · C1 C2 C12 · D1 D6 (18) |
| 3 | Batch 3 — exams in season now (Oct–Nov 2026: JEE 2027 registration, CAT, CUET prep, SSC MTS window, IBPS PO, CLAT Dec) | E1 E3 E4 E14 E10 E12 E16 E18 E25 E30 E26 E13 E15 E17 E19 E20 (16) + G3 G4 G7 G8 G10 (5) |
| 4 | Batch 4 — Tier 2 how-tos | A7 A8 A9 A12 A13 · B2 B5 B6 B7 B8 B12 · C3 C4 C5 C8 C10 · D2 D3 D4 D5 D7 D8 D10 D12 (24) |
| 5 | Batch 5 — craft, templates, bilingual | I2 I3 I4 I5 I6 I8 I10 I11 I12 I13 · M3 M4 M5 M7 · H2 H3 H7 · N2 N3 N4 N5 N6 N8 · O1 O2 O3 (26) |
| 6 | Batch 6 — growth + school + ops Tier 2 | J4 J5 J7 J9 J10 J12 J13 J15 J17 J19 J20 · K2 K3 K5 K6 · L2 L3 L5 L6 L9 L10 · F5 F6 F7 F12 F13 F16 F17 F19 (29) |
| 7 | Batch 7 — remaining exams (GATE Feb, UPSC May, defence Apr, state exams) | E2 E5 E6 E7 E8 E9 E11 E21 E22 E23 E24 E27 E28 E29 E31 E32 E33 E34 E35 E36 (20) |
| 8 | Batch 8 — long tail | A15 · B3 B10 B11 · C6 C7 C9 C11 C13 C14 C15 C16 · D9 D11 · F8 F14 F15 F20 · G5 G6 G9 · H4 H5 H8 (24) |
| 9 | Batch 9 — long tail, close-out | I7 I9 I14 I15 · J8 J14 J16 J18 · K4 K7 K8 K10 · L4 L7 L8 L11 L12 · M6 M8 M9 M10 · N7 N9 N10 N11 N12 · O4 O6 (28) |
| 10+ | Phase 2 / 3 | category hub if ≥60 posts justify it; `lang` field; cluster P |

Total scheduled: 24+18+21+24+26+29+20+24+28 = 214 — every inventory ID appears in
exactly one week (a few sit in their natural week rather than strictly by tier).
Script-checked on 2026-10-03 against §8, the schedule, the existing post slugs and
every `/blog/…` reference in this document.

---

## 12. Measurement

- **Pillar:** GSC → Pages → `/for-creators`: impressions, position and CTR for the
  nine head terms in §2.1, read weekly. Target: top-20 for "online test maker for
  coaching institutes" and "create online test free" within 90 days of Batch 3;
  top-10 within 180.
- **Spokes:** GA4 `content_group = "For Educators"` (Step 0 item 7) as one line;
  GSC regex on the slug list for per-cluster reads. Target: ≥40% of Tier-1 posts
  holding at least one top-20 query by day 60 after publish; any post with zero
  impressions at day 45 gets its title and opening rewritten before anything new is
  added to that cluster.
- **Conversion (the number that matters):** creator sign-ups → first exam created
  → first exam **published**. The admin console already lists creators; add the two
  timestamps to the weekly read. Attribute by landing page.
- **Indexing hygiene:** every new post has a prerendered file and a sitemap entry
  by construction; spot-check 5 URLs per batch with the URL Inspection tool.
- **Refresh:** re-verify §4 and the E-cluster facts every quarter and at every exam
  notification; bump `updatedAt` only for real changes. Retire or merge any two
  posts that GSC shows competing for the same query (same page swapping in and out)
  — that is cannibalisation showing up late.

---

## 13. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| E cluster reads as 36 templates and gets demoted as a set | §8-E rubric; ≥1,800 words; unique facts table, instruction block, mistakes, and demand per exam; ship in two waves so the first wave's GSC data can veto the second |
| Competitor-naming articles age or misstate a feature | Capability classes not prices; no URLs; quarterly re-check; honest "they do X better" sections |
| Capacity claims collide with the free tier | No number is printed without the owner's sign-off; L6 frames async mocks, not live, for large batches |
| AI PDF import over-promised | Universal route = prompt + JSON; AI import described as "for selected creators" everywhere |
| Hindi articles under `en-IN` | None ship before the `lang` field (Step 0 item 6) |
| FAQ rich results assumed | Treated as entity/AI-overview hygiene, not a CTR lever |
| "Keep reading" rail is weak for a 200-post category | In-body sibling links are mandatory; pillar `guides` rotates to the strongest spokes |
| Volume estimates are wrong | Tier-1 validated in Keyword Planner/GSC before Tier 2; Ahrefs connector re-rank once authorised |
| Stale product stats on the pillar | Verified in Week 0 and at each quarterly refresh |
