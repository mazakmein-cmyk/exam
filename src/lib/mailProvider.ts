// "Open mail" — send the user straight to the inbox the verification link is
// sitting in, with a search for the sender already applied.
//
// The whole point of the button is that someone cannot find the email, so a
// wrong destination is worse than no button at all: landing a Microsoft 365
// user in Gmail wastes a login and teaches them the product is broken. Every
// function here returns null rather than guessing, and the modal simply omits
// the button when nothing is known.
//
// Two-step resolution:
//   1. The address domain, against a static table. Covers the ~95% case
//      (gmail.com, hotmail.in, yahoo.co.in, …) with zero network.
//   2. Only for domains the table misses — a custom domain like @mocksetu.in
//      or a college's @xyz.ac.in — one DNS-over-HTTPS MX lookup, because the
//      MX host is what actually names the provider. Sends the DOMAIN only,
//      never the address.

/**
 * The From address of the verification email.
 *
 * SINGLE SOURCE OF TRUTH, and worth keeping honest: the Supabase-sent email
 * (resend attempts 1 and 2) takes its From from the SMTP settings in the
 * Supabase dashboard, which this repo cannot see. The Edge Function fallback
 * (supabase/functions/fallback-verify) sends as "MockSetu <hey@mocksetu.in>".
 * If the dashboard ever disagrees with this constant the search lands on an
 * empty result, so change it here and nowhere else.
 */
export const VERIFICATION_SENDER = "hey@mocksetu.in";

export interface MailProvider {
    /** Stable id, used by tests and as a React key. */
    id: string;
    /** Shown to the user: "Open Gmail", "Open Outlook". */
    label: string;
    /** Where the button points. Already carries the search where possible. */
    url: string;
    /**
     * False when the provider has no usable search deep link and the URL only
     * opens the mailbox. The button still helps — it is one tap instead of
     * three — but it must not promise a filter it did not apply.
     */
    filtered: boolean;
}

type ProviderId =
    | "gmail"
    | "outlook"
    | "office365"
    | "yahoo"
    | "proton"
    // Zoho splits by datacenter and the webmail hosts are NOT interchangeable:
    // an account whose MX is mx.zoho.in signs in at mail.zoho.in, not .com.
    | "zoho"
    | "zohoIn"
    | "zohoEu"
    | "icloud"
    | "yandex"
    | "rediff"
    | "aol";

/** `from:hey@mocksetu.in in:anywhere` — the query, before any URL encoding. */
const searchTerms = (sender: string): string => `from:${sender}`;

/**
 * Gmail separates terms inside the #search fragment with `+`. encodeURIComponent
 * turns a space into %20, which Gmail reads as part of the term rather than as
 * a separator, so swap it back.
 */
const gmailQuery = (sender: string): string =>
    encodeURIComponent(`${searchTerms(sender)} in:anywhere`).replace(/%20/g, "+");

const buildUrl = (id: ProviderId, email: string, sender: string): MailProvider => {
    const q = searchTerms(sender);

    switch (id) {
        case "gmail":
            // MUST be /mail/u/0/ — a TERMINAL route. Observed behaviour:
            //
            //   /mail/      301 -> /mail/u/0/          path rewritten
            //   /mail/u/    302 -> must resolve an index when authenticated
            //   /mail/u/0/  302 -> continue=/mail/u/0/  rewritten by nothing
            //
            // The search rides in the #fragment, and a fragment only survives a
            // redirect while the browser has somewhere to reapply it. Both of
            // the first two forms make Gmail resolve the URL to a concrete
            // account before it renders, and that resolution lands on an
            // address of its own choosing — taking #search with it, so the
            // button opened a plain inbox with no filter at all. Only the
            // already-resolved /u/0/ is safe.
            //
            // The cost is real and there is no way around it: /u/0/ is the
            // FIRST signed-in Google account, so someone signed into two will
            // get the search applied in the wrong mailbox. Gmail offers no
            // single URL that pins both the account and the query — authuser
            // loses to a path index, /mail/u/<email>/ 404s, and dropping the
            // index to let authuser win is what broke the search. authuser is
            // kept below because it costs nothing and does prefill the address
            // when the user is signed out, but it does NOT reliably switch
            // accounts. The filter is the thing the button exists for, so the
            // filter is what we guarantee.
            //
            // `in:anywhere` is the other half — it searches Spam and Trash,
            // which is where a missing verification email usually is.
            return {
                id,
                label: "Open Gmail",
                url: `https://mail.google.com/mail/u/0/?authuser=${encodeURIComponent(email)}#search/${gmailQuery(sender)}`,
                filtered: true,
            };

        case "outlook":
            // Consumer Outlook.com. Same OWA build as the work tenant below;
            // the /0/ segment that older guides use has been dropped — and
            // leaving it out matters here for the same reason it does in Gmail,
            // since /mail/0/ pins the first signed-in mailbox.
            //
            // `login_hint` is Microsoft's equivalent of authuser: it names the
            // account the link is meant for. An unrecognised hint is ignored
            // rather than fatal, so this is never worse than omitting it.
            return {
                id,
                label: "Open Outlook",
                url: `https://outlook.live.com/mail/deeplink/search?query=${encodeURIComponent(q)}&login_hint=${encodeURIComponent(email)}`,
                filtered: true,
            };

        case "office365":
            // Work/school tenant. This deep link is the one Microsoft documents.
            return {
                id,
                label: "Open Outlook",
                url: `https://outlook.office.com/mail/deeplink/search?query=${encodeURIComponent(q)}&login_hint=${encodeURIComponent(email)}`,
                filtered: true,
            };

        case "yahoo":
            return {
                id,
                label: "Open Yahoo Mail",
                url: `https://mail.yahoo.com/d/search/keyword=${encodeURIComponent(q)}`,
                filtered: true,
            };

        case "proton":
            // all-mail is the folder that includes Spam and Trash.
            // NOTE: /u/0/ pins the first signed-in Proton account, the same
            // trap Gmail springs above. Proton exposes no address hint to fix
            // it with, so a multi-account Proton user may have to switch once.
            return {
                id,
                label: "Open Proton Mail",
                url: `https://mail.proton.me/u/0/all-mail#keyword=${encodeURIComponent(sender)}`,
                filtered: true,
            };

        case "yandex":
            return {
                id,
                label: "Open Yandex Mail",
                url: `https://mail.yandex.com/#search?request=${encodeURIComponent(q)}`,
                filtered: true,
            };

        // Below: no search deep link worth trusting. Open the mailbox and say
        // nothing about filtering.
        case "zoho":
            return { id, label: "Open Zoho Mail", url: "https://mail.zoho.com/zm/#mail/folder/inbox", filtered: false };

        case "zohoIn":
            return { id, label: "Open Zoho Mail", url: "https://mail.zoho.in/zm/#mail/folder/inbox", filtered: false };

        case "zohoEu":
            return { id, label: "Open Zoho Mail", url: "https://mail.zoho.eu/zm/#mail/folder/inbox", filtered: false };

        case "icloud":
            return { id, label: "Open iCloud Mail", url: "https://www.icloud.com/mail", filtered: false };

        case "rediff":
            return { id, label: "Open Rediffmail", url: "https://mail.rediff.com/cgi-bin/login.cgi", filtered: false };

        case "aol":
            return { id, label: "Open AOL Mail", url: "https://mail.aol.com/", filtered: false };
    }
};

/** Exact-host matches. Cheap, and the overwhelming majority of signups. */
const DOMAIN_TABLE: Record<string, ProviderId> = {
    "gmail.com": "gmail",
    "googlemail.com": "gmail",

    "outlook.com": "outlook",
    "outlook.in": "outlook",
    "hotmail.com": "outlook",
    "live.com": "outlook",
    "msn.com": "outlook",
    "passport.com": "outlook",

    "yahoo.com": "yahoo",
    "ymail.com": "yahoo",
    "rocketmail.com": "yahoo",

    "aol.com": "aol",

    "proton.me": "proton",
    "protonmail.com": "proton",
    "protonmail.ch": "proton",
    "pm.me": "proton",

    "icloud.com": "icloud",
    "me.com": "icloud",
    "mac.com": "icloud",

    "zoho.com": "zoho",
    "zohomail.com": "zoho",
    "zoho.in": "zohoIn",
    "zoho.eu": "zohoEu",

    "yandex.com": "yandex",
    "yandex.ru": "yandex",
    "ya.ru": "yandex",

    "rediffmail.com": "rediff",
    "rediff.com": "rediff",
};

/**
 * Country variants are endless — hotmail.co.uk, live.in, yahoo.co.in,
 * yahoo.com.br — so match the leading label instead of listing them all.
 * Anchored at a dot so "notlive.com" cannot match "live.".
 */
const DOMAIN_PREFIXES: Array<[string, ProviderId]> = [
    ["hotmail.", "outlook"],
    ["outlook.", "outlook"],
    ["live.", "outlook"],
    ["msn.", "outlook"],
    ["yahoo.", "yahoo"],
    ["aol.", "aol"],
    ["yandex.", "yandex"],
];

/** MX hostname suffixes. This is what actually identifies a custom domain. */
const MX_SUFFIXES: Array<[string, ProviderId]> = [
    // Google Workspace: aspmx.l.google.com, alt1.aspmx.l.google.com,
    // and the newer smtp.google.com.
    ["aspmx.l.google.com", "gmail"],
    ["googlemail.com", "gmail"],
    ["smtp.google.com", "gmail"],
    ["google.com", "gmail"],

    // Microsoft 365: <tenant>.mail.protection.outlook.com
    ["mail.protection.outlook.com", "office365"],
    ["protection.outlook.com", "office365"],
    ["office365.us", "office365"],

    ["zoho.com", "zoho"],
    ["zoho.eu", "zohoEu"],
    ["zoho.in", "zohoIn"],

    ["protonmail.ch", "proton"],
    ["proton.me", "proton"],

    // Yahoo hosts AOL too, but yahoodns.net is also what Yahoo Small Business
    // sells to custom domains — Yahoo Mail is the right landing page for both.
    ["yahoodns.net", "yahoo"],

    ["mail.icloud.com", "icloud"],
    ["icloud.com", "icloud"],

    ["mx.yandex.net", "yandex"],
    ["yandex.net", "yandex"],

    ["rediffmail.com", "rediff"],
];

/**
 * The domain half of an address, lowercased. Null for anything that is not a
 * single-@ address — the modal is fed straight from a form field, so a
 * half-typed value has to be survivable.
 */
export const emailDomain = (email: string): string | null => {
    if (typeof email !== "string") return null;
    const parts = email.trim().toLowerCase().split("@");
    if (parts.length !== 2) return null;
    // "@gmail.com" has a perfectly good domain half and is still not an
    // address — without this the modal would offer to open a mailbox for an
    // account that cannot exist.
    if (!parts[0]) return null;
    const domain = parts[1].replace(/\.+$/, "");
    // A bare "user@" or a domain with no dot is not routable.
    if (!domain || !domain.includes(".")) return null;
    return domain;
};

const providerIdForDomain = (domain: string | null): ProviderId | null => {
    if (!domain) return null;
    const exact = DOMAIN_TABLE[domain];
    if (exact) return exact;
    for (const [prefix, id] of DOMAIN_PREFIXES) {
        if (domain.startsWith(prefix)) return id;
    }
    return null;
};

/**
 * Synchronous lookup against the static table. Returns null for a domain the
 * table does not know, which is the signal to try {@link lookupMailProvider}.
 */
export const mailProviderForEmail = (
    email: string,
    sender: string = VERIFICATION_SENDER
): MailProvider | null => {
    const domain = emailDomain(email);
    const id = providerIdForDomain(domain);
    if (!id) return null;
    return buildUrl(id, email.trim(), sender);
};

/** Longest-suffix match, so "google.com" cannot shadow a more specific entry. */
export const providerIdForMxHosts = (hosts: string[]): ProviderId | null => {
    let best: ProviderId | null = null;
    let bestLength = -1;

    for (const raw of hosts) {
        const host = String(raw || "").trim().toLowerCase().replace(/\.+$/, "");
        if (!host) continue;
        for (const [suffix, id] of MX_SUFFIXES) {
            const matches = host === suffix || host.endsWith(`.${suffix}`);
            if (matches && suffix.length > bestLength) {
                best = id;
                bestLength = suffix.length;
            }
        }
    }

    return best;
};

/**
 * Pulls MX hostnames out of a DNS-over-HTTPS JSON answer.
 *
 * An answer set can contain CNAME records alongside the MX ones, so filter on
 * type 15. Each MX rdata is "<preference> <host>", e.g. "10 aspmx.l.google.com."
 */
export const parseMxHosts = (payload: unknown): string[] => {
    const answers = (payload as { Answer?: unknown })?.Answer;
    if (!Array.isArray(answers)) return [];

    const hosts: string[] = [];
    for (const answer of answers) {
        const record = answer as { type?: number; data?: unknown };
        if (record?.type !== 15) continue;
        if (typeof record.data !== "string") continue;
        // Split on whitespace without a regex class; the host is the last token.
        const tokens = record.data.trim().split(" ").filter(Boolean);
        const host = tokens[tokens.length - 1];
        if (host) hosts.push(host);
    }
    return hosts;
};

/**
 * Both are free, keyless and CORS-enabled. Two of them because dns.google is
 * blocked outright on a few Indian ISPs and campus networks, which would
 * otherwise silently cost every custom-domain user the button.
 */
const DOH_ENDPOINTS = [
    "https://dns.google/resolve",
    "https://cloudflare-dns.com/dns-query",
];

const MX_TIMEOUT_MS = 4000;

/**
 * Full resolution: static table first, MX lookup only if it misses.
 *
 * Never throws and never rejects — a blocked network, a timeout or an
 * unrecognised provider all come back as null, and the caller hides the button.
 * At most two small requests, once per modal open, and only for addresses on a
 * domain the static table did not already answer.
 */
export const lookupMailProvider = async (
    email: string,
    sender: string = VERIFICATION_SENDER
): Promise<MailProvider | null> => {
    const known = mailProviderForEmail(email, sender);
    if (known) return known;

    const domain = emailDomain(email);
    if (!domain) return null;

    for (const endpoint of DOH_ENDPOINTS) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), MX_TIMEOUT_MS);
            let payload: unknown;
            try {
                const response = await fetch(
                    `${endpoint}?name=${encodeURIComponent(domain)}&type=MX`,
                    { headers: { accept: "application/dns-json" }, signal: controller.signal }
                );
                if (!response.ok) continue;
                payload = await response.json();
            } finally {
                clearTimeout(timer);
            }

            const id = providerIdForMxHosts(parseMxHosts(payload));
            if (id) return buildUrl(id, email.trim(), sender);
            // Resolved cleanly but the provider is one we have no page for —
            // a second opinion from the other resolver would say the same.
            return null;
        } catch {
            // Blocked, offline or timed out. Try the next resolver.
        }
    }

    return null;
};
