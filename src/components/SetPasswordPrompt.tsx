/**
 * SetPasswordPrompt — decides when SetPasswordModal gets to appear.
 *
 * Mounted once in the app Layout rather than on each destination page, so there
 * is one rule in one place instead of three copies that drift. What it guards:
 *
 * WHERE. Only on the pages a user lands on and stops — the creator dashboard, the
 * exam library, and the post-exam review. Never on an auth page (the session is
 * still being sorted out there), never mid-exam, and never on the projector view,
 * which does not render this layout at all.
 *
 * WHEN. Never in front of work. A finished paper takes 4-5 seconds to write and
 * the onboarding modal is already queued behind it on the review page, so
 * shouldPromptForPassword stands down while `needsOnboarding` is set and this
 * waits for that to clear — the order is profile first, password second.
 *
 * COST. getSession() reads the stored session; it does not call the network. The
 * user object it returns already carries `identities`, which is all the decision
 * needs, so adding this to the layout adds no request to any page load.
 */

import { lazy, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_PROMPT_RECHECK_EVENT, shouldPromptForPassword } from "@/lib/passwordSetup";
import LazyDialogHost from "@/components/LazyDialogHost";

const SetPasswordModal = lazy(() => import("@/components/SetPasswordModal"));

/** Pages where the user has arrived and is not in the middle of something. */
const isSettledDestination = (pathname: string) =>
    pathname === "/dashboard" ||
    pathname === "/marketplace" ||
    pathname.startsWith("/exam/review/");

const SetPasswordPrompt = () => {
    const { pathname } = useLocation();
    const [user, setUser] = useState<User | null>(null);
    const [open, setOpen] = useState(false);
    // Latches once satisfied, so the dialog is not re-raised by a later auth event.
    const [settled, setSettled] = useState(false);

    useEffect(() => {
        let active = true;

        // No getSession() call: every new subscriber is handed INITIAL_SESSION
        // (auth-js emits it unconditionally once initialisation settles, signed
        // out included), so subscribing alone seeds the user.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === "SIGNED_OUT") {
                setUser(null);
                setSettled(false);
                setOpen(false);
                return;
            }
            setUser(session?.user ?? null);
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    // Bumped whenever something that was deferring the prompt finishes. The
    // post-exam path clears `needsOnboarding` with a bare sessionStorage write
    // inside ExamReview, which fires no React update and no storage event in its
    // own tab — so without this the review-page prompt never appears.
    const [recheck, setRecheck] = useState(0);
    useEffect(() => {
        const bump = () => setRecheck((n) => n + 1);
        window.addEventListener(PASSWORD_PROMPT_RECHECK_EVENT, bump);
        return () => window.removeEventListener(PASSWORD_PROMPT_RECHECK_EVENT, bump);
    }, []);

    // Re-checked on navigation as well as on auth changes, since arriving at a
    // settled page is itself a reason to look again.
    useEffect(() => {
        if (settled) return;
        if (!isSettledDestination(pathname)) return;
        if (!shouldPromptForPassword(user)) return;
        setOpen(true);
    }, [pathname, user, settled, recheck]);

    // LazyDialogHost keeps the chunk out of the tree until `open` first turns
    // true, so a user who never sees this never downloads it.
    return (
        <LazyDialogHost open={open}>
            <SetPasswordModal
                isOpen={open}
                onOpenChange={setOpen}
                onComplete={() => setSettled(true)}
                onSkip={() => setSettled(true)}
            />
        </LazyDialogHost>
    );
};

export default SetPasswordPrompt;
