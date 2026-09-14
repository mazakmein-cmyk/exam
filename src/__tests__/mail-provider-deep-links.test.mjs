/**
 * "OPEN MAIL" — one tap from the verification modal to the email itself.
 *
 * Run with: node src/__tests__/mail-provider-deep-links.test.mjs
 *
 * The button exists because someone cannot find the verification email. That
 * framing decides every rule below:
 *
 *  1. A WRONG MAILBOX IS WORSE THAN NO BUTTON. Landing a Microsoft 365 user in
 *     Gmail costs them a login and teaches them the product is broken. Every
 *     resolver returns null rather than guessing, and the modal omits the
 *     button entirely when nothing is known.
 *  2. THE SEARCH LOOKS IN SPAM. An unfound verification email is usually in
 *     Spam or Trash, so the Gmail query carries in:anywhere. A provider with no
 *     trustworthy search deep link is marked filtered:false and promises
 *     nothing it did not do.
 *  3. THE URL IS READY BEFORE THE CLICK. An await between the click and the
 *     navigation loses the user-gesture and gets popup-blocked, so resolution
 *     happens when the modal opens and the control is a plain <a>, never
 *     window.open.
 *  4. THE LOOKUP SEES THE DOMAIN, NEVER THE ADDRESS. The MX fallback is a
 *     third-party DNS request; only the domain half may leave the browser.
 *  5. ONE SENDER CONSTANT. The From address lives in the Supabase dashboard,
 *     which this repo cannot read. If it ever disagrees with the constant the
 *     search lands empty — so there must be exactly one place to fix it.
 *  6. A PHONE GETS THE APP, AND NEVER GETS NOWHERE. Mobile points the same
 *     button at the mail app — Android through an intent that carries its own
 *     browser_fallback_url, iOS through a published scheme with a timed
 *     fallback. A missing app must cost exactly nothing, and desktop must come
 *     out byte-for-byte unchanged.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
    VERIFICATION_SENDER,
    emailDomain,
    mailProviderForEmail,
    providerIdForMxHosts,
    parseMxHosts,
    lookupMailProvider,
} from "../lib/mailProvider.ts";
import {
    detectMobilePlatform,
    supportsAndroidIntent,
    androidIntentUrl,
    mailLinkTarget,
} from "../lib/mailAppLink.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// The working copy is CRLF on disk; every static assertion below reads source
// as text, so normalise once here rather than in each pattern.
const read = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     → ${e.message}`);
        failed++;
        failures.push(name);
    }
}

const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
};
const eq = (actual, expected, msg) => {
    if (actual !== expected) {
        throw new Error(`${msg}\n       expected: ${expected}\n       actual:   ${actual}`);
    }
};

console.log("\n────────────────────────────────────────────────────────────");
console.log("  OPEN MAIL — provider deep links");
console.log("────────────────────────────────────────────────────────────\n");

console.log("  Address parsing");

test("the domain half is lowercased and trimmed", () => {
    eq(emailDomain("  Shivam@Gmail.COM  "), "gmail.com", "case and padding survive a form field");
});

test("plus-addressing does not confuse the domain", () => {
    eq(emailDomain("shivambarnwal3008+sfgsd1@gmail.com"), "gmail.com", "tag belongs to the local part");
});

test("a half-typed address resolves to nothing rather than something", () => {
    for (const bad of ["", "shivam", "shivam@", "@gmail.com", "a@b@c.com", "shivam@localhost"]) {
        eq(emailDomain(bad), null, `"${bad}" is not a routable address`);
    }
});

test("a trailing dot on the domain is tolerated", () => {
    eq(emailDomain("shivam@gmail.com."), "gmail.com", "a fully-qualified name still matches the table");
});

console.log("\n  Static domain table");

const expectProvider = (email, id) =>
    test(`${email} → ${id}`, () => {
        const p = mailProviderForEmail(email);
        assert(p !== null, "expected a provider, got null");
        eq(p.id, id, "wrong provider");
    });

expectProvider("shivam@gmail.com", "gmail");
expectProvider("shivam@googlemail.com", "gmail");
expectProvider("shivam@outlook.com", "outlook");
expectProvider("shivam@hotmail.com", "outlook");
expectProvider("shivam@live.com", "outlook");
expectProvider("shivam@yahoo.com", "yahoo");
expectProvider("shivam@proton.me", "proton");
expectProvider("shivam@icloud.com", "icloud");
expectProvider("shivam@zoho.com", "zoho");
expectProvider("shivam@zoho.in", "zohoIn");
expectProvider("shivam@yandex.ru", "yandex");
expectProvider("shivam@rediffmail.com", "rediff");
expectProvider("shivam@aol.com", "aol");

test("country variants match by leading label, not an endless list", () => {
    // The ones Indian students actually use, none of which are in the table.
    eq(mailProviderForEmail("a@hotmail.co.uk").id, "outlook", "hotmail.co.uk");
    eq(mailProviderForEmail("a@live.in").id, "outlook", "live.in");
    eq(mailProviderForEmail("a@yahoo.co.in").id, "yahoo", "yahoo.co.in");
    eq(mailProviderForEmail("a@outlook.in").id, "outlook", "outlook.in");
});

test("the prefix rule is anchored at a dot", () => {
    // "notlive.com" must not be swept up by the "live." rule.
    eq(mailProviderForEmail("a@notlive.com"), null, "notlive.com is not Outlook");
    eq(mailProviderForEmail("a@myyahoo.com"), null, "myyahoo.com is not Yahoo");
});

test("an unknown domain yields no button rather than a wrong one", () => {
    eq(mailProviderForEmail("a@somecollege.ac.in"), null, "a custom domain is the MX path's job");
    eq(mailProviderForEmail("a@mocksetu.in"), null, "including our own");
});

console.log("\n  URL shape");

test("every provider URL is a parseable https URL", () => {
    const emails = [
        "a@gmail.com", "a@outlook.com", "a@yahoo.com", "a@proton.me",
        "a@icloud.com", "a@zoho.com", "a@zoho.in", "a@yandex.ru", "a@rediffmail.com", "a@aol.com",
    ];
    for (const email of emails) {
        const p = mailProviderForEmail(email);
        const url = new URL(p.url);
        eq(url.protocol, "https:", `${p.id} must be https`);
        assert(p.label.startsWith("Open "), `${p.id} label reads as an action: ${p.label}`);
    }
});

test("the Gmail link searches Spam and Trash, not just the inbox", () => {
    const url = mailProviderForEmail("shivam@gmail.com").url;
    assert(url.includes("in%3Aanywhere"), `in:anywhere is the whole point — got ${url}`);
});

test("the Gmail link carries the sender, encoded for the search fragment", () => {
    const url = mailProviderForEmail("shivam@gmail.com").url;
    const fragment = url.slice(url.indexOf("#search/") + "#search/".length);
    // Gmail separates terms with "+"; a %20 would be read as part of the term.
    assert(!fragment.includes("%20"), `spaces must be "+" inside #search — got ${fragment}`);
    eq(
        decodeURIComponent(fragment.replace(/\+/g, " ")),
        `from:${VERIFICATION_SENDER} in:anywhere`,
        "the decoded query"
    );
});

test("the Gmail link still carries the address as a hint", () => {
    // Deliberately NOT claimed: that this switches accounts. It does not —
    // a path index beats authuser, and /u/0/ is the first signed-in account.
    // It is kept because it prefills the address when the user is signed out
    // and costs nothing when they are not.
    const url = mailProviderForEmail("shivam+tag@gmail.com").url;
    const authuser = new URL(url).searchParams.get("authuser");
    eq(authuser, "shivam+tag@gmail.com", "a hint, not a guarantee");
});

test("the Gmail link points at a TERMINAL route, so the #search survives", () => {
    // The regression this guards, and it is counter-intuitive. Observed
    // against Google, unauthenticated:
    //
    //   /mail/      301 -> /mail/u/0/           path rewritten
    //   /mail/u/    302 -> must resolve an index when authenticated
    //   /mail/u/0/  302 -> continue=/mail/u/0/   rewritten by nothing
    //
    // The query rides in the fragment. Any form that makes Gmail resolve the
    // URL to a concrete account first loses that fragment on the way, and the
    // button opens a bare inbox with no filter — which is the entire feature
    // gone. Only the already-resolved /u/0/ is safe.
    const url = mailProviderForEmail("shivam@gmail.com").url;
    eq(new URL(url).pathname, "/mail/u/0/", "a non-terminal path drops #search");
    assert(url.includes("#search/"), "the search fragment must be present");
});

test("Outlook names the account too, via login_hint", () => {
    for (const email of ["shivam@outlook.com", "shivam@hotmail.co.in"]) {
        const url = mailProviderForEmail(email).url;
        eq(
            new URL(url).searchParams.get("login_hint"),
            email,
            "Microsoft's equivalent of authuser, for the same multi-account reason"
        );
        assert(!/\/mail\/\d/.test(url), `OWA pins the first mailbox on /mail/<n>/: ${url}`);
    }
});

test("providers with a real search deep link say so; the rest do not pretend", () => {
    const filtered = ["gmail", "outlook", "yahoo", "proton", "yandex"];
    const plain = ["zoho", "zohoIn", "icloud", "rediff", "aol"];
    const byId = {
        gmail: "a@gmail.com", outlook: "a@outlook.com", yahoo: "a@yahoo.com",
        proton: "a@proton.me", yandex: "a@yandex.ru", zoho: "a@zoho.com", zohoIn: "a@zoho.in",
        icloud: "a@icloud.com", rediff: "a@rediffmail.com", aol: "a@aol.com",
    };
    for (const id of filtered) {
        eq(mailProviderForEmail(byId[id]).filtered, true, `${id} applies a search`);
    }
    for (const id of plain) {
        eq(mailProviderForEmail(byId[id]).filtered, false, `${id} only opens the mailbox`);
    }
});

test("every filtered URL actually contains the sender", () => {
    for (const email of ["a@gmail.com", "a@outlook.com", "a@yahoo.com", "a@proton.me", "a@yandex.ru"]) {
        const p = mailProviderForEmail(email);
        const decoded = decodeURIComponent(p.url).replace(/\+/g, " ");
        assert(
            decoded.includes(VERIFICATION_SENDER),
            `${p.id} claims filtered:true but its URL has no sender: ${p.url}`
        );
    }
});

console.log("\n  MX resolution (custom domains)");

test("a Google Workspace domain is recognised from its MX hosts", () => {
    eq(providerIdForMxHosts(["aspmx.l.google.com.", "alt1.aspmx.l.google.com."]), "gmail", "Workspace");
    eq(providerIdForMxHosts(["smtp.google.com."]), "gmail", "the newer single-host Workspace setup");
});

test("a Microsoft 365 tenant is recognised from its MX host", () => {
    eq(
        providerIdForMxHosts(["mocksetu-in.mail.protection.outlook.com."]),
        "office365",
        "the tenant prefix varies, the suffix does not"
    );
});

test("the other hosted providers are recognised", () => {
    eq(providerIdForMxHosts(["mx.zoho.com."]), "zoho", "Zoho");
    eq(providerIdForMxHosts(["mail.protonmail.ch."]), "proton", "Proton");
    eq(providerIdForMxHosts(["mta5.am0.yahoodns.net."]), "yahoo", "Yahoo / AOL");
    eq(providerIdForMxHosts(["mx01.mail.icloud.com."]), "icloud", "iCloud");
});

test("Zoho is routed to the datacenter its MX names, not always .com", () => {
    // Verified against live DNS: mocksetu.in is mx.zoho.in, and an Indian
    // datacenter account signs in at mail.zoho.in — mail.zoho.com is a
    // different host, so getting this wrong sends our own staff to a login
    // screen for an account that is not there.
    eq(providerIdForMxHosts(["mx.zoho.in.", "mx2.zoho.in."]), "zohoIn", "India DC");
    eq(providerIdForMxHosts(["mx.zoho.eu."]), "zohoEu", "EU DC");
    eq(providerIdForMxHosts(["mx.zoho.com."]), "zoho", "global DC");
    assert(
        mailProviderForEmail("a@zoho.in").url.includes("mail.zoho.in"),
        "an @zoho.in address must land on mail.zoho.in"
    );
});

test("a host we have no landing page for stays null", () => {
    eq(providerIdForMxHosts(["mx.somecollege.ac.in."]), null, "self-hosted");
    eq(providerIdForMxHosts(["in.mailspamprotection.com."]), null, "a gateway hides the real provider");
    eq(providerIdForMxHosts([]), null, "a domain with no MX at all");
    eq(providerIdForMxHosts(["", "  "]), null, "blank rdata");
});

test("MX rdata is split into preference and host", () => {
    const hosts = parseMxHosts({
        Answer: [
            { type: 15, data: "10 aspmx.l.google.com." },
            { type: 15, data: "20 alt1.aspmx.l.google.com." },
        ],
    });
    eq(hosts.join(","), "aspmx.l.google.com.,alt1.aspmx.l.google.com.", "the priority number is dropped");
});

test("a CNAME in the answer chain is not mistaken for an MX host", () => {
    const hosts = parseMxHosts({
        Answer: [
            { type: 5, data: "alias.example.com." },
            { type: 15, data: "10 mx.zoho.com." },
        ],
    });
    eq(hosts.join(","), "mx.zoho.com.", "only type 15 counts");
});

test("a malformed or empty DNS answer parses to nothing, not a throw", () => {
    eq(parseMxHosts(null).length, 0, "null payload");
    eq(parseMxHosts({}).length, 0, "no Answer key");
    eq(parseMxHosts({ Answer: "nope" }).length, 0, "Answer is not an array");
    eq(parseMxHosts({ Answer: [{ type: 15 }] }).length, 0, "record with no data");
});

console.log("\n  The network call itself");

const withFetch = async (impl, fn) => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        return impl(String(url), init);
    };
    try {
        return await fn(calls);
    } finally {
        globalThis.fetch = original;
    }
};

// These share one global fetch, so they MUST run one at a time — started
// together, each stub would overwrite the previous one mid-flight.
const netTest = async (name, impl, fn) => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push(String(url));
        return impl(String(url), init);
    };
    try {
        await fn(calls);
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     → ${e.message}`);
        failed++;
        failures.push(name);
    } finally {
        globalThis.fetch = original;
    }
};

await netTest(
    "a known domain never touches the network",
    () => { throw new Error("fetch must not be called"); },
    async (calls) => {
        const p = await lookupMailProvider("shivam@gmail.com");
        eq(p.id, "gmail", "a known domain resolves from the table");
        eq(calls.length, 0, "a known domain must cost zero requests");
    }
);

await netTest(
    "the MX lookup sends the domain and nothing else",
    async () => ({
        ok: true,
        json: async () => ({ Answer: [{ type: 15, data: "10 aspmx.l.google.com." }] }),
    }),
    async (calls) => {
        const p = await lookupMailProvider("shivam.barnwal+test@mocksetu.in");
        eq(p.id, "gmail", "mocksetu.in is on Google Workspace");
        eq(calls.length, 1, "one request, not one per resolver");
        eq(new URL(calls[0]).searchParams.get("name"), "mocksetu.in", "the DOMAIN is sent");
        assert(!calls[0].includes("shivam"), `the local part must never leave the browser: ${calls[0]}`);
        assert(!calls[0].includes("%40") && !calls[0].includes("@"), "no address in the query string");
    }
);

await netTest(
    "a blocked resolver falls through to the second one",
    async (url) => {
        if (url.includes("dns.google")) throw new Error("blocked by ISP");
        return { ok: true, json: async () => ({ Answer: [{ type: 15, data: "0 x.mail.protection.outlook.com." }] }) };
    },
    async (calls) => {
        const p = await lookupMailProvider("rahul@somecollege.ac.in");
        assert(p !== null, "the second resolver answered, so there must be a provider");
        eq(p.id, "office365", "the tenant is on Microsoft 365");
        eq(calls.length, 2, "dns.google was tried first");
    }
);

await netTest(
    "an offline browser hides the button instead of crashing the modal",
    async () => { throw new Error("offline"); },
    async () => {
        const p = await lookupMailProvider("rahul@somecollege.ac.in");
        eq(p, null, "total failure hides the button rather than throwing");
    }
);

await netTest(
    "an unrecognised provider yields no button, and no second request",
    async () => ({ ok: true, json: async () => ({ Answer: [{ type: 15, data: "10 mx.selfhosted.ac.in." }] }) }),
    async (calls) => {
        const p = await lookupMailProvider("rahul@somecollege.ac.in");
        eq(p, null, "a provider with no landing page yields no button");
        eq(calls.length, 1, "a clean answer is not second-guessed by the other resolver");
    }
);

console.log("\n  On a phone, the app");

// Real user agents. The iPad one is a real Mac string — that is the point of it.
const UA = {
    androidChrome:
        "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    androidSamsung:
        "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
    iphone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    ipad:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    windows:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

// One address per provider the static table knows.
const SAMPLES = [
    ["shivam@gmail.com", "gmail"],
    ["shivam@outlook.com", "outlook"],
    ["shivam@yahoo.com", "yahoo"],
    ["shivam@proton.me", "proton"],
    ["shivam@icloud.com", "icloud"],
    ["shivam@zoho.com", "zoho"],
    ["shivam@zoho.in", "zohoIn"],
    ["shivam@zoho.eu", "zohoEu"],
    ["shivam@yandex.ru", "yandex"],
    ["shivam@rediffmail.com", "rediff"],
    ["shivam@aol.com", "aol"],
];

const fallbackOf = (href) => {
    const value = href.split("S.browser_fallback_url=")[1];
    return value === undefined ? null : value.replace(/;end$/, "");
};

test("the platform is read off the user agent, iPad included", () => {
    eq(detectMobilePlatform(UA.androidChrome, 5), "android", "Android Chrome");
    eq(detectMobilePlatform(UA.androidFirefox, 5), "android", "Android Firefox is still Android");
    eq(detectMobilePlatform(UA.iphone, 5), "ios", "iPhone");
    eq(detectMobilePlatform(UA.ipad, 5), "ios", "iPadOS 13+ claims to be a Mac; the touch points give it away");
    eq(detectMobilePlatform(UA.mac, 0), null, "a real Mac has no touch points");
    eq(detectMobilePlatform(UA.windows, 0), null, "Windows");
    eq(detectMobilePlatform("", 0), null, "no navigator at all — the prerender — is not a phone");
});

test("desktop is untouched: every provider keeps its exact web URL", () => {
    for (const [email] of SAMPLES) {
        const p = mailProviderForEmail(email);
        const t = mailLinkTarget(p, null, UA.windows);
        eq(t.href, p.url, `${p.id}: the desktop href must be the resolved URL, unchanged`);
        eq(t.opensApp, false, `${p.id}: a desktop has no app to open`);
        eq(t.iosScheme, null, `${p.id}: and no scheme to attempt`);
    }
});

test("Android hands the tap to the app, with the fallback built into the href", () => {
    const p = mailProviderForEmail("shivam@gmail.com");
    const t = mailLinkTarget(p, "android", UA.androidChrome);
    eq(t.opensApp, true, "the Gmail app is what a phone should land in");
    assert(t.href.startsWith("intent://mail.google.com/mail/u/0/#Intent;"), `wrong intent data: ${t.href}`);
    assert(t.href.includes(";scheme=https;"), "the data scheme has to be declared separately");
    assert(
        t.href.includes(";package=com.google.android.gm;"),
        "an explicit package is what makes an unverified https filter match"
    );
    assert(t.href.endsWith(";end"), "an unterminated intent URI is ignored");
    eq(t.webUrl, p.url, "the web URL stays available for the modal's copy");
});

test("the Android fallback is the desktop URL, search and all", () => {
    for (const [email] of SAMPLES) {
        const p = mailProviderForEmail(email);
        const t = mailLinkTarget(p, "android", UA.androidChrome);
        if (!t.opensApp) continue;
        const encoded = fallbackOf(t.href);
        assert(encoded !== null, `${p.id}: an intent with no fallback strands a phone without the app`);
        eq(decodeURIComponent(encoded), p.url, `${p.id}: the fallback must be exactly today's URL`);
    }
});

test("nothing in the fallback can terminate the intent extras early", () => {
    // Gmail's URL carries its search in a #fragment and its account hint in a
    // query — a raw # or ; inside the extras truncates the fallback, and the
    // phone without the app lands on half a URL.
    const p = mailProviderForEmail("shivam@gmail.com");
    assert(p.url.includes("#search/"), "the Gmail URL still carries a fragment");
    const encoded = fallbackOf(mailLinkTarget(p, "android", UA.androidChrome).href);
    assert(!encoded.includes("#"), "a raw # would end the fallback at the fragment");
    assert(!encoded.includes(";"), "a raw ; would end it at the next extra");
    assert(encoded.includes("%23") && encoded.includes("%3F"), "so both are percent-encoded");
});

test("Samsung Internet is Chromium enough; Firefox for Android is not", () => {
    eq(supportsAndroidIntent(UA.androidChrome), true, "Chrome");
    eq(supportsAndroidIntent(UA.androidSamsung), true, "Samsung Internet");
    eq(supportsAndroidIntent(UA.androidFirefox), false, "intent:// there risks an error page, not a fallback");

    const p = mailProviderForEmail("shivam@gmail.com");
    const t = mailLinkTarget(p, "android", UA.androidFirefox);
    eq(t.href, p.url, "so Firefox keeps exactly today's link");
    eq(t.opensApp, false, "and the modal must not promise it an app");
});

test("a provider with no Android app keeps the web URL", () => {
    for (const email of ["shivam@icloud.com", "shivam@rediffmail.com"]) {
        const p = mailProviderForEmail(email);
        const t = mailLinkTarget(p, "android", UA.androidChrome);
        eq(t.href, p.url, `${p.id}: nothing to hand off to on Android`);
        eq(t.opensApp, false, `${p.id}: and it must not claim otherwise`);
    }
});

test("iOS keeps the web URL in the href and only attempts the app", () => {
    const p = mailProviderForEmail("shivam@gmail.com");
    const t = mailLinkTarget(p, "ios", UA.iphone);
    eq(t.href, p.url, "a long-press, or a browser that never runs the handler, must still reach the mailbox");
    eq(t.iosScheme, "googlegmail://", "the app comes first");
    eq(t.webUrl, p.url, "and the web URL is what the grace period falls back to");
    eq(t.opensApp, true, "the tap is expected to leave the browser");
});

test("iOS schemes are published ones, never guesses", () => {
    // A scheme no installed app claims raises a Safari error dialog BEFORE any
    // fallback of ours can run, so an unverifiable scheme is worse than none.
    const published = {
        gmail: "googlegmail://",
        outlook: "ms-outlook://",
        yahoo: "ymail://",
        proton: "protonmail://",
        icloud: "message://",
    };
    for (const [email, id] of SAMPLES) {
        const p = mailProviderForEmail(email);
        const t = mailLinkTarget(p, "ios", UA.iphone);
        eq(t.iosScheme, published[id] ?? null, `${id} on iOS`);
        if (!published[id]) {
            eq(t.href, p.url, `${id} has no scheme we can verify, so it keeps the web URL`);
            eq(t.opensApp, false, `${id} must not claim to open an app`);
        }
    }
});

test("a table entry with a fragment cannot smuggle it into the intent", () => {
    const url = androidIntentUrl("https://mail.zoho.com/zm/#mail/folder/inbox", "com.zoho.mail", "https://x.test/");
    assert(
        url.startsWith("intent://mail.zoho.com/zm/#Intent;"),
        `the intent syntax owns the fragment, so the entry's own must be dropped: ${url}`
    );
    eq(androidIntentUrl("not-a-url", "com.x", "https://x.test/"), null, "an unparseable entry degrades to the web URL");
});

await netTest(
    "a Microsoft 365 tenant opens Outlook on both phones",
    async () => ({ ok: true, json: async () => ({ Answer: [{ type: 15, data: "0 x.mail.protection.outlook.com." }] }) }),
    async () => {
        const p = await lookupMailProvider("rahul@somecollege.ac.in");
        eq(p.id, "office365", "a work tenant");
        eq(mailLinkTarget(p, "ios", UA.iphone).iosScheme, "ms-outlook://", "one app for work and consumer alike");
        const android = mailLinkTarget(p, "android", UA.androidChrome);
        assert(android.href.includes(";package=com.microsoft.office.outlook;"), "same app on Android");
        eq(decodeURIComponent(fallbackOf(android.href)), p.url, "falling back to the tenant's own web URL");
    }
);

console.log("\n  The modal wiring");

const MODAL = read("src/components/EmailVerificationModal.tsx");

test("Open mail is an anchor, not a popup-blocked window.open", () => {
    assert(!/window\.open\s*\(/.test(MODAL), "window.open() after an await is blocked; use <a target=_blank>");
    assert(
        /<a\s+[^>]*href=\{mailTarget\.href\}/.test(MODAL),
        "the button must render an <a> bound to the resolved target"
    );
    assert(/rel="noopener noreferrer"/.test(MODAL), "target=_blank without noopener leaks window.opener");
});

test("the new tab survives on a phone too", () => {
    // EmailVerified.tsx is a deliberate dead end — "carry on in the tab where
    // you signed up". Spend the tap on a new tab so that one is still there.
    assert(/target="_blank"/.test(MODAL), "opens in a new tab so the polling tab survives");
    assert(
        !/target=\{/.test(MODAL),
        "no platform may trade the polling tab away — /verified has nowhere else to send the user"
    );
});

test("the search survives the app launch, on its own line", () => {
    // The app opens on its INBOX, and a verification email nobody can find is
    // usually in Spam — so the filtered URL has to stay one tap away on a phone.
    assert(
        /mailTarget\?\.opensApp && mailProvider\.filtered &&/.test(MODAL),
        "the search link belongs to the app path, and only where a real filter exists"
    );
    assert(
        /href=\{mailTarget\.webUrl\}/.test(MODAL),
        "it must point at the filtered web URL — the app link cannot carry a search"
    );
    assert(
        MODAL.includes("Search mail for {VERIFICATION_SENDER}"),
        "and say which sender it searches for, from the one constant"
    );
});

test("the phone decides once, outside the click handler", () => {
    assert(MODAL.includes("detectMobilePlatform()"), "the platform must be read");
    assert(
        /useMemo\(\(\) => detectMobilePlatform\(\), \[\]\)/.test(MODAL),
        "read it once per mount — a user agent cannot change under a mounted component"
    );
    assert(
        /mailLinkTarget\(mailProvider, platform\)/.test(MODAL),
        "the href must be decided when the modal opens, not on the tap"
    );
});

test("the iOS handler is the only one that intercepts the tap", () => {
    // Android's fallback lives in the href itself, so a handler there would only
    // add a way to get it wrong.
    assert(
        /onClick=\{\s*mailTarget\.iosScheme\s*\?/.test(MODAL),
        "the click handler must be conditional on there being an iOS scheme"
    );
    assert(MODAL.includes("e.preventDefault()"), "the anchor's own navigation has to stand down first");
    assert(MODAL.includes("openMailApp(mailTarget)"), "the app attempt belongs in the library, not inline here");
});

test("the URL is resolved when the modal opens, not inside the click handler", () => {
    const effectStart = MODAL.indexOf("useEffect(() => {");
    assert(effectStart !== -1, "expected a useEffect");
    assert(
        MODAL.includes("lookupMailProvider(email)"),
        "the async lookup must run ahead of the click"
    );
    // The call must not sit inside an onClick — that is the popup-blocked shape.
    assert(
        !/onClick=\{[^}]*lookupMailProvider/.test(MODAL),
        "resolving on click reintroduces the popup blocker"
    );
});

test("a stale provider cannot survive an email edit", () => {
    assert(
        MODAL.includes("setResolvedProvider(null)"),
        "editing the address must clear the previous domain's answer"
    );
    assert(MODAL.includes("cancelled = true"), "an in-flight lookup must not write after unmount");
});

test("nothing that was on the modal was taken off it", () => {
    for (const label of ["I've Verified", "Resend verification email", "Close", "Try alternate delivery"]) {
        assert(MODAL.includes(label), `"${label}" is missing — buttons were to be added, not replaced`);
    }
    assert(MODAL.includes("hey@mocksetu.in"), "the manual-escalation mailto is still there");
});

test("both new buttons are on the modal", () => {
    assert(MODAL.includes("mailProvider.label"), "Open mail renders the provider's own name");
    assert(MODAL.includes("Try a different email"), "Try a different email is missing");
});

test("Try a different email only appears where the caller can honour it", () => {
    assert(
        MODAL.includes("onUseDifferentEmail &&"),
        "without a handler the button would be a dead end"
    );
    assert(MODAL.includes("onUseDifferentEmail?:"), "the prop is optional");
});

console.log("\n  The pages behind it");

for (const page of ["src/pages/Auth.tsx", "src/pages/StudentAuth.tsx"]) {
    const SRC = read(page);

    test(`${page.split("/").pop()} hands the form back, emptied`, () => {
        assert(SRC.includes("onUseDifferentEmail={handleUseDifferentEmail}"), "prop not passed");
        assert(SRC.includes('setEmail("")'), "the old address must be cleared");
        assert(SRC.includes('setPassword("")'), "the old password must be cleared");
        assert(SRC.includes('setConfirmPassword("")'), "the confirm field must be cleared too");
        assert(SRC.includes("setShowVerificationModal(false)"), "the modal must close");
    });

    test(`${page.split("/").pop()} focuses the field it just emptied`, () => {
        assert(SRC.includes("signupEmailRef"), "no ref on the signup email input");
        assert(
            SRC.includes("ref={signupEmailRef}"),
            "the ref must be attached to the input, not just declared"
        );
        // The signup panel is unmounted on the sign-in tab, so the tab has to be
        // switched first — which means Tabs must be controlled, not defaultValue.
        assert(SRC.includes('setAuthTab("signup")'), "must switch to the signup tab");
        assert(
            SRC.includes("value={authTab} onValueChange={setAuthTab}"),
            "an uncontrolled <Tabs defaultValue> cannot be switched from code"
        );
        assert(!/\<Tabs defaultValue=/.test(SRC), "a leftover defaultValue would fight the controlled value");
    });
}

console.log("\n  One place to fix the sender");

test("the From address is defined once, in the library", () => {
    const LIB = read("src/lib/mailProvider.ts");
    const definitions = LIB.match(/VERIFICATION_SENDER = /g) || [];
    eq(definitions.length, 1, "exactly one definition");
    eq(VERIFICATION_SENDER, "hey@mocksetu.in", "matches supabase/functions/fallback-verify");
    // The modal must reference the constant, never re-type the address next to
    // the button copy.
    const buttonRegion = MODAL.slice(MODAL.indexOf("mailProvider.filtered"), MODAL.indexOf("mailProvider.filtered") + 400);
    assert(
        buttonRegion.includes("${VERIFICATION_SENDER}"),
        "the tooltip must interpolate the constant, not hardcode the address"
    );
});

test("the Edge Function fallback still sends from that same address", () => {
    const FN = read("supabase/functions/fallback-verify/index.ts");
    assert(
        FN.includes(`<${VERIFICATION_SENDER}>`),
        `fallback-verify sends from a different address than the search filters for`
    );
});

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
console.log("────────────────────────────────────────────────────────────\n");

if (failed > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    • ${f}`);
    process.exitCode = 1;
}
