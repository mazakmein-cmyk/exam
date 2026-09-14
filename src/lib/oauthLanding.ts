/**
 * oauthLanding.ts — recognising the moment Google hands the user back.
 *
 * Runs synchronously at app startup, BEFORE verificationLanding.ts (which imports
 * it) and before supabase-js consumes the token from the URL.
 *
 * WHY THIS HAS TO EXIST AT ALL. The client is on auth-js's default implicit flow,
 * so a Google return arrives as `#access_token=...` with NO `type` param — which
 * is character for character the shape verificationLanding.ts treats as "can only
 * have come from a confirmation email" and rewrites to /verified. That page is a
 * deliberate dead end: no links, no redirect, and copy telling the reader to close
 * the tab and carry on in the tab they signed up from. With OAuth there is no such
 * tab — auth-js navigates this one — so without this module every Google sign-in
 * strands the user one click from nowhere, signed in, on a page about email.
 *
 * TWO WAYS TO RECOGNISE THE LANDING, because either one alone has a hole:
 *
 *  1. THE PATH. A Google flow is sent back to the portal page that started it
 *     (/auth or /student-auth), and no email link ever targets those — sign-up
 *     confirmations go to /verified and resets to /reset-password. So a token
 *     landing on a portal path is ours, and this arm keeps working even when
 *     storage is blocked entirely.
 *
 *  2. THE PARKED INTENT. Supabase silently substitutes the Site URL whenever a
 *     redirect target is missing from its Redirect URLs allowlist — the failure
 *     this codebase has already been bitten by four times over. In that case the
 *     landing is "/" and the path tells us nothing, so a fresh authReturnIntent
 *     record is the only remaining evidence. It is also what lets us put the user
 *     back where they belong: rather than leaving them signed in on the homepage
 *     with no user_type, we rewrite the path to their portal page and restore the
 *     query the fallback threw away, so the normal return handler picks it up.
 *
 * An explicit `type` short-circuits both arms first. Email links always carry one,
 * and no OAuth response ever does, so the email flows cannot be caught by either.
 */

import { clearAuthReturnIntent, hasFreshAuthReturnIntent, peekAuthReturnIntent } from "./authReturnIntent";

/** The two pages a Google flow is ever sent back to. */
const PORTAL_PATHS = new Set(["/auth", "/student-auth"]);

const PORTAL_PATH_FOR = { creator: "/auth", student: "/student-auth" } as const;

interface LandingParams {
  hash: URLSearchParams;
  query: URLSearchParams;
}

const readParams = (): LandingParams => ({
  hash: new URLSearchParams(window.location.hash.replace(/^#/, "")),
  query: new URLSearchParams(window.location.search),
});

const readOAuthLanding = (): boolean => {
  if (typeof window === "undefined") return false;

  const { hash, query } = readParams();

  // Email links (signup, recovery, email_change, invite) always stamp a `type`.
  // A provider response never does, so this single test keeps every email flow
  // out of here no matter what the rest of the URL looks like.
  if ((hash.get("type") ?? query.get("type")) !== null) return false;

  // Nothing came back from anywhere — an ordinary page load.
  const carriesResult = Boolean(
    hash.get("access_token") ||
    query.get("code") ||
    hash.get("error") ||
    query.get("error")
  );
  if (!carriesResult) return false;

  // Arm 1: it landed where we sent it. Neither portal path is ever an email
  // landing — confirmations go to /verified, resets to /reset-password — so a
  // result of any kind here, token or error, is ours.
  if (PORTAL_PATHS.has(window.location.pathname)) return true;

  // Arm 2: Supabase substituted the Site URL because our target was missing from
  // its allowlist, so the path tells us nothing and the parked record is all that
  // is left. Deliberately the narrowest possible form of that test, because the
  // record is only evidence that a Google flow was STARTED — not that this
  // particular landing came back from one:
  //
  //  - Only on the Site URL itself. /verified and /reset-password are where the
  //    email flows land, including their failures, and an expired link arrives
  //    there carrying error params and no `type` — indistinguishable in shape
  //    from everything else in this function. Those pages own their own landings.
  //  - Only for a hash access_token, which is the implicit-flow OAuth signature.
  //    An email link's `?code=` is PKCE and can never be ours while the client
  //    stays on implicit (src/integrations/supabase/client.ts sets no flowType,
  //    and auth-js defaults to it). REVISIT THIS if flowType is ever changed.
  //  - Never for an error-only landing. A bare `?error=` on the homepage is far
  //    more likely to be an expired email link that fell back to the Site URL
  //    than an OAuth failure that also lost its redirect target, and guessing
  //    wrong costs the user the resend form that is their only way forward.
  if (window.location.pathname !== "/") return false;
  if (!hash.get("access_token")) return false;
  return hasFreshAuthReturnIntent();
};

export const isOAuthLanding = readOAuthLanding();

/**
 * Whatever the provider said went wrong, if anything — "access_denied" when the
 * user closes the consent screen, or a provider/config error. Read once at
 * startup because supabase-js strips these params as it initialises.
 */
export const oauthLandingError: string | null = (() => {
  if (!isOAuthLanding || typeof window === "undefined") return null;
  const { hash, query } = readParams();
  if (!hash.get("error") && !query.get("error")) return null;
  const raw =
    hash.get("error_description") ??
    query.get("error_description") ??
    hash.get("error") ??
    query.get("error");
  // This text comes off the URL, so it is whatever the last redirect put there.
  // It is rendered as React text and therefore inert, but it still ends up in a
  // toast the user reads as ours — so cap it rather than handing an arbitrarily
  // long attacker-chosen sentence to the UI.
  return raw ? raw.slice(0, 200) : null;
})();

/**
 * Retire an abandoned hand-off.
 *
 * Backing out of Google's consent screen returns the user to the portal page
 * with nothing in the URL, and nothing else ever clears the record — so without
 * this it sits in storage for the full TTL, where arm 2 would treat it as
 * evidence about whatever landing happens next. Only on the portal paths,
 * which is where an abandoned flow comes back to.
 */
if (!isOAuthLanding && typeof window !== "undefined" && PORTAL_PATHS.has(window.location.pathname)) {
  clearAuthReturnIntent();
}

/**
 * Put a Site-URL-fallback landing back on its portal page.
 *
 * Same synchronous history rewrite verificationLanding.ts uses, and for the same
 * reason: the router reads window.location as it builds, so changing the path
 * here means the app boots on the right page rather than navigating to it a beat
 * later. The token is carried across untouched so supabase-js still finds it, and
 * the exam-submit params are rebuilt from the parked record — StudentAuth reads
 * those straight off the query string, so restoring them means none of its
 * existing logic has to know this detour happened.
 */
if (isOAuthLanding && typeof window !== "undefined" && !PORTAL_PATHS.has(window.location.pathname)) {
  const intent = peekAuthReturnIntent();
  if (intent) {
    const params = new URLSearchParams(window.location.search);
    if (intent.trigger) params.set("trigger", intent.trigger);
    if (intent.returnTo) params.set("returnTo", intent.returnTo);
    if (intent.from) params.set("from", intent.from);
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${PORTAL_PATH_FOR[intent.portal]}${search ? `?${search}` : ""}${window.location.hash}`
    );
  }
}
