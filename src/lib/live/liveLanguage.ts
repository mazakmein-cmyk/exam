/**
 * liveLanguage.ts — which language the creator is reading, and which one is on
 * the wall.
 *
 * There are three independent language choices in a live session, and conflating
 * any two of them is the bug this file exists to prevent:
 *
 *  1. **The student's.** Each student picks their own on their own device
 *     (LiveExamStudent). Nobody else's choice touches it — a Hindi-medium student
 *     in an English-medium room keeps reading Hindi.
 *  2. **The creator's.** What the cockpit's question preview is written in. This
 *     is a reading preference for one person a foot from the screen, and it
 *     changes nothing anyone else sees.
 *  3. **The wall's.** What the projector shows the room. A broadcast decision,
 *     like the stage theme: the creator is the only party who can make it, and
 *     the audience cannot reach the control.
 *
 * (2) and (3) are deliberately the same switch. A creator running a Hindi room
 * reads the Hindi question off their laptop while the room reads it off the wall,
 * and having to set that twice — in two different places, mid-session, in front
 * of thirty people — is how the two end up disagreeing.
 *
 * Why the exam row is not the source of truth here
 * -----------------------------------------------
 * The stage theme lives in a column because it survives the session: reopen the
 * projector next week and the hall is still dark. The display language is not
 * that. It follows the room in front of the creator on the day, it is changed
 * mid-session more often than any other setting, and writing it would make one
 * creator's choice of reading language the next co-host's too.
 *
 * So it travels as an intent over the present channel (instant, which is the
 * whole point when a room is waiting) and is cached in localStorage per exam so
 * the projector survives its own reload. The cache is a memory, never an
 * authority: an unknown or unsupported code falls back to the exam's primary
 * language, which is the one that is always fully populated.
 */

export type LiveLanguage = {
  code: string;
  label: string;
  /** The language's own name, when it differs — what a Hindi reader looks for. */
  nativeLabel: string;
  flag: string;
};

/**
 * The codes a live exam can be authored in.
 *
 * Kept in step with the identical lists in LiveExamDetail / LiveExamStudent
 * rather than imported from them: those are page modules, and the projector
 * pulling a page component into its bundle to read four strings is a worse
 * trade than four strings written twice.
 */
export const LIVE_LANGUAGES: LiveLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳" },
];

export function liveLanguageInfo(code: string | null | undefined): LiveLanguage | undefined {
  if (!code) return undefined;
  return LIVE_LANGUAGES.find((l) => l.code === code);
}

/** Human label for a code, falling back to the code itself for an unknown one. */
export function liveLanguageLabel(code: string | null | undefined): string {
  return liveLanguageInfo(code)?.label ?? (code || "en");
}

/**
 * Resolve a remembered/received code against what this exam actually has.
 *
 * Every read goes through here. A code that is not in `supported` has no rows
 * behind it, so honouring it would put an empty question on a projector — the
 * failure this whole feature is most able to cause and least able to explain.
 */
export function resolveLiveLanguage(
  wanted: string | null | undefined,
  supported: string[] | null | undefined,
  primary: string | null | undefined
): string {
  const fallback = primary || "en";
  if (!wanted) return fallback;
  const list = supported && supported.length > 0 ? supported : [fallback];
  return list.includes(wanted) ? wanted : fallback;
}

// ─── Remembering the choice locally ──────────────────────────

const STORAGE_PREFIX = "live-display-language:";

/**
 * The last language this browser was showing for this exam, or null.
 *
 * Null rather than "en" on purpose: the caller resolves against the exam's own
 * primary language, and this function has no way to know what that is. Guessing
 * English here would flash the wrong language onto the wall for one paint of
 * every reload of a Hindi-primary exam.
 */
export function readDisplayLanguage(examId: string | undefined): string | null {
  if (!examId || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_PREFIX + examId);
  } catch {
    // Storage throws outright in a locked-down profile. Losing the memory costs
    // one fallback to primary; throwing would cost the screen.
    return null;
  }
}

export function writeDisplayLanguage(examId: string | undefined, code: string): void {
  if (!examId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + examId, code);
  } catch {
    /* see above */
  }
}
