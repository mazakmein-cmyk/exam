# Google sign-in

"Continue with Google" on both portals, plus a prompt that offers a password to
accounts created that way.

The code is shipped. **None of it does anything until the dashboard steps below
are done** — the button will send the user to Google and Google will refuse,
because no OAuth client exists yet. Nothing is a SQL migration; it is all
dashboard configuration, and it takes effect immediately with no redeploy.

---

## Step 0 — confirm which Supabase project is live

Do this first; everything else keys off it.

The repo disagrees with itself:

| Source | Project ref |
| --- | --- |
| `.env` → `VITE_SUPABASE_URL` | `dwqlxyvrlrwzjwmjiost` |
| `index.html:118` preconnect | `dwqlxyvrlrwzjwmjiost` |
| `supabase/config.toml:1` | `qduxyrfibiqcwrwxqsno` |

Two independent sources say `dwqlxyvrlrwzjwmjiost`, and that is the one the app
actually connects to, so it is almost certainly right. `config.toml` is stale —
three other docs already warn about it.

Confirm anyway, because getting it wrong fails **silently**: Google redirects to
a project that never sees the user, and the only symptom is a sign-in that
dead-ends. Read `VITE_SUPABASE_URL` for the Production environment in Vercel →
Settings → Environment Variables. Everything below writes `<REF>`.

## Step 1 — Google Cloud Console

1. **OAuth consent screen** (APIs & Services → OAuth consent screen)
   - User type: **External**
   - App name `MockSetu`, support email, developer email
   - Authorized domains: `mocksetu.in` **and** `supabase.co` — the callback host
     must be listed or the client is rejected
   - Scopes: only the three non-sensitive defaults — `openid`,
     `userinfo.email`, `userinfo.profile`. No sensitive scope means no Google
     verification review.
   - **Click PUBLISH APP.** While it says "Testing", only users you add by hand
     can sign in and their refresh tokens expire after 7 days.

2. **Credentials** → Create credentials → OAuth client ID
   - Application type: **Web application**
   - **Authorized redirect URIs** — exactly one, no trailing slash:
     ```
     https://<REF>.supabase.co/auth/v1/callback
     ```
     This is Supabase's endpoint, not a mocksetu.in URL. `/auth` and
     `/student-auth` never appear here.
   - **Authorized JavaScript origins** — leave empty. We use a full-page
     redirect (`signInWithOAuth`), which does not consult them. They are only
     needed if Google One Tap is added later.
   - Copy the Client ID and Client Secret.

## Step 2 — Supabase dashboard (on the `<REF>` project from Step 0)

1. **Authentication → Providers → Google**: enable, paste the Client ID and
   Secret, leave "Skip nonce check" off, save.
   The read-only *Callback URL* shown on that panel must match what you pasted
   into Google in Step 1 character for character — that is the cheapest way to
   catch a wrong `<REF>`.

2. **Authentication → URL Configuration → Redirect URLs** — add, keeping what is
   already there:
   ```
   http://localhost:8080/**
   https://mocksetu.in/**
   ```
   The `/**` wildcard covers `/auth`, `/student-auth`, `/verified` and
   `/reset-password` in one entry. Add `https://*.vercel.app/**` too if you want
   Google sign-in to work on preview deployments.

3. **Authentication → URL Configuration → Site URL**: confirm it is
   `https://mocksetu.in`, no trailing slash.

### Why step 2.2 is not optional

Supabase does not error on a redirect target that is missing from the allowlist —
it silently substitutes the Site URL and delivers the session anyway. This
codebase documents that failure in four places already.

The app now survives it: `oauthLanding.ts` recognises the fallback landing from
the parked intent record and rewrites the path back to the right portal page,
rebuilding the `trigger`/`returnTo` query the fallback discarded. But that safety
net depends on `localStorage` being available. Add the allowlist entries.

## Step 3 — verify before trusting it

On `http://localhost:8080`:

1. Click **Continue with Google** on `/student-auth`. You should come back to
   `/student-auth` — **not** `/verified`, and not `mocksetu.in`.
2. In the console, check the account came out right:
   ```js
   const { data: { user } } = await supabase.auth.getUser()
   user.user_metadata.user_type   // "student"
   user.email_confirmed_at        // must be set — see below
   user.identities.map(i => i.provider)
   ```
3. Set a password through the prompt, sign out, then sign in with email +
   password on `/student-auth`.

**Step 3's third check is the one that can still block this feature.** Both
portals reject a sign-in whose `email_confirmed_at` is unset
(`Auth.tsx`, `StudentAuth.tsx` — "Verification required"). Google asserts a
verified email so GoTrue should set it, which is why the code does not work
around it — but that is server behaviour this repo cannot prove. If a Google user
who has set a password is bounced with "Verification required", that gate needs
an exemption for OAuth-created accounts.

Failure signatures:

| Symptom | Cause |
| --- | --- |
| `Error 400: redirect_uri_mismatch` | Step 1 redirect URI, or a wrong `<REF>` |
| Lands on `mocksetu.in` from localhost | Step 2.2 — localhost not allowlisted |
| Lands on `/verified` and stops | Step 2.2 **and** localStorage unavailable |
| "Access blocked" for a normal user | Step 1.1 — consent screen still in Testing |

---

## How it works

### The portal problem

`signInWithOAuth` has no `options.data`, so unlike email signup there is nowhere
to put `user_type` on the way out. A brand new Google account comes back with
none — and a missing `user_type` is read as **creator** by `use-user-role.ts` and
by every RLS policy. A Google *student* would look fine until their finished
paper failed to save, because the `attempts` INSERT policy tests
`auth.jwt() -> 'user_metadata' ->> 'user_type' = 'student'`.

So `authReturnIntent.ts` parks the portal in `localStorage` before the redirect
(and it also rides on the redirect URL's query string — the two cover different
failures), and `completeGoogleAuth` writes it on the way back.

**Then it calls `refreshSession()`, and that is not optional.** `updateUser`
re-saves the session with the *same* access token, so Postgres keeps reading the
old claims until the token turns over. Without the refresh you get a client
certain the user is a student and a database certain they are not.

An account that already has a `user_type` **never** has it overwritten — that
would make "sign in with Google on the creator page" a one-click promotion out of
the student role. A mismatch signs the user out with the existing "Wrong account
type" message instead.

### The landing problem

`verificationLanding.ts` used to say, in a comment, "This app has no OAuth" — and
acted on it. Any token in the URL with no `type` param was treated as a
confirmation email and rewritten to `/verified`, a page deliberately built as a
dead end. On the default implicit flow a Google return is exactly that shape, so
every Google sign-in would have stranded the user there, signed in, on a page
about email.

`oauthLanding.ts` now recognises an OAuth return two ways and
`verificationLanding.ts` stands down for it:

- **By landing path.** `/auth` and `/student-auth` are never email destinations,
  so any result arriving there is ours. This arm works even with storage blocked.
- **By the parked intent record**, for the Site-URL fallback — and this one is
  kept deliberately narrow, because the record only proves a Google flow was
  *started*, not that this landing came back from one. It applies only on `/`,
  only to a hash `access_token` (the implicit-flow signature), and never to an
  error-only landing. Otherwise a record left by an abandoned consent screen
  would swallow an **expired** email link, which arrives with error params and no
  `type` — costing the user the resend form that is their only way forward. An
  abandoned record is also cleared on the next portal-page load rather than
  sitting for its full TTL.

**An explicit `type` short-circuits both arms first**, so no valid email link can
be caught by either. `src/__tests__/google-oauth-flow.test.mjs` pins both
directions, including every typeless email landing.

### Account linking

Supabase automatically links a Google identity into an existing user with the
same **confirmed** email. It cannot be turned off. So signing up with a password
and later using Google gives you one account with both ways in, which is what we
want. One consequence is handled explicitly: an older account with no `user_type`
that Google has just been linked into is treated as a **creator** (the app's
existing rule for legacy accounts) rather than being re-typed by whichever button
was clicked.

### The password prompt

Offered to Google accounts with no password, on settled pages only — the
dashboard, the library, the review page. Never mid-exam, and never in front of a
finished paper still being written: `shouldPromptForPassword` stands down while
`needsOnboarding` is set, so the order is always profile first, password second.

"Skip for now" is honoured for the session and offered again next visit, and
**User Profile → Sign in with → Set a password** is always available.

Whether an account has a password is decided by asking two questions and taking
either as a yes: the `password_set` flag written alongside the password, and an
identity with provider `email`. Neither is sufficient alone — the flag misses
accounts that predate this, and whether GoTrue adds an `email` identity when a
password is set on an OAuth-only user is server behaviour we cannot read. The
worst case is a prompt shown to someone who does not need it, never an account
quietly left with one way in.

---

## Known gaps

- **A Google-only user who guesses at the password form gets "Incorrect
  password".** `check_account_exists` only asks whether the email exists in
  `auth.users`, so it answers yes for an account that has no password at all, and
  `signInErrors.ts` reports a wrong password. Softening that copy to mention
  Google is a five-line change in one file; it was deliberately left out of this
  change.
- **Google OAuth does not work inside embedded webviews** — Instagram and
  Facebook in-app browsers are blocked by Google with `disallowed_useragent`.
  Email + password still works there, so it degrades rather than breaking, but it
  is worth knowing when reading conversion numbers for traffic from those apps.
- **Linking Google to an existing password account from User Profile** is not
  built. Automatic linking covers the common case (same confirmed email); a
  deliberate "link Google" button would use `linkIdentity` and needs Manual
  Linking enabled in the dashboard.
