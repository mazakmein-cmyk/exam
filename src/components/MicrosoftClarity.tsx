import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isAdminPath } from "@/lib/adminRoute";

/**
 * Microsoft Clarity — session recordings and heatmaps, loaded only when a
 * project ID is configured AND the visitor is not on the admin console.
 *
 * The ID comes from VITE_CLARITY_PROJECT_ID rather than being pasted into
 * index.html, which is what Clarity's own "install manually" instructions
 * suggest. That matters more here than it does for GA: Clarity does not just
 * count hits, it records the session and folds it into the heatmaps. A
 * hardcoded snippet in index.html would therefore capture every localhost dev
 * session and every preview deploy, and those recordings are indistinguishable
 * from real student traffic once they are in the dashboard — you cannot filter
 * out "me, reloading the exam page forty times" after the fact. Leaving the
 * variable unset outside production keeps that data clean at the source.
 *
 * WHY THE ADMIN CHECK IS ASYNC AND LOOKS OVERBUILT
 * ------------------------------------------------
 * The admin console has no declared route: it is the catch-all, and it renders
 * only when the pathname's SHA-256 matches a digest committed in
 * src/lib/adminRoute.ts — deliberately, so the URL is absent from the shipped
 * bundle. So this cannot be a `pathname.startsWith("/admin")` test; the string
 * to compare against does not exist in the browser. It has to go through
 * isAdminPath(), which is async because crypto.subtle is. The practical
 * consequence is that the tag is injected one microtask after mount rather than
 * synchronously — which is also what makes a direct load of the console safe,
 * since nothing is injected until the digest has come back negative.
 *
 * Mounting this in Layout (not PresentLayout) also keeps the projector route
 * out of the recordings, for the same reason GoogleAnalytics is mounted there.
 *
 * SPA note: unlike GA4, Clarity needs no per-route page_view. The tag patches
 * history itself and starts a new page within the recording on navigation. The
 * route effect below exists only to police the admin boundary.
 */
declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

const MicrosoftClarity = () => {
  const { pathname } = useLocation();
  const injected = useRef(false);
  const stopped = useRef(false);

  useEffect(() => {
    if (!PROJECT_ID) return;

    let active = true;

    isAdminPath(pathname).then((isAdmin) => {
      if (!active) return;

      if (isAdmin) {
        // Reached the console mid-session, after the tag was already running.
        // "stop" is a supported verb (it tears down every observer and puts the
        // queueing stub back), and we deliberately never restart it: whoever is
        // in here is the site operator, so the remainder of that session is not
        // student behaviour worth recording either.
        if (injected.current && !stopped.current) {
          stopped.current = true;
          window.clarity?.("stop");
        }
        return;
      }

      if (injected.current || stopped.current) return;
      injected.current = true;

      // The queueing stub has to exist BEFORE the tag arrives, exactly as in
      // Clarity's official snippet — the loader's own first act is to call
      // window.clarity("start", config), so without the stub it throws on an
      // undefined property and nothing initialises.
      //
      // Unlike gtag (see the load-bearing `arguments` note in
      // GoogleAnalytics.tsx) a plain array is fine here: clarity.js drains the
      // queue with `clarity.apply(window, entry)`, and apply accepts any
      // array-like, so there is no silent-drop trap to reproduce.
      if (!window.clarity) {
        const stub = function (...args: unknown[]) {
          (stub.q = stub.q || []).push(args);
        } as ((...args: unknown[]) => void) & { q?: unknown[] };
        window.clarity = stub;
      }

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${PROJECT_ID}`;
      document.head.appendChild(script);
    });

    return () => {
      active = false;
    };
  }, [pathname]);

  return null;
};

export default MicrosoftClarity;
