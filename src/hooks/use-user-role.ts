import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "student" | "creator" | null;

export const useUserRole = () => {
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    setLoading(false);
                    return;
                }

                const userType = user.user_metadata?.user_type as UserRole;
                // Default to creator if undefined (legacy users)
                const effectiveRole = userType || "creator";

                setRole(effectiveRole);

                // Handle Redirections
                if (effectiveRole === "student") {
                    // Students shouldn't be on Dashboard
                    if (location.pathname.startsWith("/dashboard")) {
                        navigate("/marketplace");
                    }
                } else {
                    // Creators (or legacy) shouldn't be on Marketplace? 
                    // User said "cannot do all the stuff that students can like giving exams in marketplace or acessing marketplace all together"
                    if (location.pathname.startsWith("/marketplace")) {
                        navigate("/dashboard");
                    }
                }
            } catch (error) {
                console.error("Error checking user role:", error);
            } finally {
                setLoading(false);
            }
        };

        checkUser();

        // Subscribe to auth changes to re-run
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            checkUser();
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [navigate, location.pathname]);

    return { role, loading };
};
