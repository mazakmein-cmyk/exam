# vercel.json — why each rule is shaped the way it is

`vercel.json` cannot carry comments. It is validated against a strict JSON schema
that rejects unknown properties, so a `"//"` key inside a `rewrites` or `headers`
entry fails the deploy before the build even starts:

```
The `vercel.json` schema validation failed with the following message:
`headers[4]` should NOT have additional property `//`
```

The explanations that used to live in those keys are here instead. Keep this file
in step with `vercel.json`.

---

## `rewrites[0]` — SPA fallback

```json
{ "source": "/(.*)", "destination": "/index.html" }
```

The fallback for genuinely dynamic routes (`/exam/:id`, `/live/:code`,
`/dashboard`). Vercel checks the filesystem **before** applying rewrites, so the
per-route files written by `scripts/prerender.mjs` — `dist/blog/<slug>/index.html`
and friends — are served directly and never reach this rule.

**Do not narrow it.** Any route without a prerendered file still needs it.

---

## `headers[0]` — security headers, everywhere

`X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`
(`frame-ancestors 'self'`), `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security`.

---

## `headers[1]`, `headers[2]` — immutable assets

`/assets/*` and anything with an image or font extension are content-hashed at
build time, so they are safe to cache for a year.

---

## `headers[3]` — `/index.html` must revalidate

The SPA shell. If it is cached, a deploy does not reach anyone.

---

## `headers[4]` — the prerendered documents must revalidate too

```json
"source": "/((?!assets/)(?!.*\\.[a-zA-Z0-9]+$).*)"
```

The prerendered documents (`dist/blog/<slug>/index.html` and friends) are
requested at **extensionless** paths, so the `/index.html` rule above never
matches them. Without this rule they could be edge-cached with a stale `<head>`,
and a content update would not surface.

The two negative lookaheads keep this off `/assets` and off anything with a file
extension, so the immutable rules above stay in force.

---

## `headers[5]` — `X-Robots-Tag` on private routes

```json
"source": "/(barnwal3008/admin|dashboard|analytics|auth|student-auth)(/.*)?"
```

`X-Robots-Tag` is obeyed by crawlers that never fetch `robots.txt` and by those
that ignore it, and unlike a `<meta>` tag it does not depend on the HTML being
parsed.

This is the **third of three layers**:

1. Server-side RPC authorisation is what actually stops an attacker.
2. The first-byte `noindex` meta covers HTML consumers.
3. This covers everything else.

Listed by path here rather than in `robots.txt` because `vercel.json` is build
config and is never served to visitors — `robots.txt` would advertise the paths.
