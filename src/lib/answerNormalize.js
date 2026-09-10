/**
 * answerNormalize.js — the one client-side definition of "does this typed
 * answer match the key?"
 *
 * Mirrors public.mock_answer_norm exactly (20260839000000) — if one changes,
 * change both, plus the deliberate copy inside scoringEngine.ts (that file
 * must stay import-free). Two rules beyond trim+lowercase:
 *
 * UNICODE NFC. The same Hindi word arrives as different byte sequences from
 * different keyboards — a combined character from one IME, base letter plus
 * separate mark from another — pixel-identical on screen and unequal as
 * strings. Every comparison converts to one canonical form first, or a
 * student is marked wrong against an answer that RENDERS identically to
 * theirs, with nothing visible to explain it.
 *
 * NUMERIC CANON. "5.0", "05" and "+5" are the number 5. Only strings that are
 * PLAIN decimal literals are canonicalised — the guard regex deliberately
 * excludes commas ("1,000"), exponents ("1e3"), and anything long enough for
 * JavaScript's float to lose integer precision (>15 digits), so both graders
 * treat those identically as text.
 *
 * Plain JS with JSDoc on purpose: the app imports it as TypeScript (allowJs)
 * and the .mjs test harness imports this very file, so the tests exercise the
 * real implementation rather than a copy of it.
 */

/** Strings safe to read as a number on BOTH graders. Same regex in SQL. */
export const NUMERIC_ANSWER_RE = /^[+-]?([0-9]{1,15}(\.[0-9]{1,10})?|\.[0-9]{1,10})$/;

/**
 * @param {unknown} val
 * @returns {string}
 */
export function normalizeAnswerText(val) {
  const s = String(val ?? "").normalize("NFC").trim();
  if (NUMERIC_ANSWER_RE.test(s)) return String(Number(s));
  return s.toLowerCase();
}
