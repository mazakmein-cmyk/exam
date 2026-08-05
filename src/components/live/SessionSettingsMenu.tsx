/**
 * SessionSettingsMenu.tsx — the decisions a creator changes mid-lesson.
 *
 * These live in the control room rather than the editor because that is where
 * the creator is standing when they need them. A teacher realises the room can
 * see student names *while casting*, or decides the leaderboard is discouraging
 * the back half of the class *at question six*, or discovers the projector is
 * washing the dark theme out to grey *thirty seconds before the first question*.
 * Making them stop the session and go back to the editor is the same as not
 * having the setting.
 *
 * Everything here is a display decision. Scores and ranks are always computed —
 * turning the leaderboard off must never cost the creator their own data or the
 * post-session report.
 *
 * Why it is split into two labelled groups
 * ---------------------------------------
 * It used to be a flat list of switches. Two were about privacy and the rest
 * were about the projected screen, and at six rows the list stopped scanning:
 * the creator had to read every hint to find the one row they came for, with a
 * room waiting. The split is not decoration — the two groups answer different
 * questions ("who is allowed to see this?" versus "what is on the wall right
 * now?") and a creator hunting mid-session only ever cares about one of them.
 */

import {
  CheckCheck,
  Eye,
  EyeOff,
  List,
  Moon,
  Settings2,
  Sun,
  Trophy,
  TvMinimal,
  UserRoundX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { STAGE_THEME_OPTIONS, type StageTheme } from "@/lib/live/stageTheme";
import type { LeaderboardVisibility } from "@/services/liveExamService";

/**
 * The whole shape, not a patch — callers hand over the live session state and
 * get back a patch of only what moved. Keeping the read shape complete is what
 * lets a hint depend on a sibling setting (the standings switch is disabled by
 * the leaderboard choice above it, and the reveal row only exists while the
 * choices are drawn).
 */
export type SessionSettings = {
  privacyMode: boolean;
  leaderboardVisibility: LeaderboardVisibility;
  presentShowLeaderboard: boolean;
  presentShowRiver: boolean;
  presentShowOptions: boolean;
  presentRevealAnswer: boolean;
  presentTheme: StageTheme;
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

/**
 * The icon carries the choice as well as the label does, and faster.
 * Deliberately a Record keyed on StageTheme rather than a lookup with a
 * fallback: if a theme is ever added, this fails to compile instead of
 * rendering a blank square in the control room.
 */
const THEME_ICON: Record<StageTheme, LucideIcon> = { dark: Moon, light: Sun };

/**
 * The group heading. `pt-1` as well as `pb-1` because the second one sits under
 * a rule and needs breathing room on both sides; the first one is against the
 * popover padding and does not care.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

/** Icon, title and hint on the left; the control on the right. The default. */
function Row({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
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

/**
 * The same row, with the control on its own line underneath.
 *
 * For the two settings that are a choice between three or two options rather
 * than an on/off. A segmented control squeezed into the right-hand column of a
 * 352px popover gives each option about nine characters, and "Everyone" /
 * "Just me" / "Off" then wrap mid-word — which reads as a layout bug, not as a
 * choice.
 */
function StackRow({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/**
 * A row that is subordinate to the one above it.
 *
 * The indent, the left rule and the smaller chip all say the same thing three
 * ways: this setting is a detail of its parent and disappears with it. Without
 * that, a switch that vanishes when you flip an unrelated-looking one above it
 * reads as the menu losing its place.
 */
function SubRow({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ml-3.5 flex items-start gap-3 border-l border-border/70 py-3 pl-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/**
 * One option in a StackRow's grid.
 *
 * `title` carries the hint as a tooltip rather than printing it: three hints
 * under three buttons is more words than the whole rest of the group, and the
 * labels ("Everyone", "Just me", "Off") already say most of it. The hint is
 * there for the creator who is unsure, not for the one who is scanning.
 */
function ChoiceButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
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
      {/*
        Taller and wider than the old panel, and scrollable, because the second
        group pushed it past the height of a laptop viewport docked under a
        toolbar. `max-h-[80vh]` with `overflow-y-auto` keeps the last row
        reachable instead of clipped off the bottom of the screen — a setting
        you cannot scroll to is a setting that does not exist.
      */}
      <PopoverContent align="end" className="max-h-[80vh] w-[352px] overflow-y-auto p-3">
        <SectionLabel>What the room sees</SectionLabel>

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

          <StackRow
            icon={Trophy}
            title="Leaderboard"
            hint="Scores are always recorded — this only changes who sees the ranking."
          >
            <div className="grid grid-cols-3 gap-1.5">
              {VISIBILITY_OPTIONS.map((opt) => (
                <ChoiceButton
                  key={opt.value}
                  active={settings.leaderboardVisibility === opt.value}
                  disabled={saving}
                  title={opt.hint}
                  onClick={() => onChange({ leaderboardVisibility: opt.value })}
                >
                  {opt.label}
                </ChoiceButton>
              ))}
            </div>
          </StackRow>
        </div>

        {/*
          The rule belongs to the heading, not to the group below it — the
          divide-y inside each group already draws hairlines between rows, and a
          second one of the same weight at the boundary would make the split
          invisible. This one is the only line with space above it.
        */}
        <div className="mt-2 border-t border-border/60 pt-1">
          <SectionLabel>The big screen</SectionLabel>
        </div>

        <div className="divide-y divide-border/60">
          <StackRow
            icon={THEME_ICON[settings.presentTheme]}
            title="Theme"
            hint="Dark reads better in a dim room. Light survives daylight and a weak projector."
          >
            <div className="grid grid-cols-2 gap-1.5">
              {STAGE_THEME_OPTIONS.map((opt) => {
                const Icon = THEME_ICON[opt.value];
                return (
                  <ChoiceButton
                    key={opt.value}
                    active={settings.presentTheme === opt.value}
                    disabled={saving}
                    title={opt.hint}
                    onClick={() => onChange({ presentTheme: opt.value })}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </ChoiceButton>
                );
              })}
            </div>
          </StackRow>

          {/*
            The switch and its sub-toggle share one cell of the divide-y so the
            hairline lands under the pair rather than between them. With a rule
            in between, the indented row read as a sixth peer that happened to
            be inset, instead of as a detail of the switch above it.
          */}
          <div>
            <Row
              icon={List}
              title="Show the answer choices"
              hint={
                settings.presentShowOptions
                  ? "The choices appear under the question, sized to the wall."
                  : "The wall shows the question only. Students still get every choice on their own phone."
              }
            >
              <Switch
                checked={settings.presentShowOptions}
                disabled={saving}
                onCheckedChange={(v) => onChange({ presentShowOptions: v })}
                aria-label="Show the answer choices on the big screen"
              />
            </Row>

            {/*
              Gated on its parent, not merely disabled by it: there is nothing to
              mark correct when the choices are not drawn, so the control has no
              meaning rather than a meaning the creator is not allowed to use. A
              greyed-out switch invites a creator to hunt for what unlocks it;
              an absent one sends them to the row above, which is the answer.
              The stored value survives the round trip — flipping the choices
              back on restores the reveal exactly as it was, which is what the
              footnote below promises.
            */}
            {settings.presentShowOptions && (
              <SubRow
                icon={CheckCheck}
                title="Reveal the answer when time is up"
                hint={
                  settings.presentRevealAnswer
                    ? "The correct choice turns green on the wall the moment answers lock — never before."
                    : "The wall stays neutral after the timer ends. Nothing on it says which choice was right."
                }
              >
                <Switch
                  checked={settings.presentRevealAnswer}
                  disabled={saving}
                  onCheckedChange={(v) => onChange({ presentRevealAnswer: v })}
                  aria-label="Reveal the correct answer on the big screen when time is up"
                />
              </SubRow>
            )}
          </div>

          {/*
            "Standings" and "Live answer bars", not "… on the big screen" — the
            group heading says that once, and repeating it in every title cost
            the width that made the hints wrap to three lines.
          */}
          <Row
            icon={TvMinimal}
            title="Standings"
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
            title="Live answer bars"
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

        {/*
          Both footnotes exist for the same reason: a switch that is on but has
          no effect looks broken, and the creator finds out in front of the room.
          Saying why here is cheaper than them discovering it on the wall.
        */}
        {settings.leaderboardVisibility !== "full" && settings.presentShowLeaderboard && (
          <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            The big screen is what the room sees, so it follows the leaderboard
            setting above — standings stay hidden there too.
          </p>
        )}

        {!settings.presentShowOptions && (
          <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            With the choices off, the wall says how many there are and tells the
            room to look at their phones — so a blank space never reads as a
            broken projector.
            {settings.presentRevealAnswer &&
              " The answer reveal is paused while they are hidden, and returns with them."}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
