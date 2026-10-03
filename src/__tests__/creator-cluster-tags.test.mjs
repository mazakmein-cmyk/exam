/**
 * creator-cluster-tags.test.mjs — the creator content cluster's wiring holds.
 *
 * WHAT CAN SILENTLY BREAK, AND WHY EACH CHECK IS HERE
 * ---------------------------------------------------
 * The end-of-article CTA in BlogPost.tsx is resolved by TAG, and `resolveCta`
 * returns the FIRST entry whose tag the post carries. That design is what lets
 * a new article join a funnel without a code edit, and it is also its one sharp
 * edge: a post tagged both "SSC MTS" and "For Creators" silently sends a
 * coaching owner who just read "How to create an SSC MTS mock test" to the
 * student previous-papers page. Nothing crashes. Nothing logs. The funnel just
 * leaks, and the creator pillar the whole cluster exists to lift never receives
 * the link. Test 1 makes that collision impossible.
 *
 * Test 2 catches the opposite mistake: an educator article written with the
 * right category but no "For Creators" tag gets the generic /marketplace CTA,
 * which hands a teacher a student library.
 *
 * Tests 3-6 cover the rest of the Step 0 wiring that has no other guard —
 * the CTA entry itself, the pillar's hand-maintained guide links, the link
 * whitelist the Hindi articles depend on, and English/Hindi copy parity on the
 * pillar's new FAQ and capability band.
 *
 * See docs/creator-content-cluster.md for the cluster this protects.
 *
 * Run with: node src/__tests__/creator-cluster-tags.test.mjs
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * This checkout runs with core.autocrlf, so every .ts/.tsx file is CRLF on
 * disk even though git reports LF. Any multi-line anchor matched against the
 * raw bytes fails for a reason that has nothing to do with the code.
 */
const read = (...p) => readFileSync(resolve(ROOT, ...p), "utf-8").replace(/\r\n/g, "\n");

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
// Post metadata comes from the generated index, not from parsing 200 TS files.
//
// generate-blog-index.mjs writes one JSON.stringify'd object per line, so each
// line parses on its own. Reading the generated artifact rather than the
// sources also means a stale index — someone adding a post without rerunning
// the generator — shows up here as a missing post rather than a false pass.
// ─────────────────────────────────────────────────────────────────────────────
const indexSrc = read("src", "data", "blog", "blogIndex.ts");
const metas = indexSrc
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("{") && l.includes('"slug"'))
  .map((l) => JSON.parse(l.replace(/,$/, "")));

console.log(`\ncreator cluster tags (${metas.length} posts in the generated index)`);

const CREATOR_TAG = "For Creators";
const CREATOR_CATEGORY = "For Educators";
/**
 * Tags that route the CTA to a STUDENT pillar. Keep in sync with CLUSTER_CTAS
 * in src/pages/BlogPost.tsx — test 3 below asserts that this list and that
 * table describe the same set of funnels, so adding a cluster there without
 * adding it here is itself a failure.
 */
const STUDENT_CLUSTER_TAGS = ["SSC MTS", "JEE Main"];

// ── 1. No post carries a creator tag AND a student cluster tag ──────────────
{
  const collisions = metas
    .filter((m) => (m.tags || []).includes(CREATOR_TAG))
    .map((m) => ({
      slug: m.slug,
      clashes: (m.tags || []).filter((t) => STUDENT_CLUSTER_TAGS.includes(t)),
    }))
    .filter((c) => c.clashes.length > 0);

  ok(
    "no post carries both a creator tag and a student cluster tag",
    collisions.length === 0,
    collisions.map((c) => `${c.slug} also tagged ${c.clashes.join("+")}`).join("; ")
  );
}

// ── 2. Every "For Educators" post carries the creator tag ───────────────────
{
  const educatorPosts = metas.filter((m) => m.category === CREATOR_CATEGORY);
  const untagged = educatorPosts.filter((m) => !(m.tags || []).includes(CREATOR_TAG));

  ok(
    `every "${CREATOR_CATEGORY}" post carries the "${CREATOR_TAG}" tag`,
    untagged.length === 0,
    untagged.length
      ? `${untagged.length} untagged: ${untagged.map((m) => m.slug).join(", ")}`
      : ""
  );
  ok(
    `the "${CREATOR_CATEGORY}" category is not empty`,
    educatorPosts.length > 0,
    "no creator-side articles exist yet"
  );
}

// ── 3. The CTA table actually routes that tag to the pillar ─────────────────
{
  const blogPost = read("src", "pages", "BlogPost.tsx");
  const table = blogPost.slice(
    blogPost.indexOf("const CLUSTER_CTAS"),
    blogPost.indexOf("const resolveCta")
  );

  ok(
    "CLUSTER_CTAS exists and was located",
    table.length > 0 && table.includes("tag:"),
    "could not slice the CTA table out of BlogPost.tsx"
  );
  ok(
    `CLUSTER_CTAS routes "${CREATOR_TAG}" to /for-creators`,
    table.includes(`tag: "${CREATOR_TAG}"`) && table.includes('to: "/for-creators"'),
    "the creator funnel is missing, so every educator article falls back to /marketplace"
  );

  // The creator entry must come LAST. resolveCta takes the first match, so a
  // creator entry placed above the student ones would hijack any post that
  // ever carried both tags. Test 1 should make that impossible, but ordering
  // is the cheaper of the two guarantees and costs nothing to assert.
  const creatorAt = table.indexOf(`tag: "${CREATOR_TAG}"`);
  const lastStudentAt = Math.max(...STUDENT_CLUSTER_TAGS.map((t) => table.indexOf(`tag: "${t}"`)));
  ok(
    "the creator CTA is listed after every student CTA",
    creatorAt > lastStudentAt,
    `creator at ${creatorAt}, last student at ${lastStudentAt}`
  );

  // Every student tag this file knows about must really be in the table, or
  // test 1 is checking a set that no longer matches reality.
  for (const t of STUDENT_CLUSTER_TAGS) {
    ok(`STUDENT_CLUSTER_TAGS entry "${t}" is a real CLUSTER_CTAS funnel`, table.includes(`tag: "${t}"`));
  }

  // And the reverse: a cluster added to the table but not to this file would
  // leave a collision unguarded.
  const tagsInTable = [...table.matchAll(/tag:\s*"([^"]+)"/g)].map((m) => m[1]);
  const unknown = tagsInTable.filter(
    (t) => t !== CREATOR_TAG && !STUDENT_CLUSTER_TAGS.includes(t)
  );
  ok(
    "no CLUSTER_CTAS funnel is unknown to this test",
    unknown.length === 0,
    unknown.length ? `add to STUDENT_CLUSTER_TAGS: ${unknown.join(", ")}` : ""
  );
}

// ── 4. Pillar guide links resolve to real posts ─────────────────────────────
//
// The prerenderer fails the build on this too, but only when a build is run.
// Catching it in the test suite means a dead link on the pillar surfaces
// before anyone waits on vite.
{
  const guidesSrc = read("src", "data", "creatorGuides.ts");
  const slugs = [...guidesSrc.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  const postsDir = resolve(ROOT, "src", "data", "blog", "posts");
  const real = new Set(readdirSync(postsDir).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3)));

  ok("CREATOR_GUIDES is not empty", slugs.length > 0);
  const dead = slugs.filter((s) => !real.has(s));
  ok(
    "every CREATOR_GUIDES slug is a real post",
    dead.length === 0,
    dead.length ? `dead links on the pillar: ${dead.join(", ")}` : ""
  );
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  ok("CREATOR_GUIDES has no duplicate slugs", dupes.length === 0, [...new Set(dupes)].join(", "));
}

// ── 5. The link whitelist knows the Hindi routes ────────────────────────────
//
// Bilingual creator articles link to /hindi/for-creators. The validator treats
// an unknown static path as a hard ERROR, so without these entries the whole
// content build stops on the first such article.
//
// Read from scripts/lib/postRules.mjs, which is where the whitelist lives now
// that generate-blog-index.mjs and check-post.mjs share it.
{
  const gen = read("scripts", "lib", "postRules.mjs");
  const list = gen.slice(
    gen.indexOf("export const KNOWN_STATIC_PATHS"),
    gen.indexOf("export const LEGACY_SLUGS")
  );
  ok(
    "the whitelist was located in scripts/lib/postRules.mjs",
    list.length > 0 && list.includes('"/marketplace"'),
    "KNOWN_STATIC_PATHS moved again — update this test"
  );
  ok("KNOWN_STATIC_PATHS includes /for-creators", list.includes('"/for-creators"'));
  ok("KNOWN_STATIC_PATHS includes /hindi/for-creators", list.includes('"/hindi/for-creators"'));
  ok("KNOWN_STATIC_PATHS includes /hindi", list.includes('"/hindi"'));
  // /auth is noindexed and robots-disallowed; an article must never link there.
  ok(
    "KNOWN_STATIC_PATHS does not whitelist /auth",
    !list.includes('"/auth"'),
    "articles would be allowed to link to a noindexed, robots-disallowed page"
  );
}

// ── 6. English and Hindi pillar copy stay in step ───────────────────────────
//
// The two tables satisfy one TypeScript type, so a MISSING key is a compile
// error and needs no test. What the type cannot catch is a count mismatch:
// eight FAQs in English and six in Hindi still typechecks, and would ship a
// Hindi FAQPage that answers fewer questions than the English one.
{
  const en = read("src", "i18n", "creatorCopy.en.ts");
  const hi = read("src", "i18n", "creatorCopy.hi.ts");
  const countOf = (src, key) => (src.match(new RegExp(`\\b${key}:`, "g")) || []).length;

  const enFaqs = countOf(en, "question");
  const hiFaqs = countOf(hi, "question");
  ok("English pillar FAQ is populated", enFaqs >= 6, `${enFaqs} questions`);
  ok(
    "Hindi pillar FAQ has the same number of questions as English",
    enFaqs === hiFaqs,
    `en ${enFaqs} vs hi ${hiFaqs}`
  );

  const enFeatures = countOf(en, "linkLabel");
  const hiFeatures = countOf(hi, "linkLabel");
  ok("English capability band is populated", enFeatures >= 3, `${enFeatures} rows`);
  ok(
    "Hindi capability band has the same number of rows as English",
    enFeatures === hiFeatures,
    `en ${enFeatures} vs hi ${hiFeatures}`
  );

  // Both tables link to the same destinations — a Hindi row pointing at an
  // article the English row does not is a translation drift, not a choice.
  const dests = (src) =>
    [...src.matchAll(/to:\s*"(\/blog\/[^"]+)"/g)].map((m) => m[1]).sort().join("|");
  ok(
    "both languages' capability rows link to the same guides",
    dests(en) === dests(hi),
    `en [${dests(en)}] vs hi [${dests(hi)}]`
  );
}

// ── 7. The pillar emits exactly one FAQPage ─────────────────────────────────
//
// Two competing FAQPage nodes on one URL means neither is trusted. The page
// now has a real FAQ, so the risk is someone adding a second block later.
{
  const page = read("src", "pages", "ForCreators.tsx");
  const builder = read("src", "lib", "seo", "structuredData.ts");

  ok(
    "ForCreators.tsx builds its JSON-LD from the shared builder",
    page.includes("buildCreatorPageJsonLd"),
    "inline JSON-LD cannot be reached by scripts/prerender.mjs"
  );
  // Matches a JSON-LD @type literal, not the bare word: the page's own source
  // comments name FAQPage while explaining why there must only ever be one,
  // and a check that cannot tell documentation from a node fires on the very
  // comment warning you not to add a node.
  ok(
    "ForCreators.tsx declares no FAQPage node of its own",
    !/"@type"\s*:\s*"FAQPage"/.test(page) && !/@type:\s*"FAQPage"/.test(page),
    "a second FAQPage node would collide with the builder's"
  );
  const faqPageNodes = (builder.match(/"@type":\s*"FAQPage"/g) || []).length;
  ok(
    "buildCreatorPageJsonLd emits at most one FAQPage",
    (builder.slice(builder.indexOf("buildCreatorPageJsonLd")).match(/"FAQPage"/g) || []).length === 1,
    `${faqPageNodes} FAQPage literals in the whole module (2 expected: exam landing + creator)`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
