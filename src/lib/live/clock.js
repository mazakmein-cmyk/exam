/**
 * clock.js — server clock offset for the live session.
 *
 * Why this exists: every deadline in a live exam is anchored to a timestamp the
 * database wrote, but the countdown runs on the student's device. Phones are
 * routinely wrong by minutes — a clock that is 90s fast shows a question as
 * already expired, and the student never answers a question they had a full
 * minute for. The existing code compared a DB timestamp against raw Date.now(),
 * so that student was simply unlucky.
 *
 * The fix is the NTP idea at its smallest. Every sync response carries the
 * server's `now`. We know when we sent the request and when the reply landed,
 * so the server's clock at the reply's midpoint is our best estimate:
 *
 *     offset = server_now - (sent + received) / 2
 *
 * Two refinements matter in practice:
 *
 *  - Round-trip time is the error bar on a sample. A reply that took 900ms
 *    tells us much less than one that took 40ms, so samples far worse than the
 *    best round trip we have seen are dropped rather than averaged in. Naive
 *    averaging lets one slow request drag the clock for the rest of the session.
 *
 *  - The remaining samples are smoothed (EWMA) so the offset creeps rather than
 *    jumping, which keeps a timer from visibly stuttering mid question.
 *
 * Pure and dependency-free so the .mjs tests drive the real implementation.
 */

/** Samples slower than this are never trusted, however early in the session. */
export const MAX_TRUSTED_RTT_MS = 3000;

/** A sample is dropped if its round trip is worse than best * this. */
export const RTT_TOLERANCE_FACTOR = 2.5;

/** Weight of each new sample once the offset has settled. */
export const DEFAULT_ALPHA = 0.3;

/**
 * @typedef {Object} ClockOffset
 * @property {(serverNow: number|string|Date, sentAtMs: number, receivedAtMs: number) => boolean} addSample
 *           Feed one sync round trip. Returns whether the sample was trusted.
 * @property {() => number} getOffsetMs  server clock minus local clock
 * @property {() => number} serverNow    local now, corrected
 * @property {() => number} sampleCount  trusted samples so far
 * @property {() => number} bestRttMs    best round trip seen (Infinity if none)
 * @property {() => void}   reset
 */

/**
 * @param {{ alpha?: number }} [opts]
 * @returns {ClockOffset}
 */
export function createClockOffset(opts) {
  const alpha = clampAlpha(opts && opts.alpha);

  let offsetMs = 0;
  let samples = 0;
  let bestRtt = Infinity;

  return {
    addSample(serverNow, sentAtMs, receivedAtMs) {
      const serverMs = toEpochMs(serverNow);
      if (serverMs === null) return false;
      if (!Number.isFinite(sentAtMs) || !Number.isFinite(receivedAtMs)) return false;

      const rtt = receivedAtMs - sentAtMs;
      // A negative round trip means the local clock moved backwards mid-flight
      // (NTP correction, laptop waking). The sample is meaningless.
      if (rtt < 0 || rtt > MAX_TRUSTED_RTT_MS) return false;
      if (samples > 0 && rtt > bestRtt * RTT_TOLERANCE_FACTOR) return false;

      if (rtt < bestRtt) bestRtt = rtt;

      const sample = serverMs - (sentAtMs + receivedAtMs) / 2;
      // The first trusted sample is adopted outright: smoothing towards a
      // default of 0 would leave a genuinely skewed device wrong for the first
      // several polls, which is exactly the window where a question opens.
      offsetMs = samples === 0 ? sample : offsetMs + alpha * (sample - offsetMs);
      samples += 1;
      return true;
    },

    getOffsetMs() {
      return offsetMs;
    },

    serverNow() {
      return Date.now() + offsetMs;
    },

    sampleCount() {
      return samples;
    },

    bestRttMs() {
      return bestRtt;
    },

    reset() {
      offsetMs = 0;
      samples = 0;
      bestRtt = Infinity;
    },
  };
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function clampAlpha(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return DEFAULT_ALPHA;
  return n;
}

/**
 * @param {number|string|Date|null|undefined} v
 * @returns {number|null}
 */
function toEpochMs(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}
