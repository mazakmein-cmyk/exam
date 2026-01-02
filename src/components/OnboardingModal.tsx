import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OnboardingModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

const OnboardingModal = ({
    isOpen,
    onComplete,
}: OnboardingModalProps) => {
    const [fullName, setFullName] = useState("");
    const [username, setUsername] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    // Prevent closing by clicking outside or pressing escape
    const handleInteractOutside = (e: Event) => {
        e.preventDefault();
    };

    const handleEscapeKeyDown = (e: KeyboardEvent) => {
        e.preventDefault();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            toast({
                title: "Error",
                description: "User not authenticated.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        // Validate username format (simple alphanumeric check)
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            toast({
                title: "Invalid Username",
                description: "Username can only contain letters, numbers, and underscores.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        // Validate phone number (simple 10 digit check)
        if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
            toast({
                title: "Invalid Phone Number",
                description: "Phone number must be exactly 10 digits.",
                variant: "destructive",
            });
            setLoading(false);
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .insert({
                id: user.id,
                full_name: fullName,
                username: username,
                phone_number: phoneNumber || null,
            });

        if (error) {
            if (error.code === '23505') { // Unique violation
                toast({
                    title: "Username taken",
                    description: "This username is already taken. Please choose another one.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Error",
                    description: error.message,
                    variant: "destructive",
                });
            }
        } else {
            toast({
                title: "Profile created",
                description: "Welcome to ExamSim!",
            });
            onComplete();
        }
        setLoading(false);
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent
                className="sm:max-w-md [&>button]:hidden"
                onInteractOutside={handleInteractOutside}
                onEscapeKeyDown={handleEscapeKeyDown}
            >
                <DialogHeader>
                    <DialogTitle>Complete Your Profile</DialogTitle>
                    <DialogDescription>
                        Please provide your details to get started. These fields are required.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="fullname">Full Name <span className="text-destructive">*</span></Label>
                        <Input
                            id="fullname"
                            placeholder="John Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="username">Unique User ID <span className="text-destructive">*</span></Label>
                        <Input
                            id="username"
                            placeholder="john_doe_123"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            minLength={3}
                        />
                        <p className="text-xs text-muted-foreground">This will be your unique handle.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number (10 digits)</Label>
                        <Input
                            id="phone"
                            placeholder="0123456789"
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Creating Profile..." : "Complete Setup"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default OnboardingModal;
