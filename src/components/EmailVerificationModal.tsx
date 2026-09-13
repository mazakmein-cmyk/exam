import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Mail, CheckCircle2, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
    lookupMailProvider,
    mailProviderForEmail,
    VERIFICATION_SENDER,
    type MailProvider,
} from "@/lib/mailProvider";

interface EmailVerificationModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    email: string;
    onVerified: () => void;
    verifyCredentials?: () => Promise<boolean>;
    /**
     * Wrong address typed at signup — the most common reason this modal never
     * resolves. Optional: the button only renders where a caller can actually
     * take the user back to the form.
     */
    onUseDifferentEmail?: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;
const MAX_RESEND_ATTEMPTS = 3;

const EmailVerificationModal = ({
    isOpen,
    onOpenChange,
    email,
    onVerified,
    verifyCredentials,
    onUseDifferentEmail,
}: EmailVerificationModalProps) => {
    const [isVerified, setIsVerified] = useState(false);
    const [checking, setChecking] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [resendCount, setResendCount] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { toast } = useToast();

    // "Open mail". Known domains resolve synchronously with no network at all,
    // so the button is on screen in the first paint for almost every user; only
    // a custom domain falls through to the MX lookup below.
    const knownProvider = useMemo(() => mailProviderForEmail(email), [email]);
    const [resolvedProvider, setResolvedProvider] = useState<MailProvider | null>(null);
    const mailProvider = knownProvider ?? resolvedProvider;

    useEffect(() => {
        // Resolving here rather than in the click handler is deliberate: an
        // await between the click and window.open loses the user-gesture and
        // gets popup-blocked. With the URL ready up front the button can be a
        // plain <a>, which no blocker touches and Cmd+click opens in a tab.
        if (!isOpen || isVerified || knownProvider) {
            // A previous email's answer must not survive an edit.
            setResolvedProvider(null);
            return;
        }

        let cancelled = false;
        lookupMailProvider(email).then((provider) => {
            if (!cancelled) setResolvedProvider(provider);
        });

        return () => {
            cancelled = true;
        };
    }, [isOpen, isVerified, knownProvider, email]);

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
                    redirectTo: `${window.location.origin}/verified`,
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
                    // Without this the link falls back to the Supabase Site URL
                    // (the homepage). Every confirmation link lands on /verified.
                    options: { emailRedirectTo: `${window.location.origin}/verified` },
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
                        {mailProvider && (
                            /* A real anchor rather than a button that calls
                               window.open: popup blockers leave a plain new-tab
                               link alone, and Cmd/Ctrl+click keeps the signup tab
                               open — which matters, because that tab is the one
                               polling for the verification and showing the
                               success state. */
                            <Button asChild className="w-full">
                                <a
                                    href={mailProvider.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={
                                        mailProvider.filtered
                                            ? `Opens your mailbox with a search for ${VERIFICATION_SENDER}, including Spam`
                                            : "Opens your mailbox in a new tab"
                                    }
                                >
                                    <Mail className="h-4 w-4" />
                                    {mailProvider.label}
                                    <ExternalLink className="h-4 w-4 opacity-70" />
                                </a>
                            </Button>
                        )}

                        <Button
                            variant={mailProvider ? "secondary" : "default"}
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

                        <div className="flex items-center justify-center gap-1">
                            {onUseDifferentEmail && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={onUseDifferentEmail}
                                        className="text-muted-foreground"
                                    >
                                        Try a different email
                                    </Button>
                                    <span aria-hidden className="text-muted-foreground/40">·</span>
                                </>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                                className={`text-muted-foreground ${onUseDifferentEmail ? "" : "w-full"}`}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default EmailVerificationModal;
