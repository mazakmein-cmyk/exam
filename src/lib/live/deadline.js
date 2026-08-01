/**
 * deadline.js — the single client-side definition of when a live question closes.
 *
 * Before this module the deadline was re-derived in five places (three SQL
 * functions and both pages), all of them spelling out `unlocked_at +
 * time_seconds` by hand. That is survivable while every question has a fixed
 * length; it stops being survivable the moment a creator can add time mid
 * question, because a single missed site produces a question that looks open
 * but rejects answers, or an answer revealed while the clock still runs.
 *
 * There are two deadlines and they are NOT the same number:
 *
 *   visual end   = unlocked_at + time_seconds + extra_seconds
 *   server close = visual end + GRACE_SECONDS
 *
 * The visual end is what every countdown counts down to — a student whose
 * timer reads 0 must believe they are out of time. The server keeps accepting
 * for a further GRACE_SECONDS so that a submission already in flight over a
 * slow connection is not thrown away. Showing the grace in the UI would invite
 * students to race it; hiding it means a late-but-honest answer still lands.
 *
 * Plain JS with JSDoc on purpose: the app imports it as TypeScript (allowJs)
 * and the .mjs test harness imports the very same file, so the tests exercise
 * the real implementation rather than a copy of it.
 */

/** Extra seconds the server keeps accepting answers after the visual timer ends. */
export const GRACE_SECONDS = 2;

/**
 * When the countdown reaches zero, in epoch ms. Excludes the grace window.
 *
 * @param {number|string|Date|null|undefined} unlockedAt epoch ms, ISO string, or Date
 * @param {number|null|undefined} timeSeconds question's allotted seconds
 * @param {number|null|undefined} extraSeconds seconds granted mid question (A3)
 * @returns {number|null} epoch ms, or null when no question is open
 */
export function visualEndMs(unlockedAt, timeSeconds, extraSeconds) {
  const start = toEpochMs(unlockedAt);
  if (start === null) return null;
  const base = numberOr(timeSeconds, 0);
  const extra = numberOr(extraSeconds, 0);
  return start + (base + extra) * 1000;
}

/**
 * When the server stops accepting answers, in epoch ms. Includes the grace.
 * Mirrors `public.live_question_deadline` exactly — if one changes, both must.
 *
 * @param {number|string|Date|null|undefined} unlockedAt
 * @param {number|null|undefined} timeSeconds
 * @param {number|null|undefined} extraSeconds
 * @returns {number|null}
 */
export function serverCloseMs(unlockedAt, timeSeconds, extraSeconds) {
  const end = visualEndMs(unlockedAt, timeSeconds, extraSeconds);
  return end === null ? null : end + GRACE_SECONDS * 1000;
}

/**
 * Whole seconds left on the visual countdown, never negative.
 *
 * Rounds up, so a student sees "1" for the whole final second rather than a
 * zero that sits there while the question is still answerable.
 *
 * @param {number|null} endMs from visualEndMs
 * @param {number} nowMs server-corrected now
 * @returns {number}
 */
export function remainingSeconds(endMs, nowMs) {
  if (endMs === null || endMs === undefined) return 0;
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
}

/**
 * Is the countdown still running?
 *
 * Deliberately derived from the deadline rather than from a `remaining > 0`
 * check on a ticking value: this flips exactly once per question, so pages can
 * depend on it without re-rendering four times a second.
 *
 * @param {number|null} endMs
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isRunning(endMs, nowMs) {
  return endMs !== null && endMs !== undefined && endMs > nowMs;
}

/**
 * Fraction of the question still remaining, 0..1 — for rings and bars.
 * Returns 0 once time is up, and 0 for a zero-length question rather than
 * dividing by zero.
 *
 * @param {number|null} endMs
 * @param {number} nowMs
 * @param {number} totalSeconds allotted + extra
 * @returns {number}
 */
export function remainingFraction(endMs, nowMs, totalSeconds) {
  const total = numberOr(totalSeconds, 0);
  if (endMs === null || endMs === undefined || total <= 0) return 0;
  const leftMs = endMs - nowMs;
  if (leftMs <= 0) return 0;
  return Math.min(1, leftMs / (total * 1000));
}

/**
 * Total seconds a question is on screen for — its allotted time plus any time
 * the creator granted. Timer rings need this as their denominator, otherwise
 * granting +30s makes the ring appear to jump past full.
 *
 * @param {number|null|undefined} timeSeconds
 * @param {number|null|undefined} extraSeconds
 * @returns {number}
 */
export function totalSeconds(timeSeconds, extraSeconds) {
  return numberOr(timeSeconds, 0) + numberOr(extraSeconds, 0);
}

// ─── internals ───────────────────────────────────────────────

/**
 * Accepts everything the exam row realistically hands us: Postgres timestamps
 * arrive as ISO strings over PostgREST, cached values as numbers.
 *
 * @param {number|string|Date|null|undefined} v
 * @returns {number|null}
 */
export function toEpochMs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function numberOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
