/**
 * QuestionRail.tsx — the one-glance map of a whole live exam.
 *
 * Both roles need "where are we, what happened, what's left" in a single
 * horizontal strip, so the chip vocabulary is shared. Colour never carries a
 * status on its own: every non-neutral state also has a glyph, which keeps the
 * rail readable for colour-blind users and at a glance from a distance.
 */

import { memo } from "react";

import { Check, X, Minus, Lock, Eye, Dot } from "lucide-react";

export type ChipStatus =
  /** the question that is open right now */
  | "current"
  /** answered, correct (student) */
  | "correct"
  /** answered, wrong (student) */
  | "wrong"
  /** answered, result not revealed yet (student) */
  | "pending"
  /** the student was present but did not answer */
  | "skipped"
  /** unlocked before the student joined */
  | "missed"
  /** not unlocked yet (student) */
  | "locked"
  /** already run, analytics available (creator) */
  | "done"
  /** not yet unlocked (creator) */
  | "upcoming"
  /** the past question the creator is inspecting */
  | "reviewing";

const CHIP_CLASS: Record<ChipStatus, string> = {
  current:
    "bg-primary text-primary-foreground border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]",
  // Opacity must come from Tailwind's real scale (multiples of 5); /12 emits nothing.
  correct: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40",
  wrong: "bg-rose-500/15 text-rose-600 border-rose-500/40",
  pending: "bg-primary/10 text-primary border-primary/40 border-dashed",
  skipped: "bg-muted/50 text-muted-foreground border-border/70",
  missed: "bg-muted/50 text-muted-foreground/70 border-border/70",
  locked: "bg-muted/30 text-muted-foreground/60 border-border/50",
  done: "bg-foreground/[0.06] text-foreground/70 border-border",
  upcoming: "bg-muted/30 text-muted-foreground/60 border-border/50",
  reviewing: "bg-amber-500/15 text-amber-600 border-amber-500/50",
};

const CHIP_GLYPH: Partial<Record<ChipStatus, typeof Check>> = {
  correct: Check,
  wrong: X,
  skipped: Minus,
  missed: Eye,
  locked: Lock,
  done: Check,
  reviewing: Dot,
};

export const CHIP_LABEL: Record<ChipStatus, string> = {
  current: "Live now",
  correct: "Correct",
  wrong: "Wrong",
  pending: "Answered",
  skipped: "Not answered",
  missed: "Missed",
  locked: "Locked",
  done: "Done",
  upcoming: "Upcoming",
  reviewing: "Reviewing",
};

export type RailItem = {
  id: string;
  index: number;
  status: ChipStatus;
  /** Section heading this question sits under; adjacent equal values group. */
  group?: string;
  title?: string;
};

export function QuestionChip({
  item,
  onSelect,
  size = "md",
}: {
  item: RailItem;
  onSelect?: (item: RailItem) => void;
  size?: "sm" | "md";
}) {
  const Glyph = CHIP_GLYPH[item.status];
  const dims = size === "sm" ? "h-7 min-w-7 text-[11px]" : "h-9 min-w-9 text-xs";

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(item) : undefined}
      disabled={!onSelect}
      title={item.title ? `Q${item.index + 1} · ${item.title}` : `Q${item.index + 1}`}
      aria-label={`Question ${item.index + 1}, ${CHIP_LABEL[item.status]}`}
      aria-current={item.status === "current" ? "true" : undefined}
      className={`${dims} shrink-0 px-1.5 rounded-lg border flex items-center justify-center gap-0.5 font-bold tabular-nums transition-all
        ${CHIP_CLASS[item.status]}
        ${onSelect ? "hover:brightness-105 hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background`}
    >
      <span>{item.index + 1}</span>
      {Glyph && <Glyph className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
    </button>
  );
}

function QuestionRail({
  items,
  onSelect,
  size = "md",
  /**
   * "row" — one horizontal scroller (wide footers, sticky bars).
   * "stacked" — section label above its wrapped chips, for narrow side panels
   * where a single row would clip the later sections.
   */
  layout = "row",
  className = "",
}: {
  items: RailItem[];
  onSelect?: (item: RailItem) => void;
  size?: "sm" | "md";
  layout?: "row" | "stacked";
  className?: string;
}) {
  // Collapse adjacent items sharing a group label into labelled clusters.
  const clusters: { group?: string; items: RailItem[] }[] = [];
  items.forEach((item) => {
    const last = clusters[clusters.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else clusters.push({ group: item.group, items: [item] });
  });

  if (layout === "stacked") {
    return (
      <div className={`space-y-2.5 ${className}`}>
        {clusters.map((cluster, ci) => (
          <div key={ci} className="space-y-1.5">
            {cluster.group && (
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {cluster.group}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {cluster.items.map((item) => (
                <QuestionChip key={item.id} item={item} onSelect={onSelect} size={size} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-4 overflow-x-auto ${className}`}>
      {clusters.map((cluster, ci) => (
        <div key={ci} className="flex items-center gap-2 shrink-0">
          {cluster.group && (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground whitespace-nowrap pr-0.5">
              {cluster.group}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {cluster.items.map((item) => (
              <QuestionChip key={item.id} item={item} onSelect={onSelect} size={size} />
            ))}
          </div>
          {ci < clusters.length - 1 && <span className="h-5 w-px bg-border shrink-0 ml-2" />}
        </div>
      ))}
    </div>
  );
}

/** Small colour key so the rail is self-explanatory the first time it's seen. */
export function RailLegend({ statuses, className = "" }: { statuses: ChipStatus[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {statuses.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={`h-2.5 w-2.5 rounded-[3px] border ${CHIP_CLASS[s]}`} />
          {CHIP_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/**
 * Memoised because the creator's control room re-renders roughly once a second
 * while a question is open (the answered count polls at 750ms). Without this,
 * every one of those ticks re-ran every chip in the exam - which for a long paper is hundreds of nodes — and the props that
 * decide its output only change when the question does.
 */
export default memo(QuestionRail);
