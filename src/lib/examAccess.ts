/**
 * examAccess.ts — who is allowed to actually SIT an exam.
 *
 * Product rule: creator accounts never take exams. A creator may open their
 * OWN exam in *preview* to check how it reads, and a preview records nothing —
 * no attempt row, no responses, no marks, no live participant, no leaderboard
 * entry, no analytics. Any other exam on a creator account is blocked.
 *
 * Students and anonymous visitors are untouched: they always resolve to "take",
 * so nothing about the normal exam flow changes for them.
 *
 * The DB backs this up (see the block_creators_from_taking_exams migration),
 * but every gate here works on its own — the UI must never depend on the
 * migration having been applied.
 */

import { supabase } from "@/integrations/supabase/client";

export type ExamViewer = {
    userId: string | null;
    /**
     * Signed-in account that is not a student. Legacy accounts carry no
     * `user_type`, and the rest of the app already treats those as creators
     * (see use-user-role.ts) — so treat them the same way here.
     */
    isCreator: boolean;
};

/** Anonymous viewer — the least-privileged reading, and the safe fallback. */
const ANONYMOUS_VIEWER: ExamViewer = { userId: null, isCreator: false };

/**
 * "take"    — normal exam: attempts and responses are saved (students, guests).
 * "preview" — creator on their own exam: fully browsable, nothing persisted.
 * "blocked" — creator on somebody else's exam: no access at all.
 */
export type ExamAccessMode = "take" | "preview" | "blocked";

export const CREATOR_BLOCKED_TITLE = "Creator accounts can't take exams";
export const CREATOR_BLOCKED_MESSAGE =
    "You're logged in as a creator. Creator accounts can only preview their own exams — log in with a student account to take this one.";

/** Build a viewer from an already-fetched auth user (no extra round trip). */
export function toExamViewer(user: { id: string; user_metadata?: Record<string, any> | null } | null | undefined): ExamViewer {
    if (!user) return ANONYMOUS_VIEWER;
    return {
        userId: user.id,
        isCreator: user.user_metadata?.user_type !== "student",
    };
}

/** Fetch the current viewer. Never throws — auth hiccups read as anonymous. */
export async function getExamViewer(): Promise<ExamViewer> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return toExamViewer(user);
    } catch {
        // Don't lock a real student out of an exam over a transient auth error.
        return ANONYMOUS_VIEWER;
    }
}

/** Resolve what `viewer` may do with an exam owned by `ownerId`. */
export function resolveExamAccess(
    viewer: ExamViewer,
    ownerId: string | null | undefined,
): ExamAccessMode {
    if (!viewer.isCreator) return "take";
    return ownerId && ownerId === viewer.userId ? "preview" : "blocked";
}
