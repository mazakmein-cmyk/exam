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

test("the Gmail link names the account, so a second signed-in Google account is skipped", () => {
    const url = mailProviderForEmail("shivam+tag@gmail.com").url;
    const authuser = new URL(url).searchParams.get("authuser");
    eq(authuser, "shivam+tag@gmail.com", "authuser disambiguates personal vs school accounts");
});

test("the Gmail link must NOT pin an account index in its path", () => {
    // The bug this guards. Observed against Google, unauthenticated:
    //
    //   /mail/?authuser=X    301 -> /mail/u/0/?authuser=X    index pinned
    //   /mail/u/?authuser=X  302 -> login, continue=/mail/u/   not pinned
    //
    // Google rewrites a bare /mail/ to /mail/u/0/ BEFORE authuser is read, and
    // an index in the path beats the query parameter — so every multi-account
    // user landed in account 0 regardless of who they signed up as. Any /u/<n>/
    // creeping back into this URL reintroduces exactly that.
    const url = mailProviderForEmail("shivam@gmail.com").url;
    const path = new URL(url).pathname;
    eq(path, "/mail/u/", "the index slot must stay empty for authuser to win");
    assert(!/\/u\/\d/.test(url), `a pinned account index is the bug: ${url}`);
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

console.log("\n  The modal wiring");

const MODAL = read("src/components/EmailVerificationModal.tsx");

test("Open mail is an anchor, not a popup-blocked window.open", () => {
    assert(!/window\.open\s*\(/.test(MODAL), "window.open() after an await is blocked; use <a target=_blank>");
    assert(
        /<a\s+[^>]*href=\{mailProvider\.url\}/.test(MODAL),
        "the button must render an <a> bound to the resolved URL"
    );
    assert(/target="_blank"/.test(MODAL), "opens in a new tab so the polling tab survives");
    assert(/rel="noopener noreferrer"/.test(MODAL), "target=_blank without noopener leaks window.opener");
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
