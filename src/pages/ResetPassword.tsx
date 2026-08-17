import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import SEO from "@/components/SEO";

// Recovery links land here (see ForgotPasswordModal and AuthStateListener).
// The page has three states: waiting for supabase-js to consume the token from
// the URL, the actual "set new password" form, and an expired/invalid-link
// state that lets the user request a fresh email without leaving the page.
type PageState = "checking" | "ready" | "invalid";

const ResetPassword = () => {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

    // A recovery session always wins: whenever one appears we show the form and
    // never flip a resolved "ready" back to "invalid".
    const markReady = (email: string | null | undefined) => {
      if (cancelled) return;
      setAccountEmail(email ?? null);
      setPageState("ready");
    };

    // Subscribe first so a PASSWORD_RECOVERY/SIGNED_IN event can't slip past
    // between the getSession() call below and its resolution.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady(session.user.email);
    });

    // getSession() resolves only AFTER supabase-js has finished consuming the
    // URL token, so its result is authoritative — not a race against a timer.
    // A session means a valid link; its absence means the link was
    // missing/invalid/expired.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) markReady(session.user.email);
      else setPageState(prev => (prev === "checking" ? "invalid" : prev));
    });

    // Last-resort guard against a hung network so the user never sees an endless
    // spinner; long enough that a slow-but-valid link resolves first, and it
    // only acts while still "checking" so it can never override a ready form.
    const timeout = window.setTimeout(() => {
      setPageState(prev => (prev === "checking" ? "invalid" : prev));
    }, 15000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please make sure your passwords match.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Could not update password", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const userType = data.user?.user_metadata?.user_type;
    toast({ title: "Password updated", description: "Your password has been changed. Please log in with your new password." });
    await supabase.auth.signOut();
    navigate(userType === "creator" ? "/auth" : "/student-auth");
  };

  const handleResendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resendEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We've sent you a new password reset link." });
    }
    setLoading(false);
  };

  const inputClass = "bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11";
  const buttonClass = "w-full h-11 mt-2 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-sm shadow-lg shadow-[#6C3EF4]/30 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2";

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <SEO title="Reset Password | MockSetu" description="Set a new password for your MockSetu account." path="/reset-password" noindex />
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0618] via-[#110d2a] to-[#0d1a33]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6C3EF4]/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#A855F7]/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />

      <button onClick={() => navigate("/")} className="absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/8 transition-all text-sm font-medium">
        <ArrowLeft className="h-4 w-4" />Back to Home
      </button>

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/30 to-[#A855F7]/20 border border-white/10 flex items-center justify-center shadow-xl shadow-[#6C3EF4]/20 mb-1">
            <KeyRound className="h-6 w-6 text-[#A855F7]" />
          </div>
          <span className="text-2xl font-bold tracking-[-0.02em] text-white">
            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
          </span>
          <span className="text-xs font-semibold text-white/30 tracking-widest uppercase">Reset Password</span>
        </div>

        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#6C3EF4]/50 to-transparent" />
          <div className="p-7">
            {pageState === "checking" && (
              <div className="flex flex-col items-center gap-3 py-8">
                <svg className="animate-spin h-6 w-6 text-[#A855F7]" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-sm text-white/50">Verifying your reset link...</p>
              </div>
            )}

            {pageState === "ready" && (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <p className="text-sm text-white/50">
                  Set a new password{accountEmail ? <> for <span className="text-white/80 font-medium">{accountEmail}</span></> : null}.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">New Password</Label>
                  <div className="relative">
                    <Input id="new-password" type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className={`${inputClass} pr-11`} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-new-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Confirm New Password</Label>
                  <div className="relative">
                    <Input id="confirm-new-password" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} className={`${inputClass} pr-11`} />
                    <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className={buttonClass}>
                  {loading
                    ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Updating...</>
                    : "Update Password"}
                </button>
              </form>
            )}

            {pageState === "invalid" && (
              <form onSubmit={handleResendLink} className="space-y-4">
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 p-3">
                  <p className="text-amber-300/90 text-xs font-medium">This reset link is invalid or has expired. Enter your email and we'll send you a new one.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resend-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                  <Input id="resend-email" type="email" placeholder="you@example.com" value={resendEmail} onChange={e => setResendEmail(e.target.value)} required className={inputClass} />
                </div>
                <button type="submit" disabled={loading} className={buttonClass}>
                  {loading
                    ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Sending link...</>
                    : "Send New Reset Link"}
                </button>
                <p className="text-center text-[11px] text-white/25 pt-1">
                  Remembered your password?{" "}
                  <span className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors" onClick={() => navigate("/student-auth?mode=signin")}>Log in →</span>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
