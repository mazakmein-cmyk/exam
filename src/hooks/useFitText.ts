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
 * Why it is self-correcting, and not just careful
 * ---------------------------------------------
 * A binary search trusts every probe it made. That is only safe if the thing being
 * measured is the thing that ends up on screen, and on this page it frequently is
 * not — the probes can be made against content that is still arriving:
 *
 *   - a web font swaps in and every line gets taller,
 *   - KaTeX replaces `$x^2$` with markup of a different height,
 *   - an option image finishes decoding,
 *   - the frame is a different shape by the time the user looks at it, because
 *     they resized the window or dragged it to a projector with another aspect
 *     ratio.
 *
 * The original hook handled only the last of those, and only through a container
 * observer. Anything else left a size that had been correct at measurement time
 * and was wrong on screen — a question overflowing its frame with its options
 * clipped off the bottom, permanently, because nothing ever measured again.
 *
 * So there are now three layers, in order of how often they save you:
 *
 *  1. **A verification pass** after the search. If what was chosen does not
 *     actually fit, step down until it does. Costs nothing when the search was
 *     honest, which is most of the time.
 *  2. **A content observer.** If the content's own size changes afterwards and it
 *     no longer fits, re-fit. This is the backstop that makes overflow
 *     self-healing rather than permanent, whatever caused it.
 *  3. **A frame observer, plus window resize and `fonts.ready`.** New frame shape,
 *     new measurement.
 *
 * Cost control
 * -----------
 * Measuring forces layout, so a fit runs **once per question**, keyed by a
 * caller-supplied token — never on a timer and never on a countdown tick. Each
 * search is ~7 reflows of one element, at the moment a question appears, when
 * there is nothing else competing for the frame. Everything reactive above is
 * debounced, and the content observer only acts when the content genuinely does
 * not fit, with a bounded number of corrections per token so a layout that cannot
 * settle degrades to slightly-wrong rather than to a loop.
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

/**
 * Motion freeze for the duration of a measurement.
 *
 * The probe loop is synchronous: set a font size, read scrollHeight, repeat.
 * That is only honest if the layout ASSUMES each probed size immediately — and a
 * descendant with `transition-all` does not. `all` includes font-size, inherited
 * changes still fire an element's own transition, and a transition at t=0 reports
 * its STARTING layout, because no time passes between probes.
 *
 * This is not hypothetical; it is how the focus screen shipped its worst bug
 * twice. The option cards carried `transition-all` and em-based sizing, so every
 * probe measured them at the size of the PREVIOUS question. The search concluded
 * that maximum-size text fit, and 150ms later — when the transition actually
 * arrived — the options were clipped off the bottom of a projector. Every
 * follow-up re-measure was poisoned the same way, so no amount of re-checking
 * healed it.
 *
 * The rule is injected once and switched on per measurement via a class on the
 * content root, `!important` so no utility class outranks it. Transitions are
 * removed outright; animations are merely PAUSED — `animation: none` would
 * restart them from zero when the class comes off, and a re-measure during a
 * window drag would replay every entrance animation in a loop.
 */
const FREEZE_CLASS = "fit-text-measuring";
const FREEZE_STYLE_ID = "fit-text-measuring-style";

function ensureFreezeRule(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(FREEZE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = FREEZE_STYLE_ID;
  style.textContent = `.${FREEZE_CLASS}, .${FREEZE_CLASS} * { transition: none !important; animation-play-state: paused !important; }`;
  document.head.appendChild(style);
}

/**
 * How many times a single question may be re-fitted because its content changed
 * under us. Four covers font swap + maths + images arriving separately; beyond
 * that something is oscillating and another pass will not help.
 */
const MAX_CORRECTIONS = 4;

/**
 * How many times the FRAME observer may re-fit one question — and why it needs a
 * bound at all, when a window resize obviously deserves a re-fit every time.
 *
 * Because this box's size is not an independent variable. It is a flex child, so
 * anything the caller renders as its SIBLING and sizes from `fontSizePx` feeds the
 * chosen size straight back into the space available to choose it in:
 *
 *   bigger font → taller sibling → shorter box → observer → smaller font →
 *   shorter sibling → taller box → observer → bigger font → …
 *
 * That is a control loop with a gain, and when the gain exceeds 1 it does not
 * converge — it flips between the extremes once per debounce, forever. On the
 * focus screen the sibling was the live answer river, four em-sized rows of it,
 * and the wall visibly pulsed between huge and tiny for the whole question.
 *
 * The caller-side fix is to keep such siblings off the measured size (the river
 * now has its own), but a hook that can be driven into a permanent oscillation by
 * an ordinary-looking layout is not finished. So frame-driven re-fits are
 * budgeted: a genuine reshape needs one or two, and a loop dies in under half a
 * second with a slightly-wrong size instead of running until the question ends.
 *
 * The budget is deliberately NOT reset by the frame observer itself — only by the
 * external signals, below, which cannot be self-inflicted.
 */
const MAX_FRAME_REFITS = 3;

/**
 * Sub-pixel and one-pixel frame changes are rounding, not a reshape. Re-fitting
 * on them spends the budget above on nothing — scrollbar arithmetic and fractional
 * flex heights both jitter at this scale.
 */
const FRAME_EPSILON_PX = 2;

/** Step for the verification pass. 8% converges from any overshoot in a few steps. */
const STEP_DOWN = 0.92;

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
 *        A change resets the correction budget and forces a fresh fit.
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

  // Kept in a ref so the observers can re-run without being re-created
  // (and without needing the option values in their dependency lists).
  const measureRef = useRef<() => void>(() => {});
  /** True while we are writing font sizes, so our own writes never re-enter. */
  const measuringRef = useRef(false);
  const correctionsRef = useRef(0);
  /** Frame-driven re-fits spent on this token. See MAX_FRAME_REFITS. */
  const frameRefitsRef = useRef(0);
  /** The frame we last actually measured against, to tell a reshape from jitter. */
  const lastFrameRef = useRef<{ w: number; h: number } | null>(null);
  /** A pending retry for a frame that had no height yet. */
  const retryRef = useRef<number | null>(null);

  measureRef.current = () => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const available = box.clientHeight;
    const availableWidth = box.clientWidth;

    /**
     * A zero-height box is a layout that has not settled yet, not a box with no
     * room in it. Returning silently here was the hole that let a stale size
     * survive: `measured` had already been set by an earlier question, so the
     * caller happily rendered the previous size into a differently-shaped frame
     * and nothing ever asked again.
     */
    if (available <= 0 || availableWidth <= 0) {
      if (retryRef.current === null && typeof requestAnimationFrame !== "undefined") {
        retryRef.current = requestAnimationFrame(() => {
          retryRef.current = null;
          measureRef.current();
        });
      }
      return;
    }

    // Recorded before the probes, so the frame observer compares against the
    // shape this measurement was actually made for.
    lastFrameRef.current = { w: availableWidth, h: available };

    measuringRef.current = true;
    ensureFreezeRule();
    // Frozen for the probes, thawed before anyone can see it. Removing the class
    // fires nothing: by then every property already holds its settled value.
    content.classList.add(FREEZE_CLASS);

    let chosen: number;
    try {
      const fits = (px: number): boolean => {
        content.style.fontSize = `${px}px`;
        // scrollHeight/Width against the client box is the honest test: it
        // accounts for wrapped lines, images and rendered maths, none of which we
        // could predict from character count.
        return content.scrollHeight <= available && content.scrollWidth <= availableWidth;
      };

      // If even the smallest size overflows, take it — clipped large text is
      // worse than clipped small text, and the alternative is illegible.
      if (!fits(opts.minPx)) {
        chosen = opts.minPx;
      } else {
        let lo = opts.minPx;
        let hi = opts.maxPx;

        // Largest size that still fits. ~7 iterations across 16..96px.
        while (hi - lo > opts.tolerancePx) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }

        chosen = Math.floor(lo);

        // Verification. Every probe above was believed; if the content changed
        // between two of them (a font landing, maths rendering) the bracket is
        // wrong, and the failure mode is a question hanging out of its frame.
        let guard = 0;
        while (chosen > opts.minPx && !fits(chosen) && guard < 24) {
          chosen = Math.max(opts.minPx, Math.floor(chosen * STEP_DOWN));
          guard += 1;
        }
      }

      content.style.fontSize = `${chosen}px`;
    } finally {
      content.classList.remove(FREEZE_CLASS);
      measuringRef.current = false;
    }

    setFontSizePx(chosen);
    setMeasured(true);
  };

  // Layout effect so the measured size is applied before the browser paints —
  // otherwise every question flashes at 96px before settling.
  useLayoutEffect(() => {
    correctionsRef.current = 0;
    frameRefitsRef.current = 0;
    lastFrameRef.current = null;
    setMeasured(false);
    measureRef.current();
    // Rendered maths and images can change the content's height after the first
    // paint, so measure again on the next frame. Cheap, and it is the difference
    // between a KaTeX-heavy question fitting and overflowing.
    const raf = requestAnimationFrame(() => measureRef.current());
    return () => {
      cancelAnimationFrame(raf);
      if (retryRef.current !== null) {
        cancelAnimationFrame(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [token]);

  /**
   * Everything that can invalidate a measurement after the fact.
   *
   * Keyed on `token` as well as the debounce, because the container is
   * conditionally rendered: on the focus screen it only exists while a question is
   * on screen. With a constant dependency list this effect ran once, on a render
   * where `containerRef.current` was still null, bailed, and never ran again — so
   * no observer was attached at all and the projector never re-fitted for the rest
   * of the session.
   */
  useEffect(() => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        measureRef.current();
      }, opts.resizeDebounceMs);
    };

    /**
     * A signal from OUTSIDE the layout: the window changed, the device rotated, a
     * font landed. None of those can be caused by a size this hook chose, so each
     * one is a genuinely new situation and earns a fresh budget on both counters.
     */
    const external = () => {
      correctionsRef.current = 0;
      frameRefitsRef.current = 0;
      schedule();
    };

    const observers: ResizeObserver[] = [];

    if (typeof ResizeObserver !== "undefined") {
      /**
       * The frame's own size. Unlike `external` above this is NOT trustworthy as a
       * reason to re-measure: the box is a flex child, so a sibling sized from
       * `fontSizePx` makes this observer an echo of our own output. Hence the
       * three guards — never during our probes, never for jitter, and never more
       * than a budgeted number of times per question. See MAX_FRAME_REFITS.
       */
      const frame = new ResizeObserver(() => {
        if (measuringRef.current) return;
        const b = containerRef.current;
        if (!b) return;
        const last = lastFrameRef.current;
        if (
          last &&
          Math.abs(last.w - b.clientWidth) < FRAME_EPSILON_PX &&
          Math.abs(last.h - b.clientHeight) < FRAME_EPSILON_PX
        ) {
          return;
        }
        if (frameRefitsRef.current >= MAX_FRAME_REFITS) return;
        frameRefitsRef.current += 1;
        schedule();
      });
      frame.observe(box);
      observers.push(frame);

      if (content) {
        // The content's own size can change while the frame stays put: a web font
        // swapping in, an image decoding, KaTeX replacing markup. None of those
        // resize the container, and each of them can make the chosen size wrong.
        const grown = new ResizeObserver(() => {
          if (measuringRef.current) return; // our own probe writes
          const b = containerRef.current;
          const c = contentRef.current;
          if (!b || !c) return;
          // Only overflow is worth a reflow. Content that shrank is merely a
          // slightly-smaller-than-possible question, and re-fitting on every
          // shrink is how you get an oscillation between two sizes.
          if (c.scrollHeight <= b.clientHeight && c.scrollWidth <= b.clientWidth) return;
          if (correctionsRef.current >= MAX_CORRECTIONS) return;
          correctionsRef.current += 1;
          schedule();
        });
        grown.observe(content);
        observers.push(grown);
      }
    }

    // Belt and braces for the frame observer: a window that changes shape without
    // changing this box's size should not happen, and did. This is also what
    // restores the frame budget after a real resize, which is why the two paths
    // cannot share a handler.
    window.addEventListener("resize", external);
    window.addEventListener("orientationchange", external);

    // The single most common reason a first measurement is wrong.
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) external();
    });

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      observers.forEach((o) => o.disconnect());
      window.removeEventListener("resize", external);
      window.removeEventListener("orientationchange", external);
    };
  }, [opts.resizeDebounceMs, token]);

  return { containerRef, contentRef, fontSizePx, measured };
}
