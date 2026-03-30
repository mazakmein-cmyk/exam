import { useEffect, useState, useCallback, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Mail, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface EmailVerificationModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    email: string;
    onVerified: () => void;
    verifyCredentials?: () => Promise<boolean>;
}

const RESEND_COOLDOWN_SECONDS = 30;
const MAX_RESEND_ATTEMPTS = 3;

const EmailVerificationModal = ({
    isOpen,
    onOpenChange,
    email,
    onVerified,
    verifyCredentials,
}: EmailVerificationModalProps) => {
    const [isVerified, setIsVerified] = useState(false);
    const [checking, setChecking] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resendCount, setResendCount] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { toast } = useToast();

    // Cleanup cooldown timer on unmount
    useEffect(() => {
        return () => {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
        };
    }, []);

    const startCooldown = useCallback(() => {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setResendCooldown((prev) => {
                if (prev <= 1) {
                    if (cooldownRef.current) clearInterval(cooldownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const handleFallbackResend = async () => {
        // 3rd attempt: call Edge Function to bypass Resend and use Supabase built-in
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

            const response = await fetch(`${supabaseUrl}/functions/v1/fallback-verify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                    email,
                    redirectTo: `${window.location.origin}/marketplace`,
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || "Fallback delivery failed");
            }

            toast({
                title: "Sent from alternate server!",
                description: "Check all folders including spam.",
            });
        } catch (err: any) {
            console.error("Fallback verify error:", err);
            toast({
                title: "Delivery failed",
                description: "Please contact hey@mocksetu.in for manual verification.",
                variant: "destructive",
            });
        }
    };

    const handleResendEmail = async () => {
        if (resendCooldown > 0 || resending || resendCount >= MAX_RESEND_ATTEMPTS) return;

        setResending(true);
        const currentAttempt = resendCount + 1;

        try {
            if (currentAttempt <= 2) {
                // Attempts 1 & 2: Use Resend via Supabase auth.resend()
                const { error } = await supabase.auth.resend({
                    type: "signup",
                    email,
                });
                if (error) {
                    toast({
                        title: "Failed to resend",
                        description: error.message,
                        variant: "destructive",
                    });
                    setResending(false);
                    return;
                }

                toast({
                    title: currentAttempt === 1
                        ? "Verification email sent!"
                        : "Sent again!",
                    description: currentAttempt === 1
                        ? "Please check your inbox."
                        : "Check your spam folder too.",
                });
            } else {
                // Attempt 3: Fallback via Edge Function (Supabase built-in)
                await handleFallbackResend();
            }

            setResendCount(currentAttempt);
            startCooldown();
        } catch {
            toast({
                title: "Something went wrong",
                description: "Please try again later.",
                variant: "destructive",
            });
        } finally {
            setResending(false);
        }
    };

    const handleManualCheck = async () => {
        setChecking(true);

        if (verifyCredentials) {
            const success = await verifyCredentials();
            if (success) {
                setIsVerified(true);
                setTimeout(() => {
                    onVerified();
                }, 1000);
                setChecking(false);
                return;
            }
        }

        // Force refresh session to get latest data from server
        const { data: { session }, error } = await supabase.auth.refreshSession();

        if (session?.user?.email_confirmed_at) {
            setIsVerified(true);
            setTimeout(() => {
                onVerified();
            }, 1000);
        } else {
            // Fallback: Check user object directly if session refresh didn't update or is null
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email_confirmed_at) {
                setIsVerified(true);
                setTimeout(() => {
                    onVerified();
                }, 1000);
            } else {
                toast({
                    title: "Not verified yet",
                    description: "We haven't detected the verification yet. Please ensure you clicked the link in your email.",
                    variant: "destructive",
                });
            }
        }
        setChecking(false);
    };

    useEffect(() => {
        if (!isOpen || isVerified) return;

        // 1. Listen for Auth State Changes (Cross-tab verification)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session?.user?.email_confirmed_at) {
                    setIsVerified(true);
                    setTimeout(() => {
                        onVerified();
                    }, 2000);
                }
            }
        });

        // 2. Poll for verification status (if session exists or check if session appears)
        const intervalId = setInterval(async () => {
            // Try to refresh session first to get latest claims
            const { data: { session }, error } = await supabase.auth.refreshSession();

            if (session?.user?.email_confirmed_at) {
                setIsVerified(true);
                clearInterval(intervalId);
                setTimeout(() => {
                    onVerified();
                }, 2000);
                return;
            }

            // Fallback to getUser
            const { data: { user } } = await supabase.auth.getUser();

            if (user?.email_confirmed_at) {
                setIsVerified(true);
                clearInterval(intervalId);
                setTimeout(() => {
                    onVerified();
                }, 2000);
            }
        }, 3000);

        return () => {
            clearInterval(intervalId);
            subscription.unsubscribe();
        };
    }, [isOpen, isVerified, onVerified]);

    // Determine button label and style based on state
    const getResendButtonContent = () => {
        if (resending) {
            return { label: "Sending...", icon: true };
        }
        if (resendCooldown > 0) {
            return { label: `Resend in ${resendCooldown}s`, icon: false };
        }
        if (resendCount >= MAX_RESEND_ATTEMPTS) {
            return { label: "Max attempts reached", icon: false };
        }
        if (resendCount === 2) {
            // 3rd attempt ready — different label
            return { label: "Try alternate delivery", icon: true };
        }
        return { label: "Resend verification email", icon: true };
    };

    const { label: resendLabel, icon: showIcon } = getResendButtonContent();
    const isResendDisabled = resending || resendCooldown > 0 || resendCount >= MAX_RESEND_ATTEMPTS;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex flex-col items-center gap-4 text-center">
                        {isVerified ? (
                            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                            </div>
                        ) : (
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Mail className="h-6 w-6 text-primary" />
                            </div>
                        )}
                        <span>{isVerified ? "Email Verified!" : "Verify your email"}</span>
                    </DialogTitle>
                    <DialogDescription className="text-center space-y-2">
                        {isVerified ? (
                            <p>Your email has been successfully verified. Redirecting...</p>
                        ) : (
                            <>
                                <p>
                                    We've sent a verification link to <span className="font-medium text-foreground">{email}</span>
                                </p>
                                <p>
                                    Please check your inbox and click the link to activate your account. This window will update automatically once verified.
                                </p>
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>
                {!isVerified && (
                    <div className="flex flex-col gap-3 mt-4">
                        <Button
                            className="w-full"
                            onClick={handleManualCheck}
                            disabled={checking}
                        >
                            {checking ? "Checking..." : "I've Verified"}
                        </Button>

                        {resendCount < MAX_RESEND_ATTEMPTS ? (
                            <Button
                                variant={resendCount === 2 ? "secondary" : "outline"}
                                size="sm"
                                onClick={handleResendEmail}
                                disabled={isResendDisabled}
                                className="w-full gap-2"
                            >
                                {showIcon && (
                                    <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                                )}
                                {resendLabel}
                            </Button>
                        ) : (
                            /* Max attempts reached — show human escalation */
                            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200/60">
                                <div className="flex items-center gap-2 text-amber-700">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-xs font-medium">Still not receiving?</span>
                                </div>
                                <a
                                    href="mailto:hey@mocksetu.in?subject=Email verification not working&body=Hi, I signed up with this email but can't receive the verification link. Please help."
                                    className="text-xs font-semibold text-primary hover:underline"
                                >
                                    Email us at hey@mocksetu.in
                                </a>
                            </div>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="text-muted-foreground w-full"
                        >
                            Close
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default EmailVerificationModal;
