// "Open mail" on a phone — the same button, pointed at the mail APP.
//
// DESKTOP IS UNTOUCHED. mailProvider.ts still owns the one web URL per
// provider, and on a desktop browser that URL is byte-for-byte what the anchor
// carries. This module only decides what a PHONE does with it.
//
// Why a phone needs its own answer: mail.google.com in mobile Safari asks for a
// webmail sign-in the user does not have open, while the account is already
// signed in inside the Gmail app one tap away. The button exists because
// someone cannot find the verification email; a login screen is not an answer.
//
// A MISSING APP MUST COST NOTHING. Whatever we try, a phone with no such app
// installed has to land exactly where today's button would have put it:
//
//   Android — intent:// carrying S.browser_fallback_url. The OS launches the
//             app when it is installed; when it is not, or the intent matches
//             no activity, the browser itself navigates to the fallback URL.
//             No JS, no timer, no ERR_UNKNOWN_URL_SCHEME page. An explicit
//             `package=` also means the app's https filter does NOT need to be
//             a verified App Link — which is why a plain <a> does not already
//             open Gmail there, and this does.
//   iOS     — has no intent:// equivalent, so the href STAYS the web URL and
//             the click handler tries the app scheme first, falling back after
//             a short grace period unless the page went to the background
//             (which is the signal that the app did open). If the handler never
//             runs — no JS, a long-press "open in new tab" — the anchor is
//             still the plain web link it is today.
//
// WHAT THE APP COSTS: the search. mailProvider.ts takes real care to get
// `from:hey@mocksetu.in in:anywhere` into the URL, and no mail app on either
// platform accepts a search through a launch link — it opens on its inbox. That
// is the deliberate trade for a phone: being inside the right, already
// signed-in mailbox beats a filtered webmail login screen. The web fallback
// still carries the search, so nothing is lost when the app is absent.
//
// CONFIDENCE. Android entries are cheap to be generous with: a wrong package
// or an unhandled URI simply falls back to the web. An iOS scheme is not —
// a scheme no installed app claims makes Safari raise "cannot open the page"
// before our fallback runs — so only schemes their vendors publish are listed,
// and a provider missing from IOS_SCHEMES keeps today's web behaviour.

import type { MailProvider } from "./mailProvider";

export type MobilePlatform = "ios" | "android";

export interface MailLinkTarget {
    /** What the anchor's href must be. Always a URL the browser can navigate to. */
    href: string;
    /**
     * iOS only: the scheme to try before {@link webUrl}. Non-null is also the
     * modal's signal that the click needs a handler at all.
     */
    iosScheme: string | null;
    /** Where the tap lands when no app answers — always the desktop web URL. */
    webUrl: string;
    /** True when the tap is expected to leave the browser for a mail app. */
    opensApp: boolean;
}

/**
 * Vendor-published iOS URL schemes. Opening the app is all any of them does;
 * none takes a search.
 *
 * `message://` is Apple Mail, which is where an @icloud.com address is read on
 * an iPhone — and Mail ships with the OS, so the fallback is near-dead code.
 *
 * Deliberately absent: Zoho, Yandex, Rediffmail, AOL. Their iOS schemes are not
 * documented anywhere we can verify, and a guess here costs every user without
 * that app a Safari error dialog. They keep the web URL on iOS and still get
 * their app on Android, where a wrong guess is free.
 */
const IOS_SCHEMES: Record<string, string> = {
    gmail: "googlegmail://",
    outlook: "ms-outlook://",
    office365: "ms-outlook://",
    yahoo: "ymail://",
    proton: "protonmail://",
    icloud: "message://",
};

interface AndroidApp {
    /** Explicit package — this is what lets an unverified https filter match. */
    package: string;
    /**
     * The URI handed to the app. MUST NOT carry a #fragment: the intent syntax
     * spends the fragment on `#Intent;…;end` itself, so anything after a # in
     * here would be silently dropped. Mailbox roots only, for that reason.
     */
    link: string;
}

const ANDROID_APPS: Record<string, AndroidApp> = {
    gmail: { package: "com.google.android.gm", link: "https://mail.google.com/mail/u/0/" },

    // One app for both consumer and work accounts; only the web host differs.
    outlook: { package: "com.microsoft.office.outlook", link: "https://outlook.live.com/mail/" },
    office365: { package: "com.microsoft.office.outlook", link: "https://outlook.office.com/mail/" },

    yahoo: { package: "com.yahoo.mobile.client.android.mail", link: "https://mail.yahoo.com/" },
    proton: { package: "ch.protonmail.android", link: "https://mail.proton.me/" },

    // Zoho's datacenters are separate sign-ins on the web, but one app.
    zoho: { package: "com.zoho.mail", link: "https://mail.zoho.com/" },
    zohoIn: { package: "com.zoho.mail", link: "https://mail.zoho.in/" },
    zohoEu: { package: "com.zoho.mail", link: "https://mail.zoho.eu/" },

    yandex: { package: "ru.yandex.mail", link: "https://mail.yandex.com/" },
    aol: { package: "com.aol.mobile.aolapp", link: "https://mail.aol.com/" },

    // iCloud has no Android app, and Rediffmail's package name is not something
    // we can verify — both keep the web URL.
};

/**
 * iPadOS 13+ reports itself as "Macintosh" and is only separable from a real
 * Mac by the touch points, hence the second argument.
 */
export const detectMobilePlatform = (
    userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
    maxTouchPoints: number = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0
): MobilePlatform | null => {
    const ua = String(userAgent || "");
    // Android first: an Android UA also contains "Linux", never "iPhone".
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua)) return "ios";
    if (/macintosh|mac os x/i.test(ua) && maxTouchPoints > 1) return "ios";
    return null;
};

/**
 * intent:// is a Chromium feature. Chrome, Edge, Brave, Opera and Samsung
 * Internet all ship it; Firefox for Android does not treat it the same way, so
 * that minority keeps the plain web link rather than risking an error page.
 */
export const supportsAndroidIntent = (userAgent: string): boolean => {
    const ua = String(userAgent || "");
    if (/firefox|fxios/i.test(ua)) return false;
    return /chrome|crios|chromium|samsungbrowser/i.test(ua);
};

/**
 * `intent://host/path?query#Intent;scheme=…;package=…;S.browser_fallback_url=…;end`
 *
 * The fallback is percent-encoded, which matters more than it looks: the web
 * URLs carry `#search/…` and `?query=…`, and a raw `#` or `;` inside the intent
 * fragment would terminate the extras early and strand the user.
 *
 * Returns null for an unparseable link, so a bad table entry degrades to the
 * web URL instead of emitting a broken intent.
 */
export const androidIntentUrl = (
    link: string,
    packageName: string,
    fallbackUrl: string
): string | null => {
    const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(String(link || ""));
    if (!match) return null;
    const scheme = match[1].toLowerCase();
    // Defensive: a fragment in the table entry would be eaten by the intent
    // syntax below, so drop it rather than emit something that half-works.
    const rest = match[2].split("#")[0];
    return (
        `intent://${rest}#Intent;scheme=${scheme};package=${packageName};` +
        `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
    );
};

/**
 * The one decision: what this anchor points at, on this device.
 *
 * Desktop — and any phone whose provider has no app entry — returns the
 * provider's web URL unchanged, which is the whole compatibility guarantee.
 */
export const mailLinkTarget = (
    provider: MailProvider,
    platform: MobilePlatform | null = detectMobilePlatform(),
    userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent
): MailLinkTarget => {
    const web: MailLinkTarget = {
        href: provider.url,
        iosScheme: null,
        webUrl: provider.url,
        opensApp: false,
    };

    if (!platform) return web;

    if (platform === "android") {
        const app = ANDROID_APPS[provider.id];
        if (!app || !supportsAndroidIntent(userAgent)) return web;
        const href = androidIntentUrl(app.link, app.package, provider.url);
        if (!href) return web;
        return { href, iosScheme: null, webUrl: provider.url, opensApp: true };
    }

    const scheme = IOS_SCHEMES[provider.id];
    if (!scheme) return web;
    // href stays the web URL on purpose: it is what a long-press, a middle
    // click, or a browser with our handler disabled will use.
    return { href: provider.url, iosScheme: scheme, webUrl: provider.url, opensApp: true };
};

/**
 * How long to wait for iOS to switch apps before deciding no app answered.
 *
 * Long enough for a cold app launch on a slow phone, short enough that a user
 * without the app is not left staring at a button that did nothing. The page
 * going hidden cancels it well before this in the happy path.
 */
export const APP_LAUNCH_GRACE_MS = 1200;

/**
 * iOS only. Try the app, then the web.
 *
 * Navigates the CURRENT tab, because it has no choice: window.open by the time
 * the timer fires has long outlived the user gesture and would be popup-blocked.
 * An app launch does not unload the page, so the happy path leaves this tab
 * intact underneath the mail app — but the FALLBACK does spend it, and that is
 * the one real cost on iOS: a phone with no Gmail app ends up on webmail where
 * the signup tab used to be, and /verified has nowhere to send that user back
 * to. Android does not pay this; its fallback lands in the tab the anchor
 * opened. Nothing here can fix it, which is why the iOS scheme list stays
 * short: only apps a user is very likely to actually have.
 */
export const openMailApp = (target: MailLinkTarget): void => {
    if (typeof window === "undefined" || !target.iosScheme) return;

    let settled = false;
    const cleanup = () => {
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("pagehide", onHidden);
    };
    // The app took over: cancel the fallback, or the user comes back from Gmail
    // to find the browser had replaced the signup tab with webmail behind their
    // back. The document.hidden test is what makes this trustworthy — Safari's
    // "cannot open the page" alert, the case the fallback exists for, blurs the
    // window without ever hiding the document.
    const onHidden = () => {
        if (!document.hidden) return;
        settled = true;
        window.clearTimeout(timer);
        cleanup();
    };

    const timer = window.setTimeout(() => {
        cleanup();
        if (settled || document.hidden) return;
        window.location.assign(target.webUrl);
    }, APP_LAUNCH_GRACE_MS);

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);

    try {
        window.location.assign(target.iosScheme);
    } catch {
        // A browser that refuses the scheme outright — go straight to the web.
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        window.location.assign(target.webUrl);
    }
};
