/**
 * Head metadata for the hand-built pages — the ones whose content is JSX rather
 * than a data module.
 *
 * These live here rather than inline in the page for one reason:
 * scripts/prerender.mjs needs them at build time to write the static <head>, and
 * it cannot read a value out of a TSX literal. Previously the prerenderer kept
 * its own copy of these strings guarded by a title-comparison check, which
 * caught a renamed title but silently tolerated a drifted description or
 * keyword list. Now there is one copy and nothing to drift.
 *
 * Page-specific JSON-LD deliberately stays in the page component: it is large,
 * it is genuinely presentational in places, and it is the part crawlers get from
 * rendering rather than from the first byte.
 *
 * Adding a page here does NOT prerender it — add the key to STATIC_ROUTES in
 * scripts/prerender.mjs as well.
 */
export type StaticPageSeo = {
  title: string;
  description: string;
  path: string;
  keywords?: string;
};

export const STATIC_PAGE_SEO = {
  blog: {
    title: "MockSetu (Mockset) Blog — Mock Test Strategy, Exam Guides & Study Plans",
    description:
      "In-depth MockSetu (Mockset) guides on mock test strategy, exam preparation, and study plans for JEE, NEET, CAT, GATE, and UPSC aspirants. Written for serious students who want to actually rank.",
    path: "/blog",
    keywords:
      "mockset blog, MockSetu blog, exam preparation blog, mock test strategy blog, JEE preparation, NEET preparation, CAT preparation, GATE preparation, UPSC preparation, study plan, mockset study plan, SSC CGL preparation, bank PO preparation, CUET preparation, CLAT preparation, study techniques, placement preparation blog",
  },

  /**
   * SSC MTS cluster pillar.
   *
   * Title leads with the exact target phrase and stays under ~60 chars so it is
   * not truncated in the SERP (53 chars). "2024" is in the title because
   * "2024 ssc mts paper" is a target query in its own right, and the year is the
   * CTR trigger — it reads as "the actual paper", not a practice set. "PYQ"
   * stays because that is what aspirants actually type; it outranks "last year
   * paper" in real Indian search volume.
   *
   * Description is 150 chars — under the ~160 Google renders before truncating.
   * "last year paper" carries that query cluster; "free" + "real shifts" +
   * "actual exam screen" are the click triggers.
   */
  sscMts: {
    title: "SSC MTS Previous Year Paper 2024 — Free PYQ Mock Test",
    description:
      "Attempt every SSC MTS last year paper free — real 2024 & 2023 shifts on the actual exam screen, timed, with correct negative marking. Hindi & English.",
    path: "/ssc-mts",
    keywords:
      "SSC MTS previous year question paper, SSC MTS previous year paper, SSC MTS PYQ, SSC MTS last year paper, last year paper for SSC MTS, last year paper for SSC, 2024 SSC MTS paper, SSC MTS paper 2024, SSC MTS question paper, SSC MTS previous year paper in hindi, SSC MTS previous year paper pdf, SSC MTS 2024 question paper, SSC MTS 2023 question paper, SSC MTS mock test, SSC MTS mock test free, SSC MTS online test series, SSC MTS practice set, SSC MTS Havaldar previous year paper, SSC MTS exam pattern, SSC MTS syllabus, SSC MTS 2026, SSC MTS notification 2026, SSC MTS exam date 2026, SSC MTS vacancy 2026, SSC MTS apply online, SSC MTS full form, Multi Tasking Staff, SSC MTS salary, SSC MTS cut off, SSC MTS admit card, SSC MTS answer key, SSC MTS free online test",
  },

  marketplace: {
    title: "Free Mock Test Library — JEE, NEET, CAT, GATE, UPSC | MockSetu (Mockset)",
    description:
      "Browse the MockSetu (Mockset) free mock test library. Timed JEE, NEET, CAT, GATE & UPSC mocks with answer keys, instant scoring, and deep analytics. Practice unlimited online mock tests on the leading online assessment platform.",
    path: "/marketplace",
    keywords:
      "mockset, MockSetu marketplace, mockset library, mock test library, free mock tests, online test series, JEE mock test, NEET mock test, CAT mock test, GATE mock test, UPSC mock test, exam practice papers, MCQ practice, online assessment platform, coding assessment library, aptitude preparation",
  },

  jsonUploadGuide: {
    title: "JSON Upload Guide | MockSetu",
    description:
      "Step-by-step guide for creators: convert your exam PDF into JSON using your own AI, then upload to MockSetu in a few minutes.",
    path: "/json-upload-guide",
  },

  privacyPolicy: {
    title: "Privacy Policy | MockSetu",
    description:
      "Read MockSetu's privacy policy — how we collect, use, and protect student and creator data on our free mock test and exam simulator platform.",
    path: "/privacy-policy",
  },

  termsOfService: {
    title: "Terms of Service | MockSetu",
    description:
      "Read MockSetu's terms of service — the rules and guidelines for using our free mock test platform and exam simulator for JEE, NEET, CAT, GATE, and UPSC.",
    path: "/terms-of-service",
  },
} satisfies Record<string, StaticPageSeo>;

/** Hero copy for the prerendered shell of pages whose body cannot be derived. */
export const STATIC_PAGE_HERO: Record<string, { h1: string; lede: string; breadcrumb: string }> = {
  "/blog": {
    h1: "Mock Test Strategy & Exam Guides",
    lede:
      "In-depth guides on mock test strategy, exam preparation and study plans for JEE, NEET, CAT, GATE, UPSC and SSC aspirants.",
    breadcrumb: "Blog",
  },
  "/ssc-mts": {
    h1: "SSC MTS Previous Year Papers — Free PYQ Mock Tests",
    lede:
      "Attempt real SSC MTS 2024 and 2023 shifts on the actual exam screen — timed, bilingual, with correct negative marking. Completely free.",
    breadcrumb: "SSC MTS",
  },
  "/marketplace": {
    h1: "Free Mock Test Library",
    lede:
      "Timed JEE, NEET, CAT, GATE, UPSC and SSC mock tests with answer keys, instant scoring and deep analytics. Unlimited attempts, no payment.",
    breadcrumb: "Mock Tests",
  },
  "/json-upload-guide": {
    h1: "JSON Upload Guide for Creators",
    lede:
      "Convert your exam PDF into JSON using your own AI, then upload it to MockSetu in a few minutes.",
    breadcrumb: "JSON Upload Guide",
  },
  "/privacy-policy": {
    h1: "Privacy Policy",
    lede: "How MockSetu collects, uses and protects student and creator data.",
    breadcrumb: "Privacy Policy",
  },
  "/terms-of-service": {
    h1: "Terms of Service",
    lede: "The rules and guidelines for using MockSetu's free mock test platform.",
    breadcrumb: "Terms of Service",
  },
};
