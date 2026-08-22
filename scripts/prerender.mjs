/**
 * Build-time prerenderer for the content routes.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app is a Vite SPA. Every page's <head> is written by SEO.tsx inside a
 * useEffect, and vercel.json rewrites every unmatched path to /index.html. So
 * before this script ran, the first byte of `/blog/jee-main-syllabus-2027` was
 * the HOMEPAGE head: homepage title, homepage description, canonical pointing
 * at `/`, homepage OpenGraph card, homepage FAQPage JSON-LD, and a homepage
 * hreflang cluster. The correct tags only appeared after React mounted.
 *
 * Googlebot renders JavaScript, so search mostly recovered. Nothing else does.
 * Twitter, WhatsApp, Slack, LinkedIn, Discord and iMessage fetch the HTML and
 * read the head as-is — which meant every shared article link rendered the
 * generic homepage card, and every FAQ/Article rich-result signal was invisible
 * to any consumer that does not execute JS.
 *
 * WHAT IT DOES
 * ------------
 * After `vite build`, it takes dist/index.html as a template and writes a
 * per-route copy to dist/<route>/index.html with:
 *   - the route's real title, description, keywords, canonical and robots
 *   - the route's real OpenGraph + Twitter card
 *   - the route's real JSON-LD (Article / FAQPage / Breadcrumb / Course / ItemList)
 *   - the homepage-only JSON-LD and hreflang set stripped out
 *   - for blog posts and exam landings, the article text rendered into #root
 *
 * Vercel checks the filesystem before applying rewrites, so dist/blog/foo/index.html
 * is served for /blog/foo and the SPA catch-all is left for genuinely dynamic
 * routes (/exam/:id, /live/:code). No vercel.json rewrite change is needed.
 *
 * WHY NOT REACT SSR
 * -----------------
 * Because it is not needed here and would be a much larger, riskier change.
 * Navbar reads Supabase auth, several pages touch window at mount, and the
 * router would need a StaticRouter pass. Meanwhile every fact these pages need
 * for SEO already lives in plain TypeScript data modules, so it can be resolved
 * in Node for the price of an esbuild transform. Head correctness is the entire
 * bug; the body is a bonus that falls out of the block-based content model.
 *
 * The prerendered body goes inside #root, which createRoot() clears on mount —
 * the standard prerender handoff. It is styled with the same Tailwind classes as
 * the runtime markup so the swap is invisible. If those classes ever drift the
 * only symptom is a brief visual difference on first paint, never a wrong page.
 *
 * Run: node scripts/prerender.mjs   (wired into `npm run build`)
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);
const DIST = path.join(ROOT, "dist");
const TEMPLATE = path.join(DIST, "index.html");
const POSTS_DIR = path.join(ROOT, "src", "data", "blog", "posts");

const errors = [];
const warnings = [];
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mocksetu-prerender-"));

/**
 * Evaluate a project .ts module in Node.
 *
 * This BUNDLES rather than stripping import lines. The earlier version deleted
 * every line starting with `import` — fine while the data modules imported only
 * types, but it failed in two ways that were easy to hit and hard to read: a
 * multi-line `import type { A, B } from ...` left dangling syntax, and a real
 * value import silently became an undefined identifier at evaluation time.
 *
 * Bundling with the same "@/" alias Vite uses resolves both properly. A genuine
 * value import now works if it is Node-safe, and fails with a real module
 * resolution error if it is not, instead of a mystery `X is not defined`.
 */
async function importTsModule(filePath, tmpName) {
  const result = await esbuild.build({
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node18",
    logLevel: "silent",
    alias: { "@": path.join(ROOT, "src") },
  });
  const tmpFile = path.join(tmpDir, tmpName);
  writeFileSync(tmpFile, result.outputFiles[0].text);
  return import(pathToFileURL(tmpFile).href);
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

/**
 * Replace a single tag matched by `re`, or insert before </head> if absent.
 * Attribute values may span lines in index.html, which is why the patterns use
 * [^>]* rather than a same-line character class — [^>] matches newlines.
 */
const upsertTag = (html, re, tag) =>
  re.test(html) ? html.replace(re, tag) : html.replace("</head>", `    ${tag}\n  </head>`);

const setTitle = (html, title) =>
  upsertTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

const setMetaName = (html, name, content) =>
  upsertTag(
    html,
    new RegExp(`<meta\\s[^>]*name=["']${name}["'][^>]*>`, "i"),
    `<meta name="${name}" content="${escapeAttr(content)}" />`
  );

const setMetaProp = (html, prop, content) =>
  upsertTag(
    html,
    new RegExp(`<meta\\s[^>]*property=["']${prop}["'][^>]*>`, "i"),
    `<meta property="${prop}" content="${escapeAttr(content)}" />`
  );

const setCanonical = (html, href) =>
  upsertTag(
    html,
    /<link\s[^>]*rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeAttr(href)}" />`
  );

/** Remove every tag matching any of `patterns`. */
const stripTags = (html, patterns) =>
  patterns.reduce((acc, re) => acc.replace(re, ""), html);

/**
 * Drop the homepage-scoped hreflang cluster.
 *
 * index.html ships one for no-JS crawlers on `/`, and SEO.tsx clears it at
 * runtime for exactly this reason: left on another URL, the page would name a
 * different URL as its English version and Google discards the whole
 * conflicting cluster. The [^>]*hreflang= guard is what spares the RSS
 * <link rel="alternate">, which carries no hreflang.
 */
const stripHreflangAlternates = (html) =>
  html.replace(/[ \t]*<link\s[^>]*rel=["']alternate["'][^>]*hreflang=[^>]*>\r?\n?/gi, "");

/**
 * Write a route's own hreflang set, replacing whatever the template carried.
 *
 * Only the bilingual pairs (`/` ↔ `/hindi`, `/for-creators` ↔
 * `/hindi/for-creators`) get one; every other route is stripped bare. The set
 * must be bidirectional and self-referential — each page listing BOTH urls
 * including itself — or Google reads the pairing as unconfirmed and may index
 * only one side. That is why these come from the same exported constant the
 * component uses rather than being rebuilt here: a hand-written second copy is
 * exactly how one side ends up missing an entry.
 */
const setAlternates = (html, alternates, siteUrl) => {
  const stripped = stripHreflangAlternates(html);
  if (!alternates?.length) return stripped;
  const links = alternates
    .map(
      ({ hrefLang, path: p }) =>
        `    <link rel="alternate" hreflang="${escapeAttr(hrefLang)}" href="${escapeAttr(
          siteUrl + p
        )}" />`
    )
    .join("\n");
  return stripped.replace("</head>", `${links}\n  </head>`);
};

/**
 * Remove homepage-only structured data by @type.
 *
 * FAQPage and SoftwareApplication in index.html describe the product and the
 * homepage's own FAQ. Carried onto an article URL, the FAQPage collides with
 * the article's own FAQPage (two competing nodes, so Google trusts neither) and
 * SoftwareApplication would assert an aggregateRating on every page of the site.
 * Organization and WebSite are @id-referenced entities and correctly sitewide,
 * so they stay.
 */
const dropJsonLdTypes = (html, types) => {
  const re = /[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\r?\n?/gi;
  return html.replace(re, (block) =>
    types.some((t) => new RegExp(`"@type"\\s*:\\s*"${t}"`).test(block)) ? "" : block
  );
};

/**
 * Inject the route's JSON-LD.
 *
 * Tagged with the same data attribute SEO.tsx uses for its own nodes, so that
 * clearManagedJsonLd() reclaims these on mount and replaces them with the
 * identical runtime payload. Without the attribute the page would end up
 * carrying two copies of every node.
 */
const injectJsonLd = (html, payloads, managedAttr) => {
  const scripts = payloads
    .map(
      (p) =>
        `    <script type="application/ld+json" ${managedAttr}="1">${serializeJsonLd(p)}</script>`
    )
    .join("\n");
  return html.replace("</head>", `${scripts}\n  </head>`);
};

/**
 * JSON-LD for embedding in an HTML <script> block.
 *
 * The `<` escape is not cosmetic. JSON.stringify emits "</script>" verbatim, and
 * inside a script element the HTML parser ends the element at the first such
 * sequence — so a post whose title or FAQ answer ever contained "</script>"
 * would truncate its own structured data and spill the remainder into the
 * document as markup. The runtime path in SEO.tsx is immune because it assigns
 * via script.text (a DOM property, never HTML-parsed); this path is the only one
 * that needs it. \u003c is valid JSON and parses back to the same string.
 */
const serializeJsonLd = (payload) =>
  JSON.stringify(payload).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

/**
 * Swap the contents of <div id="root">.
 *
 * Anchored on </body> rather than on the module <script>: Vite hoists the entry
 * script into <head> during build, so in dist/index.html there is nothing after
 * the root div except the closing tags. Walking back from </body> works whether
 * the script is hoisted or left in place.
 */
const setRootContent = (html, content) => {
  const openMatch = /<div\s[^>]*id=["']root["'][^>]*>/i.exec(html);
  const bodyIdx = html.lastIndexOf("</body>");
  if (!openMatch || bodyIdx === -1) {
    warnings.push("could not locate #root in the template — body prerender skipped");
    return html;
  }
  const contentStart = openMatch.index + openMatch[0].length;
  const closeIdx = html.lastIndexOf("</div>", bodyIdx);
  if (closeIdx === -1 || closeIdx < contentStart) {
    warnings.push("could not locate the closing tag for #root — body prerender skipped");
    return html;
  }
  return html.slice(0, contentStart) + content + html.slice(closeIdx);
};

// ── Body rendering ────────────────────────────────────────────────────────────

/** Render inline [text](/path) links the same way BlogPost.tsx's renderInline does. */
const inlineLinks = (text) =>
  escapeHtml(text).replace(
    /\[([^\]]+)\]\((\/[^)\s]*)\)/g,
    (_m, label, href) =>
      `<a href="${escapeAttr(href)}" class="text-primary font-medium underline underline-offset-4 decoration-primary/40">${label}</a>`
  );

const LEDE_CLS = "text-[16px] sm:text-[18px] text-white/55 leading-[1.7] mb-6";
const H2_CLS =
  "text-[22px] sm:text-[28px] font-black text-foreground tracking-[-0.025em] mt-10 mb-4 first:mt-0";
const P_CLS = "text-[15px] sm:text-[16.5px] text-foreground/85 leading-[1.85] mb-5";
const LI_CLS = "text-[14.5px] sm:text-[15.5px] text-foreground/80 leading-[1.75] pl-5 relative";

const renderBlocks = (content) =>
  content
    .map((b) => {
      if (b.type === "h2") return `<h2 class="${H2_CLS}">${escapeHtml(b.text)}</h2>`;
      if (b.type === "p") return `<p class="${P_CLS}">${inlineLinks(b.text)}</p>`;
      if (b.type === "quote")
        return `<blockquote class="my-8 border-l-4 border-primary/60 pl-5 py-1 italic text-[16px] sm:text-[18px] text-foreground/75 leading-[1.7]">${inlineLinks(
          b.text
        )}</blockquote>`;
      if (b.type === "ul")
        return `<ul class="space-y-2.5 mb-6 mt-2">${b.items
          .map((i) => `<li class="${LI_CLS}">${inlineLinks(i)}</li>`)
          .join("")}</ul>`;
      return "";
    })
    .join("");

/**
 * FAQs are rendered expanded here, where the runtime collapses all but the
 * first. A crawler reading the static HTML should see every answer; the runtime
 * component takes over the moment React mounts.
 */
const renderFaqs = (faqs) =>
  `<div class="mt-14 pt-10 border-t border-border/50"><h2 class="${H2_CLS}">Frequently asked</h2>` +
  `<div class="rounded-2xl border border-border/60 bg-card px-5 sm:px-7">${faqs
    .map(
      (f) =>
        `<div class="border-b border-border/50 last:border-0"><div class="py-5"><h3 class="text-[15px] sm:text-[16px] font-semibold text-foreground tracking-tight">${escapeHtml(
          f.question
        )}</h3><div class="pt-3 text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">${escapeHtml(
          f.answer
        )}</div></div></div>`
    )
    .join("")}</div></div>`;

const HERO_SECTION_CLS = "relative overflow-hidden bg-[#07091A] pt-28 pb-16 px-5";

/**
 * Stand-in for <Navbar>, which the prerendered body does not include.
 *
 * Navbar renders a fixed 60px bar plus a matching `h-[60px]` spacer on every
 * non-home route. Omitting both meant the prerendered article painted 60px too
 * high and then jumped down the moment React committed — a layout shift at the
 * very top of the viewport, which is the most expensive kind for CLS. Reserving
 * the same 60px here makes the handoff positionally identical.
 *
 * Deliberately an empty spacer rather than a fake navbar: the real one is
 * auth-aware, so prerendering its logged-out state would flash the wrong header
 * at every signed-in reader. Blank space is honest and costs nothing.
 */
const NAV_SPACER = '<div class="h-[60px]"></div>';

const renderBlogPostBody = (p) =>
  `<div class="min-h-screen bg-background">` +
  NAV_SPACER +
  `<section class="${HERO_SECTION_CLS}"><div class="relative z-10 container mx-auto max-w-3xl">` +
  `<nav aria-label="Breadcrumb" class="mb-6 flex items-center gap-2 text-[12px] text-white/40">` +
  `<a href="/">Home</a><span>/</span><a href="/blog">Blog</a><span>/</span>` +
  `<span class="text-white/60">${escapeHtml(p.category)}</span></nav>` +
  `<div class="text-[11px] font-bold tracking-widest text-amber-400/80 uppercase mb-4">${escapeHtml(
    p.hero.eyebrow
  )}</div>` +
  `<h1 class="text-[30px] sm:text-[44px] md:text-[52px] font-black text-white leading-[1.1] tracking-[-0.03em] mb-5">${escapeHtml(
    p.hero.h1
  )}</h1>` +
  `<p class="${LEDE_CLS}">${escapeHtml(p.hero.lede)}</p>` +
  `<div class="flex flex-wrap items-center gap-3 text-[12px] text-white/40">` +
  `<span>${p.readingMinutes} min read</span><span>·</span>` +
  `<time datetime="${escapeAttr(p.publishedAt)}">Published ${escapeHtml(p.publishedAt)}</time>` +
  `<span>·</span><time datetime="${escapeAttr(p.updatedAt)}">Updated ${escapeHtml(
    p.updatedAt
  )}</time></div>` +
  `</div></section>` +
  `<section class="py-12 sm:py-16 px-5"><article class="container mx-auto max-w-3xl prose-mocksetu">` +
  renderBlocks(p.content) +
  renderFaqs(p.faqs) +
  `<div class="mt-12 flex flex-wrap gap-2">${p.tags
    .map(
      (t) =>
        `<span class="px-3 py-1 rounded-full bg-secondary text-[12px] font-medium text-muted-foreground">#${escapeHtml(
          t
        )}</span>`
    )
    .join("")}</div>` +
  `</article></section></div>`;

const renderExamLandingBody = (exam) => {
  const cycle = exam.cycle ?? "";
  return (
    `<div class="min-h-screen bg-background">` +
    NAV_SPACER +
    `<section class="relative overflow-hidden bg-[#07091A] pt-28 pb-20 px-5">` +
    `<div class="relative z-10 container mx-auto max-w-4xl text-center">` +
    `<nav aria-label="Breadcrumb" class="mb-6 flex items-center justify-center gap-2 text-[12px] text-white/40">` +
    `<a href="/">Home</a><span>/</span><a href="/marketplace">Mock Tests</a><span>/</span>` +
    `<span class="text-white/60">${escapeHtml(exam.examName)}</span></nav>` +
    `<div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 mb-8">` +
    `<span class="text-[12px] font-semibold text-white/70 tracking-wide">${escapeHtml(
      exam.hero.badge
    )}</span></div>` +
    `<h1 class="text-[34px] sm:text-[48px] md:text-[60px] font-black text-white leading-[1.05] tracking-[-0.035em] mb-6">${escapeHtml(
      exam.hero.h1
    )}</h1>` +
    `<p class="text-[16px] sm:text-[18px] text-white/55 max-w-2xl mx-auto leading-[1.7] mb-10">${escapeHtml(
      exam.hero.intro
    )}</p>` +
    `<div class="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">` +
    `<a href="/student-auth" class="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-[#6C3EF4]">Start Free ${escapeHtml(
      exam.examShort
    )} Mock</a>` +
    `<a href="/marketplace" class="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white/70 border border-white/10 bg-white/[0.04]">Browse All Mocks</a>` +
    `</div></div></section>` +
    `<section class="py-16 sm:py-24 px-5 bg-background"><div class="container mx-auto max-w-3xl">` +
    `<h2 class="${H2_CLS}">${escapeHtml(exam.pattern.heading)}</h2>` +
    `<div class="overflow-x-auto"><table class="w-full text-left"><tbody>${exam.pattern.rows
      .map(
        (r) =>
          `<tr><th scope="row" class="py-3 pr-4 text-[13.5px] font-semibold text-foreground align-top">${escapeHtml(
            r.label
          )}</th><td class="py-3 text-[13.5px] text-muted-foreground">${escapeHtml(
            r.value
          )}</td></tr>`
      )
      .join("")}</tbody></table></div></div></section>` +
    `<section class="py-16 sm:py-20 px-5 bg-secondary/20"><div class="container mx-auto max-w-3xl space-y-14">${exam.sections
      .map(
        (s) =>
          `<article><h2 class="${H2_CLS}">${escapeHtml(s.heading)}</h2>` +
          `<p class="text-[15px] sm:text-[16px] text-muted-foreground leading-[1.85]">${escapeHtml(
            s.body
          )}</p>` +
          (s.bullets
            ? `<ul class="mt-5 space-y-2.5">${s.bullets
                .map(
                  (b) =>
                    `<li class="text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">${escapeHtml(
                      b
                    )}</li>`
                )
                .join("")}</ul>`
            : "") +
          `</article>`
      )
      .join("")}</div></section>` +
    `<section class="py-16 sm:py-20 px-5"><div class="container mx-auto max-w-4xl">` +
    `<h2 class="${H2_CLS}">${escapeHtml(exam.examName)} Syllabus ${escapeHtml(
      cycle || "2026"
    )}</h2><div class="grid sm:grid-cols-2 gap-5">${exam.syllabus
      .map(
        (s) =>
          `<div class="rounded-2xl border border-border/60 bg-card p-6">` +
          `<h3 class="text-[15px] font-bold text-foreground tracking-tight mb-3">${escapeHtml(
            s.subject
          )}</h3><ul class="space-y-2">${s.topics
            .map(
              (t) =>
                `<li class="text-[13px] text-muted-foreground leading-[1.65]">${escapeHtml(t)}</li>`
            )
            .join("")}</ul></div>`
      )
      .join("")}</div></div></section>` +
    (exam.guides?.length
      ? `<section class="pt-16 sm:pt-20 pb-4 px-5 bg-secondary/20"><div class="container mx-auto max-w-5xl">` +
        `<h2 class="${H2_CLS}">${escapeHtml(exam.examShort)} ${escapeHtml(
          cycle
        )} Complete Guides</h2>` +
        `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${exam.guides
          .map(
            (g) =>
              `<a href="/blog/${escapeAttr(
                g.slug
              )}" class="rounded-2xl border border-border/60 bg-card p-5 block">` +
              `<span class="text-[14.5px] font-bold text-foreground tracking-tight">${escapeHtml(
                g.label
              )}</span>` +
              `<p class="mt-2 text-[13px] text-muted-foreground leading-[1.65]">${escapeHtml(
                g.blurb
              )}</p></a>`
          )
          .join("")}</div></div></section>`
      : "") +
    `<section class="py-16 sm:py-24 px-5"><div class="container mx-auto max-w-3xl">` +
    `<h2 class="${H2_CLS}">${escapeHtml(exam.examShort)} Mock Test — FAQs</h2>` +
    `<div class="rounded-2xl border border-border/60 bg-card px-6 sm:px-8">${exam.faqs
      .map(
        (f) =>
          `<div class="border-b border-border/50 last:border-0"><div class="py-5">` +
          `<h3 class="text-[15px] sm:text-[16px] font-semibold text-foreground tracking-tight">${escapeHtml(
            f.question
          )}</h3>` +
          `<div class="pt-3 text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">${escapeHtml(
            f.answer
          )}</div></div></div>`
      )
      .join("")}</div></div></section>` +
    `<section class="py-16 px-5 bg-secondary/20"><div class="container mx-auto max-w-4xl">` +
    `<h2 class="${H2_CLS}">More Free Mock Tests</h2><div class="grid sm:grid-cols-3 gap-3">${exam.related
      .map(
        (r) =>
          `<a href="/mock-test/${escapeAttr(
            r.slug
          )}" class="rounded-xl border border-border/60 bg-card p-5 block">` +
          `<span class="text-[14px] font-semibold text-foreground tracking-tight">${escapeHtml(
            r.label
          )}</span></a>`
      )
      .join("")}</div></div></section></div>`
  );
};

/**
 * Cross-check robots.txt against sitemap.xml.
 *
 * Listing a URL in the sitemap says "please index this". Disallowing it in
 * robots.txt says "do not even fetch this". Together they earn an "Indexed,
 * though blocked by robots.txt" warning in Search Console and index nothing
 * useful, because the crawler never sees the page.
 *
 * That exact contradiction existed for /student-auth: disallowed for every
 * crawler, yet listed in the sitemap at priority 0.6. It was found by reading
 * the two files side by side, which is not a thing anyone does regularly — so
 * it is checked here instead, on every build.
 *
 * Deliberately a WARNING rather than an error. Which side is wrong is a
 * judgement call (drop the sitemap entry, or lift the Disallow), and a build
 * should not fail on a decision only a human can make.
 */
function checkRobotsAgainstSitemap() {
  const robotsPath = path.join(ROOT, "public", "robots.txt");
  const sitemapPath = path.join(ROOT, "public", "sitemap.xml");
  if (!existsSync(robotsPath) || !existsSync(sitemapPath)) return;

  // Only the "*" group matters: it is the policy a URL in a public sitemap is
  // judged against, and the one every unnamed crawler obeys.
  const robots = readFileSync(robotsPath, "utf8");
  const groups = robots.split(/^(?=User-agent:)/m);
  const starGroup = groups.find((g) => /^User-agent:\s*\*/m.test(g)) ?? "";
  const disallows = [...starGroup.matchAll(/^Disallow:\s*(\S+)\s*$/gm)].map((m) => m[1]);

  // robots.txt patterns: * is a wildcard, a trailing $ anchors the end, and an
  // unanchored prefix matches anything starting with it.
  const matches = (pattern, urlPath) => {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const re = new RegExp(
      "^" +
        body
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        (anchored ? "$" : "")
    );
    return re.test(urlPath);
  };

  const sitemap = readFileSync(sitemapPath, "utf8");
  const locs = [...sitemap.matchAll(/<loc>https:\/\/mocksetu\.in([^<]*)<\/loc>/g)].map(
    (m) => m[1] || "/"
  );

  for (const loc of locs) {
    const hit = disallows.find((d) => matches(d, loc));
    if (hit) {
      warnings.push(
        `sitemap lists ${loc}, but robots.txt disallows it via "${hit}" — ` +
          `remove one of the two (a disallowed URL cannot be indexed usefully)`
      );
    }
  }
}

/** Write a route's document to dist/<route>/index.html. */
const writeRoute = (routePath, html) => {
  const outDir = path.join(DIST, ...routePath.split("/").filter(Boolean));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), html);
};

// ── Output validation ─────────────────────────────────────────────────────────

/**
 * Assert the invariants that matter on EVERY generated file, not just the couple
 * a test file spot-checks.
 *
 * The head rewriters upsert — they insert when they cannot find a tag to replace
 * — so a regex that stops matching does not throw, it quietly produces a second
 * tag. A duplicated canonical or title is worse than a missing one, because the
 * page still looks fine and search engines pick whichever they like. Running the
 * check over all 200-plus outputs at build time is what makes the whole pipeline
 * trustworthy without hand-inspecting files.
 */
function validateOutput(html, route, url) {
  const at = `${route.path}`;
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) {
    errors.push(`${at}: no </head> in output`);
    return;
  }
  const head = html.slice(0, headEnd);
  const once = (re, label) => {
    const n = (head.match(re) || []).length;
    if (n !== 1) errors.push(`${at}: expected exactly 1 ${label}, found ${n}`);
  };

  once(/<title>/g, "<title>");
  once(/name="robots"/g, "robots meta");

  if (route.noindex) {
    // A bare head is the point here, so the exactly-one checks below do not
    // apply. What must hold is that the page is genuinely marked noindex and
    // carries no discovery surface that would contradict it.
    if (!head.includes('content="noindex')) {
      errors.push(`${at}: expected a noindex robots meta`);
    }
    for (const [re, label] of [
      [/rel="canonical"/, "canonical"],
      [/property="og:/, "OpenGraph tag"],
      [/name="twitter:/, "Twitter card tag"],
      [/hreflang=/, "hreflang alternate"],
    ]) {
      if (re.test(head)) errors.push(`${at}: noindex route still carries a ${label}`);
    }
    const o = (head.match(/<script/g) || []).length;
    const c = (head.match(/<\/script>/g) || []).length;
    if (o !== c) errors.push(`${at}: unbalanced <script> tags in head (${o}/${c})`);
    return;
  }

  once(/rel="canonical"/g, "canonical link");
  once(/name="description"/g, "description meta");
  once(/name="keywords"/g, "keywords meta");
  once(/property="og:title"/g, "og:title");
  once(/property="og:url"/g, "og:url");
  once(/property="og:type"/g, "og:type");
  once(/name="twitter:title"/g, "twitter:title");

  if (!head.includes(`rel="canonical" href="${escapeAttr(url)}"`)) {
    errors.push(`${at}: canonical does not point at ${url}`);
  }
  if (!head.includes(`property="og:url" content="${escapeAttr(url)}"`)) {
    errors.push(`${at}: og:url does not point at ${url}`);
  }
  const hreflangs = [...head.matchAll(/<link\s[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)];
  if (!route.alternates?.length) {
    if (hreflangs.length) {
      errors.push(`${at}: inherited a hreflang alternate it should not carry`);
    }
  } else {
    // Self-reference is the half that gets forgotten, and its absence is what
    // makes Google discard the pairing — so it is asserted explicitly.
    if (hreflangs.length !== route.alternates.length) {
      errors.push(
        `${at}: expected ${route.alternates.length} hreflang links, found ${hreflangs.length}`
      );
    }
    if (!hreflangs.some(([, , href]) => href === url)) {
      errors.push(`${at}: hreflang set does not include this page itself (${url})`);
    }
    if (!hreflangs.some(([, lang]) => lang === "x-default")) {
      errors.push(`${at}: hreflang set has no x-default`);
    }
  }

  // Every JSON-LD block must survive a round-trip. This is what would catch a
  // "</script>" in post content truncating a block, and any malformed payload.
  const blocks = [...head.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
  let faqPages = 0;
  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push(`${at}: unparseable JSON-LD block — ${err.message}`);
      continue;
    }
    const types = (Array.isArray(parsed) ? parsed : [parsed]).map((n) => n && n["@type"]);
    if (types.includes("FAQPage")) faqPages++;
    // The English home page is the one route these legitimately belong to.
    if (types.includes("SoftwareApplication") && !route.keepHomepageJsonLd) {
      errors.push(`${at}: homepage SoftwareApplication leaked onto this route`);
    }
  }
  // Two competing FAQPage nodes on one URL means neither is trusted, which is
  // exactly what dropJsonLdTypes runs before injectJsonLd to prevent. Ordering
  // there is load-bearing; this assertion is what notices if it is ever swapped.
  if (faqPages > 1) errors.push(`${at}: ${faqPages} FAQPage nodes — expected at most 1`);

  // The prerendered <script> tags in <head> must not have been broken open by
  // content, which would leave stray markup in the document.
  const openScripts = (head.match(/<script/g) || []).length;
  const closeScripts = (head.match(/<\/script>/g) || []).length;
  if (openScripts !== closeScripts) {
    errors.push(`${at}: unbalanced <script> tags in head (${openScripts}/${closeScripts})`);
  }
}

// ── Route assembly ────────────────────────────────────────────────────────────

/**
 * Hand-built pages: which STATIC_PAGE_SEO keys become prerendered routes.
 *
 * The metadata itself is NOT duplicated here — it is read from
 * src/data/staticPageSeo.ts, the same module the page components spread into
 * <SEO>. An earlier version of this file kept its own copy of every title,
 * description and keyword list, guarded by comparing the title against the TSX
 * source. That caught a renamed title and silently tolerated a drifted
 * description, which is the failure a mirror like that always ends up having.
 * There is now one copy of each string and nothing to compare.
 *
 * Page-specific JSON-LD stays in the page component and remains JS-injected, so
 * these four routes get correct crawler metadata while their rich results still
 * depend on rendering — unlike the fully derived routes below.
 */
/**
 * Private routes that must carry `noindex` in the FIRST BYTE.
 *
 * Each of these pages already passes `noindex` to <SEO>, but that only lands
 * after React mounts. A crawler that does not run JavaScript saw index.html's
 * head instead, which says "index, follow" — so an authenticated URL could be
 * indexed under the homepage's own metadata.
 *
 * The admin route is the reason this list exists. It used to rely on a
 * misspelled robots.txt Disallow ("/barnwal3008-admin" vs the real
 * "/barnwal3008/admin"), and correcting that spelling would have published the
 * admin URL in a world-readable file. Emitting a static noindex instead
 * protects it from every crawler without naming it anywhere public.
 *
 * These get a bare head — no canonical, no OpenGraph, no structured data.
 * There is nothing to describe on a page nobody should reach, and a canonical
 * on a noindexed URL is a mixed signal.
 */
const NOINDEX_ROUTES = [
  "/auth",
  "/student-auth",
  "/dashboard",
  "/analytics",
  "/barnwal3008/admin",
];

const STATIC_ROUTE_KEYS = [
  "blog",
  "sscMts",
  "marketplace",
  "jsonUploadGuide",
  "privacyPolicy",
  "termsOfService",
];

/**
 * Minimal semantic shell for a page whose body cannot be derived from data.
 *
 * Without this the four hand-built routes inherited index.html's <noscript>
 * block, whose <h1> reads "MockSetu — The Bridge to Your Best Score" on every
 * one of them. Correct head, homepage h1 — a mismatch any consumer reading the
 * raw HTML would see. A real h1 and lede for the route is both accurate and
 * more useful than marketing copy for a different page.
 */
const renderStaticShell = (hero, path) =>
  `<div class="min-h-screen bg-background">` +
  NAV_SPACER +
  `<section class="${HERO_SECTION_CLS}"><div class="relative z-10 container mx-auto max-w-3xl">` +
  `<nav aria-label="Breadcrumb" class="mb-6 flex items-center gap-2 text-[12px] text-white/40">` +
  `<a href="/">Home</a><span>/</span>` +
  `<span class="text-white/60">${escapeHtml(hero.breadcrumb)}</span></nav>` +
  `<h1 class="text-[30px] sm:text-[44px] md:text-[52px] font-black text-white leading-[1.1] tracking-[-0.03em] mb-5">${escapeHtml(
    hero.h1
  )}</h1>` +
  `<p class="${LEDE_CLS}">${escapeHtml(hero.lede)}</p>` +
  `</div></section></div>`;

/**
 * The /blog index, with its article list.
 *
 * The runtime list is client-rendered and filterable, which meant the static
 * HTML for the hub linking to every article contained none of those links. The
 * sitemap still exposed the URLs, so discovery was never at risk, but the
 * internal linking from hub to spokes existed only after JS ran. Emitting the
 * list restores it in the first byte.
 */
const renderBlogIndexBody = (hero, metas) =>
  `<div class="min-h-screen bg-background">` +
  NAV_SPACER +
  `<section class="${HERO_SECTION_CLS}"><div class="relative z-10 container mx-auto max-w-3xl">` +
  `<nav aria-label="Breadcrumb" class="mb-6 flex items-center gap-2 text-[12px] text-white/40">` +
  `<a href="/">Home</a><span>/</span><span class="text-white/60">Blog</span></nav>` +
  `<h1 class="text-[30px] sm:text-[44px] md:text-[52px] font-black text-white leading-[1.1] tracking-[-0.03em] mb-5">${escapeHtml(
    hero.h1
  )}</h1>` +
  `<p class="${LEDE_CLS}">${escapeHtml(hero.lede)}</p>` +
  `</div></section>` +
  `<section class="py-12 sm:py-16 px-5"><div class="container mx-auto max-w-4xl">` +
  `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${metas
    .map(
      (m) =>
        `<a href="/blog/${escapeAttr(
          m.slug
        )}" class="rounded-2xl border border-border/60 bg-card p-6 block">` +
        `<span class="text-[11px] font-bold tracking-widest text-primary/70 uppercase">${escapeHtml(
          m.category
        )}</span>` +
        `<h2 class="mt-2 text-[16px] sm:text-[18px] font-bold text-foreground tracking-tight">${escapeHtml(
          m.title
        )}</h2>` +
        `<p class="mt-2 text-[13px] text-muted-foreground leading-[1.65]">${escapeHtml(
          m.excerpt
        )}</p></a>`
    )
    .join("")}</div></div></section></div>`;

async function main() {
  if (!existsSync(TEMPLATE)) {
    console.error("dist/index.html not found — run `vite build` before prerendering.");
    process.exit(1);
  }

  const seo = await importTsModule(
    path.join(ROOT, "src", "lib", "seo", "structuredData.ts"),
    "structuredData.mjs"
  );
  const { EXAM_LANDING_PAGES } = await importTsModule(
    path.join(ROOT, "src", "data", "examLandingPages.ts"),
    "examLandingPages.mjs"
  );

  const { STATIC_PAGE_SEO, STATIC_PAGE_HERO } = await importTsModule(
    path.join(ROOT, "src", "data", "staticPageSeo.ts"),
    "staticPageSeo.mjs"
  );
  const routes = [];

  // ── Private routes: noindex in the first byte, nothing else ──
  for (const p of NOINDEX_ROUTES) {
    routes.push({
      path: p,
      title: "MockSetu",
      description: "",
      lang: "en-IN",
      noindex: true,
      jsonLd: [],
    });
  }

  // ── Bilingual pairs: / ↔ /hindi and /for-creators ↔ /hindi/for-creators ──
  //
  // The only routes that EMIT hreflang rather than having it stripped. Head
  // metadata and the alternate sets come from src/i18n/pageSeo.ts — the same
  // module the components read — and the hero shells are built from the very
  // copy tables the pages render, so a prerendered Hindi page cannot end up
  // showing English words.
  const pageSeo = await importTsModule(
    path.join(ROOT, "src", "i18n", "pageSeo.ts"),
    "pageSeo.mjs"
  );
  const homeCopy = {
    en: (await importTsModule(path.join(ROOT, "src", "i18n", "homeCopy.en.ts"), "homeEn.mjs"))
      .HOME_COPY_EN,
    hi: (await importTsModule(path.join(ROOT, "src", "i18n", "homeCopy.hi.ts"), "homeHi.mjs"))
      .HOME_COPY_HI,
  };
  const creatorCopy = {
    en: (await importTsModule(path.join(ROOT, "src", "i18n", "creatorCopy.en.ts"), "creEn.mjs"))
      .CREATOR_COPY_EN,
    hi: (await importTsModule(path.join(ROOT, "src", "i18n", "creatorCopy.hi.ts"), "creHi.mjs"))
      .CREATOR_COPY_HI,
  };

  for (const lang of ["en", "hi"]) {
    const meta = pageSeo.HOME_SEO_BY_LANG[lang];
    const hero = homeCopy[lang]?.hero;
    if (!meta || !hero) {
      errors.push(`home copy or SEO missing for lang "${lang}"`);
      continue;
    }
    routes.push({
      path: pageSeo.HOME_PATHS[lang],
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      lang: meta.lang,
      ogType: "website",
      alternates: pageSeo.HOME_ALTERNATES,
      // Only the English home page keeps index.html's FAQPage and
      // SoftwareApplication: they describe that page and that product entity.
      keepHomepageJsonLd: lang === "en",
      jsonLd: [],
      // `/` keeps the hand-written English noscript block already in
      // index.html; the Hindi twin must not inherit that English copy.
      body:
        lang === "en"
          ? undefined
          : renderStaticShell(
              {
                h1: `${hero.h1a} ${hero.h1b}`,
                lede: `${hero.subA}${hero.subB}`,
                breadcrumb: "होम",
              },
              pageSeo.HOME_PATHS[lang]
            ),
    });
  }

  for (const lang of ["en", "hi"]) {
    const meta = pageSeo.CREATOR_SEO_BY_LANG[lang];
    const c = creatorCopy[lang];
    if (!meta || !c) {
      errors.push(`creator copy or SEO missing for lang "${lang}"`);
      continue;
    }
    routes.push({
      path: pageSeo.CREATOR_PATHS[lang],
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      lang: meta.lang,
      ogType: "website",
      alternates: pageSeo.CREATOR_ALTERNATES,
      jsonLd: [],
      body: renderStaticShell(
        {
          h1: `${c.heroTitleA} ${c.heroTitleB}`,
          lede: `${c.heroSub}${c.heroSubStrong}${c.heroSubTail}`,
          breadcrumb: meta.breadcrumbSelf,
        },
        pageSeo.CREATOR_PATHS[lang]
      ),
    });
  }

  // ── Exam landing pages: head + body, fully derived ──
  for (const exam of Object.values(EXAM_LANDING_PAGES)) {
    routes.push({
      path: `/mock-test/${exam.slug}`,
      title: exam.metaTitle,
      description: exam.metaDescription,
      keywords: exam.keywords,
      lang: "en-IN",
      ogType: "website",
      jsonLd: seo.buildExamLandingJsonLd(exam),
      body: renderExamLandingBody(exam),
    });
  }

  // ── Blog posts: head + body, fully derived ──
  const postFiles = readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  const posts = [];
  for (const f of postFiles) {
    try {
      const mod = await importTsModule(
        path.join(POSTS_DIR, f),
        f.replace(/\.ts$/, ".mjs")
      );
      if (mod.default) posts.push(mod.default);
      else errors.push(`${f}: no default export`);
    } catch (err) {
      errors.push(`${f}: failed to load — ${err.message}`);
    }
  }

  // Legacy posts still live in the original module rather than posts/.
  try {
    const legacy = await importTsModule(
      path.join(ROOT, "src", "data", "blogPosts.ts"),
      "legacyBlogPosts.mjs"
    );
    for (const p of Object.values(legacy.BLOG_POSTS ?? {})) posts.push(p);
  } catch (err) {
    warnings.push(`could not load legacy posts — ${err.message}`);
  }

  // ── Static, hand-built pages: real head, derived body shell ──
  // Assembled after the posts are loaded, because /blog's shell renders the
  // article list and needs every post to do it.
  //
  // Newest first, matching BLOG_META's ordering in src/data/blog/index.ts, so
  // the prerendered list is in the order the mounted app renders.
  const blogMetas = [...posts]
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category }));

  for (const key of STATIC_ROUTE_KEYS) {
    const meta = STATIC_PAGE_SEO[key];
    if (!meta) {
      errors.push(`STATIC_ROUTE_KEYS names "${key}", which is absent from STATIC_PAGE_SEO`);
      continue;
    }
    const hero = STATIC_PAGE_HERO[meta.path];
    if (!hero) {
      errors.push(`no STATIC_PAGE_HERO entry for ${meta.path} — add one in staticPageSeo.ts`);
      continue;
    }
    routes.push({
      path: meta.path,
      title: meta.title,
      description: meta.description,
      keywords: meta.keywords,
      lang: "en-IN",
      ogType: "website",
      jsonLd: [],
      body:
        meta.path === "/blog"
          ? renderBlogIndexBody(hero, blogMetas)
          : renderStaticShell(hero, meta.path),
    });
  }

  for (const p of posts) {
    routes.push({
      path: `/blog/${p.slug}`,
      title: p.metaTitle,
      description: p.metaDescription,
      keywords: p.keywords,
      lang: "en-IN",
      ogType: "article",
      publishedAt: p.publishedAt,
      updatedAt: p.updatedAt,
      jsonLd: seo.buildBlogPostJsonLd(p),
      body: renderBlogPostBody(p),
    });
  }

  if (errors.length) {
    console.error(`\nPRERENDER ERRORS (${errors.length}):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  checkRobotsAgainstSitemap();

  const template = readFileSync(TEMPLATE, "utf8");
  let written = 0;

  for (const route of routes) {
    const url = `${seo.SITE_URL}${route.path}`;
    let html = template;

    html = html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${route.lang}"`);
    html = setTitle(html, route.title);

    if (route.noindex) {
      // Nothing to describe on a page nobody should reach. Strip the discovery
      // surface entirely rather than emitting a canonical, an OpenGraph card
      // and a brand keyword list on a URL we are asking crawlers to drop — a
      // canonical on a noindexed page is a contradictory signal.
      html = setMetaName(html, "robots", seo.ROBOTS_NOINDEX);
      html = stripTags(html, [
        /[ \t]*<link\s[^>]*rel=["']canonical["'][^>]*>\r?\n?/gi,
        /[ \t]*<meta\s[^>]*name=["']description["'][^>]*>\r?\n?/gi,
        /[ \t]*<meta\s[^>]*name=["']keywords["'][^>]*>\r?\n?/gi,
        /[ \t]*<meta\s[^>]*property=["']og:[^"']*["'][^>]*>\r?\n?/gi,
        /[ \t]*<meta\s[^>]*name=["']twitter:[^"']*["'][^>]*>\r?\n?/gi,
      ]);
      html = stripHreflangAlternates(html);
      html = dropJsonLdTypes(html, ["FAQPage", "SoftwareApplication"]);
      validateOutput(html, route, url);
      writeRoute(route.path, html);
      written++;
      continue;
    }

    html = setMetaName(html, "description", route.description);
    html = setMetaName(html, "keywords", seo.mergeKeywords(route.keywords));
    html = setMetaName(html, "robots", seo.ROBOTS_INDEX);
    html = setCanonical(html, url);

    html = setMetaProp(html, "og:title", route.title);
    html = setMetaProp(html, "og:description", route.description);
    html = setMetaProp(html, "og:url", url);
    html = setMetaProp(html, "og:image", seo.DEFAULT_OG_IMAGE);
    html = setMetaProp(html, "og:locale", route.lang.replace("-", "_"));
    html = setMetaProp(html, "og:type", route.ogType);
    if (route.ogType === "article") {
      // Only meaningful on articles, and only readable by crawlers that do not
      // run JS — which is precisely the audience this whole script serves.
      html = setMetaProp(html, "article:published_time", route.publishedAt);
      html = setMetaProp(html, "article:modified_time", route.updatedAt);
    }

    html = setMetaName(html, "twitter:title", route.title);
    html = setMetaName(html, "twitter:description", route.description);
    html = setMetaName(html, "twitter:image", seo.DEFAULT_OG_IMAGE);

    html = setAlternates(html, route.alternates, seo.SITE_URL);

    // The English home page is the one route those homepage-scoped nodes
    // actually describe — its own FAQ, and the product's SoftwareApplication
    // entity. Everywhere else, including the Hindi twin (an English FAQPage on
    // a Devanagari URL), they are inherited noise and get dropped.
    if (!route.keepHomepageJsonLd) {
      html = dropJsonLdTypes(html, ["FAQPage", "SoftwareApplication"]);
    }
    if (route.jsonLd.length) html = injectJsonLd(html, route.jsonLd, seo.MANAGED_TAG_ATTR);
    if (route.body) html = setRootContent(html, route.body);

    validateOutput(html, route, url);

    writeRoute(route.path, html);
    written++;
  }

  if (errors.length) {
    console.error(`\nPRERENDER OUTPUT INVALID (${errors.length}):`);
    errors.slice(0, 25).forEach((e) => console.error(`  - ${e}`));
    if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
    process.exit(1);
  }

  rmSync(tmpDir, { recursive: true, force: true });

  console.log(`prerendered ${written} routes into dist/`);
  console.log(`  static pages:   ${STATIC_ROUTE_KEYS.length} (head + shell)`);
  console.log(`  bilingual pairs: 4 (head + hreflang + shell)`);
  console.log(`  exam landings:  ${Object.keys(EXAM_LANDING_PAGES).length} (head + body)`);
  console.log(`  blog articles:  ${posts.length} (head + body)`);
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

main().catch((err) => {
  rmSync(tmpDir, { recursive: true, force: true });
  console.error("prerender failed:", err);
  process.exit(1);
});
