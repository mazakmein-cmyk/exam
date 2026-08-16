import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * GA4, loaded only when a measurement ID is configured.
 *
 * The ID comes from VITE_GA_MEASUREMENT_ID rather than being hard-coded, so the
 * snippet is simply absent in local dev and preview builds — nobody's debugging
 * session pollutes the production property, and there is no ID to leak in a
 * branch that was never meant to report.
 *
 * SPA note: this app never does a full page load after boot, so GA4's automatic
 * page_view (which fires once, on script init) would record the landing URL and
 * nothing else. The route effect below sends an explicit page_view per
 * navigation instead, which is why send_page_view is disabled in config.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

const GoogleAnalytics = () => {
  const location = useLocation();
  const loaded = useRef(false);

  // Load gtag.js once.
  useEffect(() => {
    if (!MEASUREMENT_ID || loaded.current) return;
    loaded.current = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];

    // This MUST push the `arguments` object itself, not a rest-parameter array.
    //
    // gtag.js walks dataLayer and only recognises an entry as a command if it is
    // an arguments object; a plain Array is silently ignored. Pushing `[...args]`
    // therefore drops `js` and `config` on the floor, gtag.js never initialises,
    // and the property reports zero traffic forever with no error anywhere — in
    // the console, the network tab, or GA itself. An earlier version of this file
    // did exactly that, so the shape below is load-bearing rather than stylistic.
    const gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    } as (...args: unknown[]) => void;
    window.gtag = gtag;

    gtag("js", new Date());
    gtag("config", MEASUREMENT_ID, { send_page_view: false });
  }, []);

  // One page_view per client-side navigation.
  //
  // Deferred by a macrotask on purpose. This component sits above <Outlet/>, so
  // its effect flushes BEFORE the routed page's <SEO/> effect has written
  // document.title — reading the title synchronously would tag every hit with
  // the *previous* page's name. Yielding once lets the title land first.
  useEffect(() => {
    if (!MEASUREMENT_ID) return;
    const id = window.setTimeout(() => {
      window.gtag?.("event", "page_view", {
        page_path: `${location.pathname}${location.search}`,
        page_location: window.location.href,
        page_title: document.title,
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.search]);

  return null;
};

export default GoogleAnalytics;
