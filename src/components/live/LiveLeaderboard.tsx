/**
 * LiveLeaderboard.tsx — standings list shared by both live-exam screens.
 *
 * Rank is carried by position + a medal token, and score by a proportional bar,
 * so the shape of the class ("everyone bunched at 6" vs "one runaway leader")
 * is legible without reading a single number.
 *
 * The two screens are looking at two different name sets, deliberately. Students
 * read the masked `live_participants_public` view; the creator's cockpit reads the
 * base table and sees real names, because a teacher who cannot tell who is last
 * cannot go and help them. `aliasById` is the bridge between the two: it lets the
 * cockpit print the room's nickname beside the real name, so the creator can hold
 * both halves of the session in one glance without either view lying to them.
 */

import { memo } from "react";

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
  alias,
}: {
  participant: LiveParticipant;
  position: number;
  isMe: boolean;
  maxScore: number;
  outOf?: number;
  dense?: boolean;
  /**
   * The nickname the room is seeing for this row, when it differs from the name
   * printed here. Already resolved by the caller — the row never decides whether
   * an alias is worth showing, it only draws the one it was handed.
   */
  alias?: string;
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
        {/*
         * The alias rides beside the real name, never instead of it. This panel is
         * the creator's cockpit: they are the one person in the building who is
         * supposed to know who "Brave Badger" actually is, and swapping the name
         * out would take that away in exchange for nothing. Rendering both is what
         * lets them answer "who is second?" and "who does the wall say is second?"
         * from the same row — which is the whole reason privacy mode is bearable
         * to run a session under.
         *
         * Muted and a size down so the scan order stays name-first; the alias is an
         * annotation on the row, not a competing label.
         */}
        {alias && (
          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{alias}</span>
        )}
        {isMe && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">you</span>}
      </p>

      <span className="relative z-10 shrink-0 text-sm font-bold tabular-nums text-foreground">
        {participant.total_correct}
        {outOf ? <span className="text-xs font-medium text-muted-foreground">/{outOf}</span> : null}
      </span>
    </div>
  );
}

function LiveLeaderboard({
  entries,
  currentUserId,
  self,
  outOf,
  emptyLabel = "Standings appear once the first question closes.",
  dense = false,
  className = "",
  aliasById,
}: {
  entries: LiveParticipant[];
  currentUserId?: string;
  /** Pinned row for the current user when they fall outside the visible slice. */
  self?: LiveParticipant | null;
  outOf?: number;
  emptyLabel?: string;
  dense?: boolean;
  className?: string;
  /**
   * Participant id → the nickname the room is seeing for them, from the masked
   * `live_participants_public` view.
   *
   * Keyed on the participant row id and not on user_id, for the same reason the
   * row keys below are: privacy mode NULLs everyone else's user_id, so a map
   * keyed on it would collapse the entire room onto a single `null` entry and
   * every row would read back whichever nickname landed last.
   *
   * Optional, and left undefined by every screen that is already looking at
   * masked names — a student's board shows nicknames as the names, so annotating
   * them with the same nicknames would be noise. Only the creator's cockpit
   * passes it, and only while privacy is on.
   */
  aliasById?: Map<string, string>;
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
          /**
           * Keyed on the participant row id, not user_id.
           *
           * Under privacy mode the masked view returns NULL for everyone else's
           * user_id — it is the join key back to a real identity, so masking the
           * name without masking it achieved nothing. `id` is unique, always
           * present, and joins to nothing a student can read. The isMe check
           * below still works because the caller keeps their own user_id.
           */
          key={p.id}
          participant={p}
          position={idx + 1}
          isMe={!!currentUserId && p.user_id === currentUserId}
          maxScore={maxScore}
          outOf={outOf}
          dense={dense}
          /**
           * Only annotate when the room's name for this person is actually a
           * different string.
           *
           * With privacy off, the masked view hands back the real name — it masks
           * nothing because there is nothing to mask. Handing that straight to the
           * row would print "Priya Nair Priya Nair", which nobody reads as "the
           * wall agrees with you"; they read it as the leaderboard having
           * duplicated itself, and start distrusting the panel. The same guard
           * covers the map being absent entirely: `aliasById?.get(...)` is then
           * undefined, undefined never equals a display_name, and the row is
           * handed that same undefined — no annotation, no branch to maintain.
           */
          alias={aliasById?.get(p.id) !== p.display_name ? aliasById?.get(p.id) : undefined}
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
            /**
             * The pinned row gets the same treatment as the ones above it. No
             * caller lights both props today — the cockpit passes aliasById and
             * never a pinned self, the student screens pass a pinned self and
             * never aliasById — but a row that quietly drops the annotation
             * depending on which branch drew it is the kind of inconsistency that
             * gets reported later as "the nickname disappears when I'm off the
             * bottom of the list", and there is no reason to build that in.
             */
            alias={
              aliasById?.get(self.id) !== self.display_name ? aliasById?.get(self.id) : undefined
            }
          />
        </>
      )}
    </div>
  );
}

/**
 * Memoised because the creator's control room re-renders roughly once a second
 * while a question is open (the answered count polls at 750ms). Without this,
 * every one of those ticks re-ran all twenty leaderboard rows — and the props that
 * decide its output only change when the question does.
 *
 * That makes `aliasById` a prop callers have to hold still: a Map rebuilt inline on
 * every render is a new reference every render, which defeats this memo entirely
 * and quietly hands the polling loop back the cost it was added to remove. Callers
 * keep it in state and refresh it when the roster changes, not per tick.
 */
export default memo(LiveLeaderboard);
