/**
 * ScheduleControl.tsx — C10. Put a time on the invitation.
 *
 * Placed on the pre-live screen rather than in the editor, because this is the
 * decision a creator makes while looking at "am I about to run this?", not while
 * writing questions.
 *
 * What it actually buys
 * --------------------
 * The two most stressful minutes of a live session are distribution: sharing the
 * link while also setting up the projector while also being asked "sir, what's the
 * code?". A start time moves that work to the previous evening — send the link,
 * students land in a lobby with a countdown instead of an open-ended "waiting",
 * and nobody has to ask whether it is working.
 *
 * Auto-start is off by default, and stays honest
 * ---------------------------------------------
 * When on, the session starts on the creator's OWN control room at the first sync
 * past the scheduled time. Nothing starts unattended. That is a real constraint
 * (no cron, no edge function on this plan) but it is also the right semantic: a
 * teacher still fixing the projector at 10:00 does not want the exam to begin
 * without them.
 */

import { useEffect, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export type ScheduleControlProps = {
  scheduledStartAt: string | null;
  autoStart: boolean;
  onChange: (patch: { scheduled_start_at?: string | null; auto_start?: boolean }) => void;
  saving?: boolean;
};

/** ISO → the `YYYY-MM-DDTHH:mm` a datetime-local input expects, in LOCAL time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function ScheduleControl({
  scheduledStartAt,
  autoStart,
  onChange,
  saving = false,
}: ScheduleControlProps) {
  const [value, setValue] = useState(() => toLocalInput(scheduledStartAt));

  // Keep in step when the row changes underneath us (a second tab, or a save).
  useEffect(() => {
    setValue(toLocalInput(scheduledStartAt));
  }, [scheduledStartAt]);

  const commit = (next: string) => {
    setValue(next);
    if (!next) {
      onChange({ scheduled_start_at: null, auto_start: false });
      return;
    }
    // The input is local time; the column is timestamptz. Converting here rather
    // than storing a naive string is what lets every viewer see it in their own
    // zone and the countdown agree across devices.
    const asDate = new Date(next);
    if (Number.isNaN(asDate.getTime())) return;
    onChange({ scheduled_start_at: asDate.toISOString() });
  };

  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Start time</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional. Set one and students see a countdown instead of an open-ended
            wait — so you can share the link the night before.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              type="datetime-local"
              value={value}
              disabled={saving}
              onChange={(e) => commit(e.target.value)}
              className="h-9 w-auto min-w-[15rem]"
            />
            {value && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={saving}
                onClick={() => commit("")}
                aria-label="Clear the start time"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Named explicitly: a creator scheduling for a class in another city
              needs to know which clock this is. */}
          <p className="mt-1.5 text-[11px] text-muted-foreground">Times are in {zone}</p>

          {value && (
            <div className="mt-3 flex items-start gap-3 border-t border-border/60 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Start automatically</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Begins on its own once the time arrives — but only while you have
                  the control room open. Nothing starts unattended.
                </p>
              </div>
              <Switch
                checked={autoStart}
                disabled={saving}
                onCheckedChange={(v) => onChange({ auto_start: v })}
                aria-label="Start automatically"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
