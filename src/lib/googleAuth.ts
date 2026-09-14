/**
 * googleAuth.ts — the two halves of a Google sign-in, shared by both portals.
 *
 * `startGoogleAuth` parks what we need to remember and hands off to Google.
 * `completeGoogleAuth` picks it back up and repairs the one thing OAuth cannot
 * carry: user_metadata.user_type.
 *
 * WHY THE RETURN HALF IS NOT TRIVIAL. Email sign-up sets user_type through
 * `signUp({ options: { data } })`. signInWithOAuth has no equivalent — its options
 * are only { redirectTo, scopes, queryParams, skipBrowserRedirect } — so a brand
 * new Google account lands with no user_type at all. Nothing surfaces that as an
 * error: useUserRole reads a missing type as "creator", and so does every RLS
 * policy, so a Google *student* would look signed-in and working right up until
 * their finished paper failed to save, because the attempts INSERT policy tests
 * `auth.jwt() -> 'user_metadata' ->> 'user_type' = 'student'`.
 *
 * Which is also why refreshSession() below is not optional. updateUser swaps
 * session.user and re-saves the session, but it reuses the same access_token
 * (auth-js GoTrueClient: `session.user = data.user; await this._saveSession`).
 * The JWT — the thing Postgres actually reads — still carries the old claims until
 * the token turns over. Writing user_type without refreshing produces a client
 * that is certain the user is a student and a database that is certain they are
 * not.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  type AuthPortal,
  type AuthReturnIntent,
  clearAuthReturnIntent,
  consumeAuthReturnIntent,
  safeReturnTo,
  writeAuthReturnIntent,
} from "./authReturnIntent";
import { isOAuthLanding, oauthLandingError } from "./oauthLanding";

const PORTAL_PATH_FOR: Record<AuthPortal, string> = {
  creator: "/auth",
  student: "/student-auth",
};

export interface StartGoogleAuthOptions {
  /** The page the user clicked from — becomes user_type for a new account. */
  portal: AuthPortal;
  /** StudentAuth's `?trigger=exam_submit`, when a finished paper is waiting. */
  trigger?: string | null;
  /** Where to land afterwards. Validated same-origin before it is stored. */
  returnTo?: string | null;
  /** StudentAuth's `?from=marketplace`. */
  from?: string | null;
}

/**
 * Hand off to Google.
 *
 * The context is written to BOTH storage and the redirect URL's query string, and
 * the two cover different failures: the query is lost if the exact URL is missing
 * from Supabase's Redirect URLs allowlist (GoTrue silently substitutes the Site
 * URL), and storage is lost if the browser blocks site data or an in-app browser
 * returns into a different tab. Either survivor is enough.
 *
 * Resolves only if the redirect did NOT happen — on success the browser is already
 * navigating away and nothing after the call runs.
 */
export const startGoogleAuth = async ({
  portal,
  trigger,
  returnTo,
  from,
}: StartGoogleAuthOptions): Promise<{ error: string | null }> => {
  const safeReturn = safeReturnTo(returnTo);

  writeAuthReturnIntent({
    portal,
    trigger: trigger ?? undefined,
    returnTo: safeReturn,
    from: from ?? undefined,
  });

  const params = new URLSearchParams();
  if (trigger) params.set("trigger", trigger);
  if (safeReturn) params.set("returnTo", safeReturn);
  if (from) params.set("from", from);
  const search = params.toString();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${PORTAL_PATH_FOR[portal]}${search ? `?${search}` : ""}`,
    },
  });

  if (error) {
    // Nothing was handed off, so the parked record would only go stale.
    clearAuthReturnIntent();
    return { error: error.message };
  }
  return { error: null };
};

export type GoogleAuthReturn =
  /** Not an OAuth landing — the page should carry on as normal. */
  | { status: "none" }
  /** Session is ready and user_type is correct; `intent` restores the journey. */
  | { status: "signed-in"; intent: AuthReturnIntent | null }
  /** The Google account belongs to the other portal. Caller signs out and says so. */
  | { status: "wrong-portal"; actual: AuthPortal }
  | { status: "error"; message: string };

/**
 * Finish a Google sign-in that has just landed back on `portal`'s page.
 *
 * Call this from the page's mount effect, NOT from an onAuthStateChange handler:
 * auth-js fires SIGNED_IN for a URL session from inside _initialize on a
 * setTimeout(…, 0), and both portals are lazy() routes whose listeners subscribe
 * after that has already gone past. getSession has no such problem — it awaits the
 * same initializePromise, so it resolves only once the token has been read out of
 * the URL and stored.
 */
/**
 * isOAuthLanding is fixed for the life of the page, so a client-side navigation
 * back to a portal page would look like a second return and re-announce the
 * sign-in. One completion per page load.
 */
let completed = false;

export const completeGoogleAuth = async (portal: AuthPortal): Promise<GoogleAuthReturn> => {
  if (!isOAuthLanding || completed) return { status: "none" };
  completed = true;

  if (oauthLandingError) {
    clearAuthReturnIntent();
    return { status: "error", message: oauthLandingError };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearAuthReturnIntent();
    return { status: "error", message: "Google sign-in didn't complete. Please try again." };
  }

  const intent = consumeAuthReturnIntent();
  const existing = session.user.user_metadata?.user_type;

  if (existing === "creator" || existing === "student") {
    // An account that already knows what it is keeps what it is. Stamping the
    // clicked portal over an existing user_type would make "sign in with Google
    // on the creator page" a one-click promotion out of the student role.
    if (existing !== portal) return { status: "wrong-portal", actual: existing };
    return { status: "signed-in", intent };
  }

  // No user_type. Usually a brand new Google account — but it can also be an
  // older email/password account that predates the field, which Supabase has just
  // linked this Google identity into (automatic linking on a confirmed email
  // address; it is the default and cannot be switched off). The app already reads
  // a typeless legacy account as a creator, so re-typing one as a student here
  // because of which button they happened to click would quietly revoke their own
  // exams from them.
  const linkedToExistingPassword = (session.user.identities ?? []).some(
    (identity) => identity.provider === "email"
  );
  const resolved: AuthPortal = linkedToExistingPassword ? "creator" : portal;
  if (resolved !== portal) return { status: "wrong-portal", actual: resolved };

  const { error } = await supabase.auth.updateUser({
    // Spread first: GoTrue merges user_metadata, but re-sending what is already
    // there costs nothing and means a future change to that behaviour cannot
    // silently drop a key the RLS policies depend on.
    data: { ...session.user.user_metadata, user_type: resolved },
  });
  if (error) {
    // A signed-in session with no user_type is worse than no session at all: the
    // client and every RLS policy read the absence as "creator", so a student
    // would be silently handed a creator's reading of the app and refused their
    // own attempt INSERT with no error they could act on. Undo the sign-in.
    await supabase.auth.signOut();
    return { status: "error", message: error.message };
  }

  // Mint a JWT that actually carries the claim. See the header comment.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    // The stored user now says 'student' while the JWT still does not, which is
    // the same split-brain by another route — the UI would behave while the
    // database refused every write. Better to make them sign in again.
    await supabase.auth.signOut();
    return {
      status: "error",
      message: "Signed in, but your account type didn't finish saving. Please try again.",
    };
  }

  return { status: "signed-in", intent };
};
