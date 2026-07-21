// The one account that carries the gold "official" badge.
export const OFFICIAL_ADMIN_EMAIL = "admin@mocksetu.in";

export type VerificationTier = "gold" | "blue";

interface VerificationInput {
    email?: string | null;
    is_admin_gold?: boolean | null;
    is_verified?: boolean | null;
}

/**
 * Resolves which badge (if any) a user should display.
 * Gold (official admin) always wins over blue (verified creator).
 */
export function getVerificationTier({ email, is_admin_gold, is_verified }: VerificationInput): VerificationTier | null {
    if (is_admin_gold || (email && email.toLowerCase() === OFFICIAL_ADMIN_EMAIL)) return "gold";
    if (is_verified) return "blue";
    return null;
}
