/**
 * ScheduledCountdown.tsx — A9. "Starts in 4:32".
 *
 * Only rendered when a start time was actually set. An open-ended "waiting for
 * your teacher to start…" is honest but useless: it could mean thirty seconds or
 * twenty minutes, so students ask out loud, repeatedly, and the creator watches a
 * real clock instead of their room.
 *
 * A countdown does two things at once. It removes the "is this working?" anxiety,
 * and it CREATES anticipation — students settle and watch the number, which is
 * exactly the mood you want before question one.
 *
 * Two details that are not decoration
 * ----------------------------------
 * It runs on the server-corrected clock, never `Date.now()`. Phones are routinely
 * minutes off, and a countdown that disagrees between two devices in the same
 * room is worse than none.
 *
 * It never shows a negative number. Past zero it reads "Starting shortly",
 * because the creator may still be fixing the projector and `-00:04:12` reads as
 * broken software rather than as a teacher running late.
 *
 * Two branches, two colour systems
 * -------------------------------
 * The card branch is read by one person holding a phone, so it uses the app's
 * semantic tokens and follows that person's own light/dark preference. The
 * `display` branch is projected, so it reads only from the stage custom
 * properties the focus screen's shell sets — see stageTheme.ts for why the
 * projected surface is a broadcast decision rather than a viewer preference.
 *
 * That split is not tidiness. The display branch used to hard-code white, which
 * was correct for exactly as long as the focus screen was always dark. The
 * moment Q16 let a creator pick the light theme, the pre-show became white text
 * on near-white paper: the room spent the last five minutes before question one
 * looking at a wall that appeared to be showing nothing, which is precisely the
 * "is this working?" anxiety the countdown exists to remove.
 */

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

export type ScheduledCountdownProps = {
  /** ISO timestamp. Null means unscheduled, and this renders nothing at all. */
  scheduledStartAt: string | null;
  /** Server-corrected now. Passing Date.now would defeat the point. */
  serverNow: () => number;
  /** Projector sizing. */
  display?: boolean;
  className?: string;
};

/** mm:ss, or h:mm:ss once there is more than an hour to go. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ScheduledCountdown({
  scheduledStartAt,
  serverNow,
  display = false,
  className = "",
}: ScheduledCountdownProps) {
  const target = scheduledStartAt ? new Date(scheduledStartAt).getTime() : null;
  const [remainingMs, setRemainingMs] = useState(() =>
    target === null ? 0 : Math.max(0, target - serverNow())
  );

  useEffect(() => {
    if (target === null) return;
    // A local interval is fine here in a way it is not for the question timer:
    // this component only exists in the lobby, where nothing else is rendering,
    // and it unmounts the moment the session starts.
    const tick = () => setRemainingMs(Math.max(0, target - serverNow()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [target, serverNow]);

  if (target === null) return null;

  const started = remainingMs <= 0;
  const local = new Date(target).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (display) {
    return (
      <div className={`text-center ${className}`}>
        {/*
          Every colour below is a var(--stage-*) lookup and never a Tailwind
          colour, because this markup has to render on whichever frame the
          creator chose from the control room. Custom properties cascade from
          the stage shell, so this component takes no theme prop and stays
          identical for the student card branch below, where no stage exists.
        */}
        <p
          className="text-lg font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--stage-faint)" }}
        >
          {started ? "Starting shortly" : "Starts in"}
        </p>
        {!started && (
          /*
            The digits are the one thing a room five metres back and a viewer on
            a 360p stream both have to read, so they take the full-strength ink
            tier rather than a dimmed one. tabular-nums is load-bearing here and
            not typographic taste: proportional digits change width as the count
            falls, and a 7xl number that jitters sideways once a second is the
            single most distracting object in a silent room.
          */
          <p
            className="mt-2 font-mono text-7xl font-black tabular-nums"
            style={{ color: "var(--stage-fg)" }}
          >
            {formatCountdown(remainingMs)}
          </p>
        )}
        {/*
          The wall-clock line is reassurance, not information — the countdown
          above it already carries the fact — so it sits in the faint tier,
          which both themes hold at large-text contrast only.
        */}
        <p className="mt-2 text-base" style={{ color: "var(--stage-faint)" }}>
          Scheduled for {local}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 ${className}`}
    >
      <CalendarClock className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {started ? "Starting shortly" : `Starts in ${formatCountdown(remainingMs)}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Scheduled for {local} · your local time
        </p>
      </div>
    </div>
  );
}
