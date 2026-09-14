/**
 * passwordSetup.ts — deciding whether to offer an account a password.
 *
 * A Google account has no password, so email + password sign-in is closed to it
 * forever unless one gets set. That is fine until the day Google sign-in is not
 * available — a shared computer, a work profile, an in-app browser (Instagram and
 * Facebook block OAuth outright with disallowed_useragent), or simply not
 * remembering which button was used last time. The prompt exists so the account
 * has a second way in before it is needed.
 *
 * HOW WE KNOW WHETHER A PASSWORD EXISTS. Supabase does not expose it directly, so
 * this asks two independent questions and takes either as a yes:
 *
 *   - `user_metadata.password_set`, which SetPasswordModal writes in the same
 *     updateUser call that sets the password.
 *   - an identity with provider 'email', which every email/password signup has.
 *
 * Two, because neither is sufficient alone. The flag would miss every account
 * created before this shipped; whether GoTrue adds an 'email' identity when a
 * password is set on an OAuth-only user is server-side behaviour we cannot read
 * from here. Checking both means the worst case is a prompt shown to someone who
 * does not need it, never an account quietly left with one way in. The flag is
 * user-writable, which is not a concern: it decides whether a dialog appears,
 * nothing more — it grants no access and gates no data.
 *
 * SKIPPING IS FOR THE SESSION, NOT FOREVER. "Skip for now" has to mean it, or the
 * prompt is just a blocker with extra steps — but a permanent dismissal on the
 * one screen where it is most tempting to dismiss (straight after a 90-minute
 * paper) would leave the account single-route for good. sessionStorage splits the
 * difference: gone for this visit, offered again next time, and always available
 * on demand from User Profile.
 */

import type { User } from "@supabase/supabase-js";

const SKIP_KEY = "setPasswordSkipped";

const providersOf = (user: User): string[] => {
  const fromIdentities = (user.identities ?? []).map((identity) => identity.provider);
  const fromMetadata = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : [];
  return [...fromIdentities, ...fromMetadata];
};

/** Can this account be signed into with an email and a password? */
export const hasPasswordCredential = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (user.user_metadata?.password_set === true) return true;
  return (user.identities ?? []).some((identity) => identity.provider === "email");
};

/** Did this account come in through Google? */
export const usesGoogle = (user: User | null | undefined): boolean =>
  !!user && providersOf(user).includes("google");

/**
 * Raised when something that was deferring the prompt has finished.
 *
 * The prompt stands down while `needsOnboarding` is set, and that key is cleared
 * from inside ExamReview's onboarding modal — a plain sessionStorage write, which
 * fires no React update and no storage event in the tab that made it. Without a
 * nudge, the gate's effect never re-runs and the post-exam prompt (the single
 * most likely moment for a brand new Google student to be offered a password)
 * silently never appears.
 */
export const PASSWORD_PROMPT_RECHECK_EVENT = "mocksetu:password-prompt-recheck";

export const notifyPasswordPromptRecheck = (): void => {
  try {
    window.dispatchEvent(new Event(PASSWORD_PROMPT_RECHECK_EVENT));
  } catch {
    /* no window (SSR/tests) — nothing is listening anyway */
  }
};

export const wasPasswordPromptSkipped = (): boolean => {
  try {
    return sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
};

export const skipPasswordPrompt = (): void => {
  try {
    sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    // Storage blocked. The prompt reappears on the next navigation, which is
    // worse than intended but still dismissable — and never blocks anything.
  }
};

export const clearPasswordPromptSkip = (): void => {
  try {
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    /* nothing to clear */
  }
};

/**
 * Offer a password to a Google account that has none — unless they have already
 * waved it away this session, or a finished exam is still being written, which
 * owns the screen until it lands (the same rule StudentAuth applies to the
 * onboarding modal).
 */
export const shouldPromptForPassword = (user: User | null | undefined): boolean => {
  if (!user) return false;
  if (!usesGoogle(user)) return false;
  if (hasPasswordCredential(user)) return false;
  if (wasPasswordPromptSkipped()) return false;
  try {
    if (sessionStorage.getItem("needsOnboarding") === "1") return false;
  } catch {
    /* unreadable storage just means we do not defer */
  }
  return true;
};
