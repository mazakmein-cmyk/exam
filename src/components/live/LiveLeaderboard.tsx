/**
 * LiveLeaderboard.tsx — standings list shared by both live-exam screens.
 *
 * Rank is carried by position + a medal token, and score by a proportional bar,
 * so the shape of the class ("everyone bunched at 6" vs "one runaway leader")
 * is legible without reading a single number.
 */

import { Crown, Medal } from "lucide-react";
import type { LiveParticipant } from "@/services/liveExamService";

function initials(name: string): string {
  const parts = (name || "?").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function medalClass(rank: number): string {
  if (rank === 1) return "bg-amber-400 text-amber-950";
  if (rank === 2) return "bg-slate-300 text-slate-800";
  if (rank === 3) return "bg-amber-700 text-amber-50";
  return "bg-muted text-muted-foreground";
}

function LeaderboardRow({
  participant,
  position,
  isMe,
  maxScore,
  outOf,
  dense,
}: {
  participant: LiveParticipant;
  position: number;
  isMe: boolean;
  maxScore: number;
  outOf?: number;
  dense?: boolean;
}) {
  const rank = participant.rank || position;
  const pct = maxScore > 0 ? (participant.total_correct / maxScore) * 100 : 0;

  return (
    <div
      className={`relative flex items-center gap-2.5 rounded-lg overflow-hidden ${dense ? "px-2 py-1.5" : "px-2.5 py-2"} ${
        isMe ? "ring-1 ring-primary/40 bg-primary/[0.07]" : "hover:bg-muted/40"
      }`}
    >
      {/* Score bar sits behind the row, not beside it — no extra column cost. */}
      <div
        className={`absolute inset-y-0 left-0 ${isMe ? "bg-primary/10" : "bg-foreground/[0.045]"} transition-[width] duration-500`}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums ${medalClass(rank)}`}
      >
        {rank === 1 ? <Crown className="h-3.5 w-3.5" /> : rank <= 3 ? <Medal className="h-3.5 w-3.5" /> : rank}
      </div>

      {!dense && (
        <div className="relative z-10 h-6 w-6 shrink-0 rounded-full bg-muted/80 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
          {initials(participant.display_name)}
        </div>
      )}

      <p
        className={`relative z-10 flex-1 min-w-0 truncate text-sm ${
          isMe ? "font-bold text-primary" : "font-medium text-foreground"
        }`}
      >
        {participant.display_name}
        {isMe && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">you</span>}
      </p>

      <span className="relative z-10 shrink-0 text-sm font-bold tabular-nums text-foreground">
        {participant.total_correct}
        {outOf ? <span className="text-xs font-medium text-muted-foreground">/{outOf}</span> : null}
      </span>
    </div>
  );
}

export default function LiveLeaderboard({
  entries,
  currentUserId,
  self,
  outOf,
  emptyLabel = "Standings appear once the first question closes.",
  dense = false,
  className = "",
}: {
  entries: LiveParticipant[];
  currentUserId?: string;
  /** Pinned row for the current user when they fall outside the visible slice. */
  self?: LiveParticipant | null;
  outOf?: number;
  emptyLabel?: string;
  dense?: boolean;
  className?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className={`px-3 py-8 text-center text-sm text-muted-foreground ${className}`}>{emptyLabel}</p>
    );
  }

  const maxScore = Math.max(1, ...entries.map((e) => e.total_correct || 0));
  const selfInList = !!currentUserId && entries.some((e) => e.user_id === currentUserId);

  return (
    <div className={`space-y-0.5 ${className}`}>
      {entries.map((p, idx) => (
        <LeaderboardRow
          key={p.user_id}
          participant={p}
          position={idx + 1}
          isMe={!!currentUserId && p.user_id === currentUserId}
          maxScore={maxScore}
          outOf={outOf}
          dense={dense}
        />
      ))}

      {self && !selfInList && (
        <>
          <div className="my-1 border-t border-dashed border-border/70" />
          <LeaderboardRow
            participant={self}
            position={self.rank || entries.length + 1}
            isMe
            maxScore={maxScore}
            outOf={outOf}
            dense={dense}
          />
        </>
      )}
    </div>
  );
}
