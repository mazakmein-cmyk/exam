/**
 * One-line preview of a stored question, for the creator's collapsed list rows.
 *
 * The list row is a means of RECOGNISING a question — "which one is this?" —
 * not of reading it. The real thing is one click away in the editor, and the
 * student sees it rendered. So the preview's whole job is to stay short,
 * uniform and readable, and the two ways it used to fail at that were:
 *
 *   1. Entities printed raw. Tags were stripped with a regex and the result
 *      handed to `renderMathInText`, which HTML-ESCAPES everything that isn't
 *      math — so a `&nbsp;` that survived the strip came out on screen as the
 *      literal six characters "&nbsp;", not as a space.
 *   2. Tables flattened into prose. `<td>A</td><td>20%</td>` became
 *      "A 20%" inline, so a four-row distribution table turned the row into
 *      "District Percentage of teachers A 20% B 25% C 25% D 30%" — a wall of
 *      numbers with no structure, in the middle of a sentence.
 *
 * Both are fixed here rather than at the call sites: the tabular content is
 * lifted out and reported as a flag the row shows as a "Table" chip, and every
 * entity is decoded BEFORE the string reaches the escaping renderer.
 *
 * Plain JS so the node tests can import it without a build step.
 */

// Entities the import pipeline and the WYSIWYG editors actually emit.
const NAMED_ENTITIES = {
  "&nbsp;": " ",
  "&ensp;": " ",
  "&emsp;": " ",
  "&thinsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&times;": "×",
  "&divide;": "÷",
  "&deg;": "°",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
};

/**
 * Decode the entities a stored question can carry, once.
 *
 * `&amp;` is deliberately LAST and handled in the same pass as the rest, so a
 * double-escaped "&amp;nbsp;" decodes to the literal text "&nbsp;" instead of
 * being decoded twice into a space — one pass in, one pass out.
 */
export function decodeEntities(value) {
  if (!value || value.indexOf("&") === -1) return value || "";
  return value.replace(/&(?:#\d{1,6}|#x[0-9a-f]{1,5}|[a-z]{2,8});/gi, (m) => {
    const lower = m.toLowerCase();
    if (NAMED_ENTITIES[lower] !== undefined) return NAMED_ENTITIES[lower];
    if (lower === "&amp;") return "&";
    const numeric = /^&#x([0-9a-f]+);$/i.exec(m) || /^&#(\d+);$/.exec(m);
    if (numeric) {
      const code = numeric[0].includes("x") || numeric[0].includes("X")
        ? parseInt(numeric[1], 16)
        : parseInt(numeric[1], 10);
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
    }
    return m;
  });
}

// ─── Baked KaTeX ───────────────────────────────────────────────────────────
// Some stored math is already RENDERED. The editor's insert-formula button
// (components/RichTextEditor.tsx) runs katex.renderToString at insert time and
// drops the output straight into the content, inside a
// `<span class="math-formula" data-latex="…">` wrapper — so a question can
// hold KaTeX's markup rather than "$…$" source, and the sanitizer keeps it
// (lib/sanitizeConfig.js adds <semantics>/<annotation> back on purpose).
//
// KaTeX writes the SAME expression three times over: a MathML twin for screen
// readers, the LaTeX source in an <annotation>, and a glyph layer for sighted
// readers. Strip the tags off that and all three fall out next to each other —
// which is how "3¾ %" came to read
//
//     "at 3 3 4 \\frac{3}{4} 4 3  % per annum"
//
// So the block is not stripped, it is UNWRAPPED: the annotation's LaTeX is put
// back between dollar signs and the row's math renderer draws the fraction the
// student actually sees.

const SPAN_TAG_RE = /<span\b[^>]*>|<\/span\s*>/gi;

/** Class tokens of a tag, lowercased. */
function classTokens(tag) {
  const match = /class\s*=\s*"([^"]*)"/i.exec(tag) || /class\s*=\s*'([^']*)'/i.exec(tag);
  return match ? match[1].toLowerCase().split(/\s+/) : [];
}

/**
 * End of the span opened at `from`, by depth count rather than by regex — the
 * inner layers are spans too, so a non-greedy `</span>` match would close the
 * wrapper on KaTeX's first internal tag and spill the rest into the prose.
 * Returns the index of the closing tag, or -1 when the markup is truncated.
 */
function matchingSpanEnd(html, from) {
  SPAN_TAG_RE.lastIndex = from;
  let depth = 1;
  let tag;
  while ((tag = SPAN_TAG_RE.exec(html)) !== null) {
    depth += tag[0][1] === "/" ? -1 : 1;
    if (depth === 0) return tag.index;
  }
  return -1;
}

/** The inner HTML of the first descendant span carrying `className`. */
function innerOfClass(html, className) {
  SPAN_TAG_RE.lastIndex = 0;
  let tag;
  while ((tag = SPAN_TAG_RE.exec(html)) !== null) {
    if (tag[0][1] === "/") continue;
    if (!classTokens(tag[0]).includes(className)) continue;
    const openEnd = tag.index + tag[0].length;
    const close = matchingSpanEnd(html, openEnd);
    return close === -1 ? html.slice(openEnd) : html.slice(openEnd, close);
  }
  return null;
}

/**
 * A recovered LaTeX source → the text to drop into the preview line.
 *
 * Dollars are NOT unconditional. Handing "$…$" back to the renderer lets it
 * re-decide whether the content is math, and that test is deliberately strict
 * (lib/renderMath.ts: a "$" is a currency sign far more often than a delimiter,
 * so "$5 off" must not swallow the prose after it). LaTeX with no LaTeX syntax
 * in it — a bare "10", or an "8 Omega" whose backslash was lost upstream —
 * fails that test, and the row would then print the dollar signs at the reader:
 *
 *     resistance is $10$ here
 *
 * But such a source needs no renderer: with nothing to typeset, the LaTeX IS
 * its own rendering, so it goes in as plain text. Anything carrying a command,
 * a script or a group still goes through KaTeX. This also keeps a lone "%" —
 * a LaTeX comment, which would eat the rest of the line — out of math mode.
 */
function asMathSegment(latex) {
  return /[\\^_{}]/.test(latex) ? " $" + latex + "$ " : " " + latex + " ";
}

/** The author's LaTeX, from the insert-formula wrapper's own attribute. */
function dataLatexOf(tag) {
  const match = /data-latex\s*=\s*"([^"]*)"/i.exec(tag) || /data-latex\s*=\s*'([^']*)'/i.exec(tag);
  return match ? decodeEntities(match[1]).trim() : "";
}

/**
 * One KaTeX block → the text a preview should carry.
 *
 * The annotation wins: it is the author's own LaTeX, and wrapped in dollars it
 * renders as real math. Without one — hand-written MathML, a truncated paste —
 * the glyph layer is the least-bad fallback, and the MathML twin is dropped
 * either way so nothing is said twice.
 */
function katexBlockToText(inner) {
  const annotation = /<annotation[^>]*>([\s\S]*?)<\/annotation>/i.exec(inner);
  if (annotation) {
    const latex = decodeEntities(annotation[1]).trim();
    if (latex) return asMathSegment(latex);
  }
  const glyphs = innerOfClass(inner, "katex-html");
  return glyphs === null ? " " : " " + glyphs + " ";
}

/**
 * Replace every `<span class="katex">` block with its LaTeX.
 *
 * Also catches a bare `<math>` twin left behind when a wrapper was stripped by
 * an older import — same rule, same reason: say the expression once.
 */
export function unwrapBakedMath(html) {
  let out = html;

  if (/class\s*=\s*["'][^"']*(?:katex|math-formula)/i.test(out)) {
    let result = "";
    let cursor = 0;
    SPAN_TAG_RE.lastIndex = 0;
    let tag;
    while ((tag = SPAN_TAG_RE.exec(out)) !== null) {
      if (tag.index < cursor || tag[0][1] === "/") continue;
      const tokens = classTokens(tag[0]);
      const isWrapper = tokens.includes("math-formula");
      if (!isWrapper && !tokens.includes("katex") && !tokens.includes("katex-display")) continue;
      const openEnd = tag.index + tag[0].length;
      const close = matchingSpanEnd(out, openEnd);
      result += out.slice(cursor, tag.index);
      // The wrapper carries what the creator typed. Prefer it: it is still
      // there when KaTeX rejected the input and wrote a .katex-error span
      // with no annotation to read.
      const authored = isWrapper ? dataLatexOf(tag[0]) : "";
      result += authored
        ? asMathSegment(authored)
        : katexBlockToText(close === -1 ? out.slice(openEnd) : out.slice(openEnd, close));
      cursor = close === -1 ? out.length : close + out.slice(close).indexOf(">") + 1;
      SPAN_TAG_RE.lastIndex = cursor;
    }
    result += out.slice(cursor);
    out = result;
  }

  if (/<math\b/i.test(out)) {
    out = out.replace(/<math\b[\s\S]*?<\/math\s*>/gi, (block) => {
      const annotation = /<annotation[^>]*>([\s\S]*?)<\/annotation>/i.exec(block);
      const latex = annotation ? decodeEntities(annotation[1]).trim() : "";
      return latex ? asMathSegment(latex) : " ";
    });
  }

  return out;
}

/**
 * Question text minus its passage half.
 *
 * Greedy to the LAST `</div>`: a question section that itself contains a div
 * (an image wrapper, a centred figure) would otherwise be cut at the first
 * closing tag, truncating the preview mid-sentence.
 */
function questionHalf(text) {
  if (text.indexOf('class="passage-section"') === -1) return { body: text, hasPassage: false };
  const match = text.match(/<div class="question-section"[^>]*>([\s\S]*)<\/div>\s*$/i);
  return { body: match ? match[1] : text.replace(/<div class="passage-section"[^>]*>[\s\S]*?<\/div>/i, ""), hasPassage: true };
}

// A table is whatever this matches — used BOTH to cut tables out of the
// preview line and to hand them to the chip's popup, so the chip can never
// promise something the popup then fails to show.
const TABLE_RE = /<table\b[\s\S]*?<\/table\s*>/gi;

/** Every table in a stored question, outermost markup intact. */
export function extractTables(value) {
  const source = value == null ? "" : String(value);
  return source.match(TABLE_RE) || [];
}

/** Every image src written INTO the question text (not the image columns). */
export function extractImageUrls(value) {
  const source = value == null ? "" : String(value);
  const urls = [];
  const re = /<img\b[^>]*>/gi;
  let tag;
  while ((tag = re.exec(source)) !== null) {
    const src = /src\s*=\s*"([^"]*)"/i.exec(tag[0]) || /src\s*=\s*'([^']*)'/i.exec(tag[0]);
    const url = src ? decodeEntities(src[1]).trim() : "";
    // De-duplicated: the same figure is sometimes both a passage image and an
    // inline one, and a popup should not page through the same picture twice.
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Shape a stored question's HTML into a row preview.
 *
 * Returns the flags alongside the text because the caller renders them as
 * chips: what a table or an image contributes to a question cannot be said in
 * a truncated line of prose, and pretending otherwise is what made the old
 * preview unreadable.
 */
export function buildQuestionPreview(value) {
  const source = value == null ? "" : String(value);
  const { body, hasPassage } = questionHalf(source);

  // Carried on the preview rather than re-parsed at the call site: the chips
  // and their popups then read the same values the flags were derived from.
  const tables = extractTables(body);
  const imageUrls = extractImageUrls(source);
  const hasTable = tables.length > 0;
  const hasImage = imageUrls.length > 0;

  const text = decodeEntities(
    // Baked KaTeX first: its three layers have to collapse to one BEFORE the
    // tags come off, or all three land in the prose.
    unwrapBakedMath(body)
      // Tabular data reads as noise once flattened — the chip carries it.
      .replace(TABLE_RE, " ")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      // Block boundaries are word boundaries; without this "…table.<p>The"
      // would run two sentences together.
      .replace(/<\/(p|div|li|tr|td|th|h[1-6]|blockquote)>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    // NBSP included: a decoded one is still whitespace, and a row that starts
    // with three of them looks broken.
    .replace(/[\s\u00a0]+/g, " ")
    .trim();

  return { text, tables, imageUrls, hasTable, hasImage, hasPassage, isEmpty: text === "" };
}

/**
 * What to show when a question carries no prose at all — an image-only figure
 * question, a bare table, a passage whose question half is still empty.
 */
export function previewFallbackLabel(preview) {
  if (preview.hasImage) return "Question with image";
  if (preview.hasTable) return "Question with a table";
  if (preview.hasPassage) return "Question with passage";
  return "Untitled question";
}
