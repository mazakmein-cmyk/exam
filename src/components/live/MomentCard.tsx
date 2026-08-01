/**
 * MomentCard.tsx — B14's two layers, kept deliberately different.
 *
 * LAYER 1, the creator's chip: automatic, quiet, and a SUGGESTION. It appears on
 * the control room only and says something the creator can choose to read out.
 * It is never pushed to the room on its own.
 *
 * LAYER 2, the projector card: manual. It only exists because the creator pressed
 * Celebrate.
 *
 * The split is the whole design. A robot announcing "SANA: COMEBACK" to a class
 * reads as surveillance; a teacher saying "hey, nice comeback Sana" lands warmly,
 * and the same fact does completely different work depending on who says it. So
 * the automatic layer talks to the teacher and the loud layer waits to be asked.
 */

import { memo } from "react";
import { PartyPopper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { momentCopy } from "@/lib/live/moments.js";
import type { LiveMoment } from "@/services/liveExamService";

// ─── Layer 1: the creator's chip ─────────────────────────────

export type MomentChipProps = {
  moment: LiveMoment | null;
  onCelebrate: () => void;
  pending?: boolean;
};

export const MomentChip = memo(function MomentChip({
  moment,
  onCelebrate,
  pending = false,
}: MomentChipProps) {
  const copy = momentCopy(moment);
  if (!copy) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-3 py-2">
      <span className="text-base leading-none" aria-hidden="true">
        {copy.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
          {copy.headline}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{copy.detail}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 border-violet-500/40 px-2 text-[11px] font-semibold text-violet-600 hover:bg-violet-500/10 dark:text-violet-300"
        onClick={onCelebrate}
        disabled={pending}
        title="Show this on the big screen and set off confetti for everyone"
      >
        <PartyPopper className="mr-1 h-3.5 w-3.5" />
        Celebrate
      </Button>
    </div>
  );
});

// ─── Layer 2: the wall ───────────────────────────────────────

/**
 * Moment of the round, between questions.
 *
 * The engagement peak of a session and the thing people film, so it is sized to
 * be legible from the back of a room rather than to fit neatly.
 */
export const MomentBanner = memo(function MomentBanner({
  moment,
}: {
  moment: LiveMoment | null;
}) {
  const copy = momentCopy(moment);
  if (!copy) return null;

  return (
    <div className="flex items-center gap-5 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-400/15 to-violet-500/10 px-6 py-4">
      <span className="text-4xl leading-none" aria-hidden="true">
        {copy.emoji}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-200/70">
          <Sparkles className="h-3.5 w-3.5" />
          Moment of the round
        </p>
        <p className="mt-1 truncate text-3xl font-bold text-white">{copy.headline}</p>
        <p className="mt-0.5 truncate text-lg text-white/60">{copy.detail}</p>
      </div>
    </div>
  );
});
