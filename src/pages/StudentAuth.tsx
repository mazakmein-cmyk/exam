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

const StudentAuth = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const defaultTab = searchParams.get("mode") === "signup" ? "signup" : "signin";
    const isExamSubmit = searchParams.get("trigger") === "exam_submit";

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signUp({
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
            toast({
                title: "Sign up failed",
                description: error.message,
                variant: "destructive",
            });
        } else {
            toast({
                title: "Success!",
                description: "Account created successfully.",
            });
            await handlePendingExamSubmission();
        }
        setLoading(false);
    };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
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
            toast({
                title: "Welcome back!",
                description: "Signed in successfully.",
            });
            await handlePendingExamSubmission();
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
            {/* Back Button */}
            <Button
                variant="ghost"
                onClick={() => navigate((searchParams.get("from") === "marketplace" || isExamSubmit) ? "/marketplace" : "/")}
                className="absolute top-6 left-6 text-foreground hover:bg-white/20"
            >
                <ArrowLeft className="h-5 w-5 mr-2" />
                {(searchParams.get("from") === "marketplace" || isExamSubmit) ? "Back to Marketplace" : "Back to Home"}
            </Button>

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
