// supabase/functions/ai-pdf-import/gemini.ts
//
// Transport for every Gemini call the importer makes: the key chain, a hard
// timeout on each request, and the helpers that read a reply back.
//
// Why this is its own module: the importer went from one Gemini call per job to
// one planning call plus N parallel extraction calls, each with its own key
// slot, deadline and retry budget. "Which key, how long, and what does this
// failure mean" is now the interesting part, so it lives in one place.
//
// The single most important thing here is the TIMEOUT. Every fetch used to be
// unbounded: a socket Gemini never answered on held the worker until the
// platform killed it, and the job row sat on "running" for as long as the
// stale-check allowed. Nothing retries a request that has not failed yet, so an
// unbounded fetch is exactly how an import "keeps running for 30 minutes".

export type KeySlot = "primary" | "fallback" | "fallback2" | "fallback3";

export const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
export const API_REVISION = "2026-05-20";

/**
 * Statuses worth trying the next key on. 403 covers a suspended key, 429 a
 * spent quota, 5xx a bad minute at Google, and 408 is ours: the synthetic code
 * this module gives a request that ran past its deadline.
 */
// 404 is here since 2026-09-23: gemini-2.5-flash answered "not available" on
// three of the four keys and worked on the fourth. A model's availability is
// per Google project, so a 404 is a reason to try the NEXT KEY, not to give up.
const RETRYABLE = new Set([403, 404, 408, 429, 500, 502, 503, 504]);

/**
 * The key chain, in the order it is walked. Each slot is meant to be a separate
 * Gemini project: a key over its free-tier quota (429) or suspended (403) is
 * out as a whole, so what the next slot buys is a different account — not a
 * retry of the same one. A project may set one key or all four; slots with no
 * secret are skipped everywhere in this file.
 */
export const KEY_SLOTS: KeySlot[] = ["primary", "fallback", "fallback2", "fallback3"];

const KEY_ENV: Record<KeySlot, string> = {
  primary: "GEMINI_API_KEY",
  fallback: "GEMINI_API_KEY_FALLBACK",
  fallback2: "GEMINI_API_KEY_FALLBACK2",
  fallback3: "GEMINI_API_KEY_FALLBACK3",
};

export function keyFor(slot: KeySlot): string | undefined {
  const key = Deno.env.get(KEY_ENV[slot])?.trim();
  return key ? key : undefined;
}

/** The slots that actually hold a key, in chain order. */
export function configuredSlots(): KeySlot[] {
  return KEY_SLOTS.filter((slot) => keyFor(slot) !== undefined);
}

export function configuredSlotCount(): number {
  return configuredSlots().length;
}

// ─── Key health ──────────────────────────────────────────────────────────────
//
// A key that has just said "quota exhausted" will say it again for the next
// minute (a per-minute quota) or for the rest of the day (a daily one). The
// chain used to forget that the moment the request ended: every new job, and
// every new worker, could open on the very key that had refused seconds
// earlier and burn a whole attempt rediscovering it. This remembers.
//
// The memory lives in this isolate. Supabase keeps a warm isolate around
// between requests, so under normal use it spans a whole import session — the
// dialog polls every 4 s, which is exactly what keeps it warm. When the isolate
// is recycled the memory is empty and the chain behaves precisely as it did
// before, so nothing depends on it being there; it only makes things better.

type Cooldown = { until: number; reason: string };
const cooldowns = new Map<KeySlot, Cooldown>();

/**
 * How long to keep off a key after it refused, by what it said. Google's 429
 * carries a RetryInfo.retryDelay ("32s") for a per-minute quota, and a quota id
 * that names the window; a daily quota is not coming back for hours, so
 * guessing "a minute" there would send every job into the same wall in turn.
 * A 403 or an invalid key is a human's problem and stays off for half an hour.
 * Anything else (5xx, timeout) is the network's or Google's, not the key's,
 * and earns no cooldown at all.
 */
function cooldownMsFor(err: GeminiError): number | null {
  if (err.status === 429) {
    if (/per_?day|daily|perday/i.test(err.quotaId ?? "")) return 4 * 60 * 60_000;
    return Math.max(60_000, Math.min(15 * 60_000, err.retryAfterMs ?? 0));
  }
  if (err.status === 403) return 30 * 60_000;
  if (err.status === 400 && shouldTryNextKey(err)) return 30 * 60_000;
  return null;
}

/** Remember that `slot` refused, if what it said was about the key itself. */
export function markKeyRefused(slot: KeySlot, err: GeminiError): void {
  const ms = cooldownMsFor(err);
  if (ms === null) return;
  cooldowns.set(slot, {
    until: Date.now() + ms,
    reason: `${err.status}${err.reason ? ` ${err.reason}` : ""}${err.quotaId ? ` (${err.quotaId})` : ""}`,
  });
  console.warn(`[ai-pdf-import] resting the ${slot} key for ${Math.round(ms / 1000)}s after ${err.status}`);
}

/** A key that answered is healthy, whatever it said earlier. */
export function markKeyHealthy(slot: KeySlot): void {
  cooldowns.delete(slot);
}

export function isCooling(slot: KeySlot): boolean {
  const c = cooldowns.get(slot);
  if (!c) return false;
  if (c.until <= Date.now()) {
    cooldowns.delete(slot);
    return false;
  }
  return true;
}

/** The configured slots that have not refused recently, in chain order. */
export function healthySlots(): KeySlot[] {
  return configuredSlots().filter((slot) => !isCooling(slot));
}

/** The chain as a creator-safe report: which slots exist and which are resting. */
export function keyHealth(): { slot: KeySlot; configured: boolean; restingForS: number; reason: string | null }[] {
  return KEY_SLOTS.map((slot) => {
    const c = cooldowns.get(slot);
    const resting = c && c.until > Date.now() ? c : null;
    return {
      slot,
      configured: keyFor(slot) !== undefined,
      restingForS: resting ? Math.ceil((resting.until - Date.now()) / 1000) : 0,
      reason: resting?.reason ?? null,
    };
  });
}

// ─── Which model works on which key, and which model is having a bad hour ────
//
// Found on 2026-09-23 with the page split finally running: gemini-2.5-flash
// answered 404 "not available" on fallback, fallback2 and fallback3 — three
// newer Google projects — and worked on primary, the oldest. In the same hour
// gemini-3.5-flash timed out or answered 503 on every key. Neither fact is
// about a key or about a model alone; they are about a (model, key) pair and
// about a model's health right now. Both are remembered here so a retry lands
// where work can actually happen instead of rediscovering the same refusal.

const modelDeadOnKey = new Map<string, number>();
const modelSlowUntil = new Map<string, number>();

const pairKey = (model: string, slot: KeySlot) => `${model}|${slot}`;

/**
 * Gemini said 404 for `model` on `slot`. Remembered for ten minutes, not six
 * hours: on 2026-09-23 the same model answered 404 on all four keys for one
 * request and served the next request on those same keys a minute later — a
 * model being phased out lives on some of Google's backends and not others,
 * so a 404 is "not right now" as often as "not on this project".
 */
export function markModelDeadOnKey(model: string, slot: KeySlot): void {
  modelDeadOnKey.set(pairKey(model, slot), Date.now() + 10 * 60_000);
  console.warn(`[ai-pdf-import] ${model} is not available on the ${slot} key; remembering`);
}

export function modelDeadOn(model: string, slot: KeySlot): boolean {
  return (modelDeadOnKey.get(pairKey(model, slot)) ?? 0) > Date.now();
}

/** The configured keys that can still call `model`, in chain order. */
export function keysWithModel(model: string): KeySlot[] {
  return configuredSlots().filter((slot) => !modelDeadOn(model, slot));
}

/** `model` did not answer in time or said it was busy: keep new work off it for ten minutes. */
export function markModelSlow(model: string): void {
  modelSlowUntil.set(model, Date.now() + 10 * 60_000);
  console.warn(`[ai-pdf-import] ${model} stalled; preferring another model for the next ten minutes`);
}

export function isModelSlow(model: string): boolean {
  return (modelSlowUntil.get(model) ?? 0) > Date.now();
}

/** For the health report. */
export function modelHealth(): { model: string; slowForS: number; deadOn: KeySlot[] }[] {
  const models = new Set<string>();
  for (const k of modelDeadOnKey.keys()) models.add(k.split("|")[0]);
  for (const m of modelSlowUntil.keys()) models.add(m);
  return Array.from(models).map((model) => ({
    model,
    slowForS: Math.max(0, Math.ceil(((modelSlowUntil.get(model) ?? 0) - Date.now()) / 1000)),
    deadOn: KEY_SLOTS.filter((slot) => modelDeadOn(model, slot)),
  }));
}

/**
 * The slot at `index` among the keys that can run `model` and are not
 * resting — falling back to keys that can run it at all, then to any key.
 */
export function slotForModel(model: string, index: number): KeySlot {
  const able = keysWithModel(model);
  const chain = able.filter((slot) => !isCooling(slot)).length
    ? able.filter((slot) => !isCooling(slot))
    : able.length
      ? able
      : configuredSlots();
  if (!chain.length) return "primary";
  return chain[((index % chain.length) + chain.length) % chain.length];
}

/** The model named in a generateContent path, if any. */
function modelInPath(path: string): string | null {
  const m = /\/models\/([^/:?]+):/.exec(path);
  return m ? m[1] : null;
}

// ─── Where the next job opens ────────────────────────────────────────────────
//
// Round-robin, not random. The previous version picked a random offset per
// job, which spreads load on average but happily puts two consecutive imports
// on the same key. Counting is what "after every use, switch to the next key"
// actually means, and the seed only stops every cold isolate from starting on
// 'primary' at once.

let jobCounter = Math.floor(Math.random() * KEY_SLOTS.length);

/** The chain position the next job should open at. Each call moves one on. */
export function nextJobOffset(): number {
  jobCounter = (jobCounter + 1) % 1_000_000;
  return jobCounter;
}

/**
 * A slot name read back off a job row. Rows written before the chain grew hold
 * only 'primary' or 'fallback'; an unrecognised name reads as 'primary' rather
 * than throwing mid-poll. This checks the NAME only — whether that slot still
 * holds a key is a separate question the caller asks with keyFor().
 */
export function asKeySlot(value: unknown): KeySlot {
  return KEY_SLOTS.includes(value as KeySlot) ? (value as KeySlot) : "primary";
}

/**
 * The slot `index` positions into the CONFIGURED chain, wrapping around.
 *
 * This is how work is spread rather than stacked. Every job used to open on
 * 'primary', so with four keys configured the first one carried every import
 * and the other three only ever saw a request after it had already failed —
 * which means the creator had already waited out a 429. Handing shard i of a
 * job the slot (offset + i) instead puts four shards on four accounts, so the
 * free tier's per-project quota is four times as far away, and a retry lands on
 * an account that has not just said no.
 *
 * With one key configured this always returns that key and everything below
 * behaves exactly as it did before.
 *
 * Positions are taken over the HEALTHY chain: a key resting after a refusal is
 * not handed new work while any other key is available. Only when every key is
 * resting does the full chain come back into play — an empty chain would mean
 * refusing the import over a guess about how long a quota lasts.
 */
export function slotAt(index: number): KeySlot {
  const healthy = healthySlots();
  const chain = healthy.length ? healthy : configuredSlots();
  if (chain.length === 0) return "primary";
  return chain[((index % chain.length) + chain.length) % chain.length];
}

/** The next configured slot after `from`. Used when an attempt has to move on. */
export function rotateSlot(from: KeySlot, steps = 1): KeySlot {
  const chain = configuredSlots();
  if (chain.length === 0) return from;
  const at = chain.indexOf(from);
  return slotAt((at >= 0 ? at : 0) + steps);
}

// ─── How a GET is sent ───────────────────────────────────────────────────────
//
// On 2026-09-23 Gemini answered EVERY status poll (GET /interactions/{id}) with
// "400 Request contains an invalid argument", while the POST that created the
// interaction — same headers, same key — succeeded, and the same GET had worked
// on 2026-09-17 (two background jobs completed in under three minutes). A poll
// that always fails is indistinguishable from a worker that never finishes:
// the work completes on Google's side and nobody ever sees it, so every
// attempt runs to its deadline and is written off. Google's reference for the
// retrieve call lists only the key and Api-Revision, and does not say which
// argument it dislikes.
//
// So the GET does not guess once and give up: on a 400 it tries each plausible
// request shape in turn, remembers the first one Gemini accepts, and uses that
// for every later poll in this isolate. Variant 0 is what the docs show. The
// variant that worked is reported back so the job row can record it.

type GetVariant = { revision: boolean; contentType: boolean; query?: string; keyInQuery?: boolean };
const GET_VARIANTS: GetVariant[] = [
  { revision: true, contentType: false },
  { revision: false, contentType: false },
  // The same poll on a second key came back "API key not valid" — from the key
  // that had just created the interaction. The header is what the docs show;
  // the query parameter is the other place Google accepts a key.
  { revision: true, contentType: false, keyInQuery: true },
  { revision: false, contentType: false, keyInQuery: true },
  { revision: true, contentType: false, query: "api_version=v1beta" },
  { revision: false, contentType: false, query: "api_version=v1beta" },
  // The pre-2026-09-23 shape, in case a Content-Type on a bodiless GET was
  // never the problem and something else is.
  { revision: true, contentType: true },
];
let getVariant = 0;

/** Which GET shape polls currently use — for the health report. */
export function currentGetVariant(): number {
  return getVariant;
}

/**
 * A Gemini error body, read once so no caller re-reads a consumed stream.
 * `retryAfterMs` and `quotaId` are filled from a 429's RetryInfo / QuotaFailure
 * details when Google sends them; they decide how long the key rests.
 */
export type GeminiError = {
  status: number;
  message: string;
  reason: string;
  retryAfterMs?: number;
  quotaId?: string;
};

/** "32s", "32.5s" or "1m" → milliseconds; anything else → undefined. */
function parseDelay(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const m = /^(\d+(?:\.\d+)?)\s*(s|m)?$/i.exec(raw.trim());
  if (!m) return undefined;
  const n = Number(m[1]) * ((m[2] ?? "s").toLowerCase() === "m" ? 60_000 : 1000);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

// deno-lint-ignore no-explicit-any
type Json = any;

/**
 * Pull the error out of a failed Gemini response.
 *
 * Two shapes in the wild: /models/* returns `{error:{...}}` while /interactions
 * wraps it in a ONE-ELEMENT ARRAY, `[{error:{...}}]`. Reading only the object
 * shape is why a failed background start used to report a bare
 * "Gemini error 400." with the actual reason — "API key not valid" — dropped.
 */
export async function readGeminiError(res: Response): Promise<GeminiError> {
  let message = "";
  let reason = "";
  let retryAfterMs = parseDelay(res.headers.get("retry-after"));
  let quotaId: string | undefined;
  try {
    const parsed = JSON.parse(await res.text());
    const err = (Array.isArray(parsed) ? parsed[0]?.error : parsed?.error) ?? {};
    message = typeof err?.message === "string" ? err.message : "";
    const details: Json[] = Array.isArray(err?.details) ? err.details : [];
    const detail = details.find((d: Json) => d?.reason)?.reason;
    reason = String(detail ?? err?.status ?? "");
    // google.rpc.RetryInfo — "how long until this quota window opens again".
    retryAfterMs = parseDelay(details.find((d: Json) => d?.retryDelay)?.retryDelay) ?? retryAfterMs;
    // google.rpc.QuotaFailure — WHICH quota: a per-minute one is a short rest, a
    // per-day one is not coming back before tomorrow.
    const violation = details.find((d: Json) => Array.isArray(d?.violations))?.violations?.[0];
    const id = violation?.quotaId ?? violation?.quotaMetric ?? violation?.subject;
    if (typeof id === "string" && id) quotaId = id;
    if (!quotaId && /per\s*day|daily/i.test(message)) quotaId = "PerDay (from message)";
  } catch {
    /* body missing, empty, or not JSON */
  }
  return { status: res.status, message, reason, retryAfterMs, quotaId };
}

/**
 * Should the chain move to the next key? 403/408/429/5xx are the key's problem
 * (or the network's), so a different account is worth trying. A 400 is normally
 * OUR bad request and repeating it on four keys is pointless — except
 * API_KEY_INVALID, which is what Google returns for a deleted or rotated key.
 * That one is precisely what the next slot exists for, and treating it as fatal
 * would strand the chain on a dead key.
 */
export function shouldTryNextKey(err: GeminiError): boolean {
  if (RETRYABLE.has(err.status)) return true;
  return (
    err.status === 400 &&
    (/API_KEY_INVALID/i.test(err.reason) || /api key not valid/i.test(err.message))
  );
}

/**
 * Turn a parsed Gemini error into one sentence a creator can act on. `tried` is
 * how many keys gave this same answer: with a chain of four, "wait a minute and
 * retry" is honest after one key and a lie after all of them.
 */
export function geminiErrorMessage(err: GeminiError, tried = 1): string {
  const { status, message } = err;
  if (status === 408) {
    return "Gemini did not answer in time.";
  }
  if (status === 429) {
    const daily = /per_?day|daily|perday/i.test(err.quotaId ?? "");
    if (daily) {
      return tried > 1
        ? `Gemini's free daily allowance is used up on all ${tried} platform keys. It resets overnight (Pacific time); ask the MockSetu admin to add a key from another Google account.`
        : "Gemini's free daily allowance is used up on this key. Retry — the import will move to another key if one is configured.";
    }
    const wait = err.retryAfterMs ? `about ${Math.max(1, Math.ceil(err.retryAfterMs / 1000))} seconds` : "a minute";
    return tried > 1
      ? `Gemini is over its quota on all ${tried} platform keys. Wait ${wait} and retry, or ask the MockSetu admin to add another key.`
      : `Gemini is over its quota right now. Wait ${wait} and retry.`;
  }
  if (status === 503) {
    return tried > 1
      ? `Gemini is busy on all ${tried} platform keys. Retry in a few minutes.`
      : "Gemini is busy right now. Retry in a moment.";
  }
  if (status === 403) {
    return tried > 1
      ? `Gemini refused all ${tried} platform keys. Ask the MockSetu admin to check them.`
      : "Gemini refused the platform key. Ask the MockSetu admin to check the key.";
  }
  if (shouldTryNextKey(err) && status === 400) {
    return tried > 1
      ? `Gemini rejected all ${tried} platform keys as invalid. Ask the MockSetu admin to re-set them.`
      : "Gemini rejected the platform key as invalid. Ask the MockSetu admin to re-set it.";
  }
  if (status === 404) {
    return tried > 1
      ? `This Gemini model is not available to any of the ${tried} platform keys.`
      : "This Gemini model is not available to the platform key any more.";
  }
  return message ? `Gemini error ${status}: ${message}` : `Gemini error ${status}.`;
}

export type GeminiResult = {
  ok: boolean;
  res?: Response;
  slot: KeySlot;
  /** How many keys the chain burned getting to this answer. */
  tried: number;
  error?: GeminiError;
  /** For a GET: which request shape Gemini accepted (see GET_VARIANTS). */
  variant?: number;
};

/**
 * One request, one key, one deadline. A request that outlives `timeoutMs` is
 * aborted and reported as a synthetic 408 — which `shouldTryNextKey` treats as
 * retryable, so a key that has gone quiet is walked past like any other refusal
 * instead of holding the worker open until the platform kills it.
 */
async function callOnce(
  path: string,
  init: { method?: string; body?: Json },
  key: string,
  timeoutMs: number,
  variantIndex = 0
): Promise<{ res?: Response; error?: GeminiError }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), Math.max(1000, timeoutMs));
  const method = init.method ?? "GET";
  const isGet = method === "GET";
  // A request with a body is always sent the documented way; only a GET has a
  // shape to vary. See GET_VARIANTS.
  const v: GetVariant = isGet ? GET_VARIANTS[variantIndex] ?? GET_VARIANTS[0] : { revision: true, contentType: true };
  const headers: Record<string, string> = {};
  if (!v.keyInQuery) headers["x-goog-api-key"] = key;
  if (v.contentType) headers["Content-Type"] = "application/json";
  if (v.revision) headers["Api-Revision"] = API_REVISION;
  const params: string[] = [];
  if (isGet && v.query) params.push(v.query);
  if (isGet && v.keyInQuery) params.push(`key=${encodeURIComponent(key)}`);
  const url = `${GEMINI}${path}${params.length ? (path.includes("?") ? "&" : "?") + params.join("&") : ""}`;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: control.signal,
    });
    if (res.ok) return { res };
    return { res, error: await readGeminiError(res) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      error: {
        status: aborted ? 408 : 503,
        message: aborted
          ? `Gemini did not answer within ${Math.round(timeoutMs / 1000)}s.`
          : e instanceof Error
            ? e.message
            : String(e),
        reason: aborted ? "DEADLINE_EXCEEDED" : "NETWORK",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Gemini starting at `preferred`. With `allowFallback` a failure the chain
 * can route around moves on to the next configured slot; otherwise only
 * `preferred` is used — which is what polling a background interaction needs,
 * since Gemini will not show an interaction to any key but the one that made it.
 *
 * A success hands the Response back unread, so the caller owns the body. Only a
 * failure is read here, and then exactly once.
 */
export async function gemini(
  path: string,
  init: { method?: string; body?: Json },
  preferred: KeySlot,
  allowFallback: boolean,
  timeoutMs: number
): Promise<GeminiResult> {
  const order: KeySlot[] = allowFallback
    ? [preferred, ...KEY_SLOTS.filter((slot) => slot !== preferred)]
    : [preferred];
  // Keys that refused a moment ago go to the BACK of the line, not out of it.
  // `preferred` keeps its place only while it is healthy; a resting key is still
  // tried after every other key has also failed, because a wrong guess about
  // how long a quota lasts must never leave the chain empty.
  const ranked = allowFallback
    ? [...order.filter((slot) => !isCooling(slot)), ...order.filter((slot) => isCooling(slot))]
    : order;
  const chain = ranked
    .map((slot) => ({ slot, key: keyFor(slot) }))
    .filter((entry): entry is { slot: KeySlot; key: string } => entry.key !== undefined);
  if (!chain.length) throw new Error("No Gemini key is configured on this project.");

  // ONE deadline for the whole call, however many keys it walks. A key that
  // refuses at the door costs a second and leaves the rest of the budget to the
  // next key; a key that sits silent until the timeout has spent the budget,
  // and there is nothing left to try another key with — walking on would carry
  // the live engine straight past the platform's wall clock.
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  const isGet = (init.method ?? "GET") === "GET";
  let last!: GeminiResult;
  for (let i = 0; i < chain.length; i++) {
    const { slot, key } = chain[i];
    const remaining = deadline - Date.now();
    if (i > 0 && remaining < 5_000) break;
    let { res, error } = await callOnce(path, init, key, remaining, getVariant);
    if (isGet && error?.status === 400) {
      // The key is fine (a POST with it just worked) and the id is Gemini's
      // own; it is the SHAPE of the GET that is being refused. Try the others,
      // once each, and keep the first that is accepted. Every refusal is kept
      // in the error message, so ONE recorded poll shows the whole picture.
      const brief = (e: GeminiError) => `${e.status}${e.reason ? " " + e.reason : ""} ${e.message.slice(0, 70)}`.trim();
      const seen: string[] = [`shape ${getVariant}: ${brief(error)}`];
      for (let vi = 0; vi < GET_VARIANTS.length; vi++) {
        if (vi === getVariant) continue;
        if (deadline - Date.now() < 3_000) break;
        const again = await callOnce(path, init, key, deadline - Date.now(), vi);
        if (again.res?.ok) {
          console.warn(`[ai-pdf-import] GET shape ${vi} accepted where shape ${getVariant} was refused with 400; using it from now on`);
          getVariant = vi;
          res = again.res;
          error = undefined;
          break;
        }
        const e = again.error ?? { status: again.res?.status ?? 0, message: "", reason: "" };
        seen.push(`shape ${vi}: ${brief(e)}`);
        if (e.status !== 400) {
          error = e;
          break;
        }
      }
      if (error) error = { ...error, message: `${error.message} — tried ${seen.join(" | ")}` };
    }
    if (res?.ok) {
      markKeyHealthy(slot);
      return { ok: true, res, slot, tried: i + 1, variant: isGet ? getVariant : undefined };
    }
    const err = error ?? { status: res?.status ?? 500, message: "", reason: "" };
    last = { ok: false, res, slot, tried: i + 1, error: err };
    // Remembered whether or not the chain moves on: a poll pinned to one key
    // that gets a 429 cannot switch, but the NEXT job should still stay away.
    markKeyRefused(slot, err);
    const model = modelInPath(path);
    if (model) {
      if (err.status === 404) markModelDeadOnKey(model, slot);
      if (err.status === 408 || err.status === 503) markModelSlow(model);
    }
    if (!shouldTryNextKey(err)) return last;
    console.warn(
      `[ai-pdf-import] Gemini ${err.status}${err.reason ? ` (${err.reason})` : ""} on the ` +
        `${slot} key for ${path} (slot ${i + 1} of ${chain.length})`
    );
  }
  return last;
}

/** Text of the model's reply from an Interactions API object — model_output steps only. */
export function interactionText(interaction: Json): string {
  const out: string[] = [];
  if (typeof interaction?.output_text === "string") out.push(interaction.output_text);
  for (const step of interaction?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const c of step?.content ?? []) if (c?.type === "text" && c.text) out.push(c.text);
  }
  return out.join("\n");
}

/** Text of a generateContent reply. */
export function generateContentText(reply: Json): string {
  const parts = reply?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: Json) => p?.text).filter(Boolean).join("\n");
}
