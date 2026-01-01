import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { User } from "lucide-react";

interface ProfileDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const ProfileDialog = ({
    isOpen,
    onOpenChange,
}: ProfileDialogProps) => {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<any>(null);
    const [email, setEmail] = useState<string | undefined>("");

    useEffect(() => {
        if (isOpen) {
            fetchProfile();
        }
    }, [isOpen]);

    const fetchProfile = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            setEmail(user.email);

            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            setProfile(data);
        }
        setLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        User Profile
                    </DialogTitle>
                    <DialogDescription>
                        Your account details.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-6 text-center text-muted-foreground">Loading profile...</div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Full Name:</span>
                            <span className="text-sm font-semibold col-span-3">{profile?.full_name || "N/A"}</span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">User ID:</span>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded col-span-3">
                                {profile?.username || "N/A"}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Email:</span>
                            <span className="text-sm col-span-3 truncate">{email}</span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Phone:</span>
                            <span className="text-sm col-span-3">{profile?.phone_number || "Not set"}</span>
                        </div>
                    </div>
                )}

                <DialogFooter className="sm:justify-end">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProfileDialog;
