/**
 * liveErrors.ts — the authoritative map from server error code to what a creator
 * should read on screen.
 *
 * Why this is a TypeScript file and not a SQL comment
 * --------------------------------------------------
 * The Phase 2 RPCs raise machine-parseable codes so the UI can say "3 students
 * have already answered" instead of pasting a Postgres string in front of a class.
 * The first draft documented that contract in a comment at the top of the
 * migration — which the client cannot import, so every code had to be
 * reimplemented from prose. The first renamed code would have produced a raw
 * database error on a projector.
 *
 * A test asserts that every `RAISE EXCEPTION '<CODE>` literal in
 * supabase/migrations/20260804000000_live_v2_controls.sql has an entry here.
 *
 * How PostgREST delivers these
 * ---------------------------
 * `RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', n` arrives as HTTP 400 with body
 * `{"code":"P0001","message":"UNDO_HAS_RESPONSES:3",...}`, and supabase-js throws
 * with that string as `error.message`. So a prefix match on the message is the
 * whole parse — no custom SQLSTATE needed.
 */

export type LiveErrorTone = "info" | "warn" | "error";

export type LiveErrorCopy = {
  title: string;
  /** `arg` is whatever followed the colon in the raised code, if anything. */
  description?: (arg: string | null) => string;
  tone: LiveErrorTone;
  /**
   * True for outcomes that are a normal part of using the control — a creator who
   * missed the undo window has not hit an error, they have simply missed it. These
   * render quietly rather than as a destructive toast.
   */
  expected?: boolean;
};

const CODES: Record<string, LiveErrorCopy> = {
  // ─── A3 add time ─────────────────────────────────────────
  ADDTIME_NOT_CREATOR: {
    title: "You can't change this exam",
    tone: "error",
  },
  ADDTIME_NOT_LIVE: {
    title: "The session isn't live",
    tone: "warn",
    expected: true,
  },
  ADDTIME_NO_OPEN_QUESTION: {
    title: "No question is open",
    description: () => "Time can only be added while a question is running.",
    tone: "warn",
    expected: true,
  },
  ADDTIME_BAD_AMOUNT: {
    title: "That amount isn't allowed",
    tone: "error",
  },
  ADDTIME_TOO_LATE: {
    title: "Too late to add time",
    description: () =>
      "The clock already reached zero, so students have seen the answer. Unlock the next question instead.",
    tone: "warn",
    expected: true,
  },
  ADDTIME_CAP_REACHED: {
    title: "That's the maximum extension",
    description: (arg) =>
      arg
        ? `You've already added ${arg} seconds to this question.`
        : "You've reached the limit for this question.",
    tone: "warn",
    expected: true,
  },

  // ─── A10 undo unlock ─────────────────────────────────────
  UNDO_NOT_CREATOR: {
    title: "You can't change this exam",
    tone: "error",
  },
  UNDO_NOT_LIVE: {
    title: "The session isn't live",
    tone: "warn",
    expected: true,
  },
  UNDO_NOTHING_TO_UNDO: {
    title: "Nothing to undo",
    tone: "warn",
    expected: true,
  },
  UNDO_WINDOW_EXPIRED: {
    title: "Too late to undo",
    description: () => "Undo is only available for a few seconds after unlocking.",
    tone: "warn",
    expected: true,
  },
  UNDO_HAS_RESPONSES: {
    title: "Students have already answered",
    description: (arg) => {
      const n = Number(arg);
      if (!Number.isFinite(n) || n <= 0) return "Someone has already answered, so this can't be taken back.";
      return `${n} student${n === 1 ? " has" : "s have"} already answered, so this can't be taken back.`;
    },
    tone: "warn",
    expected: true,
  },
  UNDO_ALREADY_GRADED: {
    title: "This question has already been graded",
    tone: "warn",
    expected: true,
  },
  UNDO_PREV_STILL_OPEN: {
    title: "The previous question is still running",
    description: () =>
      "Undoing now would reopen a question that hasn't finished. Let it close first.",
    tone: "warn",
    expected: true,
  },
  UNDO_NO_HISTORY: {
    title: "Can't undo this far back",
    description: () =>
      "This session started before undo was available, so there's no unlock history to restore.",
    tone: "warn",
    expected: true,
  },
  UNDO_CONFLICT: {
    title: "Someone else already changed the question",
    description: () => "Another window moved the session on. Nothing was undone.",
    tone: "warn",
    expected: true,
  },

  // ─── Unlock ──────────────────────────────────────────────
  UNLOCK_CONFLICT: {
    title: "Another window already unlocked",
    description: () => "The session moved on, so nothing was unlocked twice.",
    tone: "warn",
    expected: true,
  },
};

export type ParsedLiveError = LiveErrorCopy & {
  code: string | null;
  /** Resolved description, or undefined when the code carries no detail. */
  text?: string;
  /** True when the message was not one of ours and is shown as-is. */
  unknown: boolean;
};

/**
 * Turn whatever supabase-js threw into something a creator can read.
 *
 * Unknown messages fall through with `unknown: true` rather than being swallowed:
 * a genuine database failure must still reach the creator, just not as a code.
 */
export function parseLiveError(err: unknown): ParsedLiveError {
  const raw =
    (typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err ?? "")) || "Something went wrong";

  const colon = raw.indexOf(":");
  const code = colon === -1 ? raw.trim() : raw.slice(0, colon).trim();
  const arg = colon === -1 ? null : raw.slice(colon + 1).trim() || null;

  const copy = CODES[code];
  if (!copy) {
    return { code: null, title: "Something went wrong", text: raw, tone: "error", unknown: true };
  }

  return {
    ...copy,
    code,
    text: copy.description ? copy.description(arg) : undefined,
    unknown: false,
  };
}

/** Every code this module knows, for the migration-coverage test. */
export function knownLiveErrorCodes(): string[] {
  return Object.keys(CODES);
}
