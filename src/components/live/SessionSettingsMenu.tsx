/**
 * SessionSettingsMenu.tsx — the four decisions a creator changes mid-lesson.
 *
 * These live in the control room rather than the editor because that is where
 * the creator is standing when they need them. A teacher realises the room can
 * see student names *while casting*, or decides the leaderboard is discouraging
 * the back half of the class *at question six*. Making them stop the session and
 * go back to the editor is the same as not having the setting.
 *
 * Everything here is a display decision. Scores and ranks are always computed —
 * turning the leaderboard off must never cost the creator their own data or the
 * post-session report.
 */

import { Eye, EyeOff, Settings2, Trophy, TvMinimal, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { LeaderboardVisibility } from "@/services/liveExamService";

export type SessionSettings = {
  privacyMode: boolean;
  leaderboardVisibility: LeaderboardVisibility;
  presentShowLeaderboard: boolean;
  presentShowRiver: boolean;
};

export type SessionSettingsMenuProps = {
  settings: SessionSettings;
  onChange: (patch: Partial<SessionSettings>) => void;
  /** Disabled while a change is in flight, so a double-tap cannot race. */
  saving?: boolean;
};

const VISIBILITY_OPTIONS: {
  value: LeaderboardVisibility;
  label: string;
  hint: string;
}[] = [
  { value: "full", label: "Everyone", hint: "The room sees the standings" },
  { value: "private", label: "Just me", hint: "Students see only their own result" },
  { value: "off", label: "Off", hint: "No ranking shown to anyone" },
];

function Row({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Eye;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

export default function SessionSettingsMenu({
  settings,
  onChange,
  saving = false,
}: SessionSettingsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" aria-label="Session settings">
          <Settings2 className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-3">
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          This session
        </p>

        <div className="divide-y divide-border/60">
          <Row
            icon={settings.privacyMode ? UserRoundX : Eye}
            title="Hide student names"
            hint={
              settings.privacyMode
                ? "The room sees nicknames like “Brave Badger”. You still see real names here."
                : "Real names appear on the leaderboard everyone can see."
            }
          >
            <Switch
              checked={settings.privacyMode}
              disabled={saving}
              onCheckedChange={(v) => onChange({ privacyMode: v })}
              aria-label="Hide student names"
            />
          </Row>

          <div className="py-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Trophy className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">Leaderboard</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  Scores are always recorded — this only changes who sees the ranking.
                </p>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = settings.leaderboardVisibility === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={saving}
                    onClick={() => onChange({ leaderboardVisibility: opt.value })}
                    title={opt.hint}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Row
            icon={TvMinimal}
            title="Standings on the big screen"
            hint="Shown between questions only, never while one is open."
          >
            <Switch
              checked={settings.presentShowLeaderboard}
              disabled={saving || settings.leaderboardVisibility !== "full"}
              onCheckedChange={(v) => onChange({ presentShowLeaderboard: v })}
              aria-label="Show standings on the big screen"
            />
          </Row>

          <Row
            icon={settings.presentShowRiver ? Eye : EyeOff}
            title="Live answer bars on the big screen"
            hint="Anonymous, and never marked correct — safe to project."
          >
            <Switch
              checked={settings.presentShowRiver}
              disabled={saving}
              onCheckedChange={(v) => onChange({ presentShowRiver: v })}
              aria-label="Show live answer bars on the big screen"
            />
          </Row>
        </div>

        {settings.leaderboardVisibility !== "full" && settings.presentShowLeaderboard && (
          <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            The big screen is what the room sees, so it follows the leaderboard
            setting above — standings stay hidden there too.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
