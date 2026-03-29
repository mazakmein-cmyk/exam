import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "student" | "creator" | null;

export const useUserRole = () => {
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

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

                // Read current path dynamically at redirect time (not captured in closure)
                // This matches the pattern already used in AuthStateListener.tsx
                const currentPath = window.location.pathname;

                // Handle Redirections
                if (effectiveRole === "student") {
                    // Students shouldn't be on Dashboard
                    if (currentPath.startsWith("/dashboard")) {
                        navigate("/marketplace");
                    }
                } else {
                    // Creators (or legacy) shouldn't be on Marketplace
                    if (currentPath.startsWith("/marketplace")) {
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

        // Subscribe ONCE on mount — re-check role on any real auth event (login, logout, token refresh).
        // Previously, location.pathname was in the dep array, which caused the entire effect (including
        // this subscription) to teardown and recreate on EVERY URL change — leaking subscriptions.
        // Now the subscription lives for the component's entire lifetime, not per-navigation.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            checkUser();
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [navigate]); // navigate is stable (never changes) — this effect runs exactly once per mount

    return { role, loading };
};
