/**
 * useFitText.ts — scale text to fill a box without overflowing it.
 *
 * The projector problem
 * --------------------
 * A question on a wall has one job: be readable from the back row. That argues
 * for the largest possible type. But questions vary from six words to a
 * four-hundred-character comprehension passage, and a fixed size that fits the
 * long one is far too small for the short one — while a size tuned for the short
 * one makes the long one scroll. A projector must never scroll: the audience has
 * no scrollbar and the creator has their back to the screen.
 *
 * So the size is measured per question: binary-search the largest font size at
 * which the content still fits its container.
 *
 * Cost control
 * -----------
 * Measuring forces layout, so this runs **once per question**, keyed by a
 * caller-supplied token — never on a timer and never on a countdown tick. Each
 * search is ~7 reflows of one element, at the moment a question appears, when
 * there is nothing else competing for the frame. A ResizeObserver re-runs it if
 * the window itself changes (dragging to the projector, resolution switch),
 * debounced so a drag does not thrash.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type UseFitTextOptions = {
  /** Smallest size we will shrink to; below this, legibility is already lost. */
  minPx?: number;
  /** Largest size, for the six-word question. */
  maxPx?: number;
  /** Stop when the bracket is this tight. Sub-pixel precision buys nothing visible. */
  tolerancePx?: number;
  /** Re-measure when the window resizes, after this quiet period. */
  resizeDebounceMs?: number;
};

const DEFAULTS = {
  minPx: 16,
  maxPx: 96,
  tolerancePx: 1,
  resizeDebounceMs: 150,
};

export type UseFitTextResult<T extends HTMLElement> = {
  /** Put this on the fixed-size box. */
  containerRef: React.RefObject<T>;
  /** Put this on the text that should grow. */
  contentRef: React.RefObject<HTMLDivElement>;
  /** Apply as `fontSize`. */
  fontSizePx: number;
  /** False during the first measurement, so callers can avoid a visible jump. */
  measured: boolean;
};

/**
 * @param token changes whenever the content does — the question id, typically.
 *        This is the only thing that triggers a re-measure besides a resize.
 */
export function useFitText<T extends HTMLElement = HTMLDivElement>(
  token: string | number,
  options?: UseFitTextOptions
): UseFitTextResult<T> {
  const opts = { ...DEFAULTS, ...(options || {}) };

  const containerRef = useRef<T>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fontSizePx, setFontSizePx] = useState(opts.maxPx);
  const [measured, setMeasured] = useState(false);

  // Kept in a ref so the resize observer can re-run without being re-created
  // (and without needing the option values in its dependency list).
  const measureRef = useRef<() => void>(() => {});

  measureRef.current = () => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const available = box.clientHeight;
    const availableWidth = box.clientWidth;
    if (available <= 0 || availableWidth <= 0) return;

    const fits = (px: number): boolean => {
      content.style.fontSize = `${px}px`;
      // scrollHeight/Width against the client box is the honest test: it
      // accounts for wrapped lines, images and rendered maths, none of which we
      // could predict from character count.
      return content.scrollHeight <= available && content.scrollWidth <= availableWidth;
    };

    let lo = opts.minPx;
    let hi = opts.maxPx;

    // If even the smallest size overflows, take it — clipped large text is
    // worse than clipped small text, and the alternative is illegible.
    if (!fits(lo)) {
      content.style.fontSize = `${lo}px`;
      setFontSizePx(lo);
      setMeasured(true);
      return;
    }

    // Largest size that still fits. ~7 iterations across 16..96px.
    while (hi - lo > opts.tolerancePx) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }

    const chosen = Math.floor(lo);
    content.style.fontSize = `${chosen}px`;
    setFontSizePx(chosen);
    setMeasured(true);
  };

  // Layout effect so the measured size is applied before the browser paints —
  // otherwise every question flashes at 96px before settling.
  useLayoutEffect(() => {
    setMeasured(false);
    measureRef.current();
    // Rendered maths and images can change the content's height after the first
    // paint, so measure again on the next frame. Cheap, and it is the difference
    // between a KaTeX-heavy question fitting and overflowing.
    const raf = requestAnimationFrame(() => measureRef.current());
    return () => cancelAnimationFrame(raf);
  }, [token]);

  /**
   * Re-fit when the frame itself changes size — dragging the window to a
   * projector, going fullscreen, a resolution switch.
   *
   * Keyed on `token` as well as the debounce, because the container is
   * conditionally rendered: on the present screen it only exists while a
   * question is on screen. With a constant dependency list this effect ran once,
   * on a render where `containerRef.current` was still null, bailed, and never
   * ran again — so the observer was never attached at all and the projector
   * never re-fitted for the rest of the session.
   */
  useEffect(() => {
    const box = containerRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        measureRef.current();
      }, opts.resizeDebounceMs);
    });

    observer.observe(box);
    return () => {
      if (timer !== null) clearTimeout(timer);
      observer.disconnect();
    };
  }, [opts.resizeDebounceMs, token]);

  return { containerRef, contentRef, fontSizePx, measured };
}
