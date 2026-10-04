/**
 * creatorGuides.ts — the articles the creator pillar hubs into.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/for-creators` had no outbound links to a single guide. The educator
 * articles pointed at it and nothing pointed back, which is a hub in name only:
 * a pillar passes authority to its spokes as well as receiving it, and a reader
 * who is not ready to sign up has nowhere to go but away. `ExamLandingPage`
 * already solved this with its `guides` array; this is the same mechanism for a
 * hand-built page.
 *
 * It is its own module, with no value imports, for the same reason
 * `staticPageSeo.ts` is: `scripts/prerender.mjs` reads it at build time to write
 * the guide links into the static HTML, and it cannot pull a value out of a TSX
 * literal. One copy, consumed by the page and the prerenderer.
 *
 * HOW TO MAINTAIN IT
 * ------------------
 * Every slug here MUST be a real file in `src/data/blog/posts/`. A link to a
 * missing slug is a soft 404 — HTTP 200 with the homepage head, then a client
 * redirect — which is worse than no link, and nothing in the build catches it
 * for a hand-built page the way `generate-blog-index.mjs` catches it inside an
 * article body. Add an entry only once its article is written.
 *
 * Keep it to 12-18 entries and rotate it: this is the pillar's strongest
 * outbound signal, so it should point at the spokes most worth lifting in the
 * current batch, not at everything ever published. The full list lives at
 * `/blog` and the category filter, which the last card links to.
 *
 * Order is the order they render, and the order of the ItemList JSON-LD.
 *
 * See docs/creator-content-cluster.md for the cluster this serves.
 */
export type CreatorGuide = {
  /** Blog slug, without the `/blog/` prefix. Must exist in src/data/blog/posts/. */
  slug: string;
  /** Card heading. Shorter than the article's own title — this is a link, not a headline. */
  label: string;
  /** One line on what the reader gets. */
  blurb: string;
};

export const CREATOR_GUIDES: CreatorGuide[] = [
  // ── Start here ──
  {
    slug: "how-to-create-an-online-mock-test",
    label: "How to Create an Online Mock Test",
    blurb: "The click-by-click build: sections, questions, marks, timers, publish.",
  },
  {
    slug: "free-online-test-maker-for-school-teachers",
    label: "Your First Class Test, Step by Step",
    blurb: "For a school teacher who has never used one of these tools before.",
  },
  {
    slug: "how-to-make-a-question-paper-online",
    label: "How to Make a Question Paper Online",
    blurb: "Writing the paper and delivering it are two jobs. This is both.",
  },
  // ── Getting an existing paper in ──
  {
    slug: "convert-pdf-question-paper-to-online-test",
    label: "Convert a PDF Question Paper to an Online Test",
    blurb: "Three routes from a paper you already wrote to a paper students can sit.",
  },
  {
    slug: "how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json",
    label: "Turn a Paper Into Import-Ready JSON",
    blurb: "Use the AI you already pay for, and the five ways the output goes wrong.",
  },
  {
    slug: "pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test",
    label: "PDF to CBT: What Actually Has to Change",
    blurb: "What a computer-based test recovers from the page, and what it adds.",
  },
  // ── Making it behave like the real exam ──
  {
    slug: "how-to-add-negative-marking-to-an-online-test",
    label: "Add Negative Marking, per Question",
    blurb: "One paper, two marking rules — and the partial-credit settings explained.",
  },
  {
    slug: "how-to-create-a-timed-online-test-with-auto-submit",
    label: "Timed Tests and Auto-Submit",
    blurb: "A clock per section, a pooled clock, or one for the paper. Which, and why.",
  },
  {
    slug: "what-makes-a-mock-test-realistic",
    label: "What Makes a Mock Test Realistic",
    blurb: "A fidelity checklist: what is worth matching, and what is just decoration.",
  },
  {
    slug: "how-to-create-a-bilingual-hindi-english-online-test",
    label: "Bilingual Hindi-English Papers",
    blurb: "Most government exams are bilingual, so an English-only mock is not a mock.",
  },
  // ── Running it, and reading what comes back ──
  {
    slug: "how-to-conduct-an-online-exam-for-students",
    label: "Conducting the Exam: Before, During, After",
    blurb: "The operational runbook, including what you can and cannot see while it runs.",
  },
  {
    slug: "how-to-share-an-online-test-with-students",
    label: "Sharing the Test With Your Batch",
    blurb: "Links, QR codes and WhatsApp, and what a published paper really means.",
  },
  {
    slug: "how-to-reduce-cheating-in-online-tests-without-proctoring",
    label: "Reducing Cheating Without Proctoring",
    blurb: "There is none here. What actually works instead, and when you need a vendor.",
  },
  // ── Programme and reference ──
  {
    slug: "how-to-create-an-online-test-series",
    label: "From One Paper to a Test Series",
    blurb: "Shape, cadence and a calendar that works backwards from the notification.",
  },
  {
    slug: "how-to-create-a-previous-year-paper-mock-test",
    label: "Previous Year Papers, Faithfully",
    blurb: "The papers aspirants search for by name — and how to not get the key wrong.",
  },
  {
    slug: "online-exam-instructions-template-for-students",
    label: "Exam Instructions Template",
    blurb: "A complete instructions block to copy, and why drift from the paper matters.",
  },
  {
    slug: "best-online-test-maker-for-coaching-institutes",
    label: "Choosing an Online Test Maker",
    blurb: "A buyer's checklist for coaching institutes, including what free tiers hide.",
  },
];
