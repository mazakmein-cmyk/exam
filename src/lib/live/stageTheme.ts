/**
 * stageTheme.ts — the colour system for the focus screen.
 *
 * Why the focus screen needs its own palette
 * -----------------------------------------
 * Every other surface in the product is read by one person holding a device, so
 * it uses the app's semantic tokens and follows the viewer's own light/dark
 * preference. The focus screen is read by a room five metres away AND by a
 * livestream audience on a phone at 360p, and the person who decides how it looks
 * is the creator standing beside it — not any of the people looking at it.
 *
 * That inverts two defaults:
 *
 *  1. The theme is a broadcast decision, not a viewer preference. It lives on the
 *     exam row and is set from the control room, because the creator is the only
 *     party who knows whether the room is a dark hall or a sunlit classroom with a
 *     weak projector. Dark is right far more often — but a washed-out projector in
 *     daylight, or a stream whose channel branding is light, makes the dark frame
 *     the wrong answer, and the old screen had no way to say so.
 *
 *  2. Neither theme uses pure black or pure white. #000 and #fff sit outside the
 *     range most streaming encoders handle gracefully: white blooms and clips,
 *     black crushes and takes gradient banding with it. Broadcast practice is to
 *     stay a few points inside both ends, so the light theme's paper is #f5f6fa
 *     and the dark theme's ink is #08080f.
 *
 * How it reaches the pixels
 * ------------------------
 * As CSS custom properties on the stage shell. The alternative — a `theme` prop
 * threaded through every child — would have to pass through LiveOption,
 * AnswerRiver, PresenterHud, MomentBanner and ScheduledCountdown, all of which
 * are shared with screens that must keep following the app's own tokens. Custom
 * properties cascade instead: a child asks for `var(--stage-fg)` and gets whatever
 * the enclosing stage decided, with no prop and no context provider, and the same
 * component renders unchanged on the student screen where no stage exists.
 */

import type { CSSProperties } from "react";

export type StageTheme = "dark" | "light";

export function isStageTheme(value: unknown): value is StageTheme {
  return value === "dark" || value === "light";
}

/** For the settings UI, so the copy and the values live in one place. */
export const STAGE_THEME_OPTIONS: { value: StageTheme; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Best in a dim room, and the safer default on stream" },
  { value: "light", label: "Light", hint: "For daylight rooms and weak projectors" },
];

/**
 * One theme's tokens.
 *
 * Deliberately a flat string map rather than nested groups: these become CSS
 * variable names verbatim, and a missing key is then a compile error rather than
 * a component silently resolving `var(--stage-nothing)` to nothing at all.
 */
type StageTokens = {
  /** Page ink. */
  bg: string;
  /** The wash behind the question — a gradient stop, not a fill. */
  glow: string;
  /** Body text and every number that matters. */
  fg: string;
  /**
   * Labels and secondary rows. Both themes clear 4.5:1 against their own bg
   * (dark 8.2, light 5.8), so anything a viewer has to READ may use this tier.
   */
  muted: string;
  /**
   * Captions and units. Around 3.1–3.8:1 — AA for large text only, which every
   * use of it on this screen is. Never the only carrier of a fact: if a viewer
   * would be misinformed by missing it, it belongs in `muted`.
   */
  faint: string;
  /** Hairlines and card borders. */
  line: string;
  /** A border that has to be seen from the back row — the timer track. */
  lineStrong: string;
  /** Card fill. */
  surface: string;
  /** A raised element inside a card — option letters, chips. */
  surface2: string;
  /** Brand violet, for the calm end of the timer ladder. */
  accent: string;
  /** Timer warning. */
  warn: string;
  /** A card that celebrates something — the moment of the round. */
  warnBg: string;
  warnLine: string;
  /** Timer critical, and the "locked" caption. */
  crit: string;
  /** Correct/positive numbers on the standings. */
  good: string;
  /** The LIVE badge, which must read as "on air" in both themes. */
  liveBg: string;
  liveFg: string;
};

/**
 * Dark: the default, and the one tuned first.
 *
 * A projector in a dim room throws light; the screen's own black is the room's
 * black, so contrast comes almost free and the question can carry the whole
 * frame. The violet wash is at 0.18 because anything stronger banded visibly
 * once a stream encoder got hold of it.
 */
const DARK: StageTokens = {
  bg: "#08080f",
  glow: "rgba(124, 58, 237, 0.18)",
  fg: "#ffffff",
  muted: "rgba(255, 255, 255, 0.64)",
  faint: "rgba(255, 255, 255, 0.40)",
  line: "rgba(255, 255, 255, 0.11)",
  lineStrong: "rgba(255, 255, 255, 0.24)",
  surface: "rgba(255, 255, 255, 0.045)",
  surface2: "rgba(255, 255, 255, 0.09)",
  accent: "#a78bfa",
  warn: "#fbbf24",
  warnBg: "rgba(251, 191, 36, 0.13)",
  warnLine: "rgba(251, 191, 36, 0.30)",
  crit: "#fb7185",
  good: "#34d399",
  liveBg: "rgba(244, 63, 94, 0.20)",
  liveFg: "#fda4af",
};

/**
 * Light: for the room the dark theme fails in.
 *
 * A weak projector in daylight cannot make black — it makes grey — so a dark
 * frame turns into a grey frame with grey text on it. Reflecting the room's own
 * light instead is the only thing that works there, and it is also what a creator
 * whose channel branding is light will ask for.
 *
 * The accents are the 600–700 end of each ramp rather than the 400s the dark
 * theme uses: amber-400 on near-white is around 1.8:1 and effectively invisible
 * at five metres, which is exactly the distance the timer has to work at.
 */
const LIGHT: StageTokens = {
  bg: "#f5f6fa",
  glow: "rgba(124, 58, 237, 0.10)",
  fg: "#12121a",
  muted: "rgba(18, 18, 26, 0.66)",
  faint: "rgba(18, 18, 26, 0.46)",
  line: "rgba(18, 18, 26, 0.13)",
  lineStrong: "rgba(18, 18, 26, 0.26)",
  surface: "#ffffff",
  surface2: "rgba(18, 18, 26, 0.06)",
  accent: "#6d28d9",
  warn: "#b45309",
  warnBg: "rgba(180, 83, 9, 0.09)",
  warnLine: "rgba(180, 83, 9, 0.26)",
  crit: "#be123c",
  good: "#047857",
  liveBg: "rgba(225, 29, 72, 0.12)",
  liveFg: "#be123c",
};

const THEMES: Record<StageTheme, StageTokens> = { dark: DARK, light: LIGHT };

/**
 * The style object for the stage shell.
 *
 * `colorScheme` is included because it is not cosmetic here: it decides what
 * colour the browser paints its own scrollbars and the letterbox around a
 * fullscreen element, and a light stage framed by dark browser furniture reads as
 * a rendering fault on camera.
 */
export function stageVars(theme: StageTheme): CSSProperties {
  const t = THEMES[theme];
  return {
    colorScheme: theme,
    "--stage-bg": t.bg,
    "--stage-glow": t.glow,
    "--stage-fg": t.fg,
    "--stage-muted": t.muted,
    "--stage-faint": t.faint,
    "--stage-line": t.line,
    "--stage-line-strong": t.lineStrong,
    "--stage-surface": t.surface,
    "--stage-surface-2": t.surface2,
    "--stage-accent": t.accent,
    "--stage-warn": t.warn,
    "--stage-warn-bg": t.warnBg,
    "--stage-warn-line": t.warnLine,
    "--stage-crit": t.crit,
    "--stage-good": t.good,
    "--stage-live-bg": t.liveBg,
    "--stage-live-fg": t.liveFg,
  } as CSSProperties;
}

// ─── Remembering the choice locally ──────────────────────────

/**
 * Why a local copy of a value the database already owns.
 *
 * The exam row is the source of truth, but it arrives one round trip after the
 * first paint, and until it does the screen has to guess. Guessing "dark" is
 * right most of the time and wrong loudly: a creator who chose light watches
 * their wall flash black in front of the room, on camera, at the start of every
 * session and on every reload.
 *
 * So the last known answer is kept per exam and used only while the first sync is
 * in flight. It is a cache, never an authority — the row overwrites it the
 * instant it lands.
 */
const STORAGE_PREFIX = "live-stage-theme:";

export function readStageTheme(examId: string | undefined): StageTheme {
  if (!examId || typeof localStorage === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + examId);
    return isStageTheme(stored) ? stored : "dark";
  } catch {
    // Storage can throw outright in a locked-down browser profile. A wrong
    // guess for 200ms is not worth a broken screen.
    return "dark";
  }
}

export function writeStageTheme(examId: string | undefined, theme: StageTheme): void {
  if (!examId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + examId, theme);
  } catch {
    /* see above */
  }
}
