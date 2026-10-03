// supabase/functions/ai-pdf-import/legacy.ts
//
// The single-pass importer: one Gemini call for the whole paper.
//
// This is what ran before parallel extraction, kept intact and reachable, for
// one reason: migration 20260916000000 is pasted by hand, and a function that
// only worked after the SQL landed would break every import in the window
// between deploying it and remembering to paste. So when the orchestration
// columns are missing, the importer runs this — the behaviour that was already
// known to work — instead of failing with a setup error.
//
// It is also the floor on how bad things can get. If the parallel path turns
// out to have a problem on some paper nobody anticipated, setting
// AI_IMPORT_PARALLEL=off puts every job back on this code.
//
// Two changes were made here rather than preserved, because both are the bug
// the rewrite was for:
//   • every Gemini fetch now has a timeout (it inherits gemini.ts);
//   • a background job is written off after BACKGROUND_STALE_MS, which is 12
//     minutes and not 45. A single pass that has not finished in twelve minutes
//     is not going to; polling it for another half hour only taught creators
//     that the import "keeps running forever".

import {
  type KeySlot,
  asKeySlot,
  gemini,
  generateContentText,
  geminiErrorMessage,
  interactionText,
  keyFor,
  nextJobOffset,
  slotAt,
} from "./gemini.ts";
import { hasDelimitedExtraction } from "../../../src/lib/extractionPrompt.js";

// deno-lint-ignore no-explicit-any
type Json = any;
// deno-lint-ignore no-explicit-any
type Client = any;

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/** A live job older than this is dead: no plan's wall clock reaches it. */
export const LIVE_STALE_MS = envInt("AI_IMPORT_SINGLE_LIVE_DEADLINE_MS", 5 * 60 * 1000);

/**
 * A background single pass older than this is abandoned rather than polled
 * forever.
 *
 * WHY THIS IS 25 MINUTES AND NOT 12. The old code polled for 45 minutes with no
 * timeout on any request, which is how an import could "keep running for 30
 * minutes" — the complaint this whole rewrite started from. The obvious reaction
 * was to cut the window hard. That was wrong, and nearly shipped a regression:
 * a real 55-page, ~90-question paper was observed still running at 21 minutes on
 * this path and finishing afterwards. A 12-minute cap would have failed a paper
 * that works today.
 *
 * The single pass is inherently slow — one model emitting ~18k tokens in one
 * serial stream — so bounding it tightly does not make it fast, it just breaks
 * big papers. Speed comes from the parallel path, which has its own 8-minute
 * deadline because it has no business taking longer. This number's only job is
 * to stop an ABANDONED job being polled forever, and 25 minutes does that while
 * leaving real work room to finish.
 */
export const BACKGROUND_STALE_MS = envInt("AI_IMPORT_SINGLE_DEADLINE_MS", 25 * 60 * 1000);

const isoNow = () => new Date().toISOString();

async function updateJob(service: Client, id: string, patch: Record<string, Json>) {
  const { error } = await service
    .from("ai_import_jobs")
    .update({ ...patch, updated_at: isoNow() })
    .eq("id", id);
  if (error) console.error("[ai-pdf-import] job update failed:", error.message);
}

/** The live engine: the Gemini call continues after the response has been sent. */
export async function runLiveJob(
  service: Client,
  jobId: string,
  model: string,
  prompt: string,
  pdfBase64: string,
  preferred: KeySlot
) {
  try {
    const body: Json = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 65536 },
    };
    const budget = Deno.env.get("AI_IMPORT_THINKING_BUDGET");
    if (budget !== undefined && budget !== "" && Number.isFinite(Number(budget))) {
      body.generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };
    }
    const { ok, res, slot, tried, error } = await gemini(
      `/models/${model}:generateContent`,
      { method: "POST", body },
      preferred,
      true,
      LIVE_STALE_MS - 20_000
    );
    if (!ok || !res) {
      await updateJob(service, jobId, {
        status: "failed",
        api_key_slot: slot,
        error: geminiErrorMessage(error ?? { status: 500, message: "", reason: "" }, tried),
        completed_at: isoNow(),
      });
      return;
    }
    const reply = await res.json();
    const text = generateContentText(reply);
    const finish = reply?.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") {
      await updateJob(service, jobId, {
        status: "failed",
        api_key_slot: slot,
        error:
          "Gemini's reply was cut off — the paper is too long for one pass. Split the PDF, or import one language at a time.",
        completed_at: isoNow(),
        usage: reply?.usageMetadata ?? null,
      });
      return;
    }
    if (!hasDelimitedExtraction(text)) {
      await updateJob(service, jobId, {
        status: "failed",
        api_key_slot: slot,
        error: "Gemini replied without the JSON block. Retry, or try the other model.",
        completed_at: isoNow(),
        usage: reply?.usageMetadata ?? null,
        raw_output: text.slice(0, 4000),
      });
      return;
    }
    await updateJob(service, jobId, {
      status: "completed",
      api_key_slot: slot,
      raw_output: text,
      usage: reply?.usageMetadata ?? null,
      completed_at: isoNow(),
      error: null,
    });
  } catch (e) {
    await updateJob(service, jobId, {
      status: "failed",
      error: `Gemini call failed: ${e instanceof Error ? e.message : String(e)}`,
      completed_at: isoNow(),
    });
  }
}

/** Start the whole paper as one background interaction. Returns an error sentence, or null. */
export async function startBackgroundJob(
  service: Client,
  jobId: string,
  model: string,
  prompt: string,
  pdfBase64: string,
  // Where this job opens in the chain: the next healthy key after the previous
  // job's, not 'primary' every time. The old fixed start meant one key carried
  // every single-pass import of the day and the others only ever saw a request
  // after it had already refused.
  preferred: KeySlot = slotAt(nextJobOffset())
): Promise<string | null> {
  const { ok, res, slot, tried, error } = await gemini(
    "/interactions",
    {
      method: "POST",
      body: {
        model,
        input: [
          { type: "text", text: prompt },
          { type: "document", mime_type: "application/pdf", data: pdfBase64 },
        ],
        background: true,
        generation_config: { temperature: 0, max_output_tokens: 65536 },
      },
    },
    preferred,
    true,
    60_000
  );
  if (!ok || !res) {
    const message = geminiErrorMessage(error ?? { status: 500, message: "", reason: "" }, tried);
    await updateJob(service, jobId, {
      status: "failed",
      api_key_slot: slot,
      error: message,
      completed_at: isoNow(),
    });
    return message;
  }
  const created = await res.json();
  if (!created?.id) {
    const message = "Gemini did not return a job id.";
    await updateJob(service, jobId, {
      status: "failed",
      api_key_slot: slot,
      error: message,
      completed_at: isoNow(),
    });
    return message;
  }
  await updateJob(service, jobId, { status: "running", interaction_id: created.id, api_key_slot: slot });
  return null;
}

/**
 * Advance a single-pass job. Returns the patch the caller should fold into what
 * it sends back, or null when nothing changed.
 */
export async function pollJob(service: Client, job: Json): Promise<Json | null> {
  const ageMs = Date.now() - new Date(job.created_at).getTime();

  if (job.engine === "live") {
    if (ageMs > LIVE_STALE_MS) {
      const error =
        "The server ran out of time before Gemini finished — the hosting plan caps each run. Retry with Gemini 3.5 Flash, which runs in the background.";
      await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
      return { status: "failed", error };
    }
    return null;
  }

  if (!job.interaction_id) return null;
  if (ageMs > BACKGROUND_STALE_MS) {
    const error = `Gemini did not finish within ${Math.round(BACKGROUND_STALE_MS / 60000)} minutes. Retry the import.`;
    await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
    return { status: "failed", error };
  }

  // Polling is pinned to the slot that created the interaction — Gemini will
  // not show it to any other key — so a slot whose secret has since been
  // removed cannot be polled at all. Say that, instead of a bare 500 from the
  // empty chain or a confusing 404 from guessing another key.
  const slot = asKeySlot(job.api_key_slot);
  if (!keyFor(slot)) {
    const error = "The Gemini key that started this import is no longer configured. Start the import again.";
    await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
    return { status: "failed", error };
  }

  const { ok, res, error: pollErr } = await gemini(`/interactions/${job.interaction_id}`, {}, slot, false, 25_000);
  if (!ok || !res) {
    // A transient poll failure is not a failed job; only 404 means it is gone.
    if (pollErr?.status === 404) {
      const error = "Gemini lost this job. Retry the import.";
      await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
      return { status: "failed", error };
    }
    return null;
  }

  const interaction = await res.json();
  const st = String(interaction?.status ?? "");
  if (st === "in_progress" || st === "queued" || st === "requires_action") return null;

  if (st === "completed") {
    const text = interactionText(interaction);
    if (!hasDelimitedExtraction(text)) {
      const error = "Gemini replied without the JSON block. Retry, or try the other model.";
      await updateJob(service, job.id, {
        status: "failed",
        error,
        completed_at: isoNow(),
        usage: interaction?.usage ?? null,
        raw_output: text.slice(0, 4000),
      });
      return { status: "failed", error };
    }
    const completed_at = isoNow();
    await updateJob(service, job.id, {
      status: "completed",
      raw_output: text,
      usage: interaction?.usage ?? null,
      completed_at,
      error: null,
    });
    return { status: "completed", raw_output: text, completed_at };
  }

  const error =
    st === "incomplete" || st === "budget_exceeded"
      ? "Gemini's reply was cut off — the paper is too long for one pass. Split the PDF, or import one language at a time."
      : `Gemini stopped with status "${st || "unknown"}". Retry the import.`;
  await updateJob(service, job.id, {
    status: "failed",
    error,
    completed_at: isoNow(),
    usage: interaction?.usage ?? null,
  });
  return { status: "failed", error };
}
