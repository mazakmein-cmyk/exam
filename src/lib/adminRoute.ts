/**
 * Keeps the admin console's URL and operator identity out of the shipped bundle.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------
 * React Router's route table is compiled into the client bundle, so declaring
 * the console's route in App.tsx published its URL as a plaintext string in a
 * file anyone can download — and Googlebot executes JavaScript and discovers
 * URLs from it. No robots.txt rule and no noindex tag can make a path secret
 * while the path itself is sitting in `/assets/index-*.js`. The same was true of
 * the operator's email address, which embedded the very token the path is built
 * from, so hashing the path alone would have left it guessable.
 *
 * The plaintext path exists in exactly ONE place in this repo: NOINDEX_ROUTES in
 * scripts/prerender.mjs, which is build tooling and never shipped to a browser.
 * Do not write it anywhere else — not in a route table, not in a prop, and not
 * in a comment explaining why you should not write it anywhere else.
 *
 * Only SHA-256 digests are committed here. A digest cannot be reversed, so the
 * bundle no longer contains the URL, the token, or anything a crawler could turn
 * into a request.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * This is obscurity, and obscurity is not access control. It is layered ON TOP
 * of the real thing: all 11 admin RPCs are SECURITY DEFINER and raise
 * 'Access Denied' unless the caller's JWT email is on a server-side allow-list.
 * Someone who learns the URL still gets an empty shell. What this buys is that
 * crawlers and automated scanners cannot find the page at all, and a human has
 * nothing in the bundle to work from.
 *
 * SHA-256 specifically, not a cheap string hash: the gate authorises on digest
 * match, so with a 32-bit hash an attacker could brute-force *some* colliding
 * string and visit it to render the console. A 256-bit preimage is not findable.
 *
 * DEV NOTE
 * --------
 * crypto.subtle requires a secure context — HTTPS or localhost. Reaching the
 * console over a LAN IP in dev (http://192.168.x.x:8080) will not work, because
 * the digest cannot be computed. Use http://localhost:8080.
 */

/** SHA-256 of the admin route's pathname, without a trailing slash. */
const ADMIN_PATH_DIGEST = "9533d4ce14ba4bf27ba35c03b7329e8a54e33659230e4aecc2e938dbfb3aac2d";

/**
 * SHA-256 of each address permitted to open the console.
 *
 * This gate is cosmetic — it decides whether to render the dashboard shell or
 * the sign-in form. Every piece of data behind it is authorised again on the
 * server, so a client that defeats this check still sees nothing.
 */
const ADMIN_EMAIL_DIGESTS = [
  "443d63ac8b016afa7fe785e68181fb87d05bda7b6632705dd123dbefc77d57d3",
  "55fb5e4bb747834c69beb6e06fe022187101b3a8e573346db34a627a9bad42b0",
];

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** SHA-256 hex digest, or null where crypto.subtle is unavailable. */
export const sha256Hex = async (value: string): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = new TextEncoder().encode(value);
    return toHex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  } catch {
    return null;
  }
};

/** Strip a trailing slash so `/x/admin` and `/x/admin/` hash alike. */
const normalisePath = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

/** Does this pathname address the admin console? */
export const isAdminPath = async (pathname: string): Promise<boolean> =>
  (await sha256Hex(normalisePath(pathname))) === ADMIN_PATH_DIGEST;

/** Is this signed-in address permitted to open the console shell? */
export const isAdminEmail = async (email: string | null | undefined): Promise<boolean> => {
  if (!email) return false;
  const digest = await sha256Hex(email.trim().toLowerCase());
  return digest !== null && ADMIN_EMAIL_DIGESTS.includes(digest);
};
