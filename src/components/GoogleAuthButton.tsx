/**
 * GoogleAuthButton — "Continue with Google", on both portals.
 *
 * ONE BUTTON PER PAGE, ABOVE THE TABS. Both auth pages are a Log In / Create
 * Account tab pair, and Google is neither: the same click signs an existing user
 * in and creates an account for a new one. Rendering it inside both TabsContent
 * panels would put two of them on the page, each with its own handler and its own
 * loading state, for one action. It sits above the TabsList with an "or" divider,
 * where it reads as the shortcut past the choice rather than an option within it.
 *
 * WHY IT DOES NOT MATCH THE GLASS CARD. Everything else on these pages is
 * `bg-white/[0.04]` with `rounded-xl`. Google's branding guidelines prohibit
 * putting the colour "G" on anything but their light, dark or neutral fills, and
 * prohibit altering the mark's colours — so the compliant options on a dark page
 * are the solid #131314 dark button or a white one, and a translucent panel is not
 * among them. The pill radius is theirs too. A white button would shout louder
 * than the portal's own primary action, so: dark fill, standard border, real logo.
 *
 * The mark is inline SVG because lucide-react ships no Google glyph, and the four
 * fills are hard-coded rather than `currentColor` for the same reason as above.
 */

import { startGoogleAuth } from "@/lib/googleAuth";
import type { AuthPortal } from "@/lib/authReturnIntent";

interface GoogleAuthButtonProps {
  portal: AuthPortal;
  /** Disabled while the page's own email form is mid-submit. */
  disabled?: boolean;
  /** Shown instead of the label while we hand off. */
  loading?: boolean;
  /** Override for the busy text — the return leg is not a redirect TO Google. */
  loadingLabel?: string;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (message: string) => void;
  /**
   * Called immediately before the redirect. StudentAuth uses it to stand down the
   * beforeunload guard it puts up during the exam-submit flow — without that, a
   * "Leave site?" dialog fires over a deliberate hand-off to Google.
   */
  onBeforeRedirect?: () => void;
  /** Journey to restore on the way back; see authReturnIntent.ts. */
  trigger?: string | null;
  returnTo?: string | null;
  from?: string | null;
}

/**
 * Google's mark, path data verbatim from their own sign-in assets.
 *
 * Not redrawn, not simplified, not re-expressed with arcs where the original
 * uses curves — "you can't change the size or color of the Google 'G' logo" is a
 * branding requirement, and an approximation of it is still a change. Decorative
 * (aria-hidden) because the button already says "Continue with Google".
 */
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path
      fill="#4285F4"
      d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8055.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
    />
    <path
      fill="#EA4335"
      d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
    />
  </svg>
);

const GoogleAuthButton = ({
  portal,
  disabled = false,
  loading = false,
  loadingLabel = "Redirecting to Google...",
  onLoadingChange,
  onError,
  onBeforeRedirect,
  trigger,
  returnTo,
  from,
}: GoogleAuthButtonProps) => {
  const handleClick = async () => {
    onLoadingChange?.(true);
    onBeforeRedirect?.();

    const { error } = await startGoogleAuth({ portal, trigger, returnTo, from });

    // Only reached when the hand-off failed — on success the browser has already
    // left the page and nothing below runs.
    if (error) {
      onError?.(error);
      onLoadingChange?.(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full h-11 rounded-full bg-[#131314] hover:bg-[#1e1f20] border border-[#8E918F] text-[#E3E3E3] font-medium text-sm flex items-center justify-center gap-2.5 transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"
    >
      {loading ? (
        <>
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {loadingLabel}
        </>
      ) : (
        <>
          <GoogleMark />
          Continue with Google
        </>
      )}
    </button>
  );
};

export default GoogleAuthButton;
