/**
 * check-post.mjs — validate one or more blog posts WITHOUT writing anything.
 *
 * Usage:
 *   node scripts/check-post.mjs how-to-create-a-timed-online-test
 *   node scripts/check-post.mjs slug-one slug-two      (several at once)
 *   node scripts/check-post.mjs --all                  (every post)
 *
 * WHY IT EXISTS
 * -------------
 * `generate-blog-index.mjs` is the authority, but it REWRITES blogIndex.ts,
 * sitemap.xml and feed.xml every time it runs. When several people — or
 * several agents — are each adding an article at the same time, every run
 * stamps those three shared files from whatever snapshot of the posts
 * directory that process saw, and the last one to finish wins. This script
 * applies the identical rules from scripts/lib/postRules.mjs and touches
 * nothing, so it is safe to run concurrently and safe to run mid-edit.
 *
 * It is a PRE-FLIGHT, not a replacement. Run the generator once when the batch
 * is finished: only it can catch duplicate slugs across posts, reused legacy
 * slugs, and the sitemap/feed being stale.
 *
 * Exit code is 1 if any ERROR was found, 0 otherwise. Warnings never fail the
 * run, but every one of them is a real defect — fix them before publishing.
 */
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { validatePost, wordCount } from "./lib/postRules.mjs";

const require = createRequire(import.meta.url);
const { transform } = require("esbuild");

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);
const POSTS_DIR = path.join(ROOT, "src", "data", "blog", "posts");

const args = process.argv.slice(2).filter(Boolean);
if (args.length === 0) {
  console.error("usage: node scripts/check-post.mjs <slug> [<slug>...] | --all");
  process.exit(2);
}

const every = readdirSync(POSTS_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.slice(0, -3));
const allSlugs = new Set(every);

const targets = args.includes("--all") ? every : args.map((a) => a.replace(/\.ts$/, ""));

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mocksetu-check-"));

/**
 * Evaluate a post module in Node.
 *
 * Import lines are stripped rather than resolved: every post file imports only
 * `type { BlogPost }`, which has no runtime meaning, and stripping avoids
 * needing the "@" alias here.
 */
async function loadPost(slug) {
  const file = path.join(POSTS_DIR, `${slug}.ts`);
  if (!existsSync(file)) throw new Error(`no such post file: src/data/blog/posts/${slug}.ts`);
  const src = readFileSync(file, "utf8").replace(/^import[^\n]*\n/gm, "");
  const { code } = await transform(src, { loader: "ts", format: "esm" });
  const tmpFile = path.join(tmpDir, `${slug}.mjs`);
  writeFileSync(tmpFile, code);
  return (await import(pathToFileURL(tmpFile).href)).default;
}

let totalErrors = 0;
let totalWarnings = 0;

for (const slug of targets) {
  let post;
  try {
    post = await loadPost(slug);
  } catch (err) {
    console.log(`\n${slug}`);
    console.log(`  ERROR  failed to load — ${err.message}`);
    totalErrors++;
    continue;
  }

  const { errors, warnings } = validatePost(post, `${slug}.ts`, allSlugs);
  totalErrors += errors.length;
  totalWarnings += warnings.length;

  const words = Array.isArray(post.content) ? wordCount(post) : 0;
  const h2s = Array.isArray(post.content) ? post.content.filter((b) => b.type === "h2").length : 0;
  const links = [...JSON.stringify(post.content ?? []).matchAll(/\]\((\/[^)\s"]*)\)/g)].map(
    (m) => m[1]
  );

  const verdict = errors.length ? "FAIL" : warnings.length ? "warn" : "ok  ";
  console.log(`\n${verdict}  ${slug}`);
  console.log(
    `      ${words} words · ${h2s} h2 · ${(post.faqs ?? []).length} faqs · ` +
      `${(post.tags ?? []).length} tags · ${links.length} links · ` +
      `metaTitle ${(post.metaTitle ?? "").length} · metaDesc ${(post.metaDescription ?? "").length}`
  );
  if (links.length) console.log(`      links: ${links.join(" ")}`);
  for (const e of errors) console.log(`      ERROR  ${e}`);
  for (const w of warnings) console.log(`      warn   ${w}`);
}

rmSync(tmpDir, { recursive: true, force: true });

console.log(
  `\nchecked ${targets.length} post(s): ${totalErrors} error(s), ${totalWarnings} warning(s)`
);
if (totalErrors) process.exit(1);
