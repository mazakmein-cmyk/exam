// Captured synchronously at app startup, BEFORE supabase-js asynchronously
// consumes and strips the recovery token from the URL. Password-reset links
// carry `type=recovery` (in the hash for the implicit flow, or the query
// string). When Supabase's Redirect URLs allowlist is missing the reset URL it
// falls back to the Site URL (the homepage), so the recovery session can land
// anywhere — this flag lets the global auth listener recognise that landing and
// route the user to /reset-password even if it subscribed too late to catch the
// one-shot PASSWORD_RECOVERY event.
//
// Must be imported before the app renders (see main.tsx) so it reads the URL
// while the token is still present.
const readRecoveryLanding = (): boolean => {
  if (typeof window === "undefined") return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || query.get("type") === "recovery";
};

export const isRecoveryLanding = readRecoveryLanding();
