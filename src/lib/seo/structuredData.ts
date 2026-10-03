/**
 * Single source of truth for head metadata and JSON-LD.
 *
 * This module is deliberately plain TypeScript with no JSX, no DOM access and
 * no runtime-only imports, because it is consumed from TWO places:
 *
 *   1. The React app at runtime — SEO.tsx, BlogPost.tsx, ExamLandingPage.tsx.
 *   2. `scripts/prerender.mjs` at build time, running in Node.
 *
 * That second consumer is the whole reason it exists. The prerenderer writes
 * the same title, description and structured data into the static HTML that
 * the app would inject on mount, and if the two were computed from separate
 * copies of this logic they would drift — silently, and in the direction that
 * is hardest to notice, since the runtime version is the one you see in
 * devtools and the static version is the one crawlers actually read.
 *
 * Keep it importable from Node: type-only imports are fine (the prerenderer
 * strips import lines before evaluating), but a value import of anything with
 * a browser dependency will break the build step.
 */
import type { BlogPost } from "@/data/blogPosts";
import type { ExamLanding } from "@/data/examLandingPages";

export const SITE_URL = "https://mocksetu.in";

/**
 * Social share card. 1200x630, opaque, a real PNG.
 *
 * These three properties are the whole reason it is a separate file from the
 * logo. It previously pointed at /mocksetu-logo.png, which is a 1024x1024 JPEG
 * carrying a .png extension — square, so `summary_large_image` centre-cropped
 * it; and mis-declared as 1200x630 in index.html, which is the kind of
 * disagreement a platform resolves by dropping the image. A square brand logo
 * is the wrong asset for a share card no matter how it is encoded.
 *
 * Exported from brand/svg via brand/png/mocksetu-og-1200x630.png. The filename
 * is deliberately new rather than a replacement: platforms cache OG images by
 * URL, so reusing the old path would have kept serving the cached square.
 */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Organisation logo for structured data — square, transparent, 1024x1024.
 *
 * Distinct from the share card on purpose: schema.org `logo` wants the mark
 * itself, while og:image wants a landscape card. Using one file for both is what
 * produced a cropped share preview.
 */
export const BRAND_LOGO = `${SITE_URL}/mocksetu-logo-square.png`;
export const BRAND_LOGO_SIZE = 1024;

/** Attribute marking a head tag as owned by SEO.tsx, so it can be reclaimed. */
export const MANAGED_TAG_ATTR = "data-mocksetu-seo";

export const ROBOTS_INDEX =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const ROBOTS_NOINDEX = "noindex, nofollow";

/**
 * Brand-alternate keyword tail appended to every page's <meta name="keywords">.
 * This reinforces "mockset" (a common misspelling / alternate query of MockSetu)
 * as a brand synonym across the entire site without polluting page-specific copy.
 * Pages can still pass their own topical keywords via the `keywords` prop.
 */
export const BRAND_KEYWORD_TAIL =
  "MockSetu, Mockset, mockset, mock setu, mockset app, mockset login, mockset mock test, mockset exam simulator";

export const mergeKeywords = (pageKeywords?: string): string => {
  if (!pageKeywords) return BRAND_KEYWORD_TAIL;
  // De-dupe naively against the brand tail to avoid stuffing the same token twice.
  const lower = pageKeywords.toLowerCase();
  if (lower.includes("mockset") && lower.includes("mocksetu")) return pageKeywords;
  return `${pageKeywords}, ${BRAND_KEYWORD_TAIL}`;
};

/** Strip inline [text](/path) links down to their anchor text (for word counts / plain-text uses). */
export const stripLinks = (text: string): string =>
  text.replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, "$1");

/**
 * WebPage JSON-LD with isPartOf -> #website and about -> #organization (which
 * carries the MockSetu / Mockset alternateName chain). Emitted on every page
 * so search engines see a consistent brand-disambiguation signal on every URL.
 */
export const buildWebPageJsonLd = (
  url: string,
  title: string,
  description: string,
  lang: string
) => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${url}#webpage`,
  url,
  name: title,
  description,
  inLanguage: lang,
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#organization` },
  primaryImageOfPage: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE },
});

/** Word count over a post's block content, ignoring internal-link syntax. */
export const postWordCount = (p: BlogPost): number =>
  p.content.reduce((acc, b) => {
    if (b.type === "p" || b.type === "h2" || b.type === "quote")
      return acc + stripLinks(b.text).split(/\s+/).filter(Boolean).length;
    if (b.type === "ul")
      return acc + stripLinks(b.items.join(" ")).split(/\s+/).filter(Boolean).length;
    return acc;
  }, 0);

export const buildBlogPostJsonLd = (p: BlogPost): Record<string, unknown>[] => {
  const url = `${SITE_URL}/blog/${p.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      datePublished: p.publishedAt,
      dateModified: p.updatedAt,
      author: { "@type": "Organization", name: "MockSetu", url: `${SITE_URL}/` },
      publisher: {
        "@type": "Organization",
        name: "MockSetu",
        // The publisher's LOGO, not the article's share card — schema.org wants
        // the mark here, and Google's article guidance expects a logo image.
        logo: {
          "@type": "ImageObject",
          url: BRAND_LOGO,
          width: BRAND_LOGO_SIZE,
          height: BRAND_LOGO_SIZE,
        },
      },
      keywords: p.keywords,
      articleSection: p.category,
      wordCount: postWordCount(p),
      inLanguage: "en-IN",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
      ],
    },
  ];
};

export const buildExamLandingJsonLd = (exam: ExamLanding): Record<string, unknown>[] => {
  const url = `${SITE_URL}/mock-test/${exam.slug}`;
  // Only emitted when the exam actually has a cluster — an empty ItemList is a
  // worse signal than no ItemList.
  const guideList = exam.guides?.length
    ? [
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${exam.examName} Preparation Guides`,
          itemListElement: exam.guides.map((g, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: g.label,
            url: `${SITE_URL}/blog/${g.slug}`,
          })),
        },
      ]
    : [];
  return [
    ...guideList,
    {
      "@context": "https://schema.org",
      "@type": "Course",
      name: `${exam.examName} Mock Test Series — MockSetu (Mockset)`,
      alternateName: `${exam.examShort} Mockset Mock Test Series`,
      description: exam.metaDescription,
      provider: {
        "@type": "Organization",
        name: "MockSetu",
        alternateName: ["Mockset", "Mock Setu"],
        "@id": `${SITE_URL}/#organization`,
        sameAs: `${SITE_URL}/`,
      },
      url,
      educationalLevel: "Higher Education",
      inLanguage: "en-IN",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "Online",
        courseWorkload: "PT3H",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        category: "Free",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: exam.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Mock Tests", item: `${SITE_URL}/marketplace` },
        { "@type": "ListItem", position: 3, name: `${exam.examName} Mock Test`, item: url },
      ],
    },
  ];
};

/**
 * Structured data for the creator pillar, in either language.
 *
 * This moved out of ForCreators.tsx for the reason everything else in this
 * module did: the page used to build its JSON-LD inline, which meant
 * scripts/prerender.mjs could not reach it and shipped the two creator routes
 * with `jsonLd: []`. The nodes existed only after React mounted — invisible to
 * every consumer that does not run JavaScript, which is the exact failure the
 * prerenderer was written to end. One builder, both consumers.
 *
 * Parameters are structural rather than imported types on purpose. This module
 * must stay importable from Node (the prerenderer bundles it), and a structural
 * signature keeps it from depending on the i18n or data layers.
 *
 * Emits at most four nodes:
 *   WebPage        — the page itself, tied into the brand graph, audience Educator
 *   BreadcrumbList — Home > this page, in the page's own language
 *   FAQPage        — the pillar's own FAQ, and the only FAQPage on this URL
 *                    (index.html's homepage FAQPage is stripped from every route
 *                    but `/`, so there is no second node to collide with)
 *   ItemList       — the guides this hub links out to
 *
 * FAQPage and ItemList are omitted entirely when their arrays are empty: an
 * empty list is a worse signal than no list, the same rule buildExamLandingJsonLd
 * follows for its guides.
 */
export const buildCreatorPageJsonLd = (opts: {
  /** Site-relative path of this language's page, e.g. "/for-creators". */
  path: string;
  /** Site-relative path of the student home in the SAME language. */
  homePath: string;
  title: string;
  description: string;
  /** BCP-47, e.g. "en-IN" / "hi-IN". */
  lang: string;
  breadcrumbHome: string;
  breadcrumbSelf: string;
  faqs: ReadonlyArray<{ question: string; answer: string }>;
  guides: ReadonlyArray<{ slug: string; label: string }>;
  /** Localised name for the ItemList, e.g. "Guides for Educators". */
  guidesName: string;
}): Record<string, unknown>[] => {
  const url = `${SITE_URL}${opts.path}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: opts.title,
      url,
      description: opts.description,
      inLanguage: opts.lang,
      audience: { "@type": "EducationalAudience", audienceType: "Educator" },
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      primaryImageOfPage: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: opts.breadcrumbHome,
          item: `${SITE_URL}${opts.homePath}`,
        },
        { "@type": "ListItem", position: 2, name: opts.breadcrumbSelf, item: url },
      ],
    },
    ...(opts.faqs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: opts.lang,
            mainEntity: opts.faqs.map((f) => ({
              "@type": "Question",
              name: f.question,
              acceptedAnswer: { "@type": "Answer", text: f.answer },
            })),
          },
        ]
      : []),
    ...(opts.guides.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: opts.guidesName,
            itemListElement: opts.guides.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: g.label,
              url: `${SITE_URL}/blog/${g.slug}`,
            })),
          },
        ]
      : []),
  ];
};
