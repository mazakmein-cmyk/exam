import { supabase } from "@/integrations/supabase/client";
import type { AuthError } from "@supabase/supabase-js";

interface SignInErrorToast {
  title: string;
  description: string;
  variant: "destructive";
}

// Supabase returns the same "Invalid login credentials" error whether the
// account doesn't exist or the password is wrong. To show an accurate message
// we ask the backend (boolean-only, rate-limited RPC) whether the account
// exists. If that check can't run, we fall back to a neutral message — we
// never claim "account not found" unless the backend confirmed it.
export const getSignInErrorToast = async (error: AuthError, email: string): Promise<SignInErrorToast> => {
  const isInvalidCredentials =
    error.message === "Invalid login credentials" || error.code === "invalid_credentials";

  if (!isInvalidCredentials) {
    if (error.code === "email_not_confirmed" || error.message.includes("Email not confirmed")) {
      return {
        title: "Verification required",
        description: "Please verify your email before signing in.",
        variant: "destructive",
      };
    }
    return { title: "Sign in failed", description: error.message, variant: "destructive" };
  }

  try {
    const { data: accountExists, error: rpcError } = await (supabase.rpc as any)("check_account_exists", {
      check_email: email,
    });
    if (!rpcError && accountExists === false) {
      return {
        title: "Account not found",
        description: "No account exists with this email. Please sign up to create one.",
        variant: "destructive",
      };
    }
    if (!rpcError && accountExists === true) {
      return {
        title: "Incorrect password",
        description: 'The password you entered is wrong. Try again, or use "Forgot?" to reset it.',
        variant: "destructive",
      };
    }
  } catch {
    // RPC unavailable — use the neutral fallback below.
  }

  return {
    title: "Sign in failed",
    description: "Incorrect email or password. Please check your details and try again.",
    variant: "destructive",
  };
};
