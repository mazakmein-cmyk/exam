
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthStateListener = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Global Auth State Change:", event);

            // Skip redirects for exam-related pages to prevent disruption during exams
            const path = location.pathname;
            const isExamPage = path.includes('/exam/') || path.includes('/simulator') || path.includes('/review');

            if (event === 'SIGNED_OUT') {
                // When user signs out, redirect to home page or login page
                // But skip if user is taking an exam to prevent data loss

                if (isExamPage) {
                    console.log("Skipping redirect on exam page due to SIGNED_OUT event");
                    return;
                }

                // Add a small delay to allow for session refresh scenarios
                // This prevents false redirects when Supabase is refreshing the token
                if (session === null) {
                    // Double-check after a short delay that we're really signed out
                    setTimeout(async () => {
                        const { data: { session: currentSession } } = await supabase.auth.getSession();
                        if (currentSession === null) {
                            // Only redirect if still signed out after delay
                            navigate("/");
                        }
                    }, 500);
                }

            } else if (event === 'SIGNED_IN' && session) {
                // When user signs in (e.g. in another tab), we might want to redirect them 
                // if they are currently on a login page.

                const isAuthPage = path === '/auth' || path === '/student-auth';

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
    }, [navigate, location]);

    return null;
};

export default AuthStateListener;
