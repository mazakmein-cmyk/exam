/**
 * optionLabels.js — strip printed labels from answer options.
 *
 * The extraction prompt asks for bare option text ("How", not "(a) How"), but
 * the same model on the same paper sometimes prefixes every option with its
 * label anyway (seen on Gemini 3.5 Flash, run to run, at temperature 0). The
 * exam UI adds its own A/B/C/D labels, so a leaked label shows twice.
 *
 * Deliberately conservative: labels are removed only when EVERY option carries
 * one AND the labels form the printed sequence (a, b, c…; A, B, C…; 1, 2, 3…).
 * A single option that happens to start with "(a)" is content, not a label,
 * and is left alone. Pure — no React, no Supabase — so both import flows and
 * the tests can call it.
 */

const PATTERNS = [
  // (a) text · a) text
  { re: /^\(?([a-e])\)\s*(.*)$/s, seq: "abcde" },
  // (A) text · A) text
  { re: /^\(?([A-E])\)\s*(.*)$/s, seq: "ABCDE" },
  // a. text · a: text · a- text
  { re: /^([a-e])[.:\-]\s+(.*)$/s, seq: "abcde" },
  // A. text · A: text · A- text
  { re: /^([A-E])[.:\-]\s+(.*)$/s, seq: "ABCDE" },
  // (1) text · 1) text
  { re: /^\(?([1-5])\)\s*(.*)$/s, seq: "12345" },
  // 1. text · 1: text
  { re: /^([1-5])[.:]\s+(.*)$/s, seq: "12345" },
];

/**
 * @param {unknown} options
 * @returns {unknown} the same array reference when nothing changed, otherwise
 *   a new array of trimmed option strings without their labels.
 */
export function normalizeOptionLabels(options) {
  if (!Array.isArray(options) || options.length < 2) return options;
  if (!options.every((o) => typeof o === "string")) return options;

  for (const { re, seq } of PATTERNS) {
    const matches = options.map((o) => o.trim().match(re));
    const allLabelled =
      matches.every(Boolean) &&
      matches.every((m, i) => m[1] === seq[i]) &&
      matches.every((m) => m[2].trim().length > 0);
    if (allLabelled) return matches.map((m) => m[2].trim());
  }
  return options;
}

/**
 * Apply normalizeOptionLabels to every accepted question of a parse report,
 * in place. Returns how many questions changed — the import summary tells the
 * creator, since it is a silent edit of what the model wrote.
 *
 * correct_answer is an index into options, so stripping labels never moves
 * the right answer.
 *
 * @param {{ perSection?: { accepted?: { options?: unknown }[] }[] }} report
 * @returns {number}
 */
export function normalizeReportOptionLabels(report) {
  let changed = 0;
  for (const section of report?.perSection ?? []) {
    for (const q of section?.accepted ?? []) {
      const next = normalizeOptionLabels(q.options);
      if (next !== q.options) {
        q.options = next;
        changed++;
      }
    }
  }
  return changed;
}
