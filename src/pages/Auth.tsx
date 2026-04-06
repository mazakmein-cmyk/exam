import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

import EmailVerificationModal from "@/components/EmailVerificationModal";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import UpdatePasswordModal from "@/components/UpdatePasswordModal";
import OnboardingModal from "@/components/OnboardingModal";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showUpdatePasswordModal, setShowUpdatePasswordModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (session.user.user_metadata?.user_type === 'creator') {
          navigate("/dashboard");
        }
      }
    };
    checkUser();
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setShowUpdatePasswordModal(true);
      } else if (event === "SIGNED_IN" && session) {
        if (session.user.user_metadata?.user_type === 'creator') {
          navigate("/dashboard");
        }
      }
    });
  }, [navigate]);

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
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { user_type: "creator" } },
    });
    if (error) {
      if (error.message.includes("already registered") || error.message.includes("User already exists")) {
        toast({ title: "Account already exists", description: "Please sign in instead." });
      } else {
        toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      }
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (!signInError && signInData.user) {
        toast({ title: "Account already exists", description: "Please sign in to your account." });
      } else if (signInError && signInError.message.includes("Email not confirmed")) {
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/dashboard` } });
        if (resendError) {
          toast({ title: "Account already exists", description: "Please sign in instead." });
        } else {
          toast({ title: "Account exists", description: "We've resent the verification email. Please check your inbox." });
          setShowVerificationModal(true);
        }
      } else {
        toast({ title: "Account already exists", description: "Please sign in instead." });
      }
    } else {
      setShowVerificationModal(true);
    }
    setLoading(false);
  };

  const handleVerificationComplete = () => {
    setShowVerificationModal(false);
    toast({ title: "Success!", description: "Account verified successfully." });
    checkProfileAndRedirect();
  };

  const checkProfileAndRedirect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) {
      setShowOnboardingModal(true);
    } else {
      const hasPendingUpload = sessionStorage.getItem('pendingPdfUpload');
      navigate(hasPendingUpload ? "/" : "/dashboard");
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboardingModal(false);
    const hasPendingUpload = sessionStorage.getItem('pendingPdfUpload');
    navigate(hasPendingUpload ? "/" : "/dashboard");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message === "Invalid login credentials") {
        toast({ title: "Account not found", description: "No account exists with these credentials. Please sign up to create one.", variant: "destructive" });
      } else {
        toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      }
    } else {
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        toast({ title: "Verification required", description: "Please verify your email before signing in.", variant: "destructive" });
        setLoading(false);
        return;
      }
      const userType = data.user?.user_metadata?.user_type;
      if (userType === "student") {
        await supabase.auth.signOut();
        toast({ title: "Wrong account type", description: "This is a student account. Please sign in from the Student sign-in page.", variant: "destructive" });
      } else {
        toast({ title: "Welcome back!", description: "Signed in successfully." });
        checkProfileAndRedirect();
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Deep gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0618] via-[#110d2a] to-[#0d1a33]" />
      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#6C3EF4]/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-[#A855F7]/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />

      {/* Modals */}
      <EmailVerificationModal isOpen={showVerificationModal} onOpenChange={setShowVerificationModal} email={email} onVerified={handleVerificationComplete}
        verifyCredentials={async () => {
          if (!password) return false;
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          return !error && !!data.session;
        }}
      />
      <ForgotPasswordModal isOpen={showForgotPasswordModal} onOpenChange={setShowForgotPasswordModal} defaultEmail={email} redirectTo="/auth" />
      <UpdatePasswordModal isOpen={showUpdatePasswordModal} onOpenChange={setShowUpdatePasswordModal} />
      <OnboardingModal isOpen={showOnboardingModal} onComplete={handleOnboardingComplete} />

      {/* Back Button */}
      <button onClick={() => navigate("/")} className="absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/8 transition-all text-sm font-medium">
        <ArrowLeft className="h-4 w-4" />Back to Home
      </button>

      <div className="relative z-10 w-full max-w-[420px]">
        {/* Brand identity */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/30 to-[#A855F7]/20 border border-white/10 flex items-center justify-center shadow-xl shadow-[#6C3EF4]/20 mb-1">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="auth-g" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6C3EF4" /><stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
              <path d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22" stroke="url(#auth-g)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22" stroke="url(#auth-g)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-[-0.02em] text-white">
            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
          </span>
          <span className="text-xs font-semibold text-white/30 tracking-widest uppercase">Creator Portal</span>
        </div>

        {/* Glass Card */}
        <div className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#6C3EF4]/50 to-transparent" />
          <div className="p-7">
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 mb-6 h-10">
                <TabsTrigger value="signin" className="rounded-lg text-[13px] font-medium text-white/40 data-[state=active]:bg-[#6C3EF4] data-[state=active]:text-white transition-all duration-200 h-8">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-[13px] font-medium text-white/40 data-[state=active]:bg-[#6C3EF4] data-[state=active]:text-white transition-all duration-200 h-8">Create Account</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="mt-0">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                    <Input id="signin-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Password</Label>
                      <button type="button" onClick={() => setShowForgotPasswordModal(true)} className="text-[11px] text-[#A855F7]/80 hover:text-[#A855F7] transition-colors">Forgot?</button>
                    </div>
                    <Input id="signin-password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-sm shadow-lg shadow-[#6C3EF4]/30 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in...</>
                      : "Sign In to Dashboard"}
                  </button>
                  <p className="text-center text-[11px] text-white/25 pt-1">
                    Taking exams?{" "}
                    <span className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors" onClick={() => navigate("/student-auth?mode=signin")}>Student login →</span>
                  </p>
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Email</Label>
                    <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Password</Label>
                    <Input id="signup-password" type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-confirm-password" className="text-white/60 text-xs font-semibold tracking-wide uppercase">Confirm Password</Label>
                    <Input id="signup-confirm-password" type="password" placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
                      className="bg-white/[0.05] border-white/[0.09] text-white placeholder:text-white/20 focus-visible:border-[#6C3EF4]/60 focus-visible:ring-[#6C3EF4]/15 rounded-xl h-11" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full h-11 mt-2 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-sm shadow-lg shadow-[#6C3EF4]/30 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {loading
                      ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating account...</>
                      : "Create Creator Account"}
                  </button>
                  <p className="text-center text-[11px] text-white/25 pt-1">
                    Taking exams?{" "}
                    <span className="text-[#A855F7]/70 hover:text-[#A855F7] cursor-pointer transition-colors" onClick={() => navigate("/student-auth?mode=signup")}>Student sign-up →</span>
                  </p>
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

export default Auth;
