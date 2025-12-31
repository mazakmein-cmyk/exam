import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface EmailVerificationModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    email: string;
    onVerified: () => void;
}

const EmailVerificationModal = ({
    isOpen,
    onOpenChange,
    email,
    onVerified,
}: EmailVerificationModalProps) => {
    const [isVerified, setIsVerified] = useState(false);
    const [checking, setChecking] = useState(false);
    const { toast } = useToast();

    const handleManualCheck = async () => {
        setChecking(true);
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
            setChecking(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (user?.email_confirmed_at) {
                setIsVerified(true);
                clearInterval(intervalId);
                setTimeout(() => {
                    onVerified();
                }, 2000);
            }
            setChecking(false);
        }, 3000);

        return () => {
            clearInterval(intervalId);
            subscription.unsubscribe();
        };
    }, [isOpen, isVerified, onVerified]);

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
