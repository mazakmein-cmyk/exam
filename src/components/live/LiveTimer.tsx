/**
 * LiveTimer.tsx — countdown surfaces shared by the student screen and the
 * creator control room.
 *
 * Colour is the primary signal, so it escalates on a fixed ladder rather than
 * on absolute seconds alone: calm (brand violet) → warning (amber) → critical
 * (rose). A 20s question and a 5-minute question therefore feel the same.
 * Emerald and rose are reserved for correctness elsewhere, so the timer never
 * borrows emerald.
 */

import { Clock } from "lucide-react";

export type TimerTone = "calm" | "warn" | "critical" | "idle";

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Urgency ladder: last 10s is critical, last third (or 30s) is a warning. */
export function timerTone(remaining: number, total: number): TimerTone {
  if (remaining <= 0) return "idle";
  if (remaining <= 10) return "critical";
  const warnAt = Math.max(15, Math.round(total * 0.34));
  if (remaining <= warnAt) return "warn";
  return "calm";
}

const TONE_TEXT: Record<TimerTone, string> = {
  calm: "text-primary",
  warn: "text-amber-500",
  critical: "text-rose-500",
  idle: "text-muted-foreground",
};

const TONE_STROKE: Record<TimerTone, string> = {
  calm: "stroke-primary",
  warn: "stroke-amber-500",
  critical: "stroke-rose-500",
  idle: "stroke-muted-foreground/40",
};

const TONE_BAR: Record<TimerTone, string> = {
  calm: "bg-primary",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
  idle: "bg-muted-foreground/30",
};

const TONE_CHIP: Record<TimerTone, string> = {
  calm: "bg-primary/10 text-primary ring-1 ring-primary/20",
  warn: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/25",
  critical: "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/30",
  idle: "bg-muted text-muted-foreground ring-1 ring-border",
};

// ─── Depletion bar ───────────────────────────────────────────

/**
 * A hairline that drains left-to-right. Sits under the sticky header so the
 * time pressure stays in peripheral vision even when the timer has scrolled
 * out of view on a phone.
 */
export function TimerBar({
  remaining,
  total,
  active,
  className = "",
}: {
  remaining: number;
  total: number;
  active: boolean;
  className?: string;
}) {
  const tone = active ? timerTone(remaining, total) : "idle";
  const pct = active && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div className={`h-[3px] w-full bg-border/40 overflow-hidden ${className}`} aria-hidden="true">
      <div
        className={`h-full transition-[width] duration-500 ease-linear ${TONE_BAR[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Compact chip ────────────────────────────────────────────

/** Inline mm:ss pill for headers and dense toolbars. */
export function TimerChip({
  remaining,
  total,
  active,
  idleLabel = "Locked",
  className = "",
}: {
  remaining: number;
  total: number;
  active: boolean;
  idleLabel?: string;
  className?: string;
}) {
  const tone = active ? timerTone(remaining, total) : "idle";

  return (
    <div
      role="timer"
      aria-label={active ? `${remaining} seconds remaining` : idleLabel}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums font-mono ${TONE_CHIP[tone]} ${
        tone === "critical" ? "animate-pulse" : ""
      } ${className}`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" />
      {active ? formatClock(remaining) : idleLabel}
    </div>
  );
}

// ─── Ring ────────────────────────────────────────────────────

/**
 * Circular countdown for the creator's control deck — the one element that
 * must read from across a room.
 */
export function TimerRing({
  remaining,
  total,
  active,
  size = 132,
  strokeWidth = 8,
  idleLabel = "—",
  caption,
}: {
  remaining: number;
  total: number;
  active: boolean;
  size?: number;
  strokeWidth?: number;
  idleLabel?: string;
  caption?: string;
}) {
  const tone = active ? timerTone(remaining, total) : "idle";
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = active && total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border/50"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={`${TONE_STROKE[tone]} transition-[stroke-dashoffset] duration-500 ease-linear`}
        />
      </svg>
      <div
        role="timer"
        aria-label={active ? `${remaining} seconds remaining` : idleLabel}
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        {/* mm:ss gets the full monospace treatment; a word like "Time up" is
            set smaller so it never crowds the ring. */}
        <span
          className={`font-bold leading-none ${active ? "font-mono tabular-nums" : "font-display tracking-tight"} ${
            TONE_TEXT[tone]
          } ${tone === "critical" ? "animate-pulse" : ""}`}
          style={{ fontSize: active ? size * 0.23 : size * 0.145 }}
        >
          {active ? formatClock(remaining) : idleLabel}
        </span>
        {caption && (
          <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
