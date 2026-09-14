/**
 * "CONTINUE WITH GOOGLE" — AND THE EMAIL FLOWS IT MUST NOT TOUCH
 *
 * Run with: node src/__tests__/google-oauth-flow.test.mjs
 *
 * Adding OAuth to this app means adding a SECOND kind of token landing to a
 * startup path that was written when there was only one. verificationLanding.ts
 * said so in as many words — "This app has no OAuth" — and acted on it: any
 * token in the URL with no `type` was a confirmation email, and got rewritten to
 * the terminal /verified page. A Google return is exactly that shape.
 *
 * So this file pins BOTH directions, and the email direction matters most,
 * because it is the one that already works and the one a regression here would
 * silently break:
 *
 *  1. EMAIL CONFIRMATIONS STILL LAND ON /verified. Every `type` an email link
 *     carries still routes the way it did, and a recovery link still goes to the
 *     reset page. The OAuth exemption is not allowed to widen into them.
 *  2. A GOOGLE RETURN IS NOT CLAIMED BY THE EMAIL PATH, on the portal pages it
 *     is sent back to, and on the homepage when Supabase's Site-URL fallback
 *     drops it there instead.
 *  3. THE PORTAL SURVIVES THE ROUND TRIP. signInWithOAuth has no options.data,
 *     so user_type — which every RLS policy reads — has to be parked and
 *     restored. A student who lost it would be read as a creator and refused
 *     their own attempt INSERT.
 *  4. THE JWT IS REFRESHED AFTER IT IS WRITTEN. updateUser re-saves the session
 *     with the SAME access_token, so Postgres keeps seeing the old claims until
 *     the token turns over. This is the failure with no visible symptom: the
 *     client is sure the user is a student, the database is sure they are not.
 *
 * Modules are EXECUTED, not just read — Node strips the TS types — with window
 * and storage shimmed, and re-imported per scenario via a cache-busting query.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// Windows checkout: files are CRLF on disk, so every source read is normalised
// before anything is matched against it.
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

// ── shims, installed before any module under test is imported ──────────────
const makeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _wipe: () => m.clear(),
  };
};
globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();

let replaced = null;
const setLocation = (pathname, search = "", hash = "") => {
  replaced = null;
  globalThis.window = {
    location: { pathname, search, hash },
    history: {
      replaceState: (_state, _title, url) => {
        replaced = url;
      },
    },
  };
};
setLocation("/");

let passed = 0;
let failed = 0;

function group(name) {
  console.log(`\n  ${name}`);
}
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

/** Fresh module instances, so each scenario re-runs the module-load logic. */
let bust = 0;
const loadLanding = async () => {
  bust += 1;
  const oauth = await import(`../lib/oauthLanding.ts?b=${bust}`);
  const verification = await import(`../lib/verificationLanding.ts?b=${bust}`);
  return { oauth, verification };
};

const intentModule = await import("../lib/authReturnIntent.ts");
const parkIntent = (portal, extra = {}) => {
  globalThis.localStorage.setItem(
    "authReturnIntent",
    JSON.stringify({ portal, ts: Date.now(), ...extra })
  );
};
const reset = () => {
  globalThis.localStorage._wipe();
  globalThis.sessionStorage._wipe();
};

console.log("\n\"CONTINUE WITH GOOGLE\" — AND THE EMAIL FLOWS IT MUST NOT TOUCH\n");

// ───────────────────────────────────────────────────────────────────────────
group("1. The email flows are untouched");

for (const type of ["signup", "email_change", "invite", "magiclink", "email"]) {
  test(`a ${type} link still lands on /verified`, async () => {
    reset();
    setLocation("/", "", `#access_token=abc&type=${type}`);
    const { verification, oauth } = await loadLanding();
    assert(verification.isVerificationLanding === true, `${type} stopped being a verification landing`);
    assert(oauth.isOAuthLanding === false, `${type} was mistaken for an OAuth return`);
    assert(String(replaced).startsWith("/verified"), `${type} was not rewritten to /verified`);
  });
}

test("a recovery link is still left for the reset page", async () => {
  reset();
  setLocation("/", "", "#access_token=abc&type=recovery");
  const { verification, oauth } = await loadLanding();
  assert(verification.isVerificationLanding === false, "recovery must not be a verification landing");
  assert(oauth.isOAuthLanding === false, "recovery must not be an OAuth landing");
});

test("a typeless confirmation landing is STILL claimed when no OAuth is in flight", async () => {
  // The original fallback, which exists because some GoTrue versions omit `type`
  // and PKCE email links carry only ?code=. The OAuth work must not delete it.
  reset();
  setLocation("/", "?code=xyz", "");
  const { verification } = await loadLanding();
  assert(verification.isVerificationLanding === true, "the typeless-confirmation fallback was lost");
});

test("an email link with a type beats a stale OAuth intent record", async () => {
  // Someone opens Google's consent screen, wanders off, then clicks a
  // confirmation email in the same browser. The email link must still win.
  reset();
  parkIntent("student");
  setLocation("/", "", "#access_token=abc&type=signup");
  const { verification, oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "a stale intent hijacked a real confirmation email");
  assert(verification.isVerificationLanding === true, "the confirmation email lost its landing page");
});

// The stale-intent family. A parked record only proves a Google flow was
// STARTED — never that this particular landing came back from one. Every case
// below is an email landing that carries no `type`, which is exactly the shape
// the OAuth check keys on, with a record sitting in storage.
test("an EXPIRED confirmation link keeps its own page even with a parked intent", async () => {
  // GoTrue's expired-link redirect is "?error=...&error_code=otp_expired" with
  // no type at all. Claiming it would replace EmailVerified's "resend" state
  // with a toast blaming Google for an email failure.
  reset();
  parkIntent("student");
  setLocation("/verified", "?error=access_denied&error_code=otp_expired", "#error=access_denied");
  const { oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "an expired email link was mistaken for a Google return");
  assert(replaced === null, "the expired-link page must not be rewritten away");
});

test("an EXPIRED reset link keeps its own page even with a parked intent", async () => {
  // Worse than the above: ResetPassword's invalid state carries the inline
  // "send me a new link" form, which is the user's only way forward.
  reset();
  parkIntent("creator");
  setLocation("/reset-password", "?error=access_denied&error_code=otp_expired", "#error=access_denied");
  const { oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "an expired reset link was mistaken for a Google return");
  assert(replaced === null, "the reset page must not be rewritten away");
});

test("a typeless ?code= confirmation still reaches /verified despite a parked intent", async () => {
  // The Site-URL arm accepts only a hash access_token — the implicit-flow OAuth
  // signature. A "?code=" is PKCE, which this client never uses for OAuth.
  reset();
  parkIntent("student");
  setLocation("/", "?code=xyz", "");
  const { oauth, verification } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "?code= on / is an email link, not a Google return");
  assert(verification.isVerificationLanding === true, "the typeless-confirmation fallback was surrendered");
});

test("an error-only landing on / is not claimed from storage alone", async () => {
  reset();
  parkIntent("student");
  setLocation("/", "?error=access_denied&error_description=Email+link+is+invalid", "");
  const { oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "a bare error on / is far more likely to be an expired email link");
});

test("an abandoned hand-off does not leave its record lying around", async () => {
  // Backing out of Google's consent screen returns to the portal page with
  // nothing in the URL. Nothing else ever retires the record.
  reset();
  parkIntent("student");
  setLocation("/student-auth", "", "");
  await loadLanding();
  assert(
    intentModule.peekAuthReturnIntent() === null,
    "an abandoned intent must be cleared, not left to widen the check for 15 minutes"
  );
});

test("a real return is NOT cleared by that sweep", async () => {
  reset();
  parkIntent("student", { returnTo: "/marketplace" });
  setLocation("/student-auth", "", "#access_token=abc");
  await loadLanding();
  assert(intentModule.peekAuthReturnIntent() !== null, "a live return must keep its record for the page to consume");
});

test("the module no longer claims the app has no OAuth", () => {
  const src = read("src/lib/verificationLanding.ts");
  assert(
    !/This app has no OAuth/.test(src),
    "the stale comment is still there and will mislead the next reader"
  );
  assert(
    /isOAuthLanding/.test(src),
    "verificationLanding must consult the OAuth landing check"
  );
});

// ───────────────────────────────────────────────────────────────────────────
group("2. A Google return is recognised, not swallowed");

for (const path of ["/auth", "/student-auth"]) {
  test(`an implicit-flow return on ${path} is an OAuth landing`, async () => {
    reset();
    setLocation(path, "", "#access_token=abc&refresh_token=def&token_type=bearer");
    const { oauth, verification } = await loadLanding();
    assert(oauth.isOAuthLanding === true, `${path} was not recognised as an OAuth return`);
    assert(verification.isVerificationLanding === false, `${path} was hijacked to /verified`);
    assert(replaced === null, "an OAuth return must not be rewritten anywhere");
  });
}

test("it is recognised on the portal path even with storage blocked", async () => {
  // The path arm exists precisely so a browser that refuses site data still works.
  reset();
  setLocation("/auth", "", "#access_token=abc");
  const { oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === true, "the path arm must not depend on storage");
});

test("a PKCE-shaped return on a portal path is recognised too", async () => {
  reset();
  setLocation("/student-auth", "?code=xyz", "");
  const { oauth, verification } = await loadLanding();
  assert(oauth.isOAuthLanding === true, "?code= on a portal path is still an OAuth return");
  assert(verification.isVerificationLanding === false, "?code= on a portal path was hijacked");
});

test("a denied consent screen is recognised so the page can say so", async () => {
  reset();
  setLocation("/auth", "", "#error=access_denied&error_description=User+denied");
  const { oauth } = await loadLanding();
  assert(oauth.isOAuthLanding === true, "a provider error must still be an OAuth landing");
  assert(/denied/i.test(String(oauth.oauthLandingError)), "the error text must be readable");
});

// ───────────────────────────────────────────────────────────────────────────
group("3. The Site-URL fallback is caught and re-routed");

test("a fallback landing on / is recognised via the parked intent", async () => {
  reset();
  parkIntent("student");
  setLocation("/", "", "#access_token=abc");
  const { oauth, verification } = await loadLanding();
  assert(oauth.isOAuthLanding === true, "the fallback landing was not recognised");
  assert(verification.isVerificationLanding === false, "the fallback landing was sent to /verified");
});

test("it is rewritten to the portal the flow started from", async () => {
  reset();
  parkIntent("creator");
  setLocation("/", "", "#access_token=abc");
  await loadLanding();
  assert(String(replaced).startsWith("/auth"), `expected /auth, got ${replaced}`);
});

test("the exam-submit journey is rebuilt onto the rewritten URL", async () => {
  // StudentAuth reads trigger/returnTo/from straight off the query string, so
  // restoring them is what lets the rest of that page stay unaware of the detour.
  reset();
  parkIntent("student", { trigger: "exam_submit", returnTo: "/exam/review/9", from: "marketplace" });
  setLocation("/", "", "#access_token=abc");
  await loadLanding();
  assert(String(replaced).startsWith("/student-auth"), `expected /student-auth, got ${replaced}`);
  assert(/trigger=exam_submit/.test(replaced), "the exam-submit trigger was dropped");
  assert(/returnTo=%2Fexam%2Freview%2F9/.test(replaced), "returnTo was dropped");
  assert(/from=marketplace/.test(replaced), "from was dropped");
  assert(/#access_token=abc$/.test(replaced), "the token must be carried across untouched");
});

test("without a parked intent, a landing on / is left to the email path", async () => {
  reset();
  setLocation("/", "", "#access_token=abc");
  const { oauth, verification } = await loadLanding();
  assert(oauth.isOAuthLanding === false, "a bare token on / must not be assumed to be OAuth");
  assert(verification.isVerificationLanding === true, "the email fallback must still claim it");
});

// ───────────────────────────────────────────────────────────────────────────
group("4. The parked intent behaves");

test("an expired record is ignored", () => {
  reset();
  globalThis.localStorage.setItem(
    "authReturnIntent",
    JSON.stringify({ portal: "student", ts: Date.now() - 60 * 60 * 1000 })
  );
  assert(intentModule.peekAuthReturnIntent() === null, "a stale intent must not be honoured");
});

test("reading consumes it, so a reload cannot replay the journey", () => {
  reset();
  parkIntent("student", { returnTo: "/marketplace" });
  assert(intentModule.consumeAuthReturnIntent()?.portal === "student", "the record should be readable once");
  assert(intentModule.consumeAuthReturnIntent() === null, "the record should be gone after one read");
});

test("an off-origin returnTo is refused", () => {
  reset();
  parkIntent("student", { returnTo: "//evil.example.com/steal" });
  assert(
    intentModule.consumeAuthReturnIntent()?.returnTo === undefined,
    "a protocol-relative returnTo is an open redirect and must be dropped"
  );
  assert(intentModule.safeReturnTo("//evil.example.com") === undefined, "// must be refused");
  assert(intentModule.safeReturnTo("https://evil.example.com") === undefined, "absolute URLs must be refused");
  assert(intentModule.safeReturnTo("/marketplace") === "/marketplace", "same-origin paths must survive");
});

test("the open-redirect guard is not fooled by a backslash or leading whitespace", () => {
  // "\" is a "/" after the scheme for http(s), and URL parsing strips leading
  // control characters before resolving — so both of these are "//evil.com" by
  // the time a browser sees them, while sailing past a startsWith("//") check.
  for (const hostile of [
    "/\\evil.example.com",
    "\t//evil.example.com",
    "\n//evil.example.com",
    " //evil.example.com",
    " //evil.example.com",
  ]) {
    assert(
      intentModule.safeReturnTo(hostile) === undefined,
      `${JSON.stringify(hostile)} is an open redirect and must be refused`
    );
  }
  assert(intentModule.safeReturnTo("/exam/review/12") === "/exam/review/12", "real paths must still pass");
});

test("a garbage record does not throw", () => {
  reset();
  globalThis.localStorage.setItem("authReturnIntent", "{not json");
  assert(intentModule.peekAuthReturnIntent() === null, "unparseable storage must read as absent");
});

// ───────────────────────────────────────────────────────────────────────────
group("5. user_type survives the round trip");

test("the portal is written when the account has none", () => {
  const src = read("src/lib/googleAuth.ts");
  assert(/updateUser\(\{/.test(src), "completeGoogleAuth must write user_type");
  assert(/user_type:\s*resolved/.test(src), "the resolved portal must be what gets written");
});

test("an existing user_type is NEVER overwritten", () => {
  // Otherwise "sign in with Google on the creator page" is a one-click promotion
  // out of the student role.
  const src = read("src/lib/googleAuth.ts");
  const guard = /if \(existing === "creator" \|\| existing === "student"\)[\s\S]{0,400}?wrong-portal/;
  assert(guard.test(src), "a known user_type must short-circuit to a portal check, not a write");
  const writeIndex = src.indexOf("user_type: resolved");
  const guardIndex = src.search(guard);
  assert(guardIndex !== -1 && guardIndex < writeIndex, "the guard must come before the write");
});

test("a linked legacy password account is not re-typed as a student", () => {
  const src = read("src/lib/googleAuth.ts");
  assert(
    /identity\.provider === "email"/.test(src) && /linkedToExistingPassword/.test(src),
    "an account Supabase auto-linked to an existing email login must keep its legacy creator reading"
  );
});

test("a half-written account is signed out rather than left as an effective creator", () => {
  // A signed-in session with no user_type is worse than no session: the client
  // and every RLS policy read the absence as "creator", so a student would get a
  // creator's app and a silent refusal on their own attempt INSERT.
  const src = read("src/lib/googleAuth.ts");
  const update = src.indexOf("supabase.auth.updateUser(");
  const refresh = src.indexOf("supabase.auth.refreshSession()");
  const tail = src.slice(update);
  const signOutsAfterUpdate = (tail.match(/supabase\.auth\.signOut\(\)/g) || []).length;
  assert(
    signOutsAfterUpdate >= 2,
    "both the updateUser failure and the refreshSession failure must sign the user out"
  );
  assert(refresh > update, "sanity: refresh follows update");
});

test("the JWT is refreshed after user_type is written", () => {
  // The failure with no symptom: RLS reads auth.jwt() -> user_metadata, and
  // updateUser reuses the old access_token.
  const src = read("src/lib/googleAuth.ts");
  // Match the CALLS, not the prose — the header comment names both.
  const update = src.indexOf("supabase.auth.updateUser(");
  const refresh = src.indexOf("supabase.auth.refreshSession()");
  assert(update !== -1, "expected an updateUser call");
  assert(refresh !== -1, "refreshSession is missing — RLS will keep seeing the old claims");
  assert(refresh > update, "refreshSession must follow updateUser, not precede it");
});

// ───────────────────────────────────────────────────────────────────────────
group("6. The pages hand over and take back correctly");

for (const [file, portal] of [["src/pages/Auth.tsx", "creator"], ["src/pages/StudentAuth.tsx", "student"]]) {
  test(`${file} renders the Google button once`, () => {
    const src = read(file);
    const count = (src.match(/<GoogleAuthButton/g) || []).length;
    assert(count === 1, `expected exactly one Google button, found ${count}`);
    assert(new RegExp(`portal="${portal}"`).test(src), `the button must declare portal="${portal}"`);
  });

  test(`${file} completes the return from its mount effect, not SIGNED_IN`, () => {
    // auth-js fires SIGNED_IN for a URL session inside _initialize on a
    // setTimeout(…, 0); these are lazy() routes that subscribe after that.
    const src = read(file);
    assert(/completeGoogleAuth\("/.test(src), "the page must complete the OAuth return");
    const inListener = /onAuthStateChange[\s\S]{0,600}?completeGoogleAuth/.test(src);
    assert(!inListener, "the return must not be driven from the auth-state listener");
    assert(/if \(isOAuthLanding\) return;/.test(src), "the SIGNED_IN branch must stand down during a return");
  });

  test(`${file} rejects a Google account belonging to the other portal`, () => {
    const src = read(file);
    assert(/wrong-portal/.test(src) && /signOut\(\)/.test(src), "a portal mismatch must sign the user out");
    assert(/Wrong account type/.test(src), "it must reuse the established wrong-portal message");
  });
}

test("StudentAuth stands the unsaved-responses guard down before leaving for Google", () => {
  // Without this the browser raises "Leave site? … may not be saved" over a
  // sign-in the student just asked for, warning about the very thing it protects.
  const src = read("src/pages/StudentAuth.tsx");
  assert(/leavingForGoogleRef/.test(src), "expected a deliberate-navigation latch");
  assert(
    /onBeforeRedirect=\{\(\) => \{ leavingForGoogleRef\.current = true; \}\}/.test(src),
    "the latch must be set before the redirect"
  );
  assert(
    /if \(leavingForGoogleRef\.current\) return;/.test(src),
    "the beforeunload handler must honour the latch"
  );
});

test("StudentAuth hands the exam-submit journey to the button", () => {
  const src = read("src/pages/StudentAuth.tsx");
  for (const prop of ["trigger=", "returnTo=", "from="]) {
    assert(src.includes(prop), `the Google button must carry ${prop}`);
  }
});

test("the global listener does not race the portal page", () => {
  const src = read("src/components/AuthStateListener.tsx");
  assert(/isOAuthLanding/.test(src), "the listener must know about OAuth returns");
  const signedIn = src.indexOf("event === 'SIGNED_IN'");
  const guard = src.indexOf("if (isOAuthLanding) return;");
  assert(guard > signedIn && guard - signedIn < 800, "the guard must sit inside the SIGNED_IN branch");
});

// ───────────────────────────────────────────────────────────────────────────
group("7. The password offer");

test("a Google-only account is offered a password", async () => {
  const { shouldPromptForPassword } = await import("../lib/passwordSetup.ts");
  reset();
  const googleOnly = { identities: [{ provider: "google" }], user_metadata: {}, app_metadata: {} };
  assert(shouldPromptForPassword(googleOnly) === true, "a Google-only account should be offered one");
});

test("an account that already has a password is not pestered", async () => {
  const { shouldPromptForPassword, hasPasswordCredential } = await import("../lib/passwordSetup.ts");
  reset();
  const both = {
    identities: [{ provider: "google" }, { provider: "email" }],
    user_metadata: {},
    app_metadata: {},
  };
  assert(hasPasswordCredential(both) === true, "an email identity means a password exists");
  assert(shouldPromptForPassword(both) === false, "no prompt when a password already exists");

  // The flag covers the case where the server does not add an email identity.
  const flagged = {
    identities: [{ provider: "google" }],
    user_metadata: { password_set: true },
    app_metadata: {},
  };
  assert(shouldPromptForPassword(flagged) === false, "the password_set flag must be honoured");
});

test("an email/password account is never offered one", async () => {
  const { shouldPromptForPassword } = await import("../lib/passwordSetup.ts");
  reset();
  const emailOnly = { identities: [{ provider: "email" }], user_metadata: {}, app_metadata: {} };
  assert(shouldPromptForPassword(emailOnly) === false, "this prompt is only for Google accounts");
});

test("skipping lasts the session, not forever", async () => {
  const { shouldPromptForPassword, skipPasswordPrompt, clearPasswordPromptSkip } =
    await import("../lib/passwordSetup.ts");
  reset();
  const googleOnly = { identities: [{ provider: "google" }], user_metadata: {}, app_metadata: {} };
  skipPasswordPrompt();
  assert(shouldPromptForPassword(googleOnly) === false, "a skip must be respected for the session");
  clearPasswordPromptSkip(); // a new session
  assert(shouldPromptForPassword(googleOnly) === true, "a new session must offer it again");
});

test("it waits behind a finished exam", async () => {
  const { shouldPromptForPassword } = await import("../lib/passwordSetup.ts");
  reset();
  globalThis.sessionStorage.setItem("needsOnboarding", "1");
  const googleOnly = { identities: [{ provider: "google" }], user_metadata: {}, app_metadata: {} };
  assert(
    shouldPromptForPassword(googleOnly) === false,
    "nothing may stand between a student and their attempt being saved"
  );
});

test("setting a password preserves user_type in the same write", () => {
  const src = read("src/components/SetPasswordModal.tsx");
  assert(
    /data:\s*\{\s*\.\.\.user\.user_metadata,\s*password_set:\s*true\s*\}/.test(src),
    "metadata must be spread back, or user_type could be lost and RLS would fail"
  );
  assert(/password,/.test(src), "the password and the flag must be one write");
});

test("the prompt is skippable but the outside-click is not an accident", () => {
  const src = read("src/components/SetPasswordModal.tsx");
  assert(/Skip for now/.test(src), "there must be an explicit skip");
  assert(/onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/.test(src), "outside clicks must not dismiss it");
});

test("closing it from User Profile does not silence the real prompt later", () => {
  // Opened deliberately, closing is just closing. Writing the session-wide skip
  // there would suppress a prompt the user never saw and never declined.
  const src = read("src/components/SetPasswordModal.tsx");
  assert(
    /if \(!required\) skipPasswordPrompt\(\);/.test(src),
    "the skip flag must only be written for an unprompted dismissal"
  );
});

test("the prompt is re-checked when the thing blocking it finishes", () => {
  // needsOnboarding is cleared by a bare sessionStorage write inside ExamReview,
  // which fires no React update and no storage event in its own tab — so the
  // post-exam prompt would otherwise never appear.
  const prompt = read("src/components/SetPasswordPrompt.tsx");
  const review = read("src/pages/ExamReview.tsx");
  assert(/PASSWORD_PROMPT_RECHECK_EVENT/.test(prompt), "the gate must listen for a recheck");
  assert(/recheck\]/.test(prompt), "the recheck must actually re-run the evaluation effect");
  assert(
    /notifyPasswordPromptRecheck\(\)/.test(review),
    "ExamReview must raise it after clearing needsOnboarding"
  );
  const clearIdx = review.indexOf("removeItem('needsOnboarding')");
  const notifyIdx = review.indexOf("notifyPasswordPromptRecheck()");
  assert(clearIdx !== -1 && notifyIdx > clearIdx, "the signal must follow the clear");
});

test("a bfcache restore re-arms the exam guard and frees the button", () => {
  // Hitting Back from Google's consent screen restores this page instead of
  // re-running it, so the latches set on the way out would otherwise survive.
  const src = read("src/pages/StudentAuth.tsx");
  assert(/"pageshow"/.test(src), "a bfcache restore must be handled");
  assert(/e\.persisted/.test(src), "only a persisted restore should reset the latches");
  const handler = src.slice(src.indexOf("handlePageShow"));
  assert(/leavingForGoogleRef\.current = false/.test(handler), "the unsaved-responses guard must be re-armed");
  assert(/setGoogleLoading\(false\)/.test(handler), "the button must be released");
});

test("the OAuth return can never wedge the button", () => {
  for (const file of ["src/pages/Auth.tsx", "src/pages/StudentAuth.tsx"]) {
    const src = read(file);
    const fn = src.slice(src.indexOf("const finishGoogle"), src.indexOf("const checkUser"));
    assert(/try \{/.test(fn), `${file}: the return must be wrapped`);
    assert(/\} finally \{/.test(fn), `${file}: the busy state must be released in a finally`);
    assert(/setGoogleLoading\(false\);/.test(fn.slice(fn.indexOf("finally"))), `${file}: released in finally`);
  }
});

test("the email forms are not usable while the Google leg is in flight", () => {
  for (const file of ["src/pages/Auth.tsx", "src/pages/StudentAuth.tsx"]) {
    const src = read(file);
    assert(
      !/<button type="submit" disabled=\{loading\}/.test(src),
      `${file}: a password submit must not race the OAuth return`
    );
    assert(/disabled=\{loading \|\| googleLoading\}/.test(src), `${file}: expected the combined guard`);
  }
});

test("User Profile offers it to anyone who skipped", () => {
  const src = read("src/components/ProfileDialog.tsx");
  assert(/SetPasswordModal/.test(src), "User Profile must be able to open it");
  assert(/Set a password/.test(src), "there must be a visible way back to it");
});

test("the prompt never appears mid-exam", () => {
  const src = read("src/components/SetPasswordPrompt.tsx");
  assert(/isSettledDestination/.test(src), "the prompt must be restricted to settled pages");
  assert(
    /pathname === "\/dashboard"/.test(src) &&
    /pathname === "\/marketplace"/.test(src) &&
    /pathname\.startsWith\("\/exam\/review\/"\)/.test(src),
    "only the dashboard, the library and the review page may raise it"
  );
  assert(!/simulator/.test(src), "the simulator must not be in the allowlist");
});

test("it costs no network request on page load", () => {
  // Free tier, and this mounts in the app layout — getUser() would hit /user on
  // every navigation. getSession() reads storage and already carries identities.
  const src = read("src/components/SetPasswordPrompt.tsx");
  assert(/getSession\(\)/.test(src), "expected getSession");
  assert(!/getUser\(\)/.test(src), "getUser() would add a request to every page load");
});

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
console.log("────────────────────────────────────────────────────────────\n");

process.exit(failed > 0 ? 1 : 0);
