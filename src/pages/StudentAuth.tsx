import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSignInErrorToast } from "@/lib/signInErrors";
import { ArrowLeft, GraduationCap, Eye, EyeOff } from "lucide-react";
import { saveExamAttempt } from "@/services/examService";
import EmailVerificationModal from "@/components/EmailVerificationModal";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import OnboardingModal from "@/components/OnboardingModal";
import SEO from "@/components/SEO";
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

  useEffect(() => {
    const checkUser = async () => {
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
        if (session.user.user_metadata?.user_type === 'student' && !isExamSubmit) {
          navigate(returnTo || "/marketplace");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, isExamSubmit, returnTo]);

  useEffect(() => {
    if (!isExamSubmit) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Exam responses will not be saved. Please sign up to save the responses.";
      return "Exam responses will not be saved. Please sign up to save the responses.";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isExamSubmit]);

  const handleBackWithCheck = () => {
    if (isExamSubmit) {
      setShowExitDialog(true);
    } else {
      navigate(searchParams.get("from") === "marketplace" ? "/marketplace" : "/");
    }
  };

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
      options: { emailRedirectTo: `${window.location.origin}${returnTo || "/marketplace"}`, data: { user_type: "student" } },
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
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}${returnTo || "/marketplace"}` } });
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
      const pendingSubmissionsStr = sessionStorage.getItem('pendingExamSubmissions');
      const singleSubmissionStr = sessionStorage.getItem('pendingExamSubmission');
      let pendingSubmissions = [];
      if (pendingSubmissionsStr) {
        try { pendingSubmissions = JSON.parse(pendingSubmissionsStr); } catch (e) { console.error("Error parsing pending submissions", e); }
      }
      if (singleSubmissionStr) {
        try { pendingSubmissions.push(JSON.parse(singleSubmissionStr)); } catch (e) { console.error("Error parsing single submission", e); }
      }
      // No pending mock-exam work: honor returnTo (e.g. back to a live exam) if present.
      if (pendingSubmissions.length === 0) { navigate(returnTo || "/marketplace"); return; }
      setSavingResults(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/marketplace"); return; }
      let lastAttemptId = null;
      for (const submission of pendingSubmissions) {
        lastAttemptId = await saveExamAttempt({ ...submission, userId: user.id });
      }
      sessionStorage.removeItem('pendingExamSubmissions');
      sessionStorage.removeItem('pendingExamSubmission');
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
        verifyCredentials={async () => {
          if (!password) return false;
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          return !error && !!data.session;
        }}
      />
      <ForgotPasswordModal isOpen={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal} defaultEmail={email} />
      <OnboardingModal isOpen={showOnboardingModal} onComplete={handleOnboardingComplete} />

      {/* Back Button */}
      <button onClick={handleBackWithCheck} className="absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/8 transition-all text-sm font-medium">
        <ArrowLeft className="h-4 w-4" />
        {(searchParams.get("from") === "marketplace" || isExamSubmit) ? "Back to Exam Library" : "Back to Home"}
      </button>

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
            <Tabs defaultValue={defaultTab} className="w-full">
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
                  <button type="submit" disabled={loading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold text-sm shadow-lg shadow-[#0EA5E9]/25 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Logging in...</>
                      : "Log In"}
                  </button>
                  {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                    <p className="text-center text-[11px] text-white/25 pt-1">
                      Want to create exams?{" "}
                      <span className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors" onClick={() => navigate("/auth")}>Creator login →</span>
                    </p>
                  )}
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                    <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
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
                  <button type="submit" disabled={loading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-semibold text-sm shadow-lg shadow-[#0EA5E9]/25 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating account...</>
                      : "Create Student Account"}
                  </button>
                  {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                    <p className="text-center text-[11px] text-white/25 pt-1">
                      Want to create exams?{" "}
                      <span className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors" onClick={() => navigate("/auth")}>Creator sign-up →</span>
                    </p>
                  )}
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/20 mt-5">
          By continuing you agree to our{" "}
          <span className="text-white/35 hover:text-white/60 cursor-pointer transition-colors" onClick={() => navigate("/terms")}>Terms</span>
          {" & "}
          <span className="text-white/35 hover:text-white/60 cursor-pointer transition-colors" onClick={() => navigate("/privacy")}>Privacy Policy</span>
        </p>
      </div>
    </div>
  );
};

export default StudentAuth;
