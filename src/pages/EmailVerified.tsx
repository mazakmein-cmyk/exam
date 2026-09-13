import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

/**
 * Terminal page for the tab an email-confirmation link opens.
 *
 * It says one thing and goes nowhere. The link is almost always clicked from a
 * mail client, which opens a BRAND NEW tab — while the tab the user actually
 * cares about (the exam, the library page, the sign-up form they came from) is
 * still sitting open behind it. Sending this tab on to /dashboard or
 * /marketplace replaced that destination with a second, redundant copy of the
 * app and lost the page the user was mid-way through.
 *
 * So: no redirect, no links, no "continue" button. The sign-up tab's
 * verification modal polls localStorage every few seconds, picks up the session
 * this tab just wrote, and carries on to wherever the user was headed. All this
 * tab has to do is confirm and get out of the way.
 */
type PageState = "checking" | "verified" | "invalid";

const EmailVerified = () => {
  const [pageState, setPageState] = useState<PageState>("checking");

  useEffect(() => {
    // Expired or already-used links come back with error params instead of a
    // token (e.g. #error=access_denied&error_code=otp_expired) — definitively invalid.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    if (hashParams.get("error") || queryParams.get("error")) {
      setPageState("invalid");
      return;
    }

    let cancelled = false;

    // A session always wins: once one appears we never flip back to "invalid".
    const markVerified = () => {
      if (!cancelled) setPageState("verified");
    };

    // Subscribe first so a SIGNED_IN event can't slip past between the
    // getSession() call below and its resolution.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markVerified();
    });

    // getSession() resolves only AFTER supabase-js has finished consuming the
    // URL token, so its result is authoritative — a session means the link was
    // good; its absence means it was missing, invalid or already used.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) markVerified();
      else setPageState(prev => (prev === "checking" ? "invalid" : prev));
    });

    // Last-resort guard against a hung network so the user never sees an
    // endless spinner; only acts while still "checking".
    const timeout = window.setTimeout(() => {
      setPageState(prev => (prev === "checking" ? "invalid" : prev));
    }, 15000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <SEO title="Email Verified | MockSetu" description="Your MockSetu email address has been verified." path="/verified" noindex />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0618] via-[#110d2a] to-[#0d1a33]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6C3EF4]/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#A855F7]/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8 gap-2">
          <span className="text-2xl font-bold tracking-[-0.02em] text-white">
            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
          </span>
        </div>

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#6C3EF4]/50 to-transparent" />
          <div className="p-8">
            {pageState === "checking" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <svg className="animate-spin h-6 w-6 text-[#A855F7]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-sm text-white/50">Verifying your email...</p>
              </div>
            )}

            {pageState === "verified" && (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="h-14 w-14 rounded-full bg-emerald-400/12 border border-emerald-400/25 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                </div>
                <h1 className="text-xl font-bold text-white tracking-[-0.01em]">Your email is verified</h1>
                <p className="text-sm text-white/50 leading-relaxed">
                  Your MockSetu account is active. You can close this tab and carry on
                  in the tab where you signed up — it continues on its own.
                </p>
              </div>
            )}

            {pageState === "invalid" && (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="h-14 w-14 rounded-full bg-amber-400/10 border border-amber-400/25 flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-amber-400" />
                </div>
                <h1 className="text-xl font-bold text-white tracking-[-0.01em]">This link has expired</h1>
                <p className="text-sm text-white/50 leading-relaxed">
                  It may also have been used already. Go back to the tab where you
                  signed up and choose "Resend verification email" to get a fresh link.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerified;
