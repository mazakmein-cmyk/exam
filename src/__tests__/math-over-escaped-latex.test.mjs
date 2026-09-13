/**
 * MATH RENDERING — one backslash too many, and the formulas that never got a
 * chance.
 *
 * Run with: node src/__tests__/math-over-escaped-latex.test.mjs
 *
 * The bug this exists to stop (reported 2026-09-13, a JEE-style calculus item).
 * The question list showed this, as literal text, dollar signs and all:
 *
 *   If $f(x) = \\begin{cases} x-2 & 0 \\le x \\le 2 \\\\ -2 & ... \end{cases}$
 *   and $h(x) = f(|x|) + |f(x)|$ then
 *   int_0^k h(x)dx is equal to $(k > 0)$
 *
 * Four segments, and it took four different defects to produce them:
 *
 *  1. The stored LaTeX carries one level too many of backslash escaping —
 *     the model applied JSON's doubling rule to LaTeX it had already doubled.
 *     `\\begin` stops the environment from opening, so KaTeX throws and the
 *     reader gets the raw string.
 *  2. `$\\int_0^k h(x)dx$` has the SAME corruption but does NOT throw: KaTeX
 *     reads `\\` as a row break and renders italic i, n, t. Silent, and the
 *     only one of the four a reader could mistake for a real formula.
 *  3. `$h(x) = f(|x|) + |f(x)|$` was rejected by the currency guard, which
 *     refused any spaced segment without a backslash or ^ _ { }.
 *  4. `$(k > 0)$` could not even be tokenised: both dollar forms excluded
 *     `<` and `>` from their bodies, so no inequality was ever renderable.
 *
 * Defects 1 and 2 are fixed in lib/latexEscapes.js, 3 and 4 in
 * lib/mathSegments.js. Both are plain JS precisely so this file can reach
 * them — renderMath.ts imports KaTeX's stylesheet and cannot be loaded here.
 *
 * The other half of every assertion is the thing that must NOT move: prose
 * about money stays prose, and correctly-escaped LaTeX is left alone.
 */

import katex from "katex";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  collapseDoubledBackslashes,
  collapseIfSafelyOverEscaped,
  documentIsOverEscaped,
  hasOverEscapedCommand,
  hasRowSeparatorContext,
} from "../lib/latexEscapes.js";
import { MATH_TOKEN_SOURCE, TAG_SOURCE, looksLikeMath } from "../lib/mathSegments.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Every file in this checkout is CRLF on disk; a static pin written with a
// bare \n would silently never match.
const readSrc = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
const eq = (got, want, msg) => {
  if (got !== want)
    throw new Error(
      `${msg}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`,
    );
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ─── A faithful stand-in for renderMath.ts's KaTeX stage ──────────────────
// Mirrors renderSegment's attempt chain (pinned against the real source at
// the bottom of this file) so the assertions below describe what a reader
// actually sees, not what a helper in isolation returns.
const KATEX_OPTS = {
  throwOnError: true,
  strict: "ignore",
  trust: false,
  output: "htmlAndMathml",
};
function tryKatex(latex, displayMode) {
  try {
    return katex.renderToString(latex, { ...KATEX_OPTS, displayMode });
  } catch {
    return null;
  }
}
function renderSegment(inner, displayMode) {
  const decoded = collapseIfSafelyOverEscaped(inner);
  return (
    tryKatex(decoded, displayMode) ??
    (hasOverEscapedCommand(decoded)
      ? tryKatex(collapseDoubledBackslashes(decoded), displayMode)
      : null)
  );
}
/**
 * The text a reader ends up looking at: math segments replaced by the glyphs
 * KaTeX draws, everything else verbatim. KaTeX's MathML annotation repeats the
 * LaTeX source, so it is stripped — otherwise every "no backslash survives"
 * assertion would just be reading the input back.
 */
function readerSees(input) {
  const re = new RegExp(MATH_TOKEN_SOURCE, "g");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(input)) !== null) {
    const start = m.index;
    const full = m[0];
    const display = m[1] ?? m[2];
    const inline = m[3] ?? m[4];
    const isDollarForm = m[1] !== undefined || m[4] !== undefined;
    const inner = display ?? inline ?? "";
    const isDisplay = display !== undefined;
    if (isDollarForm && !looksLikeMath(inner, isDisplay)) {
      out += input.slice(last, start + 1);
      last = start + 1;
      re.lastIndex = start + 1;
      continue;
    }
    const rendered = inner.trim() ? renderSegment(inner, isDisplay) : null;
    if (rendered === null) {
      out += input.slice(last, start + full.length);
      last = start + full.length;
      continue;
    }
    out += input.slice(last, start);
    out += rendered
      .replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, "")
      .replace(/<math[\s\S]*?<\/math>/g, "")
      .replace(/<[^>]*>/g, "");
    last = start + full.length;
  }
  out += input.slice(last);
  return out;
}

// The reported question, exactly as stored. In this source each `\\` is ONE
// literal backslash, so `\\\\begin` below is the two-backslash spelling the
// screenshot showed.
const REPORTED =
  "If $f(x) = \\\\begin{cases} x-2 & 0 \\\\le x \\\\le 2 \\\\\\\\ -2 & -2 \\\\le x \\\\le 0 \\\\end{cases}$ " +
  "and $h(x) = f(|x|) + |f(x)|$ then $\\\\int_0^k h(x)dx$ is equal to $(k > 0)$";

console.log("\n[1] the reported question renders, end to end");

test("not one literal backslash reaches the reader", () => {
  const seen = readerSees(REPORTED);
  ok(!seen.includes("\\"), `backslashes survived: ${seen}`);
});

test("no segment is printed with its dollar delimiters", () => {
  const seen = readerSees(REPORTED);
  ok(!/\$[^$]+\$/.test(seen), `a segment was left raw: ${seen}`);
});

test("the piecewise definition becomes a cases environment", () => {
  // KaTeX draws the brace and stacks the rows; "begin" as literal letters is
  // what the broken render showed instead.
  const seen = readerSees(REPORTED);
  ok(!seen.includes("begin"), `the environment never opened: ${seen}`);
  ok(seen.includes("≤"), `\\le never became a glyph: ${seen}`);
});

test("the integral sign comes back — the silent failure", () => {
  const seen = readerSees(REPORTED);
  ok(seen.includes("∫"), `still no integral sign: ${seen}`);
});

test("$h(x) = f(|x|) + |f(x)|$ is recognised as maths", () => {
  ok(looksLikeMath("h(x) = f(|x|) + |f(x)|", false), "the currency guard still rejects it");
});

test("$(k > 0)$ can be tokenised at all", () => {
  const re = new RegExp(MATH_TOKEN_SOURCE, "g");
  const m = re.exec("$(k > 0)$");
  ok(m !== null, "the inequality still cannot be matched");
  eq(m[4], "(k > 0)", "the wrong text was captured");
  ok(looksLikeMath("(k > 0)", false), "tokenised, but the guard rejects it");
});

console.log("\n[2] money is still money");

// The corpus renderMath.ts's own header promises will stay prose.
const CURRENCY = [
  ["$5-$10 per unit", "5-"],
  ["Pay $500; $200 now", "500; "],
  ["Get $5 off when x = 2, so $p$ is the price", "5 off when x = 2, so "],
  ["It costs $5 and $10 respectively", "5 and "],
  ["Budget $1,200 or $1,500 depending", "1,200 or "],
];
for (const [prose, fragment] of CURRENCY) {
  test(`"${prose}" — the fragment "${fragment}" is not maths`, () => {
    ok(!looksLikeMath(fragment, false), "a price fragment was treated as maths");
  });
}

test("a price sentence survives rendering unchanged", () => {
  const s = "A widget is $5-$10 per unit depending on volume.";
  eq(readerSees(s), s, "currency prose was rewritten");
});

test("…but a real $p$ in the same sentence still renders", () => {
  const seen = readerSees("Get $5 off when x = 2, so $p$ is the price.");
  ok(!seen.includes("$p$"), `the variable stayed raw: ${seen}`);
  ok(seen.includes("$5 off"), `the price was eaten: ${seen}`);
});

test("a digit-led spaced segment is never maths, whatever it contains", () => {
  ok(!looksLikeMath("5 = 10 for x", false), "a digit-led fragment slipped through");
  ok(!looksLikeMath("10 > 5 dollars", false), "a digit-led fragment slipped through");
});

test("prose between two dollars with no operator stays prose", () => {
  ok(!looksLikeMath("dollars and CA", false), "plain words were treated as maths");
});

console.log("\n[3] correctly-escaped LaTeX is left alone");

test("a genuine cases environment still renders", () => {
  const good = "$\\begin{cases} x-2 & 0 \\le x \\le 2 \\\\ -2 & -2 \\le x \\le 0 \\end{cases}$";
  const seen = readerSees(good);
  ok(!seen.includes("\\"), `a correct formula was damaged: ${seen}`);
  ok(seen.includes("≤"), `\\le did not render: ${seen}`);
});

test("an unspaced row separator is not mistaken for over-escaping", () => {
  // `\begin{matrix}a\\b\end{matrix}` is correct LaTeX; collapsing its `\\`
  // would break it. The environment check is what protects it.
  const src = "\\begin{matrix}a\\\\b\\end{matrix}";
  ok(hasOverEscapedCommand(src), "the `\\\\b` signature is present, as expected");
  ok(hasRowSeparatorContext(src), "an environment must be detected here");
  eq(collapseIfSafelyOverEscaped(src), src, "a legitimate row break was collapsed");
  ok(readerSees("$" + src + "$") !== "$" + src + "$", "the matrix stopped rendering");
});

test("a correct \\int is not touched", () => {
  eq(collapseIfSafelyOverEscaped("\\int_0^k"), "\\int_0^k", "a correct command was collapsed");
});

console.log("\n[4] the collapse itself");

test("runs are halved, never below one", () => {
  eq(collapseDoubledBackslashes("\\\\frac"), "\\frac", "2 -> 1");
  eq(collapseDoubledBackslashes("\\\\\\\\"), "\\\\", "4 -> 2, the row separator survives");
  eq(collapseDoubledBackslashes("\\frac"), "\\frac", "a lone backslash is left alone");
  eq(collapseDoubledBackslashes("\\\\\\le"), "\\le", "3 -> 1");
});

test("the signature needs a letter after the pair", () => {
  ok(hasOverEscapedCommand("\\\\int"), "`\\\\int` must be flagged");
  ok(!hasOverEscapedCommand("a \\\\ b"), "a spaced row break must not be flagged");
  ok(!hasOverEscapedCommand("\\int"), "correct LaTeX must not be flagged");
});

test("the silent case is collapsed before KaTeX ever sees it", () => {
  eq(collapseIfSafelyOverEscaped("\\\\int_0^k h(x)dx"), "\\int_0^k h(x)dx", "not collapsed");
});

console.log("\n[5] whole-document detection, for the import path");

test("a paper the model double-escaped is detected", () => {
  ok(
    documentIsOverEscaped("$\\\\frac{1}{2}$ and $\\\\sqrt{7}$ and $\\\\le$"),
    "an over-escaped paper was missed",
  );
});

test("a correctly-escaped paper is never touched", () => {
  ok(
    !documentIsOverEscaped("$\\frac{1}{2}$ $\\sqrt{7}$ $\\begin{matrix}a\\\\b\\end{matrix}$"),
    "a correct paper would have been collapsed",
  );
});

test("one stray row separator does not condemn a paper", () => {
  // A single `\\b` against several single-backslash commands must lose the
  // ratio test — this is what stops a legitimate matrix from being rewritten.
  ok(
    !documentIsOverEscaped("$\\begin{matrix}a\\\\b\\end{matrix}$ and $\\frac{1}{2}$"),
    "the ratio test was too eager",
  );
});

test("prose with no backslashes is never flagged", () => {
  ok(!documentIsOverEscaped("no backslashes here at all"), "plain prose was flagged");
});

console.log("\n[6] the HTML boundary did not move");

test("a $ inside an attribute is still unreachable", () => {
  // The tokeniser now allows < and > in a math body; that is only safe
  // because HTML-mode scanning never enters a tag in the first place.
  const html = '<img src="/a$b$c.png" class="passage-image"> costs $5 and $10';
  const tagRe = new RegExp(TAG_SOURCE, "g");
  let out = "";
  let last = 0;
  let t;
  while ((t = tagRe.exec(html)) !== null) {
    out += readerSees(html.slice(last, t.index)) + t[0];
    last = t.index + t[0].length;
  }
  out += readerSees(html.slice(last));
  ok(out.includes('src="/a$b$c.png"'), `an attribute was rewritten: ${out}`);
});

test("a bare 'x < 5' is still not treated as a tag", () => {
  const tagRe = new RegExp(TAG_SOURCE, "g");
  ok(!tagRe.test("x < 5 and y > 3"), "plain inequalities must not look like markup");
});

console.log("\n[7] renderMath.ts is actually wired to all of this");

const RENDER_MATH = readSrc("src/lib/renderMath.ts");

test("the renderer imports the shared escape helpers", () => {
  ok(
    /from "\.\/latexEscapes\.js"/.test(RENDER_MATH),
    "renderMath must use the shared collapse, not its own copy",
  );
  ok(
    /from "\.\/mathSegments\.js"/.test(RENDER_MATH),
    "renderMath must use the shared tokeniser and guard",
  );
});

test("the silent case is repaired BEFORE KaTeX, not after", () => {
  ok(
    /const decoded = collapseIfSafelyOverEscaped\(decodeBasicEntities\(inner\)\);/.test(RENDER_MATH),
    "`\\\\int` does not throw, so a retry-after-failure repair can never reach it",
  );
});

test("the loud case keeps a last-resort retry", () => {
  ok(
    /hasOverEscapedCommand\(decoded\)\s*\n?\s*\?\s*tryKatex\(collapseDoubledBackslashes\(decoded\), displayMode\)/.test(
      RENDER_MATH,
    ),
    "the third KaTeX attempt is what rescues an over-escaped cases environment",
  );
});

test("no duplicate guard or tokeniser was left behind", () => {
  ok(!/function looksLikeMath/.test(RENDER_MATH), "a second copy of the guard would drift");
  ok(!/const MATH_TOKEN_SOURCE/.test(RENDER_MATH), "a second copy of the tokeniser would drift");
});

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
