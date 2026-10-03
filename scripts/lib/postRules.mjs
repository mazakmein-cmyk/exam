/**
 * postRules.mjs — what makes a blog post valid, in one place.
 *
 * WHY THIS WAS EXTRACTED
 * ----------------------
 * These rules used to live inside generate-blog-index.mjs, which is a script
 * that WRITES three shared files (blogIndex.ts, sitemap.xml, feed.xml) as its
 * normal side effect. That is fine for a human running it once, and actively
 * dangerous when several agents validate their own new articles at the same
 * time: every one of them rewrites the same three files, and the last writer
 * wins with whatever partial view of the posts directory it happened to see.
 *
 * Pulling the rules out lets `check-post.mjs` validate a single article and
 * write nothing at all, while the generator keeps using the exact same
 * function — so a pre-flight check cannot pass something the real build then
 * rejects. A second hand-maintained copy of these thresholds is precisely the
 * drift this repo avoids everywhere else (see structuredData.ts for the same
 * argument about head metadata).
 *
 * ERRORS fail the build. WARNINGS do not, but every one of them is a real SEO
 * or quality defect and should be fixed before publishing.
 */
import path from "node:path";

export const CATEGORIES = new Set([
  "Exam Strategy",
  "Study Plans",
  "Mock Test Guide",
  "Exam Guides",
  "Study Science",
  "Placement Prep",
  "For Educators",
  "Board Exams",
  "Career Guidance",
]);

/**
 * Non-article internal destinations an article body may link to.
 *
 * A path that is not here and not /blog/<real-slug> is a hard ERROR, because
 * it is either a typo or a link to a route that does not exist — both of which
 * ship a dead link to a reader and a crawler.
 *
 * Deliberately absent: /auth, /dashboard, /analytics and the other private
 * routes. They are robots-disallowed and noindexed, so an article linking to
 * one passes no authority and sends a reader to a login wall.
 */
export const KNOWN_STATIC_PATHS = new Set([
  "/",
  "/marketplace",
  "/for-creators",
  "/student-auth",
  "/blog",
  "/json-upload-guide",
  "/mock-test/jee-main",
  "/mock-test/neet-ug",
  "/mock-test/cat",
  "/mock-test/gate",
  "/mock-test/upsc-prelims",
  // SSC MTS hub. Articles in the SSC MTS cluster link here by design, so this
  // path must be whitelisted or every one of them fails link validation.
  "/ssc-mts",
  // The Hindi twins of the two landing pages. The creator cluster links to
  // /hindi/for-creators from its bilingual articles, and those are real
  // indexable routes with their own prerendered output.
  "/hindi",
  "/hindi/for-creators",
]);

/** Slugs that existed before posts/ and still live in src/data/blogPosts.ts. */
export const LEGACY_SLUGS = [
  "how-to-take-mock-tests",
  "jee-main-vs-jee-advanced",
  "best-mock-test-strategy-for-cat",
];

/** Body word count, with inline [anchor](/path) link syntax reduced to its anchor text. */
export function wordCount(post) {
  return post.content.reduce((acc, b) => {
    const text = b.type === "ul" ? (b.items || []).join(" ") : b.text || "";
    return acc + text.replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, "$1").split(/\s+/).filter(Boolean).length;
  }, 0);
}

/**
 * Validate one post.
 *
 * @param post     the module's default export
 * @param file     its filename, e.g. "how-to-create-an-online-test.ts"
 * @param allSlugs Set of every slug that exists, for sibling-link checking
 * @returns {{errors: string[], warnings: string[]}} — pure; nothing is written
 *          and no module state is mutated, which is what makes it safe to call
 *          concurrently from several processes.
 */
export function validatePost(post, file, allSlugs) {
  const errors = [];
  const warnings = [];
  const e = (msg) => errors.push(`${file}: ${msg}`);
  const w = (msg) => warnings.push(`${file}: ${msg}`);

  if (!post || typeof post !== "object") {
    e("no default export object");
    return { errors, warnings };
  }

  const strFields = [
    "slug",
    "title",
    "metaTitle",
    "metaDescription",
    "keywords",
    "excerpt",
    "publishedAt",
    "updatedAt",
  ];
  for (const f of strFields) {
    if (typeof post[f] !== "string" || !post[f].trim()) e(`missing/empty field: ${f}`);
  }
  if (typeof post.readingMinutes !== "number") e("readingMinutes must be a number");
  if (!CATEGORIES.has(post.category)) e(`invalid category: ${post.category}`);
  if (!Array.isArray(post.tags) || post.tags.length < 3) w("fewer than 3 tags");
  if (!post.hero || !post.hero.h1 || !post.hero.lede || !post.hero.eyebrow) e("hero incomplete");
  else if (post.hero.h1 !== post.title) w("hero.h1 !== title");
  if (post.slug !== path.basename(file, ".ts")) e(`slug "${post.slug}" does not match filename`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt || "")) e("publishedAt not ISO yyyy-mm-dd");

  if (!Array.isArray(post.content) || post.content.length < 8) {
    e("content too short");
  } else {
    for (const b of post.content) {
      if (!["p", "h2", "ul", "quote"].includes(b.type)) e(`invalid block type: ${b.type}`);
    }
    const h2s = post.content.filter((b) => b.type === "h2").length;
    if (h2s < 5) w(`only ${h2s} h2 sections`);
    const words = wordCount(post);
    if (words < 1200) w(`body only ${words} words`);
  }

  if (!Array.isArray(post.faqs) || post.faqs.length < 3) e("fewer than 3 FAQs");
  if (post.metaTitle && post.metaTitle.length > 68) w(`metaTitle ${post.metaTitle.length} chars`);
  const md = post.metaDescription ? post.metaDescription.length : 0;
  if (md && (md < 120 || md > 180)) w(`metaDescription ${md} chars`);

  // Internal links.
  const body = JSON.stringify(post.content);
  const links = [...body.matchAll(/\]\((\/[^)\s"]*)\)/g)].map((m) => m[1]);
  if (links.length < 3) w(`only ${links.length} internal links`);
  for (const l of links) {
    if (KNOWN_STATIC_PATHS.has(l)) continue;
    if (l.startsWith("/blog/")) {
      const s = l.slice(6);
      // A link to a sibling article that failed to generate is low-risk (soft
      // 404), so warn rather than fail the whole build.
      if (!allSlugs.has(s) && !LEGACY_SLUGS.includes(s)) {
        w(`internal blog link to missing slug: ${l}`);
      }
      continue;
    }
    e(`broken internal link: ${l}`);
  }
  if (/https?:\/\//.test(body)) w("contains an absolute/external URL in body");

  return { errors, warnings };
}
