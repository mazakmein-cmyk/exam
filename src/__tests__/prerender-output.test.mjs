/**
 * prerender-output.test.mjs — the static HTML written by scripts/prerender.mjs
 * says the right thing, and React takes it over cleanly on mount.
 *
 * Two independent risks are covered here, because the prerenderer fails in two
 * completely different ways.
 *
 *   1. HANDOFF. The prerendered article markup lives inside <div id="root">,
 *      the same node createRoot() mounts into. The entire design rests on React
 *      CLEARING that container on initial mount rather than appending to it. If
 *      that assumption were wrong the site would render every page twice —
 *      once statically, once from React — which is the kind of bug that looks
 *      fine in a build log and catastrophic in a browser. Test 1 mounts a real
 *      React root over real prerendered markup in jsdom and asserts the static
 *      content is gone.
 *
 *   2. HEAD CORRECTNESS. The reason the prerenderer exists is that crawlers
 *      which do not run JavaScript were being served the homepage's head on
 *      every URL. Test 2 reads the actual dist output and asserts the tags a
 *      social crawler reads are present exactly once, scoped to the right URL,
 *      and free of the homepage-only nodes that must not be inherited.
 *
 * Test 2 is skipped (not failed) when dist/ is absent, so this file is safe to
 * run on a clean checkout. Run `npm run build` first to exercise it.
 *
 * Run with: node src/__tests__/prerender-output.test.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = resolve(ROOT, "dist");

let pass = 0;
const failures = [];

const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. React clears prerendered content in #root on mount
// ─────────────────────────────────────────────────────────────────────────────
console.log("\ncreateRoot() takes over a prerendered #root");

{
  const PRERENDERED_MARKER = "PRERENDERED_ARTICLE_BODY";
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>` +
      `<div id="root"><section><h1>${PRERENDERED_MARKER}</h1><p>static paragraph</p></section></div>` +
      `</body></html>`,
    { pretendToBeVisual: true }
  );

  // react-dom/client reads these off the global scope, so they must exist
  // before it is imported.
  global.window = dom.window;
  global.document = dom.window.document;
  // Node 24 exposes `navigator` as a getter-only global, so a plain assignment
  // throws. Redefining the property is the only way to hand React jsdom's copy.
  Object.defineProperty(global, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.MessageChannel = dom.window.MessageChannel;
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
  global.cancelAnimationFrame = dom.window.cancelAnimationFrame;

  const container = dom.window.document.getElementById("root");
  ok(
    "prerendered markup is present before mount",
    container.textContent.includes(PRERENDERED_MARKER)
  );

  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");

  const App = () => React.createElement("main", null, "REACT_TREE");

  const root = createRoot(container);
  root.render(React.createElement(App));

  // Concurrent root: the initial mount is scheduled, not synchronous. Yield
  // long enough for the scheduler to commit.
  await new Promise((r) => setTimeout(r, 100));

  ok("React tree is mounted", container.textContent.includes("REACT_TREE"));
  ok(
    "prerendered markup was removed, not appended to",
    !container.textContent.includes(PRERENDERED_MARKER),
    `container still reads: ${container.textContent.slice(0, 120)}`
  );
  ok(
    "container holds exactly one root child",
    container.children.length === 1,
    `found ${container.children.length}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. dist output invariants
// ─────────────────────────────────────────────────────────────────────────────
const ARTICLE = resolve(DIST, "blog", "jee-main-syllabus-2027", "index.html");
const LANDING = resolve(DIST, "mock-test", "jee-main", "index.html");
const HOME = resolve(DIST, "index.html");

if (!existsSync(ARTICLE) || !existsSync(LANDING) || !existsSync(HOME)) {
  console.log("\ndist output invariants: SKIPPED (run `npm run build` first)");
} else {
  const read = (p) => readFileSync(p, "utf8");
  const headOf = (html) => html.slice(0, html.indexOf("</head>"));
  const bodyOf = (html) => html.slice(html.indexOf("</head>"));
  const count = (s, re) => (s.match(re) || []).length;
  const jsonLdTypes = (head) =>
    [...head.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map((m) => {
      const parsed = JSON.parse(m[1]);
      return Array.isArray(parsed) ? "ARRAY" : parsed["@type"];
    });

  console.log("\nprerendered article: /blog/jee-main-syllabus-2027");
  const article = read(ARTICLE);
  const aHead = headOf(article);
  const aBody = bodyOf(article);
  const aTypes = jsonLdTypes(aHead);

  // Exactly-once: a duplicated tag is as bad as a missing one, and the upsert
  // logic in prerender.mjs inserts when it cannot find an existing tag.
  ok("one <title>", count(aHead, /<title>/g) === 1);
  ok("one canonical", count(aHead, /rel="canonical"/g) === 1);
  ok("one og:title", count(aHead, /property="og:title"/g) === 1);
  ok("one og:url", count(aHead, /property="og:url"/g) === 1);
  ok("one description", count(aHead, /name="description"/g) === 1);
  ok("one twitter:title", count(aHead, /name="twitter:title"/g) === 1);

  ok(
    "canonical points at this article",
    aHead.includes('rel="canonical" href="https://mocksetu.in/blog/jee-main-syllabus-2027"')
  );
  ok("title is the article's, not the homepage's", /<title>JEE Main Syllabus 2027/.test(aHead));
  ok("og:type is article", aHead.includes('property="og:type" content="article"'));
  ok("article:published_time present", aHead.includes('property="article:published_time"'));

  // The homepage ships a hreflang cluster for `/`. Inherited onto another URL it
  // names a different page as this one's English version, and Google discards
  // the whole conflicting cluster.
  ok("homepage hreflang cluster stripped", count(aHead, /hreflang=/g) === 0);
  ok("RSS alternate survived the hreflang strip", aHead.includes("application/rss+xml"));

  // Article structured data present, homepage-only structured data gone.
  ok("BlogPosting JSON-LD present", aTypes.includes("BlogPosting"));
  ok("BreadcrumbList JSON-LD present", aTypes.includes("BreadcrumbList"));
  ok("Organization JSON-LD retained (sitewide entity)", aTypes.includes("Organization"));
  ok("WebSite JSON-LD retained (sitewide entity)", aTypes.includes("WebSite"));
  ok(
    "SoftwareApplication dropped (would assert a rating on every URL)",
    !aTypes.includes("SoftwareApplication")
  );
  ok(
    "exactly one FAQPage — the article's, not the homepage's too",
    aTypes.filter((t) => t === "FAQPage").length === 1,
    `found ${aTypes.filter((t) => t === "FAQPage").length}`
  );

  // Injected nodes must carry the attribute SEO.tsx reclaims on mount,
  // otherwise the page ends up with two copies of every node.
  const managed = count(aHead, /application\/ld\+json" data-mocksetu-seo="1"/g);
  ok(
    "every injected JSON-LD node is tagged for runtime reclaim",
    managed === aTypes.length - 2,
    `${managed} tagged of ${aTypes.length - 2} injected`
  );

  ok("body carries the article h1", /<h1[^>]*>JEE Main Syllabus 2027/.test(aBody));
  ok("body carries article sections", count(aBody, /<h2/g) >= 5);
  ok(
    "homepage noscript boilerplate replaced",
    !aBody.includes("The Bridge to Your Best Score")
  );

  console.log("\nprerendered landing: /mock-test/jee-main");
  const landing = read(LANDING);
  const lHead = headOf(landing);
  const lTypes = jsonLdTypes(lHead);
  ok("one <title>", count(lHead, /<title>/g) === 1);
  ok(
    "canonical points at this landing page",
    lHead.includes('rel="canonical" href="https://mocksetu.in/mock-test/jee-main"')
  );
  ok("Course JSON-LD present", lTypes.includes("Course"));
  ok("ItemList JSON-LD present (cluster hub)", lTypes.includes("ItemList"));
  ok("one FAQPage", lTypes.filter((t) => t === "FAQPage").length === 1);
  ok("body carries the landing h1", /<h1/.test(bodyOf(landing)));

  // The prerendered body omits <Navbar>, which at runtime renders a fixed 60px
  // bar plus a matching h-[60px] spacer on every non-home route. Without an
  // equivalent spacer the static article paints 60px high and jumps down when
  // React commits — a shift at the top of the viewport, the worst kind for CLS.
  console.log("\nlayout handoff: navbar space is reserved");
  for (const [label, file] of [
    ["article", ARTICLE],
    ["landing", LANDING],
  ]) {
    const body = bodyOf(read(file));
    const rootStart = body.indexOf('id="root"');
    const firstChunk = body.slice(rootStart, rootStart + 400);
    ok(`${label} reserves the 60px navbar height before its hero`, /h-\[60px\]/.test(firstChunk));
  }

  console.log("\nprerendered static shells");
  const blogIndex = read(resolve(DIST, "blog", "index.html"));
  const blogBody = bodyOf(blogIndex);
  ok("no unrendered object leaked into the body", !blogBody.includes("[object Object]"));
  ok(
    "/blog h1 is the blog's, not the homepage's",
    /<h1[^>]*>Mock Test Strategy &amp; Exam Guides/.test(blogBody),
    "h1 did not match"
  );
  ok(
    "/blog no longer inherits the homepage noscript copy",
    !blogBody.includes("The Bridge to Your Best Score")
  );
  // The hub linking to every article used to contain none of those links in
  // static HTML, because the list is client-rendered and filterable.
  const articleLinks = (blogBody.match(/href="\/blog\/[a-z0-9-]+"/g) || []).length;
  ok(
    "/blog statically links to the article set",
    articleLinks >= 150,
    `found ${articleLinks} article links`
  );
  ok(
    "/blog links to a known article slug",
    blogBody.includes('href="/blog/jee-main-syllabus-2027"')
  );

  const sscMts = read(resolve(DIST, "ssc-mts", "index.html"));
  const sscBody = bodyOf(sscMts);
  ok("/ssc-mts has its own h1", /<h1[^>]*>SSC MTS Previous Year Papers/.test(sscBody));
  ok(
    "/ssc-mts no longer inherits the homepage noscript copy",
    !sscBody.includes("The Bridge to Your Best Score")
  );
  ok(
    "/ssc-mts title still comes from the shared SEO module",
    headOf(sscMts).includes("<title>SSC MTS Previous Year Paper 2024")
  );

  // ── Bilingual pairs ────────────────────────────────────────────────────────
  // These are the only prerendered routes that EMIT hreflang instead of having
  // it stripped, and the only ones where a wrong <head> would be actively
  // harmful rather than merely unhelpful: an unconfirmed pairing makes Google
  // pick one side and drop the other.
  console.log("\nbilingual pairs: hreflang and language");

  const HREFLANG_PAIRS = [
    {
      label: "/ ↔ /hindi",
      en: resolve(DIST, "index.html"),
      hi: resolve(DIST, "hindi", "index.html"),
      enUrl: "https://mocksetu.in/",
      hiUrl: "https://mocksetu.in/hindi",
    },
    {
      label: "/for-creators ↔ /hindi/for-creators",
      en: resolve(DIST, "for-creators", "index.html"),
      hi: resolve(DIST, "hindi", "for-creators", "index.html"),
      enUrl: "https://mocksetu.in/for-creators",
      hiUrl: "https://mocksetu.in/hindi/for-creators",
    },
  ];

  for (const pair of HREFLANG_PAIRS) {
    if (!existsSync(pair.en) || !existsSync(pair.hi)) {
      ok(`${pair.label}: both sides prerendered`, false, "a side is missing");
      continue;
    }
    const enHead = headOf(read(pair.en));
    const hiHead = headOf(read(pair.hi));
    const links = (head) =>
      [...head.matchAll(/hreflang="([^"]+)"\s+href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    const enLinks = links(enHead);
    const hiLinks = links(hiHead);

    // Bidirectional: each side names BOTH urls.
    for (const [side, set] of [
      ["en", enLinks],
      ["hi", hiLinks],
    ]) {
      ok(
        `${pair.label}: ${side} side lists the English url`,
        set.some(([, href]) => href === pair.enUrl)
      );
      ok(
        `${pair.label}: ${side} side lists the Hindi url`,
        set.some(([, href]) => href === pair.hiUrl)
      );
      ok(
        `${pair.label}: ${side} side declares x-default`,
        set.some(([lang]) => lang === "x-default")
      );
    }
    ok(`${pair.label}: both sides declare the same number of alternates`, enLinks.length === hiLinks.length);

    ok(`${pair.label}: en canonical is the English url`, enHead.includes(`rel="canonical" href="${pair.enUrl}"`));
    ok(`${pair.label}: hi canonical is the Hindi url`, hiHead.includes(`rel="canonical" href="${pair.hiUrl}"`));
  }

  console.log("\nHindi routes are actually in Hindi");
  const hindiHome = read(resolve(DIST, "hindi", "index.html"));
  const hindiHead = headOf(hindiHome);
  const hindiBody = bodyOf(hindiHome);
  const DEVANAGARI = /[ऀ-ॿ]/;
  ok('<html lang> is hi-IN', /<html lang="hi-IN"/.test(hindiHome));
  ok("og:locale is hi_IN", hindiHead.includes('property="og:locale" content="hi_IN"'));
  ok("title is in Devanagari", DEVANAGARI.test(/<title>(.*?)<\/title>/s.exec(hindiHead)[1]));
  ok(
    "description is in Devanagari",
    DEVANAGARI.test(/name="description" content="([^"]*)"/.exec(hindiHead)[1])
  );
  ok("body h1 is in Devanagari", DEVANAGARI.test(/<h1[^>]*>([^<]*)/.exec(hindiBody)[1]));
  ok(
    "English homepage noscript copy is gone",
    !hindiBody.includes("The Bridge to Your Best Score")
  );
  // An English FAQPage on a Devanagari URL is a wrong-language answer set.
  ok(
    "English homepage FAQPage/SoftwareApplication not inherited",
    !jsonLdTypes(hindiHead).includes("FAQPage") &&
      !jsonLdTypes(hindiHead).includes("SoftwareApplication")
  );

  const hindiCreators = read(resolve(DIST, "hindi", "for-creators", "index.html"));
  ok(
    "/hindi/for-creators h1 is in Devanagari",
    DEVANAGARI.test(/<h1[^>]*>([^<]*)/.exec(bodyOf(hindiCreators))[1])
  );
  ok(
    "/hindi/for-creators title is in Devanagari",
    DEVANAGARI.test(/<title>(.*?)<\/title>/s.exec(headOf(hindiCreators))[1])
  );

  console.log("\nEnglish home keeps what only it should have: /");
  const home = read(HOME);
  const hHead = headOf(home);
  const hTypes = jsonLdTypes(hHead);
  ok("homepage canonical still /", hHead.includes('rel="canonical" href="https://mocksetu.in/"'));
  ok("homepage keeps its hreflang cluster", count(hHead, /hreflang=/g) >= 4);
  // The homepage title used to be stale: index.html shipped one string while
  // HomeLanding rendered another, so the first byte disagreed with the app.
  ok(
    "homepage title matches what the app renders",
    /<title>Free Mock Tests &amp; Previous Year Papers with Answer Keys/.test(hHead),
    "title is not the one HOME_SEO_BY_LANG.en declares"
  );
  ok("homepage keeps SoftwareApplication", hTypes.includes("SoftwareApplication"));
  ok("homepage keeps its own FAQPage", hTypes.includes("FAQPage"));
  ok(
    "homepage has no article JSON-LD leaked into it",
    !hTypes.includes("BlogPosting") && !hTypes.includes("Course")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. robots.txt: every crawler group carries the private-area policy
// ─────────────────────────────────────────────────────────────────────────────
//
// robots.txt groups are SELF-CONTAINED — a crawler obeys only the most specific
// group naming it and inherits nothing from "User-agent: *". This file once had
// eleven crawlers in groups holding a bare "Allow: /", which handed all eleven
// the authenticated areas. Any group with zero Disallow lines is that bug.
console.log("\nrobots.txt: private areas closed for every named crawler");

{
  const robots = readFileSync(resolve(ROOT, "public", "robots.txt"), "utf8");

  // Correct group parsing: consecutive User-agent lines share the rules that
  // follow them. A naive split on every User-agent line reports false failures.
  const groups = [];
  let current = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
    } else if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ key, value });
    }
  }

  const REQUIRED_DISALLOWS = [
    "/auth",
    "/student-auth",
    "/dashboard",
    "/analytics",
    "/exam/*/section/*/edit",
    "/exam/*/section/*/simulator",
    "/exam/review/",
  ];

  ok("robots.txt parsed into groups", groups.length > 0, `found ${groups.length}`);

  for (const g of groups) {
    const label = g.agents.length === 1 ? g.agents[0] : `${g.agents.length} named crawlers`;
    const disallowed = g.rules.filter((r) => r.key === "disallow").map((r) => r.value);
    const missing = REQUIRED_DISALLOWS.filter((d) => !disallowed.includes(d));
    ok(`group [${label}] closes every private area`, missing.length === 0, `missing: ${missing.join(", ")}`);
  }

  ok(
    "every AI/search/social crawler is covered by some group",
    ["GPTBot", "ClaudeBot", "PerplexityBot", "Googlebot", "Bingbot", "Twitterbot",
     "facebookexternalhit", "LinkedInBot", "Google-Extended", "Applebot-Extended"].every((bot) =>
      groups.some((g) => g.agents.includes(bot))
    )
  );

  // The admin console must be disallowed for every crawler, but WITHOUT the
  // literal path appearing: robots.txt is world-readable and is the first file
  // an automated scanner fetches to harvest admin URLs. A wildcard satisfies
  // both, and cannot rot the way a hand-copied spelling did.
  const ADMIN_PATH = "/barnwal3008/admin";
  const robotsMatches = (pattern, urlPath) => {
    const anchored = pattern.endsWith("$");
    const bodyPat = anchored ? pattern.slice(0, -1) : pattern;
    const re = new RegExp(
      "^" +
        bodyPat
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        (anchored ? "$" : "")
    );
    return re.test(urlPath);
  };
  for (const g of groups) {
    const label = g.agents.length === 1 ? g.agents[0] : `${g.agents.length} named crawlers`;
    const covered = g.rules
      .filter((r) => r.key === "disallow")
      .some((r) => robotsMatches(r.value, ADMIN_PATH));
    ok(`group [${label}] disallows the admin console`, covered);
  }
  ok(
    "robots.txt never spells out the admin path",
    !/^\s*(Dis)?allow:.*barnwal/im.test(robots),
    "a rule names the admin route, which advertises it to scanners"
  );

  // The typo that made the original rule inert. Guarding the shape, not a
  // spelling, is what stops it recurring.
  ok(
    "no hyphenated admin path lingers in robots.txt rules",
    !/^\s*(Dis)?allow:.*-admin/im.test(robots)
  );
  ok(
    "sitemap is declared",
    /^Sitemap:\s*https:\/\/mocksetu\.in\/sitemap\.xml\s*$/m.test(robots)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Private routes carry noindex in the first byte
// ─────────────────────────────────────────────────────────────────────────────
// These pages pass `noindex` to <SEO>, but that only lands after React mounts.
// A crawler that does not run JS previously saw index.html's "index, follow".
if (existsSync(resolve(DIST, "dashboard", "index.html"))) {
  console.log("\nprivate routes: noindex in the first byte");
  for (const p of ["auth", "student-auth", "dashboard", "analytics", "barnwal3008/admin"]) {
    const f = resolve(DIST, ...p.split("/"), "index.html");
    if (!existsSync(f)) {
      ok(`/${p} is prerendered`, false, "file missing");
      continue;
    }
    const head = readFileSync(f, "utf8").split("</head>")[0];
    ok(`/${p} is noindex`, /name="robots" content="noindex/.test(head));
    ok(
      `/${p} carries no discovery surface`,
      !/rel="canonical"/.test(head) &&
        !/property="og:/.test(head) &&
        !/name="twitter:/.test(head) &&
        !/hreflang=/.test(head)
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. The admin console's URL is not discoverable, and the gate still opens
// ─────────────────────────────────────────────────────────────────────────────
//
// React Router compiles its route table into the client bundle, so declaring the
// admin path there published the URL as a plaintext string in a file anyone can
// download — and Googlebot executes JS and discovers URLs from it. The route now
// resolves by SHA-256 digest instead (src/lib/adminRoute.ts).
//
// Two things must hold together, and testing only one is worse than testing
// neither: the URL must be ABSENT from everything shipped, and the digest must
// still MATCH the real path, or the console becomes unreachable.
console.log("\nadmin console: undiscoverable, but still reachable");

{
  const adminRouteSrc = readFileSync(resolve(ROOT, "src", "lib", "adminRoute.ts"), "utf8");
  const appSrc = readFileSync(resolve(ROOT, "src", "App.tsx"), "utf8");

  // The real path lives in the build script's NOINDEX_ROUTES — source, never
  // shipped. Reading it from there avoids adding another plaintext copy just to
  // write this test.
  const prerenderSrc = readFileSync(resolve(ROOT, "scripts", "prerender.mjs"), "utf8");
  const noindexBlock = /const NOINDEX_ROUTES = \[([\s\S]*?)\]/.exec(prerenderSrc);
  const adminPath = noindexBlock
    ? (noindexBlock[1].match(/"([^"]*\/admin)"/) || [])[1]
    : undefined;

  ok("the real admin path is recoverable from the build script", Boolean(adminPath));

  if (adminPath) {
    const { createHash } = await import("node:crypto");
    const digest = createHash("sha256").update(adminPath, "utf8").digest("hex");
    ok(
      "the committed digest matches the real admin path (gate opens)",
      adminRouteSrc.includes(digest),
      `sha256("${"*".repeat(adminPath.length)}") is not the committed constant — ` +
        `the console would be UNREACHABLE`
    );

    // A wrong-but-plausible digest is the dangerous failure, so also confirm the
    // constant is a well-formed digest rather than a truncated paste.
    const declared = /ADMIN_PATH_DIGEST = "([0-9a-f]*)"/.exec(adminRouteSrc);
    ok(
      "ADMIN_PATH_DIGEST is a full 64-hex SHA-256",
      Boolean(declared) && declared[1].length === 64,
      declared ? `length ${declared[1].length}` : "not found"
    );

    const secretToken = adminPath.split("/").filter(Boolean)[0];

    ok(
      "App.tsx does not declare the admin path",
      !appSrc.includes(adminPath),
      "the route table would compile the URL into the bundle"
    );
    ok(
      "adminRoute.ts holds only digests, never the plaintext",
      !adminRouteSrc.includes(adminPath) && !adminRouteSrc.includes(secretToken)
    );

    // The shipped bundle is the artefact that actually matters.
    const assetsDir = resolve(DIST, "assets");
    if (existsSync(assetsDir)) {
      const js = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
      const leaking = js.filter((f) =>
        readFileSync(resolve(assetsDir, f), "utf8").includes(secretToken)
      );
      ok(
        "no shipped JS chunk contains the admin token",
        leaking.length === 0,
        `leaked in: ${leaking.join(", ")}`
      );

      // The operator address embeds the same token, so leaving it in would make
      // the hashed path guessable and defeat the whole exercise.
      const emailLeaks = js.filter((f) =>
        /barnwal3008@|abarnwal3008@/.test(readFileSync(resolve(assetsDir, f), "utf8"))
      );
      ok(
        "no shipped JS chunk contains an operator email",
        emailLeaks.length === 0,
        `leaked in: ${emailLeaks.join(", ")}`
      );
    }

    // Belt and braces: the outer layers still apply to the real path.
    const adminDoc = resolve(DIST, ...adminPath.split("/").filter(Boolean), "index.html");
    if (existsSync(adminDoc)) {
      const head = readFileSync(adminDoc, "utf8").split("</head>")[0];
      ok("the admin URL still serves a noindex first byte", /content="noindex/.test(head));
      ok("the admin URL leaks nothing in its head", !head.includes(secretToken));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. The share card is a real image of the size the markup claims
// ─────────────────────────────────────────────────────────────────────────────
//
// This is where the whole prerender effort could have been quietly wasted. The
// per-page OpenGraph tags were correct, but they pointed at /mocksetu-logo.png —
// a 1024x1024 JPEG with a .png extension, declared in the markup as 1200x630.
// A platform that finds the bytes disagreeing with the declaration crops badly
// or drops the image, so every share would still have looked broken.
//
// Asserted against the actual PNG header, not against another copy of the
// numbers, because two copies of a wrong number agree perfectly.
console.log("\nshare card: real PNG, declared size matches the bytes");

{
  const ogFile = resolve(ROOT, "public", "og-image.png");
  if (!existsSync(ogFile)) {
    ok("public/og-image.png exists", false);
  } else {
    const bytes = readFileSync(ogFile);
    const isPng = bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    ok("og-image.png really is a PNG (not JPEG bytes in disguise)", isPng);

    const ihdr = bytes.indexOf("IHDR");
    const width = bytes.readUInt32BE(ihdr + 4);
    const height = bytes.readUInt32BE(ihdr + 8);
    ok("og-image.png is 1200x630", width === 1200 && height === 630, `${width}x${height}`);

    // summary_large_image wants roughly 1.91:1. A square gets centre-cropped.
    const ratio = width / height;
    ok(
      "aspect ratio suits summary_large_image (~1.91:1)",
      ratio > 1.85 && ratio < 1.95,
      `ratio ${ratio.toFixed(3)}`
    );

    // colourType 2 = RGB, i.e. no alpha. Transparent OG images render black or
    // white depending on the platform, so opacity is not optional here.
    const colourType = bytes[ihdr + 13];
    ok("og-image.png is opaque (no alpha channel)", colourType === 2, `colourType ${colourType}`);

    // Every declaration of the size must agree with the header above.
    const seoSrc = readFileSync(resolve(ROOT, "src", "lib", "seo", "structuredData.ts"), "utf8");
    ok(
      "structuredData.ts declares the real width",
      new RegExp(`OG_IMAGE_WIDTH = ${width}\\b`).test(seoSrc)
    );
    ok(
      "structuredData.ts declares the real height",
      new RegExp(`OG_IMAGE_HEIGHT = ${height}\\b`).test(seoSrc)
    );
    ok("DEFAULT_OG_IMAGE points at og-image.png", seoSrc.includes("/og-image.png`"));

    const indexSrc = readFileSync(resolve(ROOT, "index.html"), "utf8");
    ok(
      "index.html declares the real width",
      indexSrc.includes(`property="og:image:width" content="${width}"`)
    );
    ok(
      "index.html declares the real height",
      indexSrc.includes(`property="og:image:height" content="${height}"`)
    );
    ok(
      "index.html no longer points og:image at the square logo",
      !/property="og:image" content="[^"]*mocksetu-logo\.png"/.test(indexSrc)
    );
    ok(
      "twitter:image points at the share card too",
      indexSrc.includes('name="twitter:image" content="https://mocksetu.in/og-image.png"')
    );

    // And the prerendered pages must have inherited it.
    if (existsSync(ARTICLE)) {
      const aHead = readFileSync(ARTICLE, "utf8").split("</head>")[0];
      ok(
        "a prerendered article points at the share card",
        aHead.includes('property="og:image" content="https://mocksetu.in/og-image.png"')
      );
      ok(
        "a prerendered article inherits the correct declared size",
        aHead.includes(`property="og:image:width" content="${width}"`)
      );
    }
  }

  // The schema.org logo must be the square mark, and a real PNG.
  const logoFile = resolve(ROOT, "public", "mocksetu-logo-square.png");
  if (existsSync(logoFile)) {
    const b = readFileSync(logoFile);
    const i = b.indexOf("IHDR");
    ok(
      "mocksetu-logo-square.png is a real 1024x1024 PNG",
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
        b.readUInt32BE(i + 4) === 1024 &&
        b.readUInt32BE(i + 8) === 1024
    );
  } else {
    ok("public/mocksetu-logo-square.png exists", false);
  }

  // brand/README.md is explicit that the old file must stay until crawlers and
  // mail clients have re-fetched: it is still referenced by three email templates.
  ok(
    "the old /mocksetu-logo.png is still served (email templates depend on it)",
    existsSync(resolve(ROOT, "public", "mocksetu-logo.png"))
  );
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFAILURES:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
