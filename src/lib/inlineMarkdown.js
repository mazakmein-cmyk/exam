/**
 * inlineMarkdown.js — the light markdown that survives import, undone at
 * display time.
 *
 * Imported question text arrives as HTML that may still carry four inline
 * markdown forms the model wrote: `**bold**`, `*italic*`, `~~strike~~` and
 * `[text](url)`. Students see the rendered form, so those have to be turned
 * into real tags before the math pass runs.
 *
 * Why the asterisk rules are so fussy
 * -----------------------------------
 * An asterisk is not only markdown. On a reasoning paper it is the QUESTION:
 *
 *   "Select the correct combination of mathematical signs that can sequentially
 *    replace the * signs and balance the given equation. 12 * 3 * 4 = 6 * 8 * 8"
 *
 * A naive `*(...)*` pass pairs those up, swallows the prose between them and
 * italicises it — the student is asked to replace signs they can no longer see,
 * while the creator's own list (which renders as plain text) still shows them.
 * That is not a cosmetic bug: the question becomes unanswerable.
 *
 * So a delimiter run only counts when it looks like authored emphasis, using
 * CommonMark's flanking idea tightened by one notch:
 *
 *   - it OPENS only when the next character is neither whitespace nor another
 *     asterisk, and the character before it is not a letter or digit;
 *   - it CLOSES only when the previous character is not whitespace, and the
 *     character after it is not a letter or digit.
 *
 * The first half kills the spaced-out arithmetic above ("12 * 3": the asterisk
 * is followed by a space, so it never opens). The second half kills the
 * unspaced form ("12*3*4": the asterisk is preceded by a digit, so it never
 * opens) — CommonMark would italicise that one, and for a paper full of algebra
 * it must not. Prose emphasis is unaffected: `*word*`, `(*word*)`, `**Note:**`
 * all still open on a space or bracket and close on a space or punctuation.
 *
 * Pure (no React, no DOM) so the display layer and the tests share one copy.
 */

// Letter or digit, Unicode-aware — a Hindi paper is as much a paper as an
// English one, so the intraword rule can't be spelled [A-Za-z0-9].
const WORD = "[\\p{L}\\p{N}]";

// **bold** — content must start and end on a character that is neither space
// nor asterisk, which also means `****` and `** spaced **` match nothing.
const BOLD_RE = new RegExp(
  `(?<!${WORD})\\*\\*(?![\\s*])([^\\n]*?[^\\s*])\\*\\*(?!${WORD})`,
  "gu",
);

// *italic* — same rules, and the run may not sit against another asterisk on
// either side, so the leftover stars of `***x***` (bolded above) still pair up.
const ITALIC_RE = new RegExp(
  `(?<!${WORD})(?<!\\*)\\*(?![\\s*])([^*\\n]*?[^\\s*])\\*(?!${WORD})(?!\\*)`,
  "gu",
);

const LINK_CLASS = "text-primary underline hover:text-primary/80";

/**
 * Inline markdown left behind by import, plus link hardening. Applied to HTML,
 * so it stays conservative: only the four inline forms are touched.
 *
 * @param {string} html
 * @returns {string}
 */
export function applyInlineMarkdown(html) {
  return String(html ?? "")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      `<a href="$2" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}">$1</a>`,
    )
    .replace(/<a href/g, `<a class="${LINK_CLASS}" href`)
    .replace(BOLD_RE, "<strong>$1</strong>")
    .replace(ITALIC_RE, "<em>$1</em>")
    .replace(/~~(.*?)~~/g, "<del>$1</del>");
}
