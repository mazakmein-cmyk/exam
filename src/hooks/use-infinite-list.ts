import { useEffect, useMemo, useState } from "react";

/** How many rows to materialise per batch when a caller doesn't say. */
export const DEFAULT_INFINITE_PAGE_SIZE = 24;

type InfiniteList<T> = {
  /** The slice to render right now. */
  visible: T[];
  /** True while `visible` is shorter than the full list. */
  hasMore: boolean;
  /**
   * Attach to an element BELOW the last row, rendered only while `hasMore`.
   * Crossing into view (or coming within 600px of it) appends the next batch.
   *
   * A callback ref, not a ref object, and that difference is load-bearing — see
   * the note on tab switches in the hook body.
   */
  sentinelRef: (node: HTMLElement | null) => void;
};

/**
 * Infinite scroll over a list that is ALREADY in memory.
 *
 * This is not pagination and it fetches nothing — every page here filters and
 * searches the complete list and always did. What it limits is how many rows get
 * materialised into the DOM at once, which is the part that actually costs
 * something: an exam card mounts a dropdown-menu root, and a creator card also
 * mounts a switch and a tooltip, so a library of several hundred was building
 * several hundred of those before it could paint anything.
 *
 * Two details worth knowing:
 *
 *  - `visibleCount` is in the effect's dependencies on purpose. An
 *    IntersectionObserver only fires when intersection CHANGES, so if appending a
 *    batch left the sentinel still inside the root margin, no further callback
 *    would come and scrolling would silently stall halfway down the list.
 *    Re-creating the observer each batch gives a fresh initial callback, which
 *    continues the run whenever the sentinel is still in range. That is what lets
 *    this work with no "Show more" button as a backstop.
 *
 *  - Resetting on a new `items` reference means changing a filter or typing in a
 *    search box starts again from the first batch — which is right, because the
 *    result set the reader is now looking at is a different list.
 *
 *  - The sentinel is tracked in STATE via a callback ref, not in a ref object.
 *    Both library pages have tabs, and switching tabs unmounts one grid and
 *    mounts the other without unmounting the page. With a ref object, the
 *    returning tab gets a brand-new sentinel node while the effect's dependencies
 *    are all unchanged — so the effect never re-runs, the observer stays pointed
 *    at the detached old node, and scrolling that tab silently stops loading
 *    anything ever again. Keeping the node in state makes "the node changed" a
 *    dependency like any other.
 */
export function useInfiniteList<T>(
  items: T[],
  pageSize: number = DEFAULT_INFINITE_PAGE_SIZE
): InfiniteList<T> {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

  const hasMore = visibleCount < items.length;

  useEffect(() => {
    if (!hasMore) return;
    if (!sentinel) return;

    // No observer (very old browser, or a non-DOM test environment): render the
    // whole list rather than strand rows behind a scroll that can never fire.
    if (typeof IntersectionObserver === "undefined") {
      setVisibleCount(items.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + pageSize, items.length));
        }
      },
      // Load the next batch before the reader reaches the end, so this reads as
      // one continuous list instead of as loading.
      { rootMargin: "600px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, items.length, pageSize, visibleCount]);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // setSentinel is stable, so React calls it only when the node actually
  // attaches or detaches — not on every render.
  return { visible, hasMore, sentinelRef: setSentinel };
}
