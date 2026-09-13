/**
 * latexEscapes.js — undoing one level too many of backslash escaping.
 *
 * The problem
 * -----------
 * Imported LaTeX reaches us through a JSON string, and a backslash has to
 * survive two encoders to get here: the model writes `\frac`, JSON requires
 * it be typed `"\\frac"`, and `JSON.parse` hands back `\frac`. When the model
 * applies the doubling rule to LaTeX it has *already* doubled, it emits
 * `"\\\\frac"` and we store `\\frac` — one backslash too many, every time.
 *
 * That corruption has two very different faces downstream, and only one of
 * them is loud:
 *
 *   LOUD   `$\\begin{cases} x-2 & 0 \\le x \\le 2 \\\\ -2 \\end{cases}$`
 *          KaTeX reads `\\` as a row break and `begin` as three letters, so
 *          no environment ever opens, the `&` is misplaced, and KaTeX throws.
 *          The reader sees the raw string, dollar signs and all.
 *
 *   SILENT `$\\int_0^k h(x)dx$`
 *          KaTeX reads `\\` as a row break and renders `int_0^k h(x)dx`
 *          happily — italic i, n, t, on a fresh line, with no integral sign.
 *          Nothing throws. A reader who does not know the question cannot
 *          tell it is wrong, and no retry-after-failure repair can ever see
 *          it. This is the dangerous one.
 *
 * Why a blanket collapse is not the answer
 * ----------------------------------------
 * `\\` is legitimate LaTeX — it is the row separator inside `cases`, `array`,
 * `matrix`, `aligned`. `\begin{matrix}a\\b\end{matrix}` is correct today and
 * collapsing its `\\` to `\` breaks it. So the collapse is gated on evidence
 * that the string really is over-escaped, and the two call sites ask for
 * different amounts of evidence:
 *
 *   - Display (renderMath) applies it pre-emptively only to segments with no
 *     environment machinery at all, and otherwise only after KaTeX has
 *     already failed — where the alternative is the raw string on screen.
 *   - Import (jsonImportParser) applies it to a whole document, which gives
 *     a much stronger signal: a paper whose commands are *uniformly* doubled
 *     was double-escaped wholesale.
 *
 * Pure (no React, no DOM, no KaTeX) so the node tests can import it directly.
 */

/**
 * The signature of one level too many: two backslashes immediately followed
 * by a letter. In hand-written LaTeX `\\` is a row break and is followed by
 * a space, a newline, `[2pt]`, or the end of the line — essentially never by
 * a letter, because `\\b` reads as "break, then the letter b", which nobody
 * writes on purpose.
 *
 * @param {string} s
 * @returns {boolean}
 */
export function hasOverEscapedCommand(s) {
  return /\\\\[A-Za-z]/.test(String(s ?? ""));
}

/**
 * Does this string carry the machinery of a multi-row environment? Those are
 * the only places a genuine `\\` row separator can appear, so their presence
 * is the reason to be cautious about collapsing.
 *
 * Checked on the ALREADY-collapsed spelling too, because in an over-escaped
 * string the environment reads as `\\begin{cases}` — `\begin{` is still in
 * there as a substring, which is exactly what makes this test conservative.
 *
 * @param {string} s
 * @returns {boolean}
 */
export function hasRowSeparatorContext(s) {
  const t = String(s ?? "");
  return /\\begin\{|\\end\{|&|\\cr\b|\\substack|\\newline/.test(t);
}

/**
 * Remove exactly one level of backslash escaping: every run of N backslashes
 * becomes floor(N/2) — but never fewer than one, so a lone `\` survives.
 *
 *   `\\frac`   -> `\frac`     (2 -> 1)
 *   `\\\\`     -> `\\`        (4 -> 2, the row separator is preserved)
 *   `\frac`    -> `\frac`     (1 -> 1, an odd lone backslash is left alone)
 *   `\\\le`    -> `\le`       (3 -> 1)
 *
 * @param {string} latex
 * @returns {string}
 */
export function collapseDoubledBackslashes(latex) {
  return String(latex ?? "").replace(/\\+/g, (run) =>
    "\\".repeat(Math.max(1, Math.floor(run.length / 2))),
  );
}

/**
 * The display-time pre-pass: collapse only when the string is over-escaped
 * AND carries no environment machinery that could legitimately own a `\\`.
 *
 * This is the narrow gate that rescues the SILENT case (`$\\int_0^k$`) while
 * leaving `\begin{matrix}a\\b\end{matrix}` untouched. Anything it declines to
 * touch is still caught by the post-failure retry, because a string with an
 * environment in it that is over-escaped cannot parse and so always throws.
 *
 * @param {string} latex
 * @returns {string} the collapsed form, or the input unchanged
 */
export function collapseIfSafelyOverEscaped(latex) {
  const s = String(latex ?? "");
  if (!hasOverEscapedCommand(s) || hasRowSeparatorContext(s)) return s;
  return collapseDoubledBackslashes(s);
}

// ─── Import-time, whole-document ──────────────────────────────────────────

// A backslash command spelled with one backslash (`\frac`) vs two (`\\frac`).
// Counting both across a whole paper tells us whether the document was
// double-escaped wholesale or just happens to contain a row separator.
const SINGLE_CMD_RE = /(?<!\\)\\[A-Za-z]/g;
const DOUBLE_CMD_RE = /(?<!\\)\\\\[A-Za-z]/g;

function countMatches(s, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(s) !== null) n += 1;
  return n;
}

/**
 * Decide whether a whole imported document was escaped one level too many.
 *
 * A single `\\begin` proves nothing on its own — it could be a row separator
 * that happens to precede a letter. What is decisive is the RATIO: in a paper
 * the model double-escaped, every command is doubled and single-backslash
 * commands are absent. So we require doubled commands to exist and to
 * outnumber single ones, which no correctly-escaped paper can manage (its
 * `\\` runs are row separators, and those are not followed by letters).
 *
 * @param {string} documentText all imported text, concatenated
 * @returns {boolean}
 */
export function documentIsOverEscaped(documentText) {
  const s = String(documentText ?? "");
  const doubled = countMatches(s, DOUBLE_CMD_RE);
  if (doubled === 0) return false;
  return doubled > countMatches(s, SINGLE_CMD_RE);
}
