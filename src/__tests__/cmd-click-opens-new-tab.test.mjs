/**
 * cmd-click-opens-new-tab.test.mjs — a destination has to be an href.
 *
 * Run with: node src/__tests__/cmd-click-opens-new-tab.test.mjs
 *
 * Ctrl/Cmd+click, middle-click, Shift+click, "Open link in new tab", "Copy link
 * address" and the status-bar URL preview are not features a page implements.
 * They are things the BROWSER does, for free, the moment a destination is
 * expressed as a real <a href>. Every one of them was broken across this app for
 * one reason: the destination lived in `onClick={() => navigate("/x")}` on a
 * <button> or a <div>, where there is no URL for the browser to see.
 *
 * So this suite does not test that Cmd+click works — that is the browser's job
 * and it cannot regress. It tests the only thing that CAN regress: that we keep
 * expressing destinations as links, and that we did not break anything on the
 * way there.
 *
 * Three of these would fail silently in production rather than throw:
 *
 *  [1] A <button> (or another <a>) nested inside a <Link> is invalid HTML. The
 *      browser recovers by splitting the elements apart, which is exactly the
 *      layout you did not draw, and the inner control stops being reliably
 *      clickable. It renders fine in the happy case, so only a scan catches it.
 *  [2] `disabled` does nothing on an anchor. A <Button disabled asChild> wrapping
 *      a <Link> still navigates — a dead-looking control that is very much alive.
 *  [3] target="_blank" without rel="noopener" hands the opened page a live
 *      window.opener handle back into this origin.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

/** Files on disk are CRLF here; every pattern below is written in LF. */
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // The shadcn primitives are vendored and deliberately untouched.
      if (name === "ui") continue;
      walk(full, out);
    } else if (name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
};

const FILES = walk(resolve(ROOT, "src")).map((f) => ({
  path: relative(ROOT, f).split("\\").join("/"),
  src: read(f),
}));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  FAIL ${name}\n     -> ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Walks from a `<Link` opening tag to its matching `</Link>`, counting nesting,
 * and returns what sits between them. A regex cannot do this: `[\s\S]*?</Link>`
 * stops at the first close tag, which is the WRONG one the moment anything
 * nests — and that is precisely the case worth catching.
 */
function linkBodies(src) {
  const bodies = [];
  const open = /<Link(\s|>)/g;
  let m;
  while ((m = open.exec(src))) {
    const tagEnd = src.indexOf(">", m.index);
    if (tagEnd === -1) continue;
    if (src[tagEnd - 1] === "/") continue; // self-closing: <Link ... />
    let depth = 1;
    let i = tagEnd + 1;
    const start = i;
    while (i < src.length && depth > 0) {
      const nextOpen = src.indexOf("<Link", i);
      const nextClose = src.indexOf("</Link>", i);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 5;
      } else {
        depth--;
        if (depth === 0) bodies.push(src.slice(start, nextClose));
        i = nextClose + 7;
      }
    }
  }
  return bodies;
}

console.log("\n[1] the destination is an href, not a handler");

/**
 * The one exception is deliberate and named. `onClick={() => navigate(...)}` is
 * still right for a click that DOES something before it moves — there is no
 * shareable destination before it runs, and Cmd+clicking it into a background
 * tab would either repeat the action or open a URL that is not ready.
 *
 * Anything added to this list needs that same justification written down.
 */
const NAVIGATE_ON_CLICK_ALLOWED = new Map([
  [
    "src/pages/StudentAuth.tsx",
    "the 'Leave & Discard' button inside a confirm dialog: it throws away pending guest submissions and only then leaves",
  ],
]);

test("no navigational click is left as an onClick handler", () => {
  const offenders = [];
  for (const { path, src } of FILES) {
    const hits = src.match(/onClick=\{\(\) => navigate\(/g);
    if (!hits) continue;
    if (NAVIGATE_ON_CLICK_ALLOWED.has(path)) continue;
    offenders.push(`${path} (${hits.length})`);
  }
  assert(
    offenders.length === 0,
    `a destination expressed as a handler cannot be Cmd+clicked, copied or previewed: ${offenders.join(", ")}`
  );
});

test("the allowlist describes something that is really still there", () => {
  // A stale allowlist quietly stops protecting anything. If the entry is gone,
  // the entry should go too.
  for (const [path, why] of NAVIGATE_ON_CLICK_ALLOWED) {
    const file = FILES.find((f) => f.path === path);
    assert(file, `${path} is allowlisted but no longer exists`);
    assert(
      /onClick=\{\(\) => navigate\(/.test(file.src),
      `${path} no longer has a navigate() onClick — drop the allowlist entry (${why})`
    );
  }
});

console.log("\n[2] the conversions did not break the markup");

test("nothing interactive is nested inside a <Link>", () => {
  const offenders = [];
  for (const { path, src } of FILES) {
    for (const body of linkBodies(src)) {
      // <Button asChild><Link>...</Link></Button> is the correct idiom and puts
      // the Button OUTSIDE — so only the inside of a Link is searched here.
      if (/<button[\s>]/.test(body)) offenders.push(`${path}: <button> inside <Link>`);
      if (/<Button[\s>]/.test(body)) offenders.push(`${path}: <Button> inside <Link>`);
      if (/<a[\s>]/.test(body)) offenders.push(`${path}: <a> inside <Link>`);
    }
  }
  assert(
    offenders.length === 0,
    `interactive content nested in an anchor is invalid and splits at render: ${offenders.join("; ")}`
  );
});

test("no <Button disabled> was turned into a link", () => {
  // An <a> ignores `disabled` entirely, so asChild + disabled is a control that
  // looks dead and still navigates.
  const offenders = [];
  for (const { path, src } of FILES) {
    const re = /<Button\b[^>]*>/g;
    let m;
    while ((m = re.exec(src))) {
      const tag = m[0];
      if (/\basChild\b/.test(tag) && /\bdisabled[=\s]/.test(tag)) {
        offenders.push(`${path}: ${tag.slice(0, 90)}`);
      }
    }
  }
  assert(offenders.length === 0, `disabled is ignored on an anchor: ${offenders.join("; ")}`);
});

test("every new-tab link is opened safely", () => {
  const offenders = [];
  for (const { path, src } of FILES) {
    const re = /target="_blank"/g;
    let m;
    while ((m = re.exec(src))) {
      const start = src.lastIndexOf("<", m.index);
      const end = src.indexOf(">", m.index);
      const el = start >= 0 && end > 0 ? src.slice(start, end + 1) : "";
      if (!/noopener/.test(el)) {
        offenders.push(`${path}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
  }
  assert(
    offenders.length === 0,
    `target="_blank" without rel="noopener" leaves window.opener pointing back at this origin: ${offenders.join(", ")}`
  );
});

test("no in-place navigation is a raw <a> to an internal route", () => {
  // <a href="/dashboard"> works, but costs a full document reload and throws
  // away the SPA's warm state, so internal in-place destinations go through
  // <Link>.
  //
  // target="_blank" is deliberately exempt, and not as a loophole: a new tab
  // loads the app from scratch no matter which element opened it, so there is
  // no reload to avoid. The three anchors this exempts all sit inside the JSON
  // upload dialog, where following the guide in THIS tab would throw away a
  // half-finished upload — a new tab is the point, not an oversight.
  const offenders = [];
  for (const { path, src } of FILES) {
    const re = /<a\s[^>]*href=[{"]\/?[^>]*>/g;
    let m;
    while ((m = re.exec(src))) {
      const tag = m[0];
      if (!/href="\/(?!\/)/.test(tag)) continue; // external, mailto:, or an expression
      if (/target="_blank"/.test(tag)) continue;
      offenders.push(`${path}: ${tag.slice(0, 80)}`);
    }
  }
  assert(
    offenders.length === 0,
    `an internal route behind a raw in-place <a href> reloads the whole app: ${offenders.join("; ")}`
  );
});

console.log("\n[3] the shared rule module is intact");

test("navigation.ts still exports the escape hatch", () => {
  const src = read(resolve(ROOT, "src/lib/navigation.ts"));
  assert(/export const isModifiedClick/.test(src), "isModifiedClick is the shared definition of 'not here'");
  assert(
    /metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey/.test(src),
    "all four modifiers count — Cmd/Ctrl open a tab, Shift a window, Alt downloads"
  );
  assert(
    /button !== 0/.test(src),
    "middle-click has to count too, or a hand-rolled handler and <Link> disagree about what a modified click is"
  );
});

test("a Link whose onClick has side effects guards them against a modified click", () => {
  // react-router runs a <Link>'s onClick BEFORE it decides to stand aside. So a
  // handler that changes THIS page must check first, or "open that over there"
  // silently changes things here as well. The dashboard tab toggle is the case
  // that taught us this.
  const dash = FILES.find((f) => f.path === "src/pages/Dashboard.tsx");
  assert(dash, "Dashboard.tsx must exist");
  const tabLinks = dash.src.match(/handleTabChange\("(mock|live)"\)/g) || [];
  assert(tabLinks.length >= 2, "both dashboard tabs should still be addressable");
  assert(
    (dash.src.match(/if \(isModifiedClick\(e\)\) return;/g) || []).length >= 2,
    "a Cmd+click on a tab must open the other tab elsewhere without flipping this one"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\nEvery destination is a link the browser can open where you want it.");
