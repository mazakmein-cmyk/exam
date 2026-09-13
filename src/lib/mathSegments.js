/**
 * mathSegments.js — which parts of a stored string are maths at all.
 *
 * Two decisions live here, and both are pure string work, so they sit in a
 * plain-JS module the node tests can import directly. (renderMath.ts is
 * TypeScript and imports KaTeX's stylesheet, so nothing in the suite can load
 * it; before this split the currency guard below — the single most
 * regression-prone rule in the renderer — was pinned by nothing at all.)
 *
 *   1. MATH_TOKEN_SOURCE  — where a candidate segment starts and ends.
 *   2. looksLikeMath      — whether a bare-dollar candidate is maths or money.
 *
 * KaTeX, caching, sanitisation and the HTML/text split stay in renderMath.ts.
 */

// ─── Tokeniser ─────────────────────────────────────────────────────────────
// Order matters: $$...$$ must be tried before $...$. Inline $...$ stays on a
// single line.
//
// Both dollar forms used to refuse raw < / > in their bodies as well, so that
// a pair of dollars could never swallow an HTML tag or pair up across a tag
// boundary. That cost us every inequality a paper actually asks about —
// "$(k > 0)$", "$a < b$" — which could not be tokenised at all, no matter
// what they contained. The protection was also redundant: in HTML mode the
// scanner is only ever handed the text BETWEEN tags (renderMathImpl splits on
// TAG_SOURCE first), so a complete tag can never be inside a candidate; and in
// text mode every non-math character is escaped on the way out and KaTeX
// escapes its own output, so no markup can be produced either way.
// (Entity-encoded &lt;/&gt; keep working too — they are decoded before the
// content reaches KaTeX.)
export const MATH_TOKEN_SOURCE =
  "(?<!\\\\)\\$\\$([^$]+?)(?<!\\\\)\\$\\$" + //   1: $$display$$
  "|\\\\\\[([\\s\\S]+?)\\\\\\]" + //              2: \[display\]
  "|\\\\\\(([\\s\\S]+?)\\\\\\)" + //              3: \(inline\)
  "|(?<!\\\\)\\$([^$\\n]+?)(?<!\\\\)\\$"; //      4: $inline$

// HTML tags and comments — segments the HTML-mode scanner must never enter.
// Requires a letter (or /) after "<" so a bare "x < 5" in text is not
// mistaken for a tag.
export const TAG_SOURCE = "<\\/?[a-zA-Z][^>]*>|<!--[\\s\\S]*?-->";

// ─── Currency guard ────────────────────────────────────────────────────────
/**
 * Is a bare-dollar candidate maths, or is it prose about money?
 *
 * `\(...\)` and `\[...\]` are explicit and never come here; only `$...$` and
 * `$$...$$` are ambiguous, because a rupee/dollar amount uses the same
 * character. Getting this wrong in the permissive direction is loud and ugly
 * — "Pay $500; $200 now" turns into italic gibberish — so the rules below
 * stay deliberately shy of anything that could be a price.
 *
 * @param {string} content the text between the delimiters, entities decoded
 * @param {boolean} isDisplay true for the `$$...$$` form
 * @returns {boolean}
 */
export function looksLikeMath(content, isDisplay) {
  // LaTeX structural characters — a backslash command, grouping, or scripts.
  if (/[\\^_{}]/.test(content)) return true;
  // An eaten backslash-escape (TAB+"imes", FF+"rac", ...) about to be repaired.
  if (/[\t\r\f\b\v][A-Za-z]/.test(content)) return true;
  // Unicode math symbols.
  if (/[×÷±≤≥≠√∑∏∫∞°πθΔαβγλμσΩ]/.test(content)) return true;
  // "$$...$$" is a deliberate display-math authoring choice, so a bare "="
  // is trusted there ($$v = u + at$$). It is NOT trusted for single-$ —
  // "Get $5 off when x = 2, so $p$..." would swallow the prose between two
  // ordinary prices.
  if (isDisplay && content.includes("=")) return true;
  // Compact token that contains at least one letter ($x$, $3x+2$, $a=b$).
  // The letter requirement rejects digit/punctuation-only currency fragments
  // like "5-", "500;", "5." that arise from "$5-$10" style prose.
  if (!/\s/.test(content) && /[A-Za-z]/.test(content)) return true;
  // Spaced content used to stop here, which made every airy inline formula
  // unrenderable — "$h(x) = f(|x|) + |f(x)|$" and "$(k > 0)$" both printed
  // raw, dollar signs and all, because they carry no backslash and no ^_{}.
  //
  // What lets us go further is the shape of the thing we are guarding
  // against: a price is ALWAYS "$" followed by a digit. So the fragments the
  // renderer's header warns about — "5-", "10 per unit", "500; ", "200 now",
  // "5 off when x = 2, so " — are all excluded by one cheap test, and past it
  // we can ask for an ordinary mathematical signal instead of a LaTeX one.
  if (/^[\s\d]/.test(content)) return false;
  return (
    /[A-Za-z]\(/.test(content) || // function application: f(x), h(x)
    /[=<>]/.test(content) || //      a relation: (k > 0), v = u + at
    /\|[^|]+\|/.test(content) //     absolute value: |x|
  );
}
