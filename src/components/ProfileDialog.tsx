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
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { User, GraduationCap, PenLine } from "lucide-react";
import { VerifiedSeal } from "@/components/VerifiedBadge";
import { getVerificationTier } from "@/lib/verification";

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
    // Legacy accounts carry no user_type — the rest of the app reads those as
    // creators (use-user-role.ts, examAccess.ts), so this must match.
    const [userType, setUserType] = useState<"student" | "creator">("creator");
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState({ full_name: "", phone_number: "" });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchProfile();
            setIsEditing(false);
        }
    }, [isOpen]);

    const fetchProfile = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            setEmail(user.email);
            setUserType(user.user_metadata?.user_type === "student" ? "student" : "creator");

            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            setProfile(data);
            setEditedProfile({
                full_name: data?.full_name || "",
                phone_number: data?.phone_number || ""
            });
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No user found");

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: editedProfile.full_name,
                    phone_number: editedProfile.phone_number,
                })
                .eq('id', user.id);

            if (error) throw error;

            // Refresh profile data
            setProfile({ ...profile, ...editedProfile });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating profile:", error);
        } finally {
            setSaving(false);
        }
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
                            {isEditing ? (
                                <div className="col-span-3">
                                    <Input
                                        value={editedProfile.full_name}
                                        onChange={(e) => setEditedProfile({ ...editedProfile, full_name: e.target.value })}
                                        placeholder="Enter full name"
                                    />
                                </div>
                            ) : (
                                <span className="text-sm font-semibold col-span-3">{profile?.full_name || "N/A"}</span>
                            )}
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Role:</span>
                            <div className="col-span-3 flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${userType === "student"
                                    ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                                    : "bg-purple-50 text-purple-700 ring-purple-600/20"
                                    }`}>
                                    {userType === "student"
                                        ? <GraduationCap className="h-3.5 w-3.5" />
                                        : <PenLine className="h-3.5 w-3.5" />}
                                    {userType === "student" ? "Student" : "Creator"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {userType === "student" ? "Takes exams" : "Creates exams"}
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">User ID:</span>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded col-span-3 flex items-center gap-1.5">
                                {profile?.username || "N/A"}
                                {(() => {
                                    const tier = getVerificationTier({ email, is_admin_gold: profile?.is_admin_gold, is_verified: profile?.is_verified });
                                    return tier && <VerifiedSeal size={15} tier={tier} />;
                                })()}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Email:</span>
                            <span className="text-sm col-span-3 truncate">{email}</span>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-sm font-medium text-muted-foreground col-span-1">Phone:</span>
                            {isEditing ? (
                                <div className="col-span-3">
                                    <Input
                                        value={editedProfile.phone_number}
                                        onChange={(e) => setEditedProfile({ ...editedProfile, phone_number: e.target.value })}
                                        placeholder="Enter phone number"
                                    />
                                </div>
                            ) : (
                                <span className="text-sm col-span-3">{profile?.phone_number || "Not set"}</span>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter className="sm:justify-end gap-2">
                    {isEditing ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditedProfile({
                                        full_name: profile?.full_name || "",
                                        phone_number: profile?.phone_number || ""
                                    });
                                }}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
                                Edit Profile
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                                Close
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProfileDialog;
