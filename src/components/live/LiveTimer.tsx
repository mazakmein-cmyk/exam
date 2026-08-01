/**
 * LiveTimer.tsx — countdown surfaces shared by the student screen and the
 * creator control room.
 *
 * Colour is the primary signal, so it escalates on a fixed ladder rather than
 * on absolute seconds alone: calm (brand violet) → warning (amber) → critical
 * (rose). A 20s question and a 5-minute question therefore feel the same.
 * Emerald and rose are reserved for correctness elsewhere, so the timer never
 * borrows emerald.
 *
 * Two layers, and the split matters
 * ---------------------------------
 * `TimerBar` / `TimerChip` / `TimerRing` are pure: seconds in, pixels out. They
 * know nothing about where the time came from, which is what lets the present
 * screen render a huge one from the same code.
 *
 * `LiveTimerBar` / `LiveTimerChip` / `LiveTimerRing` are the connected
 * versions. They subscribe to the shared countdown store themselves, so the
 * ticking value never passes through a page's state. That is deliberate and
 * load-bearing: the countdown used to live in `useState` at the top of both
 * live pages, which re-rendered the leaderboard, the question rail and the
 * whole question preview four times a second for the length of every question.
 *
 * Rule of thumb: if a component renders a list, or is a page, it must not read
 * the ticking value. Render a connected timer instead and let it re-render
 * alone.
 */

import { Clock } from "lucide-react";
import { useLiveCountdown } from "@/lib/live/timerStore";

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

// ─── Connected variants ──────────────────────────────────────
//
// Each of these subscribes to the countdown store directly, so it re-renders
// roughly once a second and nothing above it re-renders at all.

/** Header hairline, wired to the live countdown. */
export function LiveTimerBar({ className = "" }: { className?: string }) {
  const { remaining, total, running } = useLiveCountdown();
  return <TimerBar remaining={remaining} total={total} active={running} className={className} />;
}

/** Sticky mm:ss pill, wired to the live countdown. */
export function LiveTimerChip({
  idleLabel = "Locked",
  className = "",
}: {
  idleLabel?: string;
  className?: string;
}) {
  const { remaining, total, running } = useLiveCountdown();
  return (
    <TimerChip
      remaining={remaining}
      total={total}
      active={running}
      idleLabel={idleLabel}
      className={className}
    />
  );
}

/**
 * Control-deck ring, wired to the live countdown.
 *
 * `idleLabel` is a function of the session rather than a plain string because
 * "no question yet", "time up" and "session over" are three different idle
 * states and the ring is the only place that says which one you are in.
 */
export function LiveTimerRing({
  size = 132,
  strokeWidth = 8,
  idleLabel = "—",
  caption,
}: {
  size?: number;
  strokeWidth?: number;
  idleLabel?: string;
  caption?: string;
}) {
  const { remaining, total, running } = useLiveCountdown();
  return (
    <TimerRing
      remaining={remaining}
      total={total}
      active={running}
      size={size}
      strokeWidth={strokeWidth}
      idleLabel={idleLabel}
      caption={running ? caption : undefined}
    />
  );
}
