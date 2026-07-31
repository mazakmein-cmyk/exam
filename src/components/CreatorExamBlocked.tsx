/**
 * CreatorExamBlocked — the one screen a creator sees when they land on an exam
 * they aren't allowed to sit (i.e. any exam that isn't their own).
 *
 * Shared by the mock intro, the mock simulator and the live student view so the
 * wording and the way out are identical wherever the block happens.
 */

import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CREATOR_BLOCKED_MESSAGE, CREATOR_BLOCKED_TITLE } from "@/lib/examAccess";

type Props = {
    /** Where "Back" goes. Defaults to the creator dashboard. */
    backTo?: string;
    backLabel?: string;
};

const CreatorExamBlocked = ({ backTo = "/dashboard", backLabel = "Back to Dashboard" }: Props) => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card shadow-xl overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-[#6C3EF4] via-[#8B5CF6] to-[#A855F7]" />
                <div className="p-7 space-y-5 text-center">
                    <div className="mx-auto h-12 w-12 rounded-2xl bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 flex items-center justify-center">
                        <Lock className="h-5 w-5 text-[#A855F7]" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-xl font-bold text-foreground">{CREATOR_BLOCKED_TITLE}</h1>
                        <p className="text-sm text-muted-foreground leading-relaxed">{CREATOR_BLOCKED_MESSAGE}</p>
                    </div>
                    <Button className="w-full" onClick={() => navigate(backTo)}>
                        {backLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CreatorExamBlocked;
