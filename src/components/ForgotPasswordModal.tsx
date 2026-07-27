import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ForgotPasswordModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    defaultEmail?: string;
}

const ForgotPasswordModal = ({
    isOpen,
    onOpenChange,
    defaultEmail = "",
}: ForgotPasswordModalProps) => {
    const [email, setEmail] = useState(defaultEmail);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // All reset links land on the dedicated page, which handles the
        // recovery token, expired links, and routing back to the right portal.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } else {
            toast({
                title: "Check your email",
                description: "We've sent you a password reset link.",
            });
            onOpenChange(false);
        }
        setLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                    <DialogDescription>
                        Enter your email address and we'll send you a link to reset your password.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="reset-email">Email</Label>
                        <Input
                            id="reset-email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Sending link..." : "Send Reset Link"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default ForgotPasswordModal;
