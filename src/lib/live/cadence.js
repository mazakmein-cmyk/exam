/**
 * cadence.js — how often a client may ask the server for session state.
 *
 * The server owns this decision, because the server is the only party that
 * knows how many people are in the room. `live_session_sync` returns
 * `next_poll_ms`; this module applies the two adjustments only the client can
 * make, and it may only ever make polling *rarer*:
 *
 *  - A hidden tab does not need a live session. A phone in a pocket polling
 *    every 1.5s for forty minutes is pure waste, and on a class of 500 it is
 *    waste multiplied by 500. Hidden tabs drop to a slow keep-alive and catch
 *    up in one request when they come back.
 *
 *  - Jitter. Every device in the room unlocks the same question at the same
 *    instant, so without jitter they all poll in lockstep forever after: a
 *    thundering herd that arrives as a spike rather than a stream. Spreading
 *    each interval by +/-15% turns the spike into a flat line at the same
 *    total cost.
 *
 * The floor is deliberate. `next_poll_ms` can legitimately be small (the server
 * asks to be woken just after a question closes), but jitter must never turn a
 * small interval into a hot loop.
 */

/** Hidden tabs poll at this interval regardless of what the server asked for. */
export const HIDDEN_POLL_MS = 20000;

/** No client ever polls faster than this, whatever the arithmetic says. */
export const MIN_POLL_MS = 500;

/** Fraction each interval is spread by, in both directions. */
export const JITTER_RATIO = 0.15;

/**
 * A server-supplied interval that has been stopped, so callers can compare
 * against a name instead of a magic zero.
 */
export const STOP = 0;

/**
 * Turn the server's requested interval into the delay this client will use.
 *
 * @param {number|null|undefined} serverNextPollMs from live_session_sync
 * @param {{ hidden?: boolean, random?: () => number, jitterRatio?: number }} [opts]
 *        `random` is injectable so tests are deterministic.
 * @returns {number} delay in ms, or STOP (0) to stop polling entirely
 */
export function clientPollDelayMs(serverNextPollMs, opts) {
  const o = opts || {};
  const requested = Number(serverNextPollMs);

  // A non-positive or unusable value means "stop": the exam has ended or is a
  // draft, and there is nothing left to learn by asking again.
  if (!Number.isFinite(requested) || requested <= 0) return STOP;

  // Hidden wins outright rather than taking a max, so a server asking for 750ms
  // (question about to close) does not keep a backgrounded phone busy.
  if (o.hidden) return HIDDEN_POLL_MS;

  const ratio = normaliseRatio(o.jitterRatio);
  const rand = typeof o.random === "function" ? o.random : Math.random;
  // rand() in [0,1) → spread in [-ratio, +ratio)
  const spread = (rand() * 2 - 1) * ratio;
  const jittered = requested * (1 + spread);

  return Math.max(MIN_POLL_MS, Math.round(jittered));
}

/**
 * Should this client send a presence heartbeat with its next sync?
 *
 * Heartbeats are the one part of syncing that writes, so they are decoupled
 * from poll frequency: a room of 500 polling every 1.5s would otherwise be 333
 * upserts a second, where one beat per student per 30s is 17. The server treats
 * anything seen within 45s as present, which leaves comfortable room for a
 * missed beat before someone is wrongly counted as gone.
 *
 * @param {number|null} lastBeatAtMs epoch ms of the last beat, null if never
 * @param {number} nowMs
 * @param {number} [intervalMs]
 * @returns {boolean}
 */
export function shouldBeat(lastBeatAtMs, nowMs, intervalMs) {
  const every = Number.isFinite(intervalMs) ? Number(intervalMs) : BEAT_INTERVAL_MS;
  if (lastBeatAtMs === null || lastBeatAtMs === undefined) return true;
  return nowMs - lastBeatAtMs >= every;
}

/** How often a present client refreshes its presence row. */
export const BEAT_INTERVAL_MS = 30000;

/**
 * @param {unknown} v
 * @returns {number}
 */
function normaliseRatio(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 1) return JITTER_RATIO;
  return n;
}
