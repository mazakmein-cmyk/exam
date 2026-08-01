/**
 * usePeerWindow.ts — is the other live window open, and how do I get it back?
 *
 * Q2: whichever window survives must be able to restore the one that was
 * closed. A creator who accidentally shuts the control room is mid-lesson with
 * thirty students watching a projector; hunting through browser history is not
 * an option. So both windows advertise themselves, and each offers a button that
 * either opens or focuses the other.
 *
 * Presence is heartbeat-based rather than event-based because a force-closed or
 * crashed window never gets to say goodbye. Believing `bye` alone would leave a
 * dead peer looking alive forever.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HELLO_INTERVAL_MS,
  PEER_TTL_MS,
  openPresentChannel,
  type PresentChannel,
  type PresentIntent,
  type PresentRole,
} from "@/lib/live/presentChannel";

export type UsePeerWindowResult = {
  /** True while the other window has said hello recently. */
  peerOpen: boolean;
  /** Open the other window, or focus it if it is already there. */
  openPeer: () => void;
  /** Send an intent to the other window. */
  post: (intent: PresentIntent) => void;
};

/**
 * @param examId exam these windows share
 * @param role which window this is
 * @param peerUrl url to open if the peer is absent
 * @param peerWindowName named target, so a second click focuses instead of duplicating
 * @param onIntent optional handler for intents other than the presence handshake
 */
export function usePeerWindow(
  examId: string | undefined,
  role: PresentRole,
  peerUrl: string,
  peerWindowName: string,
  onIntent?: (intent: PresentIntent) => void
): UsePeerWindowResult {
  const [peerOpen, setPeerOpen] = useState(false);

  const channelRef = useRef<PresentChannel | null>(null);
  const lastSeenRef = useRef<number>(0);
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;
  /** Handle from our own window.open, so we can focus what we opened. */
  const openedRef = useRef<Window | null>(null);

  useEffect(() => {
    if (!examId) return;

    const channel = openPresentChannel(examId, role, (intent) => {
      if (intent.t === "hello") {
        lastSeenRef.current = Date.now();
        setPeerOpen(true);
        // Answer, so a window that was already open learns about this new peer.
        channel.post({ t: "ping", role });
        return;
      }
      if (intent.t === "ping") {
        lastSeenRef.current = Date.now();
        setPeerOpen(true);
        return;
      }
      if (intent.t === "bye") {
        lastSeenRef.current = 0;
        setPeerOpen(false);
        return;
      }
      onIntentRef.current?.(intent);
    });

    channelRef.current = channel;
    channel.post({ t: "hello", role });

    const heartbeat = setInterval(() => {
      channel.post({ t: "hello", role });
      // Expire a peer that stopped answering. A backgrounded tab still runs
      // intervals (throttled to ~1/s), which is well inside the TTL.
      if (lastSeenRef.current !== 0 && Date.now() - lastSeenRef.current > PEER_TTL_MS) {
        lastSeenRef.current = 0;
        setPeerOpen(false);
      }
    }, HELLO_INTERVAL_MS);

    const sayBye = () => channel.post({ t: "bye", role });
    window.addEventListener("pagehide", sayBye);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", sayBye);
      sayBye();
      channel.close();
      channelRef.current = null;
    };
  }, [examId, role]);

  const openPeer = useCallback(() => {
    // A live handle is the most reliable way to raise a window we opened
    // ourselves; the named target covers the case where we did not.
    if (openedRef.current && !openedRef.current.closed) {
      openedRef.current.focus();
      return;
    }
    const win = window.open(peerUrl, peerWindowName);
    openedRef.current = win;
    // Focus explicitly: reusing a named target does not raise it on its own in
    // every browser, which would look like the button did nothing.
    win?.focus();
  }, [peerUrl, peerWindowName]);

  const post = useCallback((intent: PresentIntent) => {
    channelRef.current?.post(intent);
  }, []);

  return { peerOpen, openPeer, post };
}
