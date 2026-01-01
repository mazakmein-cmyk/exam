import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { saveExamAttempt, ExamSubmissionData } from "@/services/examService";
import EmailVerificationModal from "@/components/EmailVerificationModal";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import UpdatePasswordModal from "@/components/UpdatePasswordModal";
import OnboardingModal from "@/components/OnboardingModal";
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
    const [loading, setLoading] = useState(false);
    const [showVerificationModal, setShowVerificationModal] = useState(false);
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [showUpdatePasswordModal, setShowUpdatePasswordModal] = useState(false);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const defaultTab = searchParams.get("mode") === "signup" ? "signup" : "signin";
    const isExamSubmit = searchParams.get("trigger") === "exam_submit";
    const [showExitDialog, setShowExitDialog] = useState(false);

    useEffect(() => {
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "PASSWORD_RECOVERY") {
                setShowUpdatePasswordModal(true);
            }
        });
    }, []);

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
                emailRedirectTo: `${window.location.origin}/marketplace`,
                data: {
                    user_type: "student",
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
                // User verified and password correct
                // Do NOT log them in automatically from the signup tab.
                // Do NOT show verification modal.
                toast({
                    title: "Account already exists",
                    description: "Please sign in to your account.",
                });
            } else if (signInError && signInError.message.includes("Email not confirmed")) {
                // User exists but not verified. Resend verification.
                const { error: resendError } = await supabase.auth.resend({
                    type: 'signup',
                    email,
                    options: {
                        emailRedirectTo: `${window.location.origin}/marketplace`,
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
                // User exists, password wrong or other error
                toast({
                    title: "Account already exists",
                    description: "Please sign in instead.",
                });
            }
        } else {
            // New user created, or existing user found and needs verification.
            // Show verification modal for newly created users.
            setShowVerificationModal(true);
        }
        setLoading(false);
    };

    const handleVerificationComplete = async () => {
        setShowVerificationModal(false);
        toast({
            title: "Success!",
            description: "Account verified successfully.",
        });
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

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            toast({
                title: "Sign in failed",
                description: signInError.message,
                variant: "destructive",
            });
        } else {
            // Fetch fresh user data to ensure we have the latest metadata
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) {
                toast({
                    title: "Error",
                    description: "Failed to fetch user profile.",
                    variant: "destructive",
                });
                setLoading(false);
                return;
            }

            // Strict verification check
            if (!user.email_confirmed_at) {
                await supabase.auth.signOut();
                toast({
                    title: "Verification required",
                    description: "Please verify your email before signing in.",
                    variant: "destructive",
                });
                setLoading(false);
                return;
            }

            console.log("Student Sign in successful. User data:", user);
            console.log("User metadata:", user.user_metadata);

            // Check if user is a creator trying to sign in to student page
            const userType = user.user_metadata?.user_type;
            console.log("Detected user type:", userType);

            if (userType === "creator") {
                await supabase.auth.signOut();
                toast({
                    title: "Wrong account type",
                    description: "This is a creator account. Please sign in from the Creator sign-in page.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Welcome back!",
                    description: "Signed in successfully.",
                });
                checkProfileAndRedirect();
            }
        }
        setLoading(false);
    };

    const handlePendingExamSubmission = async () => {
        const pendingSubmissionsStr = sessionStorage.getItem('pendingExamSubmissions');
        // Legacy support
        const singleSubmissionStr = sessionStorage.getItem('pendingExamSubmission');

        let pendingSubmissions = [];
        if (pendingSubmissionsStr) {
            try {
                pendingSubmissions = JSON.parse(pendingSubmissionsStr);
            } catch (e) {
                console.error("Error parsing pending submissions", e);
            }
        }
        if (singleSubmissionStr) {
            try {
                pendingSubmissions.push(JSON.parse(singleSubmissionStr));
            } catch (e) {
                console.error("Error parsing single submission", e);
            }
        }

        if (pendingSubmissions.length === 0) {
            navigate("/marketplace");
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                navigate("/marketplace");
                return;
            }

            let lastAttemptId = null;

            for (const submission of pendingSubmissions) {
                lastAttemptId = await saveExamAttempt({
                    ...submission,
                    userId: user.id,
                });
            }

            sessionStorage.removeItem('pendingExamSubmissions');
            sessionStorage.removeItem('pendingExamSubmission');

            toast({
                title: "Exams Submitted",
                description: `Successfully saved ${pendingSubmissions.length} section(s).`,
            });

            if (lastAttemptId) {
                navigate(`/exam/review/${lastAttemptId}`);
            } else {
                navigate("/marketplace");
            }
        } catch (error) {
            console.error("Error saving pending exam:", error);
            toast({
                title: "Error",
                description: "Failed to save your exam attempt.",
                variant: "destructive",
            });
            navigate("/marketplace");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-6 relative">
            <EmailVerificationModal
                isOpen={showVerificationModal}
                onOpenChange={setShowVerificationModal}
                email={email}
                onVerified={handleVerificationComplete}
            />
            <ForgotPasswordModal
                isOpen={showForgotPasswordModal}
                onOpenChange={setShowForgotPasswordModal}
                defaultEmail={email}
                redirectTo="/student-auth"
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
                onClick={handleBackWithCheck}
                className="absolute top-6 left-6 text-foreground hover:bg-white/20"
            >
                <ArrowLeft className="h-5 w-5 mr-2" />
                {(searchParams.get("from") === "marketplace" || isExamSubmit) ? "Back to Marketplace" : "Back to Home"}
            </Button>

            <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Exam responses will not be saved. Please sign up to save the responses.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => navigate("/marketplace")}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Leave & Discard
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div className="w-full max-w-md">
                <div className="flex items-center justify-center mb-8 space-x-2">
                    <GraduationCap className="h-8 w-8 text-primary" />
                    <span className="text-3xl font-bold text-foreground">Student Portal</span>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>{isExamSubmit ? "Save Your Results" : "Student Access"}</CardTitle>
                        <CardDescription>
                            {isExamSubmit
                                ? "To check your results, please sign in or sign up below"
                                : "Sign in or create a student account to access exams from the marketplace"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue={defaultTab} className="w-full">
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
                                    {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                                        <p className="text-center text-sm text-muted-foreground mt-4">
                                            Want to create exams?{" "}
                                            <span
                                                className="text-primary hover:underline cursor-pointer"
                                                onClick={() => navigate("/auth")}
                                            >
                                                Sign in as Creator
                                            </span>
                                        </p>
                                    )}
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
                                    {searchParams.get("from") !== "marketplace" && !isExamSubmit && (
                                        <p className="text-center text-sm text-muted-foreground mt-4">
                                            Want to create exams?{" "}
                                            <span
                                                className="text-primary hover:underline cursor-pointer"
                                                onClick={() => navigate("/auth")}
                                            >
                                                Sign up as Creator
                                            </span>
                                        </p>
                                    )}
                                </form>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default StudentAuth;
