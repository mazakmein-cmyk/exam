/**
 * aiImportService.ts — the client half of "Import from PDF".
 *
 * Everything here talks to the ai-pdf-import edge function or to Storage; the
 * parsing and the database writes stay in the same code the manual JSON upload
 * uses (jsonImportParser + the page's commitJson). This module knows nothing
 * about React.
 */
import { supabase } from "@/integrations/supabase/client";

export type AiImportModelId = "gemini-3.5-flash" | "gemini-2.5-flash";
export type AiImportEngine = "background" | "live";

export type AiImportModelOption = {
  id: AiImportModelId;
  label: string;
  badge?: string;
  engine: AiImportEngine;
  /** One line: why pick this. */
  headline: string;
  /** One or two lines: what it costs you in behaviour. */
  detail: string;
  /** Rough duration for a 25–30 page paper, from the live checks. */
  eta: string;
};

/**
 * What the creator can choose between. Copy reflects the September 2026 checks
 * on a real SBI Clerk paper: 3.5 Flash was right on maths and Hindi where 2.5
 * Flash dropped digits and a root sign, and 3.5 Flash is the only one of the
 * two Gemini will run in the background.
 */
/**
 * Wall clock the live engine dies at on the deployed Supabase plan (Free = 150 s,
 * paid = 400 s) — keep in step with supabase/functions/ai-pdf-import/index.ts.
 */
export const LIVE_WALL_CLOCK_MS = 150_000;

export const AI_IMPORT_MODELS: AiImportModelOption[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    badge: "Recommended",
    engine: "background",
    headline: "Most accurate on maths and Hindi in our checks.",
    detail: "Runs in the background — close this window and come back.",
    eta: "Usually 2–3 min",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    engine: "live",
    headline: "Weaker on formula-heavy questions in our checks.",
    detail: "Runs live on the server, which stops it after about 2½ minutes — short papers only.",
    eta: "Short papers · under 2½ min",
  },
];

export const DEFAULT_AI_IMPORT_MODEL: AiImportModelId = "gemini-3.5-flash";

export function aiImportModel(id: string | null | undefined): AiImportModelOption {
  return AI_IMPORT_MODELS.find((m) => m.id === id) ?? AI_IMPORT_MODELS[0];
}

export type AiImportJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

/** Shape returned by the edge function for start/status. */
export type AiImportJob = {
  jobId: string;
  status: AiImportJobStatus;
  engine: AiImportEngine;
  model: string;
  language: string;
  createdAt: string;
  completedAt: string | null;
  elapsedMs: number;
  storagePath: string;
  pdfName: string | null;
  pdfUrl: string | null;
  error: string | null;
  /** Present only on a completed job when requested. */
  rawOutput?: string | null;
  /** start only: an already-running job for this exam+language was returned. */
  reused?: boolean;
};

export class AiImportError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "request_failed", status = 0) {
    super(message);
    this.name = "AiImportError";
    this.code = code;
    this.status = status;
  }
}

/**
 * supabase.functions.invoke folds any non-2xx into `error` and keeps the body
 * on error.context (a Response). The function always answers with
 * {error:{code,message}}, and those messages are written for creators, so
 * surface them instead of the generic "Edge Function returned a non-2xx".
 */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-pdf-import", { body });
  if (error) {
    let code = "request_failed";
    let message = error.message || "The import service did not respond.";
    let status = 0;
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      status = typeof ctx.status === "number" ? ctx.status : 0;
      try {
        const j = await ctx.json();
        if (j?.error?.code) code = String(j.error.code);
        if (j?.error?.message) message = String(j.error.message);
      } catch {
        /* body was not JSON */
      }
    }
    if (status === 404 && code === "request_failed") {
      message = "The import service is not deployed on this project yet (ai-pdf-import).";
      code = "not_deployed";
    }
    throw new AiImportError(message, code, status);
  }
  // Only the function's failure envelope {error:{code,message}} is an error.
  // A job object also carries `error` — a failed job's reason, a string — and
  // that must reach the caller as data: otherwise the dialog can only say
  // "Import failed." while the real reason sits in the job row.
  const envelope = (data as any)?.error;
  if (envelope && typeof envelope === "object") {
    throw new AiImportError(String(envelope.message ?? "Import failed."), String(envelope.code ?? "request_failed"), 200);
  }
  return data as T;
}

/** Storage bucket the PDF goes to — the same one the manual flow uses. */
export const AI_IMPORT_BUCKET = "exam-pdfs";

/**
 * Path the edge function will accept: it insists on `${userId}/${examId}/…pdf`
 * (the bucket's INSERT policy keys on the first folder being the uploader).
 */
export function aiImportPdfPath(userId: string, examId: string, language: string): string {
  return `${userId}/${examId}/ai-import-${language}-${Date.now()}.pdf`;
}

export type UploadedPdf = { storagePath: string; publicUrl: string; pdfName: string; size: number };

/** Upload the creator's PDF to their own folder; returns what `start` needs. */
export async function uploadAiImportPdf(examId: string, language: string, file: File): Promise<UploadedPdf> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AiImportError("Sign in to import from PDF.", "sign_in_required", 401);
  const storagePath = aiImportPdfPath(user.id, examId, language);
  const { error } = await supabase.storage
    .from(AI_IMPORT_BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: "application/pdf" });
  if (error) throw new AiImportError(error.message || "Couldn't upload the PDF.", "upload_failed");
  const { data } = supabase.storage.from(AI_IMPORT_BUCKET).getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl, pdfName: file.name, size: file.size };
}

/** Fetch the PDF of a job back as a File — for auto-snipping on a resumed job. */
export async function downloadAiImportPdf(storagePath: string, pdfName?: string | null): Promise<File> {
  const { data, error } = await supabase.storage.from(AI_IMPORT_BUCKET).download(storagePath);
  if (error || !data) throw new AiImportError(error?.message || "Couldn't fetch the PDF back from storage.", "download_failed");
  return new File([data], pdfName || "paper.pdf", { type: "application/pdf" });
}

export type StartAiImportParams = {
  examId: string;
  language: string;
  model: AiImportModelId;
  storagePath: string;
  pdfName: string;
  /** Start even if a job for this exam+language is still running. */
  force?: boolean;
};

export function startAiImport(params: StartAiImportParams): Promise<AiImportJob> {
  return invoke<AiImportJob>({ action: "start", ...params });
}

export function getAiImportStatus(jobId: string, includeOutput = true): Promise<AiImportJob> {
  return invoke<AiImportJob>({ action: "status", jobId, includeOutput });
}

export function cancelAiImport(jobId: string): Promise<{ jobId: string; status: AiImportJobStatus }> {
  return invoke({ action: "cancel", jobId });
}

/** Tell the server the result was imported, so it stops being offered for reuse. */
export function ackAiImport(jobId: string): Promise<{ jobId: string; ok: boolean }> {
  return invoke({ action: "ack", jobId });
}

const TERMINAL: AiImportJobStatus[] = ["completed", "failed", "cancelled"];
export function isTerminalAiImportStatus(s: AiImportJobStatus): boolean {
  return TERMINAL.includes(s);
}

/** A job the creator can pick up again when they reopen the dialog. */
export type ResumableAiImportJob = {
  id: string;
  language: string;
  model: string;
  engine: AiImportEngine;
  status: AiImportJobStatus;
  createdAt: string;
  pdfName: string | null;
  storagePath: string;
  pdfUrl: string | null;
};

/** Running jobs older than this are stale; the server will fail them on poll. */
const RESUME_RUNNING_MAX_MS = 45 * 60 * 1000;
/** Finished-but-unimported replies older than this are not worth offering. */
const RESUME_COMPLETED_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * The most recent job for this exam that is still running, or finished but was
 * never imported. Read through RLS (own rows only). Any failure → null: the
 * dialog simply starts fresh.
 */
export async function findResumableAiImportJob(examId: string): Promise<ResumableAiImportJob | null> {
  try {
    const { data, error } = await supabase
      .from("ai_import_jobs")
      .select("id, language, model, engine, status, created_at, pdf_name, storage_path, pdf_url, imported_at")
      .eq("exam_id", examId)
      .in("status", ["queued", "running", "completed"])
      .is("imported_at", null)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !data) return null;
    const now = Date.now();
    for (const row of data as any[]) {
      const age = now - new Date(row.created_at).getTime();
      const running = row.status === "queued" || row.status === "running";
      if (running && age > RESUME_RUNNING_MAX_MS) continue;
      if (!running && age > RESUME_COMPLETED_MAX_MS) continue;
      return {
        id: row.id,
        language: row.language,
        model: row.model,
        engine: row.engine,
        status: row.status,
        createdAt: row.created_at,
        pdfName: row.pdf_name ?? null,
        storagePath: row.storage_path,
        pdfUrl: row.pdf_url ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** The most recent job for an exam, whatever became of it. */
export type LastAiImportJob = ResumableAiImportJob & {
  completedAt: string | null;
  importedAt: string | null;
  error: string | null;
  /**
   * True when Continue / Finish import makes sense: still running (≤ 45 min) or
   * finished and not yet saved (≤ 2 h). Everything else can only be read again.
   */
  resumable: boolean;
};

/** Older than this, a last run is history — Setup does not mention it. */
const LAST_JOB_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * The exam's last import job, any status, so Setup can offer "Read again" on the
 * PDF that is already in storage — Gemini sometimes reads a paper badly and the
 * creator should not have to find the file again. Read through RLS (own rows);
 * any failure → null and Setup is simply empty.
 */
export async function findLastAiImportJob(examId: string): Promise<LastAiImportJob | null> {
  try {
    const { data, error } = await supabase
      .from("ai_import_jobs")
      .select("id, language, model, engine, status, created_at, completed_at, pdf_name, storage_path, pdf_url, imported_at, error")
      .eq("exam_id", examId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as any;
    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > LAST_JOB_MAX_MS) return null;
    const running = row.status === "queued" || row.status === "running";
    const resumable =
      (running && age <= RESUME_RUNNING_MAX_MS) ||
      (row.status === "completed" && !row.imported_at && age <= RESUME_COMPLETED_MAX_MS);
    return {
      id: row.id,
      language: row.language,
      model: row.model,
      engine: row.engine,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? null,
      pdfName: row.pdf_name ?? null,
      storagePath: row.storage_path,
      pdfUrl: row.pdf_url ?? null,
      importedAt: row.imported_at ?? null,
      error: row.error ?? null,
      resumable,
    };
  } catch {
    return null;
  }
}

/**
 * Time given to a section the import creates. One minute per question is the
 * common banking/SSC norm; clamped so a 3-question section is not a 3-minute
 * one and a 200-question section stays editable. The summary tells the creator
 * the number so they can change it.
 */
export function defaultSectionMinutes(questionCount: number): number {
  const n = Math.round(Number(questionCount) || 0);
  return Math.min(180, Math.max(10, n));
}

/** "1m 32s" — for the running-step timer. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** One sentence for a failure the creator can act on. */
export function describeAiImportError(err: unknown): string {
  if (err instanceof AiImportError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Retry.";
}
