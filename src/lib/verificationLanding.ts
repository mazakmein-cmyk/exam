// Runs synchronously at app startup, BEFORE supabase-js consumes the token
// from the URL and BEFORE App.tsx builds the router from window.location.
//
// Email-confirmation links open in a brand new tab, so that tab has no journey
// to continue — the page the user actually wanted is still open in the tab they
// signed up from. This module spots a confirmation landing and rewrites the
// path to /verified, where a terminal "you're verified" page says its piece and
// stops (see EmailVerified.tsx).
//
// Why a synchronous history rewrite rather than a navigate() from the auth
// listener: Supabase falls back to the Site URL (the homepage) whenever its
// Redirect URLs allowlist is missing the target, so the confirmation lands on
// "/" and the router has already committed to the homepage by the time any
// SIGNED_IN event arrives. Rewriting here means the router boots on /verified
// in the first place. The query and hash are carried across untouched, so
// supabase-js still finds its token exactly where it expects it.

const CONFIRMATION_TYPES = new Set(["signup", "email_change", "invite", "magiclink", "email"]);

const readVerificationLanding = (): boolean => {
  if (typeof window === "undefined") return false;

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") ?? query.get("type");

  // Password resets have their own landing page — see recoveryLanding.ts.
  if (type === "recovery") return false;
  if (type !== null) return CONFIRMATION_TYPES.has(type);

  // No `type` to go on (PKCE links carry only `?code=`, and some GoTrue
  // versions omit it). This app has no OAuth, no magic-link and no OTP
  // sign-in — supabase-js is the only thing that ever writes a session — so a
  // token landing that is not a recovery can only have come from a
  // confirmation email.
  return Boolean(hash.get("access_token") || query.get("code"));
};

export const isVerificationLanding = readVerificationLanding();

if (isVerificationLanding && window.location.pathname !== "/verified") {
  window.history.replaceState(
    null,
    "",
    `/verified${window.location.search}${window.location.hash}`
  );
}
