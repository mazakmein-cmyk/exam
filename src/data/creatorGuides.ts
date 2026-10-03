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
  {
    slug: "how-to-create-an-online-mock-test",
    label: "How to Create an Online Mock Test",
    blurb: "The click-by-click build: sections, questions, marks, timers, publish.",
  },
  {
    slug: "convert-pdf-question-paper-to-online-test",
    label: "Convert a PDF Question Paper to an Online Test",
    blurb: "Three routes from a paper you already wrote to a paper students can sit.",
  },
  {
    slug: "best-online-test-maker-for-coaching-institutes",
    label: "Choosing an Online Test Maker",
    blurb: "A buyer's checklist for coaching institutes, including what free tiers hide.",
  },
];
