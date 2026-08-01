/**
 * ConfusionButton.tsx — B12. A hand raised that nobody else can see.
 *
 * Real classrooms have a bug: the students who most need to ask are the least
 * likely to raise a hand in front of their peers. Until now the only channel from
 * student to creator was a submitted answer, so confusion was invisible until it
 * showed up as a wrong one — which is *after* the moment help would have helped.
 *
 * What makes it usable is what it does NOT do. It returns nothing. It shows no
 * count, no "6 others feel this way", no confirmation beyond a tick. A student
 * who suspects the number is visible to the room does not press it, and the
 * feature is worth exactly as much as it is trusted.
 *
 * The tap is absorbed by a primary key server-side (one per student per
 * question), so there is no rate limiting here and no way to inflate the count.
 */

import { useEffect, useState } from "react";
import { Check, HandHelping } from "lucide-react";

export type ConfusionButtonProps = {
  /** Ordinal of the open question; resets the button when it changes. */
  questionKey: number;
  onFlag: () => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export default function ConfusionButton({
  questionKey,
  onFlag,
  disabled = false,
  className = "",
}: ConfusionButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  // One signal per question. A new question is a new chance to be lost.
  useEffect(() => {
    setState("idle");
  }, [questionKey]);

  const handle = async () => {
    if (state !== "idle" || disabled) return;
    setState("sending");
    try {
      await onFlag();
      setState("sent");
    } catch {
      // Deliberately silent. A toast saying "couldn't send" would announce to
      // anyone glancing at the screen that this student pressed it — and the
      // server absorbs duplicates anyway, so a retry costs nothing.
      setState("idle");
    }
  };

  const sent = state === "sent";

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || state !== "idle"}
      aria-label={sent ? "You've told your teacher you're lost" : "Tell your teacher you're lost"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        sent
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border/70 text-muted-foreground hover:border-amber-500/50 hover:text-amber-600 disabled:opacity-50"
      } ${className}`}
    >
      {sent ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Sent — only your teacher sees this
        </>
      ) : (
        <>
          <HandHelping className="h-3.5 w-3.5" />
          I'm lost
        </>
      )}
    </button>
  );
}
