/**
 * celebrate.ts — the loud half of B14, in one place.
 *
 * Three screens fire this (projector, student phone, and nothing else), and each
 * one previously would have needed its own confetti call with its own particle
 * count and its own reduced-motion check. One helper means the room cannot end up
 * with three different celebrations firing at three different intensities.
 *
 * Explicitly NOT called from the control room. The creator's cockpit must stay
 * responsive at the exact moment they are about to press something, and confetti
 * on the one screen driving the session is cost with no audience.
 */

import confetti from "canvas-confetti";
import { playCelebrate } from "@/lib/liveSounds";

/** Capped deliberately: a projector at 1080p does not need more, and a mid-range phone does not want it. */
const PARTICLES_DISPLAY = 140;
const PARTICLES_PHONE = 70;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fire the celebration.
 *
 * @param variant `display` for the projector, `phone` for a student device
 */
export function fireCelebration(variant: "display" | "phone" = "phone"): void {
  // The sound plays regardless of motion preference — reduced motion is a
  // vestibular setting, not a request for silence, and it is the part that
  // actually carries the moment to someone not looking at the screen.
  playCelebrate();

  if (prefersReducedMotion()) return;

  const particleCount = variant === "display" ? PARTICLES_DISPLAY : PARTICLES_PHONE;
  try {
    confetti({
      particleCount,
      spread: variant === "display" ? 110 : 80,
      startVelocity: variant === "display" ? 55 : 40,
      origin: { y: variant === "display" ? 0.55 : 0.7 },
      disableForReducedMotion: true,
      scalar: variant === "display" ? 1.3 : 1,
    });
  } catch {
    /* canvas unavailable; the sound already carried it */
  }
}

/**
 * Should this observation of `celebrate_seq` fire?
 *
 * The counter is monotonic so a reconnect can be told apart from a new
 * celebration. The first value a client ever sees establishes a baseline and
 * fires nothing — otherwise every page load in a session that had already
 * celebrated once would open with confetti.
 *
 * @param seen the last sequence this client acted on, or null on first observation
 * @param incoming the sequence just observed
 */
export function shouldCelebrate(seen: number | null, incoming: number): boolean {
  if (seen === null) return false;
  return incoming > seen;
}
