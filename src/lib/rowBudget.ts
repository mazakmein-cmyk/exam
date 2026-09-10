/**
 * rowBudget.ts — how many table rows are worth painting before the reader asks
 * for more.
 *
 * Question Analysis drew every question in the paper on first paint. A row is
 * not cheap: four cells, a ghost button with an icon, and an accuracy bar built
 * from nested divs — roughly a dozen DOM nodes each. Two hundred of those is a
 * few thousand nodes to build, lay out and paint before anything appears, which
 * a mid-range Android does slowly enough to feel broken. On the creator's own
 * laptop it looks instant, which is why it shipped.
 *
 * The fix is not "always paginate" — on a machine with room to spare, a button
 * between the creator and their own numbers is pure friction. So the budget is
 * resolved from what the device admits about itself, and a roomy device gets
 * BUDGET_UNLIMITED: the full table, no controls, exactly as before.
 *
 * WHY A TOTAL, NOT A PER-SECTION CAP
 * Eight sections of thirty questions each clear any sane per-section cap and
 * still paint 240 rows. The cost being bounded is the cost of the whole table,
 * so the budget is a total, spent section by section in display order.
 *
 * WHY UNKNOWN MEANS MODEST, NOT ROOMY
 * `deviceMemory` and a meaningful `hardwareConcurrency` are Chromium-only.
 * Safari and Firefox report nothing useful, and a phone that declines to
 * describe itself is far more likely to be the cheap Android this exists for
 * than a workstation. Viewport width breaks the tie: desktop-class width with
 * unknown specs is treated as a laptop, a narrow one is not.
 *
 * Nothing here is measured over time and nothing is cached to storage — it is a
 * one-shot read of static device facts, so callers can resolve it once per
 * mount and keep it.
 */

/** A budget meaning "paint the whole thing"; no controls are rendered. */
export const BUDGET_UNLIMITED = Number.POSITIVE_INFINITY;

/** Rows painted up front on a device that admits to being weak. */
export const BUDGET_TIGHT = 40;

/** Rows painted up front on a mid device, or one that told us nothing. */
export const BUDGET_MODEST = 80;

/**
 * Hiding a handful of rows behind a click is worse than painting them: the
 * button costs a tap and reads as though something is missing. A section whose
 * tail is this short or shorter is rendered whole instead.
 *
 * Ten because sections in these papers run 20-50 questions, so a hard stop at
 * the budget lands mid-section constantly. A 25-and-20 paper against the
 * tightest budget offered "View 5 more" at four -- a control that costs a tap
 * and buys five rows. Twenty rows is worth a button; five is not.
 *
 * Only the section the budget runs out inside can overspend, and only once, so
 * the whole table is still bounded by budget + this.
 */
export const TAIL_SLACK_ROWS = 10;

/** Below this viewport width an unknown device is assumed to be a phone. */
const DESKTOP_MIN_WIDTH = 1024;

/** The facts a budget is resolved from. Every field is optional: absent reads as unknown. */
export type DeviceFacts = {
  /** navigator.deviceMemory — approximate RAM in GiB, capped at 8 by the spec. */
  memoryGb?: number;
  /** navigator.hardwareConcurrency — logical cores. */
  cores?: number;
  /** navigator.connection.saveData — an explicit request to do less work. */
  saveData?: boolean;
  /** Viewport width, the tie-breaker when the device reports no specs. */
  viewportWidth?: number;
};

/**
 * Resolve a total row budget from device facts.
 *
 * Pure and separately exported so the tiering can be asserted without a
 * browser; `getRowBudget` is the thin wrapper that reads the real globals.
 */
export function resolveRowBudget(facts: DeviceFacts): number {
  // An explicit Data Saver request outranks the hardware. The device may well be
  // capable; the reader has still asked for less, and this is work to skip.
  if (facts.saveData) return BUDGET_TIGHT;

  const { memoryGb, cores } = facts;
  const knowsItself = typeof memoryGb === "number" || typeof cores === "number";

  if (!knowsItself) {
    // Nothing to go on but the window. Desktop-class width is the only signal
    // that outweighs "assume a phone".
    return (facts.viewportWidth ?? 0) >= DESKTOP_MIN_WIDTH ? BUDGET_UNLIMITED : BUDGET_MODEST;
  }

  // Either signal being poor is enough. A 2 GiB device with eight little cores
  // is still a 2 GiB device, and a quad-core is not painting this quickly.
  if ((memoryGb !== undefined && memoryGb <= 2) || (cores !== undefined && cores <= 4)) {
    return BUDGET_TIGHT;
  }

  // The spec caps deviceMemory at 8, so 8-and-8 is the top tier it can express.
  if ((memoryGb ?? 0) >= 8 && (cores ?? 0) >= 8) return BUDGET_UNLIMITED;

  return BUDGET_MODEST;
}

/** Read the current device's facts and resolve a budget. Safe outside a browser. */
export function getRowBudget(): number {
  if (typeof navigator === "undefined") return BUDGET_UNLIMITED;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  return resolveRowBudget({
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
    saveData: nav.connection?.saveData === true,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : undefined,
  });
}

/**
 * Decide how many rows of each section to paint.
 *
 * `sizes` and `expanded` are parallel arrays in display order. Returns the
 * visible row count per section.
 *
 * Two properties matter more than the exact numbers:
 *
 *   STABLE — the budget is spent on a BASELINE pass that ignores `expanded`, and
 *            revealed sections are then overridden to full. A section is charged
 *            for its slice whether or not the reader later revealed it, so one
 *            "View more" can never resize a different section. Sharing the
 *            budget instead — an expanded section paying nothing, freeing its
 *            slice for whoever is below — makes the table rearrange itself
 *            underneath the tap that asked for one more row.
 *   HONEST — a section the budget could not reach still returns 0 rather than
 *            being dropped, so the caller renders its heading and its count and
 *            "there are four more sections below" is on the screen.
 *
 * Overspends by at most TAIL_SLACK_ROWS, when stopping exactly at the budget
 * would have hidden a tail too short to be worth a button.
 */
export function allocateRows(sizes: number[], budget: number, expanded: boolean[]): number[] {
  if (budget === BUDGET_UNLIMITED) return sizes.map(size => size);

  let remaining = Math.max(0, budget);

  const baseline = sizes.map(size => {
    if (size <= remaining) {
      remaining -= size;
      return size;
    }

    // The budget ran out inside this section. Show what is left of it, unless
    // the tail we would be hiding is too short to be worth a button.
    const shown = size - remaining <= TAIL_SLACK_ROWS ? size : remaining;
    remaining = 0;
    return shown;
  });

  return baseline.map((shown, i) => (expanded[i] ? sizes[i] : shown));
}
