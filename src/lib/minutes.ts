/**
 * minutes.ts — the shared rules for "a small box you type minutes into".
 *
 * Every one of these boxes used to be <input type="number">, which is the wrong
 * control at this size for three reasons:
 *
 *   1. Chrome paints its spinner arrows *over* the text box, so in a 56–64px
 *      field a three-digit value ("120", "30" with centred padding) was clipped
 *      mid-glyph. That is the bug you could see.
 *   2. A scroll over a focused field silently rewrote the number — the length of
 *      an exam changing because someone scrolled the sidebar.
 *   3. It accepts "e", "+", "-" and "1e9" as valid input, then hands back NaN.
 *
 * So the boxes are text fields constrained to digits, and these helpers are the
 * constraint. Kept in one place so the section boxes and the whole-paper box
 * can never drift apart on what a valid entry is.
 */

/** Four digits is 9999 minutes — a week of exam. Nothing legitimate exceeds it. */
export const MINUTES_MAX_DIGITS = 4;

/** Digits only, no leading zeros, capped in length. Safe to feed back as value. */
export function sanitiseMinutes(raw: string): string {
  return raw
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MINUTES_MAX_DIGITS);
}

/** null for empty or nonsense, so callers can tell "unset" from "zero". */
export function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** 120 → "2h", 95 → "1h 35m". null under an hour, where the box already says it. */
export function formatHours(minutes: number): string | null {
  if (!Number.isFinite(minutes) || minutes < 60) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
