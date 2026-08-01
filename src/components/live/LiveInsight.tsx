/**
 * LiveInsight.tsx — the creator-only readouts: B4, B6, A8 and B12's counter.
 *
 * All four are control-room surfaces and none may appear on the projector. They
 * name individual behaviour ("9 answered wrong in two seconds"), and a class that
 * can see that is a class learning to game it.
 *
 * Everything here renders numbers the server already computed. No component in
 * this file issues a request.
 */

import { memo } from "react";
import {
  AlertTriangle,
  Gauge,
  HandHelping,
  Lightbulb,
  Rabbit,
  Turtle,
} from "lucide-react";
import { optionLabel } from "@/lib/live/optionTally.js";
import { deriveCoachLine } from "@/lib/live/coachLine.js";
import { useLiveCountdown } from "@/lib/live/timerStore";
import type { Classification } from "@/lib/live/classifyDistribution.js";
import type {
  CoachContext,
  CoachLine as CoachLineValue,
} from "@/lib/live/coachLine.js";

// ─── A8 ──────────────────────────────────────────────────────

const TONE_STYLE: Record<string, string> = {
  calm: "border-border/60 bg-muted/40 text-muted-foreground",
  act: "border-primary/30 bg-primary/[0.07] text-foreground",
  warn: "border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300",
};

/**
 * One sentence of interpretation.
 *
 * Memoised on `ruleId` alone, not on the text. The numbers inside a line change
 * constantly — "9 of 34" becomes "11 of 34" a second later — and re-rendering for
 * that makes the line visibly twitch. The situation is what the creator reads;
 * the exact figure is not worth a repaint.
 */
export const CoachLine = memo(
  function CoachLine({ line }: { line: CoachLineValue | null }) {
    if (!line) return null;
    return (
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium leading-snug ${
          TONE_STYLE[line.tone] || TONE_STYLE.calm
        }`}
        role="status"
      >
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
        <span>{line.text}</span>
      </div>
    );
  },
  (a, b) => a.line?.ruleId === b.line?.ruleId
);

/**
 * The coach line, connected to the countdown.
 *
 * One rule — "only 9 of 34 answered with 12s left" — needs the ticking value. If
 * the page read it, the whole control room would re-render once a second and undo
 * Phase 0's entire point. So the tick is consumed HERE, in a leaf: this wrapper
 * re-renders every second, `deriveCoachLine` runs (a handful of comparisons on
 * numbers already in memory), and the memoised child above re-renders only when
 * the rule ID actually changes.
 *
 * The caller passes everything except `remainingSeconds`.
 */
export const LiveCoachLine = memo(function LiveCoachLine({
  context,
}: {
  context: Omit<CoachContext, "remainingSeconds"> | null;
}) {
  const { remaining } = useLiveCountdown();
  if (!context) return null;
  const line = deriveCoachLine({ ...context, remainingSeconds: remaining });
  return <CoachLine line={line} />;
});

// ─── B4 ──────────────────────────────────────────────────────

const KIND_COPY: Record<
  string,
  { label: string; tone: keyof typeof TONE_STYLE; describe: (c: Classification) => string }
> = {
  systematic: {
    label: "Shared misconception",
    tone: "act",
    describe: (c) =>
      `${c.percentages[c.dominantIndex ?? 0] ?? 0}% chose ${optionLabel(
        c.dominantIndex ?? 0
      )} — more than chose the answer. This is a belief, not a guess.`,
  },
  split: {
    label: "Split down the middle",
    tone: "act",
    describe: (c) =>
      `${optionLabel(c.topTwo[0])} and ${optionLabel(
        c.topTwo[1]
      )} are close — they're separating two similar ideas and getting it wrong half the time.`,
  },
  scattered: {
    label: "Looks like guessing",
    tone: "warn",
    describe: () => "Answers are spread roughly evenly, which usually means the idea is missing rather than muddled.",
  },
  solid: {
    label: "Class has it",
    tone: "calm",
    describe: (c) => `${c.correctPct}% correct.`,
  },
  insufficient: {
    label: "Too few answers to read",
    tone: "calm",
    describe: (c) => `${c.responders} response${c.responders === 1 ? "" : "s"} so far.`,
  },
  combinations: {
    label: "Multiple answers",
    tone: "calm",
    describe: () => "Counts are per option, so they can add up past 100%.",
  },
};

export const MisconceptionCallout = memo(function MisconceptionCallout({
  classification,
}: {
  classification: Classification | null;
}) {
  if (!classification) return null;
  const copy = KIND_COPY[classification.kind];
  // `inconclusive` deliberately renders nothing. A label that says "we can't tell"
  // is noise occupying the space a real signal would use.
  if (!copy) return null;

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${TONE_STYLE[copy.tone]}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.1em] opacity-80">{copy.label}</p>
        <p className="mt-0.5 text-[13px] leading-snug">{copy.describe(classification)}</p>
      </div>
    </div>
  );
});

// ─── B6 ──────────────────────────────────────────────────────

export type TimeProfileValue = {
  fastCorrect: number;
  slowCorrect: number;
  fastWrong: number;
  slowWrong: number;
  impulsiveWrong: number;
  medianMs: number | null;
  histogram: number[];
};

function Quadrant({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Rabbit;
  label: string;
  value: number;
  hint: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 px-2.5 py-2" title={hint}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-0.5 text-[15px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/**
 * Right and wrong, split by fast and slow.
 *
 * Two students both answer wrong: one in two seconds, one after the full minute.
 * They are completely different problems — one is confidently mistaken, the other
 * is lost — and an accuracy percentage renders them identical. "Fast" is relative
 * to this question's own median, computed server-side, because five seconds is
 * quick on a 15s question and impossible on a 90s one.
 */
export const TimeProfile = memo(function TimeProfile({ profile }: { profile: TimeProfileValue }) {
  const total =
    profile.fastCorrect + profile.slowCorrect + profile.fastWrong + profile.slowWrong;
  if (total === 0) return null;

  const peak = Math.max(1, ...profile.histogram);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/25">
      <div className="grid grid-cols-4 divide-x divide-border/50">
        <Quadrant
          icon={Rabbit}
          label="Fast right"
          value={profile.fastCorrect}
          hint="Knew it cold."
          tone="text-emerald-600"
        />
        <Quadrant
          icon={Turtle}
          label="Slow right"
          value={profile.slowCorrect}
          hint="Worked it out — the good kind of struggle."
          tone="text-emerald-600/80"
        />
        <Quadrant
          icon={Rabbit}
          label="Fast wrong"
          value={profile.fastWrong}
          hint="Confidently mistaken, or guessing."
          tone="text-rose-600"
        />
        <Quadrant
          icon={Turtle}
          label="Slow wrong"
          value={profile.slowWrong}
          hint="Tried hard and got lost — these are the ones to go and stand next to."
          tone="text-rose-600/80"
        />
      </div>

      {profile.histogram.length > 0 && (
        <div className="flex items-end gap-[2px] border-t border-border/50 px-2.5 py-2" aria-hidden="true">
          {profile.histogram.map((n, i) => (
            <div
              key={i}
              className="min-w-0 flex-1 rounded-sm bg-primary/30"
              style={{ height: `${Math.max(2, (n / peak) * 24)}px` }}
              title={`${n} answered in this window`}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── B12 ─────────────────────────────────────────────────────

/**
 * How many students said they were lost.
 *
 * Exact from one. Hidden entirely at zero — an empty row is a permanent reminder
 * of a thing that is not happening, and the deck has no space for that.
 *
 * Control room only. A count on the projector turns an anonymous signal into a
 * public one and nobody taps it again.
 */
export const ConfusionCount = memo(function ConfusionCount({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[13px] font-medium text-amber-700 dark:text-amber-300">
      <HandHelping className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-bold tabular-nums">{count}</span>{" "}
        {count === 1 ? "student says they're" : "students say they're"} lost
      </span>
    </div>
  );
});

// ─── Shared heading ──────────────────────────────────────────

export function InsightHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      <Gauge className="h-3 w-3" />
      {children}
    </p>
  );
}
