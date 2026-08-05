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
 *
 * Q16: every colour here comes from the `--stage-*` custom properties the focus
 * screen puts on its shell (see lib/live/stageTheme.ts). This banner is only ever
 * rendered inside `.stage-rail` on the projector — never in the control room, which
 * gets MomentChip above — so it is a projected surface and the whole-screen rule
 * applies: the theme is a broadcast decision the creator makes for the room, and
 * nothing on the wall may carry a colour that decision cannot reach.
 *
 * Concretely, this card was written when the frame was always dark, so it hard-coded
 * `text-white` on the headline and an amber-on-transparent wash around it. Switch the
 * stage to light and the headline goes white-on-near-white — the loudest thing on the
 * screen becomes the one thing nobody can read, at the exact moment the room is
 * looking at it and somebody is filming it. The amber tones failed the other way:
 * amber-200/70 on #f5f6fa is roughly 1.5:1, so the eyebrow simply vanished.
 *
 * The fill and hairline use the warn pair rather than the plain surface pair on
 * purpose — `--stage-warn-bg` / `--stage-warn-line` exist for this card (their
 * comments in stageTheme.ts say so) and are the themed continuation of the amber
 * this banner always had. A moment that looked like every other card on the rail
 * would read as another panel of standings instead of as a celebration.
 */
export const MomentBanner = memo(function MomentBanner({
  moment,
}: {
  moment: LiveMoment | null;
}) {
  const copy = momentCopy(moment);
  if (!copy) return null;

  return (
    <div
      className="flex items-center gap-5 rounded-2xl border px-6 py-4"
      style={{
        borderColor: "var(--stage-warn-line)",
        // The amber→violet wash the banner has always had, expressed in tokens: the
        // warn fill is the celebration, the glow is the same violet the stage puts
        // behind the question, so the card reads as part of the frame rather than as
        // a sticker on top of it. `--stage-glow` is a gradient stop by design.
        background: "linear-gradient(to right, var(--stage-warn-bg), var(--stage-glow))",
      }}
    >
      <span className="text-4xl leading-none" aria-hidden="true">
        {copy.emoji}
      </span>
      <div className="min-w-0">
        {/* Full-strength warn, not the dimmed amber-200/70 this used to be. The old
            value was a dark-frame nicety; at 70% of a light theme's amber-700 the
            label drops under AA at the distance this screen is read from, and an
            eyebrow nobody can read is what turns a name on the wall from a tribute
            into an unexplained callout. */}
        <p
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--stage-warn)" }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Moment of the round
        </p>
        <p className="mt-1 truncate text-3xl font-bold" style={{ color: "var(--stage-fg)" }}>
          {copy.headline}
        </p>
        {/* `muted` and not `faint`: the detail carries the reason the moment happened
            ("four in a row"), and a viewer who misses it is left with a bare name and
            no idea why it is on the wall. faint is for captions nobody needs. */}
        <p className="mt-0.5 truncate text-lg" style={{ color: "var(--stage-muted)" }}>
          {copy.detail}
        </p>
      </div>
    </div>
  );
});
