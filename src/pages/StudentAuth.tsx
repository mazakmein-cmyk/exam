import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSignInErrorToast } from "@/lib/signInErrors";
import { ArrowLeft, GraduationCap, Eye, EyeOff } from "lucide-react";
import { saveExamAttempt } from "@/services/examService";
import {
  clearPendingSubmissions,
  readPendingSubmissions,
  writePendingSubmissions,
} from "@/lib/pendingSubmissions.js";
import EmailVerificationModal from "@/components/EmailVerificationModal";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import OnboardingModal from "@/components/OnboardingModal";
import SEO from "@/components/SEO";
import { completeGoogleAuth } from "@/lib/googleAuth";
import { isOAuthLanding } from "@/lib/oauthLanding";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const StudentAuth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [authTab, setAuthTab] = useState(defaultTab);
  const signupEmailRef = useRef<HTMLInputElement>(null);
  const isExamSubmit = searchParams.get("trigger") === "exam_submit";
  // Same-origin relative paths only ("/x" but not "//host") — guards against open redirects.
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = rawReturnTo && rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : null;
  const [showExitDialog, setShowExitDialog] = useState(false);
  // Full-screen overlay while pending exam attempts are being written (4-5s).
  const [savingResults, setSavingResults] = useState(false);
  // Latch, not state: state updates are async, so two rapid clicks could both
  // read savingResults=false and each write a fresh attempt row. The ref flips
  // synchronously, so only the first invocation ever reaches saveExamAttempt.
  const savingRef = useRef(false);
  const [googleLoading, setGoogleLoading] = useState(isOAuthLanding);
  // True only while the return leg is in flight. isOAuthLanding is fixed for
  // the page's life, so using it directly would keep saying "Signing you in"
  // on a retry after a failed return.
  const [oauthReturning, setOauthReturning] = useState(isOAuthLanding);
  // A Google return is handled exactly once.
  const oauthHandledRef = useRef(false);
  // Set the instant we hand off to Google, so the unsaved-responses guard below
  // knows this particular navigation is deliberate.
  const leavingForGoogleRef = useRef(false);

  useEffect(() => {
    // Returning from Google. Driven from the mount effect, not the SIGNED_IN
    // listener: auth-js raises that event for a URL-borne session from inside
    // _initialize on a setTimeout(…, 0), and this page is a lazy() route whose
    // listener subscribes after it has already fired.
    const finishGoogle = async () => {
      if (oauthHandledRef.current) return;
      oauthHandledRef.current = true;

      // Everything below is wrapped: an unexpected throw (storage blocked, a
      // network failure inside supabase-js) would otherwise leave the button
      // stuck on its busy label with no way back.
      try {
        const result = await completeGoogleAuth("student");
        if (result.status === "none") return;

        if (result.status === "error") {
          toast({ title: "Google sign-in failed", description: result.message, variant: "destructive" });
          return;
        }
        if (result.status === "wrong-portal") {
          await supabase.auth.signOut();
          toast({
            title: "Wrong account type",
            description: "This Google account is registered as a creator. Please log in from the Creator login page.",
            variant: "destructive",
          });
          return;
        }

        toast({ title: "Welcome!", description: "Signed in with Google." });
        // Same pipeline the password path uses — profile check, then the pending
        // exam replay. By this point completeGoogleAuth has refreshed the JWT, so
        // the attempts INSERT policy can actually see user_type='student'.
        await checkProfileAndRedirect();
      } catch (err) {
        console.error("Google sign-in failed to complete:", err);
        toast({
          title: "Google sign-in failed",
          description: "Something went wrong finishing your sign-in. Please try again.",
          variant: "destructive",
        });
      } finally {
        // Always released, so the button is never left spinning.
        setGoogleLoading(false);
        setOauthReturning(false);
      }
    };

    const checkUser = async () => {
      if (isOAuthLanding) {
        await finishGoogle();
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (session.user.user_metadata?.user_type === 'student' && !isExamSubmit) {
          navigate(returnTo || "/marketplace");
        }
      }
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // PASSWORD_RECOVERY is handled globally in AuthStateListener, which
      // routes to the dedicated /reset-password page.
      if (event === "SIGNED_IN" && session) {
        // A Google return owns its own routing — it still has a user_type to
        // write and a JWT to refresh before anything may navigate.
        if (isOAuthLanding) return;
        if (session.user.user_metadata?.user_type === 'student' && !isExamSubmit) {
          navigate(returnTo || "/marketplace");
        }
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, isExamSubmit, returnTo]);

  // Coming BACK from Google's consent screen restores this page from the
  // back/forward cache rather than re-running it, so the latches set on the way
  // out survive: the unsaved-responses guard would stay disarmed for the rest of
  // the visit, and the button would stay stuck on its busy label. pageshow with
  // persisted=true is the only notification a bfcache restore gives us.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      leavingForGoogleRef.current = false;
      setGoogleLoading(false);
      setOauthReturning(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    if (!isExamSubmit) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Handing off to Google is a navigation away from this page, so without
      // this the browser raises "Leave site? Changes you made may not be saved"
      // over the sign-in the student just asked for — and the warning says their
      // responses will be lost, which is exactly backwards.
      if (leavingForGoogleRef.current) return;
      e.preventDefault();
      e.returnValue = "Exam responses will not be saved. Please sign up to save the responses.";
      return "Exam responses will not be saved. Please sign up to save the responses.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isExamSubmit]);

  // "Back" is a real destination — except mid exam-submit, where it has to stop
  // and ask before the unsaved responses are thrown away. So the safe case
  // renders as a <Link> (Cmd+click opens the library in a new tab, the sign-in
  // form stays put) and only the confirm-first case stays a <button>.
  const cameFromMarketplace = searchParams.get("from") === "marketplace";
  const backTo = cameFromMarketplace ? "/marketplace" : "/";
  const backClassName = "absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/8 transition-all text-sm font-medium";
  const backContent = (
    <>
      <ArrowLeft className="h-4 w-4" />
      {(cameFromMarketplace || isExamSubmit) ? "Back to Exam Library" : "Back to Home"}
    </>
  );

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Please make sure your passwords match.", variant: "destructive" });
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/verified`, data: { user_type: "student" } },
    });
    if (error) {
      if (error.message.includes("already registered") || error.message.includes("User already exists")) {
        toast({ title: "Account already exists", description: "Please log in instead." });
      } else {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      }
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError && signInData.user) {
        toast({ title: "Account already exists", description: "Please log in to your account." });
      } else if (signInError && signInError.message.includes("Email not confirmed")) {
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/verified` } });
        if (resendError) {
          toast({ title: "Account already exists", description: "Please log in instead." });
        } else {
          toast({ title: "Account exists", description: "We've resent the verification email. Please check your inbox." });
          setShowVerificationModal(true);
        }
      } else {
        toast({ title: "Account already exists", description: "Please log in instead." });
      }
    } else {
      setShowVerificationModal(true);
    }
    setLoading(false);
  };

  // "Try a different email". The unverified account stays in Supabase, which is
  // harmless — the user can still come back and confirm it later — so this only
  // has to hand the form back, emptied and focused.
  const handleUseDifferentEmail = () => {
    setShowVerificationModal(false);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setAuthTab("signup");
    // The signup panel is unmounted while the sign-in tab is showing, so the
    // input does not exist until the tab switch has rendered.
    requestAnimationFrame(() => signupEmailRef.current?.focus());
  };

  const handleVerificationComplete = async () => {
    setShowVerificationModal(false);
    toast({ title: "Success!", description: "Account verified successfully." });
    await checkProfileAndRedirect();
  };

  const checkProfileAndRedirect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) {
      if (isExamSubmit) {
        // Post-exam flow: save the attempt first and overlay onboarding on the review page.
        sessionStorage.setItem('needsOnboarding', '1');
        await handlePendingExamSubmission();
      } else {
        setShowOnboardingModal(true);
      }
    } else {
      await handlePendingExamSubmission();
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboardingModal(false);
    await handlePendingExamSubmission();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      toast(await getSignInErrorToast(signInError, email));
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast({ title: "Error", description: "Failed to fetch user profile.", variant: "destructive" });
        setLoading(false);
        return;
      }
      if (!user.email_confirmed_at) {
        await supabase.auth.signOut();
        toast({ title: "Verification required", description: "Please verify your email before logging in.", variant: "destructive" });
        setLoading(false);
        return;
      }
      const userType = user.user_metadata?.user_type;
      if (userType === "creator") {
        await supabase.auth.signOut();
        toast({ title: "Wrong account type", description: "This is a creator account. Please log in from the Creator login page.", variant: "destructive" });
      } else {
        toast({ title: "Welcome back!", description: "Logged in successfully." });
        // Awaited so `loading` holds the button disabled for the full 4-5s
        // attempt save; releasing it early is what let users re-submit.
        await checkProfileAndRedirect();
      }
    }
    setLoading(false);
  };

  const handlePendingExamSubmission = async () => {
    // A second log-in click (or a re-fired auth event) while the 4-5s save is
    // in flight would insert a duplicate attempt for the same sitting.
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      // Reads the durable queue AND drains the legacy sessionStorage keys —
      // see lib/pendingSubmissions.js for both halves of issue 18.
      const pendingSubmissions = readPendingSubmissions();
      // No pending mock-exam work: honor returnTo (e.g. back to a live exam) if present.
      if (pendingSubmissions.length === 0) { navigate(returnTo || "/marketplace"); return; }
      setSavingResults(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/marketplace"); return; }
      let lastAttemptId = null;
      // Cross each section off AS IT LANDS. Clearing only after the whole loop
      // meant a network hiccup on section 3 left all 3 parked — and the next
      // sign-in re-saved sections 1-2 as duplicate attempts.
      for (let i = 0; i < pendingSubmissions.length; i++) {
        lastAttemptId = await saveExamAttempt({ ...pendingSubmissions[i], userId: user.id });
        writePendingSubmissions(pendingSubmissions.slice(i + 1));
      }
      clearPendingSubmissions();
      toast({ title: "Exams Submitted", description: `Successfully saved ${pendingSubmissions.length} section(s).` });
      if (lastAttemptId) { navigate(`/exam/review/${lastAttemptId}`); } else { navigate("/marketplace"); }
    } catch (error) {
      console.error("Error saving pending exam:", error);
      toast({ title: "Error", description: "Failed to save your exam attempt.", variant: "destructive" });
      navigate("/marketplace");
    } finally {
      savingRef.current = false;
      setSavingResults(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <SEO
        title="Log In or Sign Up Free | MockSetu"
        description="Create your free MockSetu account to take timed mock tests for JEE, NEET, CAT, GATE, and UPSC."
        path="/student-auth"
        noindex
      />
      {/* Deep gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d1a33] to-[#0a0f1e]" />
      {/* Ambient glow orbs — teal/indigo tone for student portal */}
      <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-[#0EA5E9]/15 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-[#6C3EF4]/12 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-2/3 right-1/4 w-64 h-64 bg-[#22D3EE]/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.7s' }} />

      {/* Saving overlay — blocks every click while the exam attempt is written */}
      {savingResults && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#0a1628]/90 backdrop-blur-md" role="status" aria-live="polite">
          <svg className="animate-spin h-10 w-10 text-[#38BDF8]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-white font-semibold text-base">Saving your exam results…</p>
          <p className="text-white/50 text-sm max-w-xs text-center">This takes a few seconds. Please don't close or refresh this page.</p>
        </div>
      )}

      {/* Modals */}
      <EmailVerificationModal isOpen={showVerificationModal} onOpenChange={setShowVerificationModal} email={email} onVerified={handleVerificationComplete}
        onUseDifferentEmail={handleUseDifferentEmail}
        verifyCredentials={async () => {
          if (!password) return false;
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          return !error && !!data.session;
        }}
      />
      <ForgotPasswordModal isOpen={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal} defaultEmail={email} />
      <OnboardingModal isOpen={showOnboardingModal} onComplete={handleOnboardingComplete} />

      {/* Back Button */}
      {isExamSubmit ? (
        <button onClick={() => setShowExitDialog(true)} className={backClassName}>
          {backContent}
        </button>
      ) : (
        <Link to={backTo} className={backClassName}>
          {backContent}
        </Link>
      )}

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
            <AlertDialogDescription>Exam responses will not be saved. Please sign up to save the responses.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/marketplace")} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Leave & Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand identity — Student variant */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0EA5E9]/25 to-[#6C3EF4]/20 border border-white/10 flex items-center justify-center shadow-xl shadow-[#0EA5E9]/15 mb-1">
            <GraduationCap className="h-6 w-6 text-[#38BDF8]" />
          </div>
          {/* MockSetu wordmark + student label */}
          <span className="text-2xl font-bold tracking-[-0.02em] text-white">
            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
          </span>
          <span className="text-xs font-semibold text-white/30 tracking-widest uppercase">Student Portal</span>
        </div>

        {/* Save-results notice banner */}
        {isExamSubmit && (
          <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/8 p-3 text-center">
            <p className="text-amber-300/90 text-xs font-medium">⚡ Log in or create an account to save your exam results</p>
          </div>
        )}

        {/* Glass Card */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#0EA5E9]/40 to-transparent" />

          <div className="p-7">
            {/* Above the tabs, not inside them: one Google click both signs an
                existing student in and creates a new account, so it belongs to
                neither panel. The journey is handed over with it — a finished
                paper waiting to be saved has to survive the trip to Google. */}
            <GoogleAuthButton
              portal="student"
              loading={googleLoading}
              loadingLabel={oauthReturning ? "Signing you in..." : undefined}
              disabled={loading}
              onLoadingChange={setGoogleLoading}
              onBeforeRedirect={() => { leavingForGoogleRef.current = true; }}
              onError={(message) => {
                leavingForGoogleRef.current = false;
                toast({ title: "Google sign-in failed", description: message, variant: "destructive" });
              }}
              trigger={searchParams.get("trigger")}
              returnTo={rawReturnTo}
              from={searchParams.get("from")}
            />
            <div className="relative my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/[0.09]" />
              <span className="text-[11px] font-medium uppercase tracking-widest text-white/45">or</span>
              <span className="h-px flex-1 bg-white/[0.09]" />
            </div>
            <Tabs value={authTab} onValueChange={setAuthTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 mb-6 h-10">
                <TabsTrigger value="signin" className="rounded-lg text-[13px] font-medium text-white/40 data-[state=active]:bg-[#0EA5E9] data-[state=active]:text-white transition-all duration-200 h-8">Log In</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-[13px] font-medium text-white/40 data-[state=active]:bg-[#0EA5E9] data-[state=active]:text-white transition-all duration-200 h-8">Create Account</TabsTrigger>
              </TabsList>

              {/* Log In Tab */}
              <TabsContent value="signin" className="mt-0">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                    <Input id="signin-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#0EA5E9]/60 focus-visible:ring-[#0EA5E9]/10 rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Password</Label>
                      <button type="button" onClick={() => setShowForgotPasswordModal(true)} className="text-[11px] text-[#38BDF8]/80 hover:text-[#38BDF8] transition-colors">Forgot?</button>
                    </div>
                    <div className="relative">
                      <Input id="signin-password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                        className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#0EA5E9]/60 focus-visible:ring-[#0EA5E9]/10 rounded-xl h-11 pr-11" />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading || googleLoading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold text-sm shadow-lg shadow-[#0EA5E9]/25 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Logging in...</>
                      : "Log In"}
                  </button>
                  {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                    <p className="text-center text-[11px] text-white/25 pt-1">
                      Want to create exams?{" "}
                      <Link to="/auth" className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors">Creator login →</Link>
                    </p>
                  )}
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                    <Input id="signup-email" ref={signupEmailRef} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#0EA5E9]/60 focus-visible:ring-[#0EA5E9]/10 rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Password</Label>
                    <div className="relative">
                      <Input id="signup-password" type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                        className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#0EA5E9]/60 focus-visible:ring-[#0EA5E9]/10 rounded-xl h-11 pr-11" />
                      <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-confirm-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Confirm Password</Label>
                    <div className="relative">
                      <Input id="signup-confirm-password" type={showConfirmPassword ? "text" : "password"} placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
                        className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#0EA5E9]/60 focus-visible:ring-[#0EA5E9]/10 rounded-xl h-11 pr-11" />
                      <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading || googleLoading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold text-sm shadow-lg shadow-[#0EA5E9]/25 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating account...</>
                      : "Create Student Account"}
                  </button>
                  {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                    <p className="text-center text-[11px] text-white/25 pt-1">
                      Want to create exams?{" "}
                      <Link to="/auth" className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors">Creator sign-up →</Link>
                    </p>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* These two pointed at "/terms" and "/privacy", which are not routes —
            App.tsx declares "/terms-of-service" and "/privacy-policy", so both
            links have been landing on the 404 page. Corrected while converting. */}
        <p className="text-center text-[11px] text-white/20 mt-5">
          By continuing you agree to our{" "}
          <Link to="/terms-of-service" className="text-white/35 hover:text-white/60 cursor-pointer transition-colors">Terms</Link>
          {" & "}
          <Link to="/privacy-policy" className="text-white/35 hover:text-white/60 cursor-pointer transition-colors">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
};

export default StudentAuth;
