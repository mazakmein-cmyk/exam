/**
 * presentChannel.ts — the wire between the control room and the present window.
 *
 * The rule that shapes this file: **this channel carries intents, never state.**
 *
 * The present screen is a real page that reads the session from the database
 * itself. It is not a mirror of the control room. That distinction is what makes
 * it survive the creator accidentally closing the control window mid-question —
 * the projector keeps counting down, the class never sees a blank wall, and the
 * creator reopens the cockpit from a button on the projector view.
 *
 * If state travelled over this channel instead, the two windows could disagree,
 * and the one pointed at thirty students would be the one showing a stale
 * question. So the channel is limited to things that have no database
 * representation and no meaning after the moment they happen:
 *
 *   hello / bye / ping   is the other window open? (drives the rescue buttons)
 *   config               preview a settings toggle before the row round-trips
 *   celebrate            fire confetti now (Phase 4)
 *
 * BroadcastChannel is same-origin, same-browser, and sub-millisecond, which is
 * exactly the scope of the chosen design: one laptop, two windows, an HDMI
 * cable. Casting to a second device is a later, larger change and is why the
 * present screen was built to stand on its own from the start.
 */

export type PresentIntent =
  /** Sent on mount and on an interval; tells the peer this window exists. */
  | { t: "hello"; role: PresentRole }
  /** Sent on unload. Best-effort — a crashed tab never sends it, hence hello's TTL. */
  | { t: "bye"; role: PresentRole }
  /** Reply to a hello, so a window that started first learns about a later peer. */
  | { t: "ping"; role: PresentRole }
  /** Optimistic settings preview; the database row remains the source of truth. */
  | { t: "config"; showLeaderboard?: boolean; showRiver?: boolean }
  /** B14 (Phase 4): fire the celebration now. */
  | { t: "celebrate"; seq: number };

export type PresentRole = "control" | "present";

/**
 * How long a peer is believed to be alive after its last hello.
 *
 * A window that crashes or is force-closed never sends `bye`, so presence has to
 * expire on its own. Three missed heartbeats before we call it gone: long enough
 * that a busy main thread does not make the rescue button flicker, short enough
 * that a creator who closed the projector window sees the button change within a
 * few seconds.
 */
export const PEER_TTL_MS = 7000;

/** Heartbeat interval. PEER_TTL_MS is deliberately a little over 2x this. */
export const HELLO_INTERVAL_MS = 3000;

function channelName(examId: string): string {
  return `live-present-${examId}`;
}

export type PresentChannel = {
  post: (intent: PresentIntent) => void;
  close: () => void;
};

/**
 * Open the channel for an exam.
 *
 * Returns a no-op channel where BroadcastChannel is unavailable (older Safari,
 * some embedded webviews) rather than throwing. Losing it costs the rescue
 * buttons and instant celebrate; both windows still work, because neither
 * depends on the channel for state.
 *
 * @param examId exam whose windows should talk to each other
 * @param role which window this is
 * @param onIntent called for every intent from the OTHER window (never our own)
 */
export function openPresentChannel(
  examId: string,
  role: PresentRole,
  onIntent: (intent: PresentIntent) => void
): PresentChannel {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, close: () => {} };
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(channelName(examId));
  } catch {
    return { post: () => {}, close: () => {} };
  }

  const ch = channel;

  ch.onmessage = (event: MessageEvent<PresentIntent>) => {
    const intent = event.data;
    if (!intent || typeof intent !== "object") return;
    // BroadcastChannel does not echo to the sender, but a second control window
    // would, and a control window reacting to another control window's hello as
    // if a projector had opened is exactly the wrong answer.
    if ("role" in intent && intent.role === role) return;
    onIntent(intent);
  };

  return {
    post(intent: PresentIntent) {
      try {
        ch.postMessage(intent);
      } catch {
        /* channel closed underneath us; nothing here is load-bearing */
      }
    },
    close() {
      try {
        ch.close();
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * Window name for the present view.
 *
 * Passed to window.open so a second click focuses the existing projector window
 * instead of opening a duplicate — a duplicate would be the worst outcome here,
 * since the creator cannot see which one is on the wall.
 */
export function presentWindowName(examId: string): string {
  return `live-present-${examId}`;
}

/** Window name for the control room, for the same reason in reverse. */
export function controlWindowName(examId: string): string {
  return `live-control-${examId}`;
}
