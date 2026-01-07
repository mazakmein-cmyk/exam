
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthStateListener = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Global Auth State Change:", event);

            if (event === 'SIGNED_OUT') {
                // When user signs out, redirect to home page or login page
                // We avoid redirecting if already on public/auth pages to prevent loops, 
                // unless we want to clear some state.
                // But for "logout in all tabs", forcing a navigation to root or auth is safe.
                // If the user is on a protected route, this will kick them out.

                // Use window.location.href to force a full reload is sometimes safer for clearing memory state,
                // but SPA navigation is better for UX.
                // We will stick to SPA navigation.

                // Only redirect if NOT already on an auth page or public landing, 
                // OR better: redirect to '/' which serves as a neutral ground 
                // from which they can navigate to sign in again.

                // However, if I am on /student-auth (signin tab) and I logout in another tab,
                // I should probably stay on /student-auth (maybe clear forms?).
                // But if I was logged in (and thus on dashboard), I definitely need to go away.

                if (session === null) {
                    // Force redirect to home if logged out
                    navigate("/");
                }

            } else if (event === 'SIGNED_IN' && session) {
                // When user signs in (e.g. in another tab), we might want to redirect them 
                // if they are currently on a login page.

                const path = location.pathname;
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
