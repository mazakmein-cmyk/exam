// Generates src/data/blog/blogIndex.ts from the per-post files in src/data/blog/posts/,
// refreshes the auto-generated blog section of public/sitemap.xml, and emits public/feed.xml.
// Run: node scripts/generate-blog-index.mjs
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transform } = require("esbuild");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const POSTS_DIR = path.join(ROOT, "src", "data", "blog", "posts");
const INDEX_OUT = path.join(ROOT, "src", "data", "blog", "blogIndex.ts");
const SITEMAP = path.join(ROOT, "public", "sitemap.xml");
const FEED_OUT = path.join(ROOT, "public", "feed.xml");
const SITE = "https://mocksetu.in";

const CATEGORIES = new Set([
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

const KNOWN_STATIC_PATHS = new Set([
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
]);
const LEGACY_SLUGS = ["how-to-take-mock-tests", "jee-main-vs-jee-advanced", "best-mock-test-strategy-for-cat"];

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mocksetu-blog-"));
const errors = [];
const warnings = [];

async function importPostFile(filePath) {
  const src = readFileSync(filePath, "utf8").replace(/^import[^\n]*\n/gm, "");
  const { code } = await transform(src, { loader: "ts", format: "esm" });
  const tmpFile = path.join(tmpDir, path.basename(filePath).replace(/\.ts$/, ".mjs"));
  writeFileSync(tmpFile, code);
  return (await import(pathToFileURL(tmpFile).href)).default;
}

function wordCount(post) {
  return post.content.reduce((acc, b) => {
    const text = b.type === "ul" ? (b.items || []).join(" ") : b.text || "";
    return acc + text.replace(/\[([^\]]+)\]\(\/[^)\s]*\)/g, "$1").split(/\s+/).filter(Boolean).length;
  }, 0);
}

function validate(post, file, allSlugs) {
  const e = (msg) => errors.push(`${file}: ${msg}`);
  const w = (msg) => warnings.push(`${file}: ${msg}`);
  if (!post || typeof post !== "object") return e("no default export object");
  const strFields = ["slug", "title", "metaTitle", "metaDescription", "keywords", "excerpt", "publishedAt", "updatedAt"];
  for (const f of strFields) if (typeof post[f] !== "string" || !post[f].trim()) e(`missing/empty field: ${f}`);
  if (typeof post.readingMinutes !== "number") e("readingMinutes must be a number");
  if (!CATEGORIES.has(post.category)) e(`invalid category: ${post.category}`);
  if (!Array.isArray(post.tags) || post.tags.length < 3) w("fewer than 3 tags");
  if (!post.hero || !post.hero.h1 || !post.hero.lede || !post.hero.eyebrow) e("hero incomplete");
  else if (post.hero.h1 !== post.title) w("hero.h1 !== title");
  if (post.slug !== path.basename(file, ".ts")) e(`slug "${post.slug}" does not match filename`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt || "")) e("publishedAt not ISO yyyy-mm-dd");
  if (!Array.isArray(post.content) || post.content.length < 8) e("content too short");
  else {
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
  // Internal link validation
  const body = JSON.stringify(post.content);
  const links = [...body.matchAll(/\]\((\/[^)\s"]*)\)/g)].map((m) => m[1]);
  if (links.length < 3) w(`only ${links.length} internal links`);
  for (const l of links) {
    if (KNOWN_STATIC_PATHS.has(l)) continue;
    if (l.startsWith("/blog/")) {
      const s = l.slice(6);
      // A link to a sibling article that failed to generate is low-risk (soft 404),
      // so warn rather than fail the whole build.
      if (!allSlugs.has(s) && !LEGACY_SLUGS.includes(s)) w(`internal blog link to missing slug: ${l}`);
      continue;
    }
    e(`broken internal link: ${l}`);
  }
  if (/https?:\/\//.test(body)) w("contains an absolute/external URL in body");
}

const files = readdirSync(POSTS_DIR).filter((f) => f.endsWith(".ts")).sort();
const posts = [];
const allSlugs = new Set(files.map((f) => path.basename(f, ".ts")));

for (const f of files) {
  try {
    const post = await importPostFile(path.join(POSTS_DIR, f));
    validate(post, f, allSlugs);
    posts.push(post);
  } catch (err) {
    errors.push(`${f}: failed to load — ${err.message}`);
  }
}

const dupes = posts.map((p) => p.slug).filter((s, i, a) => a.indexOf(s) !== i);
for (const d of dupes) errors.push(`duplicate slug: ${d}`);
for (const s of LEGACY_SLUGS) if (allSlugs.has(s)) errors.push(`new post reuses legacy slug: ${s}`);

posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

// ---- Emit blogIndex.ts ----
const metaEntries = posts
  .map((p) => {
    const meta = {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      category: p.category,
      publishedAt: p.publishedAt,
      updatedAt: p.updatedAt,
      readingMinutes: p.readingMinutes,
      tags: p.tags,
    };
    return "  " + JSON.stringify(meta);
  })
  .join(",\n");

const indexSource = `// AUTO-GENERATED by scripts/generate-blog-index.mjs — do not edit by hand.
// Run \`node scripts/generate-blog-index.mjs\` after adding/editing posts in src/data/blog/posts/.
import type { BlogPost } from "@/data/blogPosts";

export type BlogMeta = Pick<
  BlogPost,
  "slug" | "title" | "excerpt" | "category" | "publishedAt" | "updatedAt" | "readingMinutes" | "tags"
>;

export const NEW_BLOG_META: BlogMeta[] = [
${metaEntries}
];
`;
writeFileSync(INDEX_OUT, indexSource);

// ---- Update sitemap.xml (idempotent, marker-based) ----
const OPEN_MARK = "  <!-- ============ Blog articles (auto-generated) ============ -->";
const CLOSE_MARK = "  <!-- ============ /Blog articles (auto-generated) ============ -->";
const urlBlock = posts
  .map(
    (p) => `  <url>
    <loc>${SITE}/blog/${p.slug}</loc>
    <lastmod>${p.updatedAt}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`
  )
  .join("\n\n");
const section = `${OPEN_MARK}\n\n${urlBlock}\n\n${CLOSE_MARK}\n`;

let sitemap = readFileSync(SITEMAP, "utf8");
if (sitemap.includes(OPEN_MARK)) {
  const start = sitemap.indexOf(OPEN_MARK);
  const end = sitemap.indexOf(CLOSE_MARK) + CLOSE_MARK.length + 1;
  sitemap = sitemap.slice(0, start) + section + sitemap.slice(end);
} else {
  sitemap = sitemap.replace("</urlset>", `${section}\n</urlset>`);
}
writeFileSync(SITEMAP, sitemap);

// ---- Emit RSS feed (new + legacy posts) ----
const legacyModule = await importPostFile(path.join(ROOT, "src", "data", "blogPosts.ts")).catch(() => null);
let legacyList = [];
try {
  const src = readFileSync(path.join(ROOT, "src", "data", "blogPosts.ts"), "utf8").replace(/^import[^\n]*\n/gm, "");
  const { code } = await transform(src, { loader: "ts", format: "esm" });
  const tmpFile = path.join(tmpDir, "legacy-blogPosts.mjs");
  writeFileSync(tmpFile, code);
  const mod = await import(pathToFileURL(tmpFile).href);
  legacyList = mod.BLOG_LIST || [];
} catch (err) {
  warnings.push(`could not load legacy posts for RSS: ${err.message}`);
}
void legacyModule;

const xmlEscape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const feedPosts = [...posts, ...legacyList].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
const rssItems = feedPosts
  .map(
    (p) => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${SITE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.publishedAt + "T09:00:00+05:30").toUTCString()}</pubDate>
      <category>${xmlEscape(p.category)}</category>
      <description>${xmlEscape(p.excerpt)}</description>
    </item>`
  )
  .join("\n");
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MockSetu Blog — Mock Test Strategy &amp; Exam Guides</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>In-depth guides on mock test strategy, exam preparation, and study plans for JEE, NEET, CAT, GATE, UPSC, SSC, banking, and placement aspirants — from MockSetu (Mockset).</description>
    <language>en-in</language>
${rssItems}
  </channel>
</rss>
`;
writeFileSync(FEED_OUT, rss);

rmSync(tmpDir, { recursive: true, force: true });

console.log(`posts: ${posts.length}`);
console.log(`blogIndex.ts written with ${posts.length} entries`);
console.log(`sitemap.xml updated (${posts.length} article URLs in auto section)`);
console.log(`feed.xml written with ${feedPosts.length} items`);
if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`);
  for (const m of warnings) console.log("  - " + m);
}
if (errors.length) {
  console.error(`\nERRORS (${errors.length}):`);
  for (const m of errors) console.error("  - " + m);
  process.exit(1);
}
console.log("\nOK");
