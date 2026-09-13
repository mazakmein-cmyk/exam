/**
 * Shared LaTeX/math renderer for question content.
 *
 * Questions imported via JSON keep math as raw `$...$` / `$$...$$` (and
 * `\(...\)` / `\[...\]`) LaTeX — the AI extraction guide tells the model to
 * emit exactly that. The WYSIWYG editors, in contrast, bake finished KaTeX
 * HTML at insert time, so their content contains no `$` delimiters at all.
 * This module closes the gap at display time: it finds math segments in a
 * stored string and replaces them with KaTeX HTML, leaving everything else
 * byte-for-byte untouched.
 *
 * Safety rules (nothing can regress):
 *  - Any segment KaTeX cannot parse is emitted exactly as it was stored.
 *  - `renderMathInText` HTML-escapes all non-math content, so a plain-text
 *    option renders character-identical to the previous `{option}` JSX.
 *  - A `$...$` / `$$...$$` candidate is only treated as math when it carries
 *    a math signal (backslash command, ^ _ { }, a math symbol, a compact
 *    letter-bearing token, or — for spaced content that cannot be a price,
 *    because it does not open with a digit — a relation, a function call or
 *    absolute-value bars). Currency prose — "$5-$10 per unit", "Pay $500;
 *    $200 now", "Get $5 off when x = 2" — stays prose. See mathSegments.js.
 *  - In HTML mode the scanner never looks inside tags, so a `$` in an
 *    attribute (image URLs etc.) can never be rewritten. That is also what
 *    makes it safe for a math body to contain `<` or `>`, so the inequality
 *    a question actually asks about ("$(k > 0)$") can render at all.
 *  - LaTeX escaped one level too many (`\\int` for `\int`) is collapsed, but
 *    only where a `\\` cannot be a legitimate row separator, or after KaTeX
 *    has already refused the segment. See latexEscapes.js.
 *  - Eaten-escape repair never touches newlines in display math, where a
 *    line break before `u`/`e`/`i` is legitimate formatting, not a broken
 *    `\nu`/`\neq`/`\ni`.
 *  - Editor-baked content has no `$` delimiters, so it is returned untouched
 *    by the fast path and can never be double-rendered.
 */
import katex from "katex";
// KaTeX's stylesheet ships with the chunks that render math instead of inside
// the global CSS bundle. Every screen that can display math imports this
// module (or katex itself), so the style always arrives with the code that
// needs it — and the exam library / landing pages stop downloading it.
import "katex/dist/katex.min.css";
import {
  collapseDoubledBackslashes,
  collapseIfSafelyOverEscaped,
  hasOverEscapedCommand,
} from "./latexEscapes.js";
import { MATH_TOKEN_SOURCE, TAG_SOURCE, looksLikeMath } from "./mathSegments.js";
import { looksLikeHtml, renderClozeBlanks } from "./richText";
import { sanitizeStoredHtml } from "./sanitizeHtml";

// ─── Bounded cache (exam pages re-render on every timer tick) ─────────────
const CACHE_MAX = 500;
const cache = new Map<string, string>();

function cacheSet(key: string, value: string): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// ─── Escaping ──────────────────────────────────────────────────────────────
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// ─── Eaten-escape repair ───────────────────────────────────────────────────
// JSON.parse turns an under-escaped "\times" into TAB + "imes", "\frac" into
// FORM-FEED + "rac", "\right" into CR + "ight", etc. Inside a math segment a
// raw TAB/FF/BS/VT/CR immediately followed by a letter is almost always one
// of these casualties, so restore the eaten backslash-escape.
//
// Newlines are the exception: inside DISPLAY math a line break before a
// letter is usually genuine formatting ("v = 3\nu = 4" means the variable u
// on a new line, NOT Greek \nu), and KaTeX treats the newline as a space —
// which matches what readers saw before this module existed. So \n is only
// repaired in inline math, where a raw newline has no legitimate use.
// (A bare CR before a letter is still repaired everywhere: CRLF pairs never
// match because the CR is followed by LF, not a letter.)
const CONTROL_TO_ESCAPE: Record<string, string> = {
  "\t": "\\t",
  "\n": "\\n",
  "\r": "\\r",
  "\f": "\\f",
  "\b": "\\b",
  "\v": "\\v",
};

function repairEatenEscapes(latex: string, repairNewlines: boolean): string {
  // Case 1: BACKSLASH + control char + letter. Triple-escaped JSON like
  // "\\\frac" parses to "\" + FF + "rac"; the pair must COLLAPSE into one
  // command: "\" + FF -> "\f", giving "\frac". (Restoring the control char
  // on its own would yield "\" + "\f" = "\\f..." — a LaTeX line break
  // followed by stray letters, e.g. the "frac227" bug.) A lone backslash
  // before a raw control char has no legitimate meaning, so this repair is
  // safe in BOTH inline and display mode, newlines included.
  let out = latex.replace(/\\[\t\n\r\f\b\v](?=[A-Za-z])/g, (m) => CONTROL_TO_ESCAPE[m[1]] ?? m);
  // Case 2: bare control char + letter ("\text" eaten to TAB + "ext").
  // Newlines are only repaired in inline math — see the comment above.
  const re = repairNewlines
    ? /[\t\n\r\f\b\v](?=[A-Za-z])/g
    : /[\t\r\f\b\v](?=[A-Za-z])/g;
  return out.replace(re, (c) => CONTROL_TO_ESCAPE[c] ?? c);
}

// Stored HTML may carry entities inside math segments ($x &lt; 5$), <br> tags
// and non-breaking spaces; KaTeX wants the literal characters.
function decodeBasicEntities(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

// ─── KaTeX ─────────────────────────────────────────────────────────────────
function tryKatex(latex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: true,
      strict: "ignore",
      trust: false,
      output: "htmlAndMathml",
    });
  } catch {
    return null;
  }
}

function renderSegment(inner: string, displayMode: boolean): string | null {
  // One level too many of backslash escaping (`\\int` where `\int` was meant)
  // has to be undone BEFORE KaTeX, not after, because KaTeX does not object
  // to it: `\\` is a row break, so `$\\int_0^k h(x)dx$` renders as a line
  // break and the italic letters i-n-t, with no integral sign and no error.
  // There is no failure to retry on, so the collapse happens up front — but
  // only for segments with no environment machinery, where a `\\` cannot be a
  // legitimate row separator. See collapseIfSafelyOverEscaped.
  const decoded = collapseIfSafelyOverEscaped(decodeBasicEntities(inner));
  return (
    tryKatex(repairEatenEscapes(decoded, !displayMode), displayMode) ??
    tryKatex(decoded, displayMode) ??
    // Last resort, and only ever reached by content that is ALREADY going to
    // be printed raw: over-escaping that DOES carry environment machinery
    // (`$\\begin{cases} ... \\\\ ... \end{cases}$`) always throws, because the
    // `\\` stops the environment from opening and strands the `&`. Collapsing
    // one level turns it back into the formula the creator wrote. If this
    // attempt fails too we are exactly where we were: the raw string.
    (hasOverEscapedCommand(decoded)
      ? tryKatex(collapseDoubledBackslashes(decoded), displayMode)
      : null)
  );
}

// ─── Scanner ───────────────────────────────────────────────────────────────
// The tokeniser and the currency guard live in mathSegments.js — pure string
// rules the node tests can import, which this TypeScript module cannot offer
// them (it pulls in KaTeX's stylesheet).

function scanSegment(input: string, escapeText: boolean): string {
  const re = new RegExp(MATH_TOKEN_SOURCE, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  const emit = (raw: string) => {
    out += escapeText ? escapeHtml(raw) : raw;
  };

  while ((m = re.exec(input)) !== null) {
    const start = m.index;
    const full = m[0];
    const display = m[1] ?? m[2];
    const inline = m[3] ?? m[4];
    // Bare-dollar forms ($...$ and $$...$$) are ambiguous with currency and
    // must pass the guard; \(...\) and \[...\] are explicit math delimiters.
    const isDollarForm = m[1] !== undefined || m[4] !== undefined;
    const inner = display ?? inline ?? "";
    const isDisplay = display !== undefined;

    if (isDollarForm && !looksLikeMath(decodeBasicEntities(inner), isDisplay)) {
      // Not math ("costs $5 and $10..."): emit through the opening "$" and
      // rescan right after it so a later real "$...$" still renders.
      emit(input.slice(last, start + 1));
      last = start + 1;
      re.lastIndex = start + 1;
      continue;
    }

    const rendered = inner.trim() ? renderSegment(inner, isDisplay) : null;
    if (rendered === null) {
      // Unparseable: leave the segment exactly as stored (today's behavior).
      emit(input.slice(last, start + full.length));
      last = start + full.length;
      continue;
    }

    emit(input.slice(last, start));
    out += rendered;
    last = start + full.length;
  }

  emit(input.slice(last));
  return out;
}

function renderMathImpl(input: string, escapeText: boolean): string {
  if (escapeText) {
    // Plain-text mode (options): scan the whole string, escaping non-math.
    return scanSegment(input, true);
  }
  // HTML mode: never scan inside tags or comments — a "$" in an attribute
  // value (e.g. an image URL) must not be rewritten. Split on tags, scan
  // only the text between them, and pass the tags through verbatim.
  const tagRe = new RegExp(TAG_SOURCE, "g");
  let out = "";
  let last = 0;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(input)) !== null) {
    out += scanSegment(input.slice(last, t.index), false);
    out += t[0];
    last = t.index + t[0].length;
  }
  out += scanSegment(input.slice(last), false);
  return out;
}

function mayContainMath(s: string): boolean {
  return s.includes("$") || s.includes("\\(") || s.includes("\\[");
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Render math inside a stored HTML string (question text / passage that is
 * already injected via dangerouslySetInnerHTML). Non-math content passes
 * through KaTeX untouched; on any math failure the original markup is kept.
 *
 * SANITIZATION BOUNDARY. The returned string is what the pages inject, and
 * the stored HTML is creator-authored — any creator can write arbitrary HTML
 * to their own rows through the REST API, editors notwithstanding. So every
 * exit from this function passes through sanitizeStoredHtml: the math-free
 * fast path (most instructions and passages), the rendered path, and the
 * catch path alike. Sanitizing before the cache means the cost is paid once
 * per distinct string, not once per render tick.
 *
 * KaTeX's own output is generated with trust:false and survives the
 * sanitizer intact (sanitize-question-html.test.mjs holds that, against the
 * exact config the app ships).
 */
export function renderMathInHtml(html: string | null | undefined): string {
  // Cloze markers first: they must render as blanks even in math-free text.
  const s = renderClozeBlanks(html ?? "");
  if (!s) return s;
  const key = "h:" + s;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let result: string;
  try {
    result = mayContainMath(s) ? renderMathImpl(s, false) : s;
  } catch {
    result = s;
  }
  result = sanitizeStoredHtml(result);
  cacheSet(key, result);
  return result;
}

/**
 * Render math inside a plain-text string (answer options). Non-math content
 * is HTML-escaped, so plain options render exactly as the old `{option}`
 * JSX did. Always returns an HTML string for dangerouslySetInnerHTML.
 */
export function renderMathInText(text: unknown): string {
  // Cloze markers first — the plain-text form survives escaping unchanged.
  const s = renderClozeBlanks(text == null ? "" : String(text));
  if (!s) return "";
  const key = "t:" + s;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let result: string;
  try {
    result = mayContainMath(s) ? renderMathImpl(s, true) : escapeHtml(s);
  } catch {
    result = escapeHtml(s);
  }
  cacheSet(key, result);
  return result;
}

/**
 * Render a field that may hold EITHER plain text or editor-produced HTML —
 * answer options, and any short value resolved from them.
 *
 * Options were plain text before the option fields got a rich-text toolbar, so
 * both shapes live in the same array and neither may regress: markup is
 * rendered as markup, while anything without a real tag keeps the escaping
 * path (so a stored "a < b" still shows literally instead of being eaten as an
 * unclosed tag).
 */
export function renderMathInRichText(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (!s) return "";
  return looksLikeHtml(s) ? renderMathInHtml(s) : renderMathInText(s);
}
