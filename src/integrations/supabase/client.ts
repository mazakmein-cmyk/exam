import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // The default navigatorLock is origin-wide: if any tab wedges while
    // holding it, getSession()/sign-in hang in EVERY tab (pages freeze on
    // their loading state). processLock scopes locking to this tab; the
    // server's refresh-token reuse window covers the rare concurrent
    // refresh from two tabs.
    lock: processLock,
  }
});