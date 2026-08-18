/**
 * lastExamMemo.ts — remembers the last exam the visitor opened, so the home
 * page can offer "jump back in" instead of making them find it again.
 *
 * Deliberately a breadcrumb, not attempt state: real progress lives server-side
 * with the attempt, and duplicating it here would rot. All the home page needs
 * is a name and a door — the intro page it points at works out the rest.
 *
 * localStorage access is guarded the same way instructionFreshness.js guards
 * its own: an absent localStorage (test runner, SSR) reads as "no memo".
 */

const KEY = "mocksetu:last-exam";

/** After this long the memo is stale enough to be noise rather than a nudge. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type LastExamMemo = {
    id: string;
    name: string;
    category: string | null;
    openedAt: number;
};

export function rememberLastExam(memo: { id: string; name: string; category?: string | null }): void {
    if (!memo.id || !memo.name || typeof localStorage === "undefined") return;
    try {
        const value: LastExamMemo = {
            id: memo.id,
            name: memo.name,
            category: memo.category ?? null,
            openedAt: Date.now(),
        };
        localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        // Quota / privacy mode — the nudge is optional, never worth an error.
    }
}

export function readLastExam(): LastExamMemo | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<LastExamMemo>;
        if (!parsed || typeof parsed.id !== "string" || typeof parsed.name !== "string") return null;
        if (typeof parsed.openedAt !== "number" || Date.now() - parsed.openedAt > MAX_AGE_MS) return null;
        return {
            id: parsed.id,
            name: parsed.name,
            category: typeof parsed.category === "string" ? parsed.category : null,
            openedAt: parsed.openedAt,
        };
    } catch {
        return null;
    }
}

export function clearLastExam(): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* nothing to clean up */
    }
}
