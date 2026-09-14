/**
 * SetPasswordModal — gives a Google account a second way in.
 *
 * SEMI-BLOCKING, NOT BLOCKING. OnboardingModal hides its close button and eats
 * both Escape and outside-clicks, because the app genuinely cannot function
 * without a profile row. This one can be dismissed: a Google account already
 * works, and the single most likely moment to see this dialog is immediately
 * after a 90-minute paper, where standing between the student and their result
 * would be indefensible. Outside-clicks are still swallowed so it is not
 * dismissed by accident, but Escape, the X and an explicit "Skip for now" all
 * work — and skipping lasts for the session, so it is offered again next visit
 * and any time from User Profile.
 *
 * ONE WRITE. `updateUser({ password, data })` sets the password and records the
 * flag in the same request, so there is no window where one landed and the other
 * did not. user_metadata is spread back in because user_type lives there too and
 * every RLS policy reads it — see googleAuth.ts.
 *
 * REAUTHENTICATION. If the project has Supabase's "Secure password change" turned
 * on, GoTrue refuses the update with reauthentication_needed and wants a nonce
 * from a 6-digit code it emails. That setting is off by default, so most projects
 * never see this branch — but without it the dialog would simply fail with an
 * opaque error and no way forward, so the code path exists.
 */

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { skipPasswordPrompt } from "@/lib/passwordSetup";
import { Eye, EyeOff, KeyRound } from "lucide-react";

interface SetPasswordModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    /** Password saved. The caller stops offering it. */
    onComplete?: () => void;
    /** Dismissed. Session-scoped, so it comes back next visit. */
    onSkip?: () => void;
    /** Hide the skip affordances — used from User Profile, where it is opt-in already. */
    required?: boolean;
}

const MIN_LENGTH = 6;

const SetPasswordModal = ({
    isOpen,
    onOpenChange,
    onComplete,
    onSkip,
    required = false,
}: SetPasswordModalProps) => {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    // Only ever set when the project enforces "Secure password change".
    const [needsCode, setNeedsCode] = useState(false);
    const [code, setCode] = useState("");
    const { toast } = useToast();

    const handleSkip = () => {
        // Only an unprompted dismissal counts as "not now". Opened deliberately
        // from User Profile, closing it is just closing it — writing the
        // session-wide skip there would suppress the real prompt later on, one
        // the user has not seen and did not decline.
        if (!required) skipPasswordPrompt();
        onOpenChange(false);
        onSkip?.();
    };

    const save = async (nonce?: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast({ title: "Not signed in", description: "Please log in again.", variant: "destructive" });
            return;
        }

        const { error } = await supabase.auth.updateUser({
            password,
            // Spread so user_type — which the RLS policies read — cannot be lost.
            data: { ...user.user_metadata, password_set: true },
            ...(nonce ? { nonce } : {}),
        });

        if (!error) {
            toast({
                title: "Password set",
                description: "You can now log in with your email and password, or with Google.",
            });
            setPassword("");
            setConfirmPassword("");
            setCode("");
            setNeedsCode(false);
            onOpenChange(false);
            onComplete?.();
            return;
        }

        if (error.code === "reauthentication_needed" || error.code === "reauth_nonce_missing") {
            const { error: reauthError } = await supabase.auth.reauthenticate();
            if (reauthError) {
                toast({ title: "Couldn't verify it's you", description: reauthError.message, variant: "destructive" });
                return;
            }
            setNeedsCode(true);
            toast({
                title: "Check your email",
                description: "We've sent a 6-digit code to confirm this change.",
            });
            return;
        }

        toast({ title: "Couldn't set password", description: error.message, variant: "destructive" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast({
                title: "Passwords do not match",
                description: "Please make sure your passwords match.",
                variant: "destructive",
            });
            return;
        }
        setLoading(true);
        try {
            await save(needsCode ? code : undefined);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : handleSkip())}>
            <DialogContent
                className="sm:max-w-md"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5" />
                        Set a password
                    </DialogTitle>
                    <DialogDescription>
                        You signed in with Google. Add a password so you can also log in with your
                        email address — useful on a shared computer, or anywhere Google sign-in
                        isn't available.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="set-password">New Password</Label>
                        <div className="relative">
                            <Input
                                id="set-password"
                                type={showPassword ? "text" : "password"}
                                placeholder={`Min. ${MIN_LENGTH} characters`}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={MIN_LENGTH}
                                autoFocus
                                className="pr-11"
                            />
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="set-password-confirm">Confirm Password</Label>
                        <Input
                            id="set-password-confirm"
                            type={showPassword ? "text" : "password"}
                            placeholder="Re-enter password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={MIN_LENGTH}
                        />
                    </div>

                    {needsCode && (
                        <div className="space-y-2">
                            <Label htmlFor="set-password-code">Confirmation code</Label>
                            <Input
                                id="set-password-code"
                                inputMode="numeric"
                                placeholder="6-digit code from your email"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                This project confirms password changes by email.
                            </p>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:justify-end">
                        {!required && (
                            <Button type="button" variant="ghost" onClick={handleSkip} disabled={loading}>
                                Skip for now
                            </Button>
                        )}
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Set Password"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default SetPasswordModal;
