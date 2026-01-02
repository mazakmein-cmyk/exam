import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, ArrowLeft } from "lucide-react";

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
        // If already logged in, redirect to dashboard
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
      toast({
        title: "Passwords do not match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          user_type: "creator",
        },
      },
    });

    if (error) {
      if (error.message.includes("already registered") || error.message.includes("User already exists")) {
        toast({
          title: "Account already exists",
          description: "Please sign in instead.",
        });
      } else {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
      // User exists. Check status.
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!signInError && signInData.user) {
        // User exists, is verified, and password is correct.
        // Do NOT log them in automatically from the signup tab.
        // Do NOT show verification modal.
        toast({
          title: "Account already exists",
          description: "Please sign in to your account.",
        });
        // Optional: Switch to sign in tab? For now just toast.
      } else if (signInError && signInError.message.includes("Email not confirmed")) {
        // User exists but is not verified. 
        // Resend verification and SHOW modal.
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (resendError) {
          toast({
            title: "Account already exists",
            description: "Please sign in instead.",
          });
        } else {
          toast({
            title: "Account exists",
            description: "We've resent the verification email. Please check your inbox.",
          });
          setShowVerificationModal(true);
        }
      } else {
        // User exists but password wrong or other error.
        toast({
          title: "Account already exists",
          description: "Please sign in instead.",
        });
      }
    } else {
      // New user created successfully
      setShowVerificationModal(true);
    }
    setLoading(false);
  };

  const handleVerificationComplete = () => {
    setShowVerificationModal(false);
    toast({
      title: "Success!",
      description: "Account verified successfully.",
    });
    // Check if there's a pending PDF upload
    const hasPendingUpload = sessionStorage.getItem('pendingPdfUpload');
    setShowVerificationModal(false);
    toast({
      title: "Success!",
      description: "Account verified successfully.",
    });
    // After verification, check for profile and show onboarding if needed
    checkProfileAndRedirect();
  };

  const checkProfileAndRedirect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      setShowOnboardingModal(true);
    } else {
      // Check if there's a pending PDF upload
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      // Check for email verification strictly
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        toast({
          title: "Verification required",
          description: "Please verify your email before signing in.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      console.log("Sign in successful. User data:", data.user);
      console.log("User metadata:", data.user?.user_metadata);

      // Check if user is a student trying to sign in to creator page
      const userType = data.user?.user_metadata?.user_type;
      console.log("Detected user type:", userType);

      if (userType === "student") {
        await supabase.auth.signOut();
        toast({
          title: "Wrong account type",
          description: "This is a student account. Please sign in from the Student sign-in page.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "Signed in successfully.",
        });
        // Check if there's a pending PDF upload
        checkProfileAndRedirect();
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-6 relative">
      <EmailVerificationModal
        isOpen={showVerificationModal}
        onOpenChange={setShowVerificationModal}
        email={email}
        onVerified={handleVerificationComplete}
        verifyCredentials={async () => {
          if (!password) return false;
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error || !data.session) return false;
          return true;
        }}
      />
      <ForgotPasswordModal
        isOpen={showForgotPasswordModal}
        onOpenChange={setShowForgotPasswordModal}
        defaultEmail={email}
        redirectTo="/auth"
      />
      <UpdatePasswordModal
        isOpen={showUpdatePasswordModal}
        onOpenChange={setShowUpdatePasswordModal}
      />
      <OnboardingModal
        isOpen={showOnboardingModal}
        onComplete={handleOnboardingComplete}
      />
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 text-foreground hover:bg-white/20"
      >
        <ArrowLeft className="h-5 w-5 mr-2" />
        Back to Home
      </Button>

      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8 space-x-2">
          <FileText className="h-8 w-8 text-primary" />
          <span className="text-3xl font-bold text-foreground">ExamSim</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or create an account to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                  <div className="text-center mt-2">
                    <Button
                      variant="link"
                      className="text-xs text-muted-foreground p-0 h-auto font-normal"
                      onClick={() => setShowForgotPasswordModal(true)}
                      type="button"
                    >
                      Forgot your password?
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Want to take exams?{" "}
                    <span
                      className="text-primary hover:underline cursor-pointer"
                      onClick={() => navigate("/student-auth?mode=signin")}
                    >
                      Sign in as Student
                    </span>
                  </p>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Want to take exams?{" "}
                    <span
                      className="text-primary hover:underline cursor-pointer"
                      onClick={() => navigate("/student-auth?mode=signup")}
                    >
                      Sign up as Student
                    </span>
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
