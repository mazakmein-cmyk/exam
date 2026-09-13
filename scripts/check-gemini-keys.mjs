#!/usr/bin/env node
/**
 * Test every Gemini key in the ai-pdf-import fallback chain, one at a time.
 *
 * Why this is needed: the chain only reaches GEMINI_API_KEY_FALLBACK* when the
 * key before it answers 403/429/5xx. A successful import therefore proves that
 * the PRIMARY key works and says nothing at all about the other three — they
 * sit untested until the day the primary runs out, which is the worst possible
 * moment to discover a typo.
 *
 * It makes the same two calls the function makes, per key:
 *   1. POST /interactions  background=true, gemini-3.5-flash  (the default model)
 *   2. POST /models/gemini-2.5-flash:generateContent          (the "live" model)
 * Both with a one-word prompt, so the cost is negligible.
 *
 * Keys are read from supabase/.temp/gemini-keys.local (gitignored), one
 * NAME=value per line — NOT from the command line or environment, because
 * PowerShell writes `$env:X="..."` into ConsoleHost_history.txt and a key
 * pasted there outlives the terminal. Delete the file when you are done.
 *
 * Usage:
 *   node scripts/check-gemini-keys.mjs [path]
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEYS_FILE = process.argv[2] ?? "supabase/.temp/gemini-keys.local";

// Must match KEY_SLOTS / KEY_ENV in supabase/functions/ai-pdf-import/index.ts.
const SLOTS = [
  { slot: "primary", env: "GEMINI_API_KEY" },
  { slot: "fallback", env: "GEMINI_API_KEY_FALLBACK" },
  { slot: "fallback2", env: "GEMINI_API_KEY_FALLBACK2" },
  { slot: "fallback3", env: "GEMINI_API_KEY_FALLBACK3" },
];

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const API_REVISION = "2026-05-20";
/** The statuses the function's chain treats as "try the next key". */
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);

const path = resolve(ROOT, KEYS_FILE);
if (!existsSync(path)) {
  console.error(`No key file at ${KEYS_FILE}

Create it with one line per key (same names as the Supabase secrets):

  GEMINI_API_KEY=AIza...
  GEMINI_API_KEY_FALLBACK=AIza...
  GEMINI_API_KEY_FALLBACK2=AIza...
  GEMINI_API_KEY_FALLBACK3=AIza...

Then run this again, and delete the file afterwards.`);
  process.exit(2);
}

const keys = new Map();
for (const [i, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
  const text = line.trim();
  if (!text || text.startsWith("#")) continue;
  const eq = text.indexOf("=");
  if (eq < 0) {
    console.error(`${KEYS_FILE}:${i + 1}: expected NAME=value, got "${text.slice(0, 24)}…"`);
    process.exit(2);
  }
  keys.set(text.slice(0, eq).trim(), text.slice(eq + 1).trim().replace(/^["']|["']$/g, ""));
}

/** Never print a key. Enough to tell two keys apart, not enough to use one. */
const mask = (k) => `${k.slice(0, 6)}…${k.slice(-4)} (${k.length} ch)`;

async function call(key, path, body) {
  try {
    const res = await fetch(`${GEMINI}${path}`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
        "Api-Revision": API_REVISION,
      },
      body: JSON.stringify(body),
    });
    let detail = "";
    if (!res.ok) {
      try {
        // /models/* returns {error:{…}}; /interactions wraps it in a
        // one-element array. Read only the object shape and an invalid key
        // reports as a bare "400" with no reason.
        const parsed = JSON.parse(await res.text());
        detail = (Array.isArray(parsed) ? parsed[0]?.error : parsed?.error)?.message ?? "";
      } catch {
        /* body not JSON */
      }
    }
    return { status: res.status, ok: res.ok, detail };
  } catch (e) {
    return { status: 0, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

const background = (key) =>
  call(key, "/interactions", {
    model: "gemini-3.5-flash",
    input: [{ type: "text", text: "ping" }],
    background: true,
    generation_config: { temperature: 0, max_output_tokens: 16 },
  });

const live = (key) =>
  call(key, "/models/gemini-2.5-flash:generateContent", {
    contents: [{ parts: [{ text: "ping" }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 16 },
  });

/**
 * A 2xx means the key may use the model — that is the whole question here.
 * A truncated or empty reply is still a pass: 16 output tokens is deliberately
 * too few to answer with, and this is an auth check, not a quality check.
 */
function verdict(r) {
  if (r.ok) return { text: "OK", bad: false };
  if (r.status === 404) {
    return { text: `404 model not available — THE CHAIN WILL NOT SKIP THIS`, bad: true };
  }
  if (r.status === 400 && /api key not valid|api_key_invalid|expired/i.test(r.detail)) {
    // shouldTryNextKey() in the edge function treats this one 400 as routable.
    return { text: `400 invalid key — chain moves to the next key`, bad: true };
  }
  if (RETRYABLE.has(r.status)) {
    const why = r.status === 429 ? "over quota" : r.status === 403 ? "refused/suspended" : "server error";
    return { text: `${r.status} ${why} — chain moves to the next key`, bad: true };
  }
  return { text: `${r.status} ${r.detail || "failed"}`, bad: true };
}

console.log(`Testing the ai-pdf-import key chain, in the order the function walks it.\n`);

let problems = 0;
let configured = 0;
const seen = new Map();

for (const { slot, env } of SLOTS) {
  const key = keys.get(env);
  if (!key) {
    console.log(`${slot.padEnd(10)} ${env}`);
    console.log(`${" ".repeat(11)}not in the key file — skipped\n`);
    continue;
  }
  configured++;
  console.log(`${slot.padEnd(10)} ${env}  ${mask(key)}`);

  if (seen.has(key)) {
    console.log(`${" ".repeat(11)}⚠  IDENTICAL to ${seen.get(key)} — this slot adds nothing`);
    problems++;
  }
  seen.set(key, env);

  const [bg, lv] = await Promise.all([background(key), live(key)]);
  const bgv = verdict(bg);
  const lvv = verdict(lv);
  console.log(`${" ".repeat(11)}gemini-3.5-flash (default, background)  ${bgv.bad ? "✗" : "✓"} ${bgv.text}`);
  console.log(`${" ".repeat(11)}gemini-2.5-flash (live engine)          ${lvv.bad ? "✗" : "✓"} ${lvv.text}`);
  if (bgv.bad || lvv.bad) problems++;
  console.log();
}

console.log("─".repeat(70));
if (!configured) {
  console.log("No keys found in the file. Nothing was tested.");
  process.exit(2);
}
console.log(
  problems === 0
    ? `All ${configured} configured key(s) can run both models. The chain is real.`
    : `${problems} of ${configured} configured key(s) have a problem — see above.`
);
console.log(`\nDelete ${KEYS_FILE} now; it holds your keys in plain text.`);
process.exit(problems === 0 ? 0 : 1);
