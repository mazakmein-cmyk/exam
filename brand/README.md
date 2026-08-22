# MockSetu logo kit

Vector master + PNG exports of the MockSetu mark. Nothing here is wired into the site yet —
the shipped assets in `public/` are untouched. See "Wiring it up" below.

## Where this came from

`public/mocksetu-logo.png` is a **1024×1024 JPEG that has been given a `.png` extension**. It has
JPEG ringing along every edge, a baked-in white background (no transparency), and its gradient
(`#402DBE → #8F2DF6`) does not match the brand gradient used across the app.

The mark here was recovered by tracing that raster back to vector (sub-pixel contour tracing at 2×
supersample, then Bézier fitting) and recoloured to the real brand gradient. It is geometrically
faithful to the original — the overlay diff is a hairline — but has no compression artefacts and
scales without limit.

## Files

### `svg/` — use these wherever you can

| File | What it is |
| --- | --- |
| `mocksetu-mark.svg` | **Master.** Tight-cropped mark, transparent, brand gradient. 1000×461.75. |
| `mocksetu-logo.svg` | Mark centred in a 1024² square with 10% padding, transparent. |
| `mocksetu-icon.svg` | White mark on a brand-gradient rounded tile — app/PWA icon. |
| `mocksetu-mark-white.svg` | Flat white, for dark backgrounds and photos. |
| `mocksetu-mark-black.svg` | Flat `#0B0A1A`, for one-colour and print. |

### `png/` — all transparent except the OG card

`mocksetu-mark-{512,1024,2048,4096}.png` · `mocksetu-mark-white-{1024,2048}.png` ·
`mocksetu-logo-square-{256,512,1024}.png` · `mocksetu-icon-{192,512,1024}.png` ·
`mocksetu-og-1200x630.png` (opaque white — OG images must not be transparent).

`preview.png` is the QA sheet: every variant at every size, on light and dark.

## Brand gradient

Horizontal, `#6C3EF4 → #A855F7` — the pair already used 219/61 times across the codebase and
defined as `--gradient-brand` in `src/index.css`.

## Two things to know before you use it

**Don't use this mark below ~32px.** It is four thin tapered strokes; at favicon sizes they blur
together. `public/favicon.svg` is a simplified thicker-stroke version that survives 16px — keep it
for the favicon. This kit is for 48px and up.

**Don't use a transparent PNG as the OG image.** Several platforms composite transparency onto
black. That is what `mocksetu-og-1200x630.png` is for — and 1200×630 is the right OG aspect, where
the current square logo gets centre-cropped.

## Wiring it up (not done — your call)

`public/mocksetu-logo.png` is referenced as the OG image, the Twitter image, the
`apple-touch-icon`, the schema.org `logo`, in `public/sitemap.xml`, in three email templates, and as
`DEFAULT_OG_IMAGE` in `src/lib/seo/structuredData.ts`. Those are live, outward-facing URLs, so
replacing it changes what social crawlers and mail clients fetch. If you want that:

1. Copy `png/mocksetu-og-1200x630.png` to `public/` and point `DEFAULT_OG_IMAGE` plus the
   `og:image` / `twitter:image` tags in `index.html` at it (add `og:image:width` 1200 /
   `og:image:height` 630).
2. Copy `png/mocksetu-icon-512.png` to `public/` for `apple-touch-icon` — it needs an opaque
   background, which the gradient tile gives it.
3. Leave `public/favicon.svg` and `public/favicon.ico` alone.
4. Keep `public/mocksetu-logo.png` in place until crawlers have re-fetched, or the old URL 404s.
