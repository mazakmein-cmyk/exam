/**
 * LiveStats.tsx — compact metric primitives for the live-exam screens.
 *
 * The control room has to fit on one screen, so metrics are built to be read
 * as shapes first and numbers second: a stacked outcome bar instead of four
 * separate counters, a fill bar instead of a bare fraction.
 */

import type { LucideIcon } from "lucide-react";

const TONE_TEXT = {
  neutral: "text-foreground",
  brand: "text-primary",
  correct: "text-emerald-600",
  wrong: "text-rose-600",
  warn: "text-amber-600",
  muted: "text-muted-foreground",
} as const;

export type StatTone = keyof typeof TONE_TEXT;

/** Label-under-value tile. Values stay tabular so columns don't jitter live. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  icon: Icon,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: StatTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-bold leading-none tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

/**
 * Stacked correct / wrong / skipped bar. One row replaces four tiles and shows
 * the class's grasp of a question at a glance.
 */
export function OutcomeBar({
  correct,
  wrong,
  skipped,
  className = "",
  showLegend = true,
}: {
  correct: number;
  wrong: number;
  skipped: number;
  className?: string;
  showLegend?: boolean;
}) {
  const total = Math.max(1, correct + wrong + skipped);
  const seg = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`${correct} correct, ${wrong} wrong, ${skipped} did not answer`}>
        <div className="bg-emerald-500 transition-[width] duration-500" style={{ width: seg(correct) }} />
        <div className="bg-rose-500 transition-[width] duration-500" style={{ width: seg(wrong) }} />
        <div className="bg-muted-foreground/30 transition-[width] duration-500" style={{ width: seg(skipped) }} />
      </div>
      {showLegend && (
        <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {correct} correct
          </span>
          <span className="inline-flex items-center gap-1 text-rose-600">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {wrong} wrong
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            {skipped} skipped
          </span>
        </div>
      )}
    </div>
  );
}

/** Labelled progress bar — "68 / 128 answered" plus the fill it describes. */
export function MeterRow({
  label,
  value,
  max,
  suffix,
  tone = "brand",
  className = "",
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  tone?: "brand" | "correct" | "warn";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = tone === "correct" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-primary";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {value}
          <span className="text-xs font-medium text-muted-foreground">
            /{max}
            {suffix ? ` ${suffix}` : ""}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
