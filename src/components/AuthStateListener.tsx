
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthStateListener = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Global Auth State Change:", event);

            // Get the current pathname at the time of the event, not from react-router state
            // This ensures we have the most up-to-date pathname
            const currentPath = window.location.pathname;

            // Check if user is on exam-related pages - never redirect from these
            const isExamPage = currentPath.includes('/exam/') ||
                currentPath.includes('/simulator') ||
                currentPath.includes('/review') ||
                currentPath.includes('/intro');

            // Ignore TOKEN_REFRESHED events completely - these happen during tab switches
            if (event === 'TOKEN_REFRESHED') {
                console.log("Token refreshed, ignoring...");
                return;
            }

            if (event === 'SIGNED_OUT') {
                // Never redirect if user is taking an exam
                if (isExamPage) {
                    console.log("Skipping redirect on exam page due to SIGNED_OUT event");
                    return;
                }

                // Double-check session after a delay to handle false SIGNED_OUT events
                // that can occur during token refresh
                if (session === null) {
                    setTimeout(async () => {
                        const { data: { session: currentSession } } = await supabase.auth.getSession();
                        // Re-check current path in case user navigated
                        const pathNow = window.location.pathname;
                        const stillOnExamPage = pathNow.includes('/exam/') ||
                            pathNow.includes('/simulator') ||
                            pathNow.includes('/review') ||
                            pathNow.includes('/intro');

                        if (currentSession === null && !stillOnExamPage) {
                            navigate("/");
                        }
                    }, 500);
                }

            } else if (event === 'SIGNED_IN' && session) {
                // Only redirect from auth pages
                const isAuthPage = currentPath === '/auth' || currentPath === '/student-auth';

                if (isAuthPage) {
                    const userType = session.user.user_metadata?.user_type;
                    if (userType === 'creator') {
                        navigate('/dashboard');
                    } else if (userType === 'student') {
                        navigate('/marketplace');
                    }
                }
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [navigate]);

    return null;
};

export default AuthStateListener;

