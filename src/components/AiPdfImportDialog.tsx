/**
 * AiPdfImportDialog.tsx — "Import from PDF": Gemini reads the paper, MockSetu
 * turns the reply into sections and questions, all in one run.
 *
 * Three views:
 *   1. Setup    — pick the PDF, the language slot, the model, add-or-replace.
 *   2. Running  — six steps with live state; a failed step offers Retry.
 *   3. Done     — what landed, what to check, import the next language.
 *
 * Everything after "Gemini replied" is the manual JSON upload's own machinery:
 * parseExamJson for the report, buildSectionCreationPlan + dataSource for the
 * sections the paper has and the exam does not, autoSnip for figures, and the
 * page's commitJson for the writes. The only new moving part is the job
 * (aiImportService) — and a job outlives this dialog: close it mid-run and
 * the next open offers to pick the job up where it was.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadQuestionImage } from "@/lib/questionImageUpload";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  FileUp,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { parseExamJson, type ParseContext, type ParseReport } from "@/services/jsonImportParser";
import { autoSnip, type SnipRequest } from "@/services/autoSnipper";
import {
  buildSectionCreationPlan,
  type JsonUploadDataSource,
  type LangStatus,
  type NewSectionSpec,
  type SectionMeta,
} from "@/components/jsonUploadSources";
import type { CommitJsonExtras, CommitResult } from "@/components/JsonUploadDialog";
import { normalizeReportOptionLabels } from "@/lib/optionLabels.js";
import {
  AI_IMPORT_MODELS,
  DEFAULT_AI_IMPORT_MODEL,
  ackAiImport,
  aiImportModel,
  cancelAiImport,
  defaultSectionMinutes,
  describeAiImportError,
  downloadAiImportPdf,
  findLastAiImportJob,
  formatElapsed,
  getAiImportStatus,
  isTerminalAiImportStatus,
  startAiImport,
  uploadAiImportPdf,
  LIVE_WALL_CLOCK_MS,
  type AiImportEngine,
  type AiImportModelId,
  type LastAiImportJob,
  type UploadedPdf,
} from "@/services/aiImportService";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AiPdfImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  supportedLanguages: string[];
  primaryLanguage: string;
  /** Language tab the creator is looking at — preselected in Setup. */
  activeLanguage?: string;
  dataSource: JsonUploadDataSource;
  commitJson: (
    report: ParseReport,
    mode: "replace" | "append",
    language: string,
    extras?: CommitJsonExtras
  ) => Promise<CommitResult>;
  /** Fired after this dialog creates sections, so the page behind it resyncs. */
  onSectionsChanged?: () => void | Promise<void>;
};

type StepId = "upload" | "gemini" | "parse" | "sections" | "figures" | "save";
type StepStatus = "pending" | "active" | "done" | "failed" | "skipped";
type Step = {
  id: StepId;
  label: string;
  status: StepStatus;
  /** Short right-aligned result, e.g. "100 questions in 3 sections". */
  detail?: string;
  /** Live sub-line while active, e.g. "Cutting figure 4 of 12". */
  live?: string;
  progress?: { done: number; total: number };
  /** When the step went active — the row's clock runs from here. */
  startedAt?: number;
  /** Quiet expectation shown next to the clock, e.g. "usually 2–3 min". */
  eta?: string;
  /** Which Gemini engine the step runs on — decides when "slow" becomes "over the limit". */
  engine?: AiImportEngine;
  /** Set while the step is being retried on its own — what went wrong the first time. */
  retryNote?: string;
};

type Failure = {
  stepId: StepId;
  message: string;
  /** Offer "Switch to Gemini 3.5 Flash and retry" (only when on the other model). */
  canSwitchModel: boolean;
};

type Summary = {
  language: string;
  model: AiImportModelId;
  mode: "append" | "replace";
  perSection: { name: string; count: number; created: boolean; minutes?: number }[];
  totalQuestions: number;
  figures: number;
  figuresFailed: number;
  labelsCleaned: number;
  /**
   * q_no is the number PRINTED in the PDF (what Gemini keys its notes on);
   * examQNo is where that question actually landed in the editor, which the
   * parser renumbers by position. They differ on any paper numbered straight
   * through its sections, so both are shown.
   */
  needsReview: { section: string; q_no: number; examQNo: number | null; reason: string }[];
  skipped: { reason: string; q_no?: number; page?: number }[];
  placeholders: number;
  /** Questions that came back with a correct answer — counted from the parse, not from Gemini. */
  answersMarked: number;
  /**
   * What Gemini said about the paper's answer key. Null when it said nothing
   * (an older prompt, or a reply that omitted the block) — then the summary
   * stays quiet rather than guessing why answers are missing.
   */
  answerKey: { found: boolean | null; applied: boolean | null; note: string } | null;
  elapsedMs: number;
  /** False on a resumed job whose stored PDF url was lost — then nothing is attached. */
  pdfAttached: boolean;
};

/** Mutable state of one run — lives in a ref so async steps never read stale closures. */
type RunCtx = {
  token: number;
  language: string;
  model: AiImportModelId;
  mode: "append" | "replace";
  pdfFile: File | null;
  uploaded: (UploadedPdf & { file: File | null }) | null;
  jobId: string | null;
  jobStartedAt: number | null;
  rawOutput: string | null;
  report: ParseReport | null;
  sectionsByLang: Record<string, SectionMeta[]>;
  createdSections: { name: string; minutes?: number }[];
  labelsCleaned: number;
  snipUrls: Map<string, string>;
  figures: number;
  figuresFailed: number;
  startedAt: number;
  /** Automatic Gemini retries already spent in this attempt (see AUTO_RETRIES). */
  autoRetries: number;
  /** The next Gemini start must be a fresh job even if one is still running (a redo). */
  forceNewJob: boolean;
};

const STEP_LABELS: Record<StepId, string> = {
  upload: "PDF uploaded",
  gemini: "Paper read by Gemini",
  parse: "Questions extracted",
  sections: "Sections matched or created",
  figures: "Figures cut from the PDF",
  save: "Questions saved to this exam",
};
/** The same steps while running or stopped — STEP_LABELS is the finished form. */
const STEP_DOING: Record<StepId, string> = {
  upload: "Uploading the PDF",
  gemini: "Gemini is reading the paper",
  parse: "Extracting the questions",
  sections: "Matching or creating sections",
  figures: "Cutting figures from the PDF",
  save: "Saving questions to this exam",
};
const STEP_ORDER: StepId[] = ["upload", "gemini", "parse", "sections", "figures", "save"];

const LANGUAGE_LABEL: Record<string, string> = { en: "English", hi: "Hindi" };
const langLabel = (code: string) => LANGUAGE_LABEL[code] ?? code.toUpperCase();

const MAX_PDF_MB = 40;
const POLL_MS = 4000;

class Aborted extends Error {
  constructor() {
    super("aborted");
    this.name = "Aborted";
  }
}

const freshSteps = (): Step[] => STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id], status: "pending" }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Past this, the Gemini row says so instead of letting the clock run in silence. */
const SLOW_GEMINI_MS = 5 * 60 * 1000;
/**
 * A failed Gemini read — quota, a reply without the JSON block, a lost job — or
 * a reply the parser cannot read is retried this many times on its own before
 * the creator sees the failure card and its Retry button.
 */
const AUTO_RETRIES = 1;
/**
 * Steps a creator can run again by hand while the import is in progress. The
 * PDF is not uploaded twice; a Gemini redo starts a fresh job and the steps
 * after it run on their own. Upload has nothing to redo, save must never be.
 */
const REDOABLE = new Set<StepId>(["gemini", "parse", "sections", "figures"]);

// Shell: pinned header and footer, only the middle scrolls (CreateExamDialog's chrome).
const HEADER = "border-b px-6 pb-4 pr-12 pt-6 text-left";
const BODY =
  "min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-6 py-5 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30";
const FOOTER = "gap-2 border-t px-6 py-4 sm:items-center sm:gap-0";
// One selected look for every pick-one control, the app's own card idiom.
const PICK =
  "rounded-lg border-2 border-border bg-background transition-all hover:border-primary/40 hover:bg-muted/50 " +
  "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:shadow-sm " +
  "data-[disabled]:cursor-not-allowed data-[disabled]:border-border data-[disabled]:bg-muted/40 data-[disabled]:text-muted-foreground data-[disabled]:hover:border-border data-[disabled]:hover:bg-muted/40";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

// ─── Component ───────────────────────────────────────────────────────────────

export default function AiPdfImportDialog({
  open,
  onOpenChange,
  examId,
  supportedLanguages,
  primaryLanguage,
  activeLanguage,
  dataSource,
  commitJson,
  onSectionsChanged,
}: AiPdfImportDialogProps) {
  const { toast } = useToast();

  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [sectionsByLang, setSectionsByLang] = useState<Record<string, SectionMeta[]>>({});
  const [langStatus, setLangStatus] = useState<Record<string, LangStatus>>({});

  const [language, setLanguage] = useState<string>(primaryLanguage);
  const [model, setModel] = useState<AiImportModelId>(DEFAULT_AI_IMPORT_MODEL);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [dragging, setDragging] = useState(false);

  const [lastJob, setLastJob] = useState<LastAiImportJob | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);

  const [steps, setSteps] = useState<Step[]>(freshSteps());
  const [failure, setFailure] = useState<Failure | null>(null);
  const [committing, setCommitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showReview, setShowReview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<RunCtx | null>(null);
  const tokenRef = useRef(0);

  // ─── Loading exam state ───
  const loadStatus = useCallback(async (): Promise<Record<string, SectionMeta[]> | null> => {
    setLoadingStatus(true);
    try {
      const byLang = await dataSource.loadSectionsByLang(examId, supportedLanguages);
      setSectionsByLang(byLang);
      const status = await dataSource.loadLangStatus(examId, supportedLanguages, byLang);
      setLangStatus(status);
      return byLang;
    } catch (err: any) {
      toast({
        title: "Couldn't load exam state",
        description: err?.message ?? "Close and reopen the dialog.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, [dataSource, examId, supportedLanguages, toast]);

  useEffect(() => {
    if (!open) return;
    tokenRef.current += 1; // abandon any polling loop from a previous open
    setPhase("setup");
    setSteps(freshSteps());
    setFailure(null);
    setSummary(null);
    setShowReview(false);
    setCommitting(false);
    setMode("append");
    setModel(DEFAULT_AI_IMPORT_MODEL);
    setLanguage(
      activeLanguage && supportedLanguages.includes(activeLanguage) ? activeLanguage : primaryLanguage
    );
    setLastJob(null);
    ctxRef.current = null;
    loadStatus();
    findLastAiImportJob(examId).then((job) => setLastJob(job));
  }, [open, activeLanguage, primaryLanguage, supportedLanguages, examId, loadStatus]);

  // Live timer while a step is active.
  const anyActive = phase === "running" && steps.some((s) => s.status === "active");
  useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [anyActive]);

  // Leaving during the save step truncates the import — same guards as the JSON dialog.
  useEffect(() => {
    if (!committing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.history.pushState({ aiImportGuard: true }, "");
    const onPopState = () => {
      window.history.pushState({ aiImportGuard: true }, "");
      toast({ title: "Import in progress", description: "Please wait — leaving now would keep only part of your questions." });
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      if ((window.history.state as any)?.aiImportGuard) window.history.back();
    };
  }, [committing, toast]);

  // ─── Step helpers ───
  const patchStep = (id: StepId, patch: Partial<Step>) =>
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        // First tick of an active step starts its clock, unless the caller set one.
        const starting = patch.status === "active" && s.status !== "active" && patch.startedAt === undefined;
        return { ...s, ...patch, ...(starting ? { startedAt: Date.now() } : {}) };
      })
    );

  const resetStepsFrom = (id: StepId) =>
    setSteps((prev) => {
      const idx = STEP_ORDER.indexOf(id);
      return prev.map((s, i) =>
        i >= idx ? { id: s.id, label: s.label, status: "pending" as StepStatus } : s
      );
    });

  const ensureLive = (ctx: RunCtx) => {
    if (ctx.token !== tokenRef.current) throw new Aborted();
  };

  // ─── Steps ───
  const stepUpload = async (ctx: RunCtx) => {
    if (ctx.uploaded && ctx.uploaded.file && ctx.uploaded.file === ctx.pdfFile) {
      patchStep("upload", { status: "done", detail: `${ctx.uploaded.pdfName} · already uploaded` });
      return;
    }
    if (!ctx.pdfFile) throw new Error("Choose a PDF first.");
    patchStep("upload", { status: "active", live: `Uploading ${ctx.pdfFile.name}…` });
    const up = await uploadAiImportPdf(examId, ctx.language, ctx.pdfFile);
    ensureLive(ctx);
    ctx.uploaded = { ...up, file: ctx.pdfFile };
    patchStep("upload", {
      status: "done",
      live: undefined,
      detail: `${up.pdfName} · ${(up.size / 1024 / 1024).toFixed(1)} MB`,
    });
  };

  const stepGemini = async (ctx: RunCtx) => {
    const opt = aiImportModel(ctx.model);
    patchStep("gemini", { status: "active", live: `Sending to ${opt.label}…` });
    if (!ctx.jobId) {
      if (!ctx.uploaded) throw new Error("The PDF was not uploaded.");
      const started = await startAiImport({
        examId,
        language: ctx.language,
        model: ctx.model,
        storagePath: ctx.uploaded.storagePath,
        pdfName: ctx.uploaded.pdfName,
        force: ctx.forceNewJob,
      });
      ensureLive(ctx);
      ctx.forceNewJob = false;
      ctx.jobId = started.jobId;
      ctx.jobStartedAt = new Date(started.createdAt).getTime() || Date.now();
      if (started.reused) {
        toast({
          title: "Picking up the run already in progress",
          description: `An import for ${langLabel(ctx.language)} was still running — continuing with it.`,
        });
      }
    }
    if (!ctx.jobStartedAt) ctx.jobStartedAt = Date.now();
    patchStep("gemini", { startedAt: ctx.jobStartedAt, eta: opt.eta.toLowerCase(), engine: opt.engine });

    let consecutiveErrors = 0;
    let first = true;
    for (;;) {
      if (!first) await sleep(POLL_MS);
      first = false;
      ensureLive(ctx);
      let st;
      try {
        st = await getAiImportStatus(ctx.jobId!, true);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 4) throw err;
        continue;
      }
      ensureLive(ctx);
      if (!isTerminalAiImportStatus(st.status)) {
        patchStep("gemini", {
          live:
            opt.engine === "background"
              ? `${opt.label} · runs on Gemini's side — safe to close this window`
              : `${opt.label} · runs live on the server — must finish within 2½ minutes`,
        });
        continue;
      }
      if (st.status === "completed" && st.rawOutput) {
        ctx.rawOutput = st.rawOutput;
        patchStep("gemini", {
          status: "done",
          live: undefined,
          detail: `${opt.label} · ${formatElapsed(st.elapsedMs)}`,
        });
        return;
      }
      ctx.jobId = null; // a failed job is not resumed; retry starts a new one
      ctx.jobStartedAt = null;
      throw new Error(st.error ?? `Gemini stopped (${st.status}).`);
    }
  };

  const parseCtxFor = (ctx: RunCtx): ParseContext => ({
    language: ctx.language,
    selectedLanguage: ctx.language,
    isPrimary: ctx.language === primaryLanguage,
    supportedLanguages,
    examSectionsForLanguage: ctx.sectionsByLang[ctx.language] ?? [],
  });

  const stepParse = async (ctx: RunCtx) => {
    patchStep("parse", { status: "active", live: "Checking the JSON…" });
    if (!ctx.rawOutput) throw new Error("Gemini's reply is missing.");
    const report = parseExamJson(ctx.rawOutput, parseCtxFor(ctx));
    if (!report.ok) throw new Error(report.fatalReason ?? "The reply could not be read as exam JSON.");
    ctx.labelsCleaned = normalizeReportOptionLabels(report);
    ctx.report = report;
    const qs = report.perSection.reduce((n, s) => n + s.questionCountInJson, 0);
    patchStep("parse", {
      status: "done",
      live: undefined,
      detail: `${qs} question${qs === 1 ? "" : "s"} in ${report.perSection.length} section${report.perSection.length === 1 ? "" : "s"}`,
    });
  };

  const stepSections = async (ctx: RunCtx) => {
    const report = ctx.report!;
    const unmatched = report.perSection.filter((s) => s.matchedSectionId === null);
    if (unmatched.length === 0) {
      patchStep("sections", { status: "done", detail: "All sections already exist" });
      return;
    }
    patchStep("sections", {
      status: "active",
      live: `Creating ${unmatched.map((u) => u.jsonName).join(", ")}…`,
    });
    const specs: NewSectionSpec[] = unmatched.map((u) => ({
      name: u.jsonName,
      ...(dataSource.requiresSectionTime ? { timeMinutes: defaultSectionMinutes(u.questionCountInJson) } : {}),
    }));
    const rows = buildSectionCreationPlan(specs, ctx.sectionsByLang, supportedLanguages);
    await dataSource.createSections(examId, rows);
    ensureLive(ctx);
    const byLang = await dataSource.loadSectionsByLang(examId, supportedLanguages);
    ensureLive(ctx);
    ctx.sectionsByLang = byLang;
    setSectionsByLang(byLang);
    // Re-parse against the new section list: the parser never validated the
    // questions of unmatched sections, so the old report cannot be patched.
    const reparsed = parseExamJson(ctx.rawOutput!, parseCtxFor(ctx));
    if (!reparsed.ok) throw new Error(reparsed.fatalReason ?? "The reply could not be re-read after creating sections.");
    ctx.labelsCleaned = normalizeReportOptionLabels(reparsed);
    ctx.report = reparsed;
    ctx.createdSections = specs.map((s) => ({ name: s.name, minutes: s.timeMinutes }));
    void onSectionsChanged?.();
    patchStep("sections", {
      status: "done",
      live: undefined,
      detail: `Created ${specs.length}: ${specs.map((s) => s.name).join(", ")}`,
    });
  };

  const stepFigures = async (ctx: RunCtx) => {
    const report = ctx.report!;
    const requests: SnipRequest[] = [];
    for (const sec of report.perSection) {
      if (!sec.matchedSectionId) continue;
      sec.accepted.forEach((q, qIdx) => {
        if (!q.imageRegion) return;
        requests.push({ key: `${sec.jsonName}::${qIdx}`, page: q.imageRegion.page, bbox: q.imageRegion.bbox });
      });
    }
    if (!report.hasImageRegions || requests.length === 0) {
      patchStep("figures", { status: "skipped", detail: "No figures in this paper" });
      return;
    }
    patchStep("figures", { status: "active", live: "Opening the PDF…", progress: { done: 0, total: requests.length } });
    let file = ctx.pdfFile;
    if (!file) {
      // Resumed job: the File is gone with the old tab — fetch it back.
      if (!ctx.uploaded) throw new Error("The PDF is no longer available for cutting figures.");
      file = await downloadAiImportPdf(ctx.uploaded.storagePath, ctx.uploaded.pdfName);
      ensureLive(ctx);
      ctx.pdfFile = file;
    }
    const results = await autoSnip(file, requests, {
      paddingPct: report.imagePaddingPct,
      onProgress: (msg, done, total) => patchStep("figures", { live: msg, progress: { done, total } }),
    });
    ensureLive(ctx);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in.");
    const uploadable = results.filter((r) => r.blob.size > 0);
    ctx.figuresFailed = results.length - uploadable.length;
    let done = 0;
    patchStep("figures", { live: "Uploading figures…", progress: { done: 0, total: uploadable.length } });
    for (const r of uploadable) {
      const safeKey = r.key.replace(/[^A-Za-z0-9_-]/g, "_");
      const url = await uploadQuestionImage(`${user.id}/${examId}/auto-snip-${safeKey}-${Date.now()}.png`, r.blob);
      ensureLive(ctx);
      ctx.snipUrls.set(r.key, url);
      done++;
      patchStep("figures", { progress: { done, total: uploadable.length } });
    }
    ctx.figures = done;
    patchStep("figures", {
      status: "done",
      live: undefined,
      progress: undefined,
      detail: `${done} figure${done === 1 ? "" : "s"} attached${ctx.figuresFailed ? ` · ${ctx.figuresFailed} couldn't be cut` : ""}`,
    });
  };

  const stepSave = async (ctx: RunCtx) => {
    const report = ctx.report!;
    const total = report.perSection.filter((s) => s.matchedSectionId).reduce((n, s) => n + s.accepted.length, 0);
    patchStep("save", { status: "active", live: "Saving questions…", progress: { done: 0, total } });
    setCommitting(true);
    let res: CommitResult;
    try {
      res = await commitJson(report, ctx.mode, ctx.language, {
        snipUrls: ctx.snipUrls.size > 0 ? ctx.snipUrls : undefined,
        uploadedPdfUrl: ctx.uploaded?.publicUrl,
        onProgress: (done, tot) => patchStep("save", { progress: { done, total: tot } }),
      });
    } finally {
      setCommitting(false);
    }
    ensureLive(ctx);
    if (!res.ok) {
      throw new Error(
        "The questions could not be saved — usually because the exam is published or no section matched. " +
          "Close this window, fix that on the exam page, then reopen Import from PDF: the finished Gemini reply is kept for two hours, so the paper is not re-read."
      );
    }
    patchStep("save", {
      status: "done",
      live: undefined,
      progress: undefined,
      detail: `${total} question${total === 1 ? "" : "s"} saved`,
    });
  };

  const STEP_FN: Record<StepId, (ctx: RunCtx) => Promise<void>> = {
    upload: stepUpload,
    gemini: stepGemini,
    parse: stepParse,
    sections: stepSections,
    figures: stepFigures,
    save: stepSave,
  };

  const finish = (ctx: RunCtx) => {
    const report = ctx.report!;
    const created = new Set(ctx.createdSections.map((c) => c.name));
    const perSection = report.perSection
      .filter((s) => s.matchedSectionId)
      .map((s) => ({
        name: s.jsonName,
        count: s.accepted.length,
        created: created.has(s.jsonName),
        minutes: ctx.createdSections.find((c) => c.name === s.jsonName)?.minutes,
      }));
    const placeholders = report.perSection.reduce(
      (n, s) => n + s.accepted.filter((q) => /Manual entry needed/.test(JSON.stringify(q.options))).length,
      0
    );
    // Counted from what actually parsed, never from Gemini's own tally.
    const answersMarked = report.perSection
      .filter((s) => s.matchedSectionId)
      .reduce(
        (n, s) =>
          n +
          s.accepted.filter(
            (q) => q.correct_answer !== null && q.correct_answer !== undefined &&
              (!Array.isArray(q.correct_answer) || q.correct_answer.length > 0)
          ).length,
        0
      );
    const rawKey = (report.extractionSummary as any)?.answer_key;
    const answerKey =
      rawKey && typeof rawKey === "object"
        ? {
            found: typeof rawKey.found === "boolean" ? rawKey.found : null,
            applied: typeof rawKey.applied === "boolean" ? rawKey.applied : null,
            note: typeof rawKey.note === "string" ? rawKey.note.slice(0, 300) : "",
          }
        : null;
    setSummary({
      language: ctx.language,
      model: ctx.model,
      mode: ctx.mode,
      perSection,
      totalQuestions: perSection.reduce((n, s) => n + s.count, 0),
      figures: ctx.figures,
      figuresFailed: ctx.figuresFailed,
      labelsCleaned: ctx.labelsCleaned,
      needsReview: ((report.extractionSummary?.needs_manual_review as any[]) ?? []).map((r) => {
        const section = String(r?.section ?? "");
        const printed = Number(r?.q_no ?? 0);
        // Where did the question with that printed number actually land?
        const sec = report.perSection.find((s) => s.jsonName === section && s.matchedSectionId);
        const hit = sec?.accepted.find((q) => q.sourceQNo === printed);
        return {
          section,
          q_no: printed,
          examQNo: hit && hit.q_no !== printed ? hit.q_no : null,
          reason: String(r?.reason ?? ""),
        };
      }),
      skipped: ((report.extractionSummary?.skipped as any[]) ?? []).map((r) => ({
        reason: String(r?.reason ?? ""),
        q_no: r?.q_no,
        page: r?.page,
      })),
      placeholders,
      answersMarked,
      answerKey,
      elapsedMs: Date.now() - ctx.startedAt,
      pdfAttached: !!ctx.uploaded?.publicUrl,
    });
    if (ctx.jobId) void ackAiImport(ctx.jobId).catch(() => {});
    setPhase("done");
  };

  /**
   * Forget a reply that could not be used so the next Gemini step asks afresh.
   * A job that is still being polled (jobId set, no reply yet) is kept — the
   * retry simply resumes polling it; the server hands the same running job back.
   */
  const discardReply = (ctx: RunCtx) => {
    if (ctx.rawOutput && ctx.jobId) {
      // Unreadable reply: mark the job consumed so it is not offered for resume.
      void ackAiImport(ctx.jobId).catch(() => {});
      ctx.jobId = null;
      ctx.jobStartedAt = null;
    }
    ctx.rawOutput = null;
    ctx.report = null;
  };

  const runFrom = async (startId: StepId) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.token = ++tokenRef.current;
    setFailure(null);
    resetStepsFrom(startId);
    const from = STEP_ORDER.indexOf(startId);
    for (let i = from; i < STEP_ORDER.length; i++) {
      const id = STEP_ORDER[i];
      try {
        await STEP_FN[id](ctx);
      } catch (err) {
        if (err instanceof Aborted || ctx.token !== tokenRef.current) return;
        const message = describeAiImportError(err);
        // Gemini's reading is the flaky part. Try it once more on our own —
        // a fresh job, or the same one if it is only the polling that broke —
        // and only then stop and ask.
        if ((id === "gemini" || id === "parse") && ctx.autoRetries < AUTO_RETRIES) {
          ctx.autoRetries += 1;
          discardReply(ctx);
          resetStepsFrom("gemini");
          patchStep("gemini", { retryNote: `First try failed — ${message} Trying once more automatically.` });
          i = STEP_ORDER.indexOf("gemini") - 1; // the loop's i++ lands on "gemini"
          continue;
        }
        patchStep(id, { status: "failed", live: undefined, progress: undefined, detail: undefined });
        setFailure({
          stepId: id,
          message,
          canSwitchModel: (id === "gemini" || id === "parse") && ctx.model !== DEFAULT_AI_IMPORT_MODEL,
        });
        return;
      }
    }
    if (ctx.token === tokenRef.current) finish(ctx);
  };

  // ─── Setup actions ───
  const acceptFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast({ title: "PDF only", description: "Choose the exam paper as a PDF file.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      toast({
        title: "PDF too large",
        description: `Max ${MAX_PDF_MB} MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }
    setPdfFile(file);
  };

  const existingQs = langStatus[language]?.questionCount ?? 0;
  const replaceBlockedReason =
    (langStatus[language]?.submittedAttemptCount ?? 0) > 0
      ? dataSource.replaceBlockedReason(langStatus[language]!.submittedAttemptCount)
      : null;
  // The chips show the mode that will run (effectiveMode); keep the state in step
  // with them, or a swallowed click on "Add" leaves "replace" armed underneath.
  useEffect(() => {
    if (mode === "replace" && replaceBlockedReason) setMode("append");
  }, [mode, replaceBlockedReason]);

  const startRun = () => {
    if (!pdfFile) return;
    const prev = ctxRef.current;
    ctxRef.current = {
      token: 0,
      language,
      model,
      mode: mode === "replace" && replaceBlockedReason ? "append" : mode,
      pdfFile,
      // Same File as the last run → the upload step reuses it.
      uploaded: prev?.uploaded && prev.uploaded.file === pdfFile ? prev.uploaded : null,
      jobId: null,
      jobStartedAt: null,
      rawOutput: null,
      report: null,
      sectionsByLang,
      createdSections: [],
      labelsCleaned: 0,
      snipUrls: new Map(),
      figures: 0,
      figuresFailed: 0,
      startedAt: Date.now(),
      autoRetries: 0,
      forceNewJob: false,
    };
    setSummary(null);
    setPhase("running");
    void runFrom("upload");
  };

  const resumeJob = async () => {
    if (!lastJob) return;
    setResumeBusy(true);
    try {
      const modelId = (AI_IMPORT_MODELS.some((m) => m.id === lastJob.model) ? lastJob.model : DEFAULT_AI_IMPORT_MODEL) as AiImportModelId;
      ctxRef.current = {
        token: 0,
        language: lastJob.language,
        model: modelId,
        mode: "append",
        pdfFile: null,
        uploaded: {
          storagePath: lastJob.storagePath,
          publicUrl: lastJob.pdfUrl ?? "",
          pdfName: lastJob.pdfName ?? "paper.pdf",
          size: 0,
          file: null,
        },
        jobId: lastJob.id,
        jobStartedAt: new Date(lastJob.createdAt).getTime() || Date.now(),
        rawOutput: null,
        report: null,
        sectionsByLang,
        createdSections: [],
        labelsCleaned: 0,
        snipUrls: new Map(),
        figures: 0,
        figuresFailed: 0,
        startedAt: Date.now(),
        autoRetries: 0,
        forceNewJob: false,
      };
      setLanguage(lastJob.language);
      setModel(modelId);
      setSteps((prev) => prev.map((s) => (s.id === "upload" ? { ...s, status: "done", detail: `${lastJob.pdfName ?? "PDF"} · uploaded earlier` } : s)));
      setPhase("running");
      void runFrom("gemini");
    } finally {
      setResumeBusy(false);
    }
  };

  /**
   * "Read again" from Setup: a fresh Gemini job on the PDF the last run already
   * uploaded, with the choices currently on screen (language, model, add-or-
   * replace), then the next steps. A still-running last job is cancelled and a
   * finished-but-unsaved one marked consumed, so neither is offered again.
   */
  const readAgainFromLastJob = async () => {
    if (!lastJob) return;
    const job = lastJob;
    setResumeBusy(true);
    try {
      if (job.status === "queued" || job.status === "running") {
        try {
          await cancelAiImport(job.id);
        } catch {
          /* the server ages it out; force below starts a new job regardless */
        }
      } else if (job.status === "completed" && !job.importedAt) {
        void ackAiImport(job.id).catch(() => {});
      }
      ctxRef.current = {
        token: 0,
        language,
        model,
        mode: mode === "replace" && replaceBlockedReason ? "append" : mode,
        pdfFile: null,
        uploaded: {
          storagePath: job.storagePath,
          publicUrl: job.pdfUrl ?? "",
          pdfName: job.pdfName ?? "paper.pdf",
          size: 0,
          file: null,
        },
        jobId: null,
        jobStartedAt: null,
        rawOutput: null,
        report: null,
        sectionsByLang,
        createdSections: [],
        labelsCleaned: 0,
        snipUrls: new Map(),
        figures: 0,
        figuresFailed: 0,
        startedAt: Date.now(),
        autoRetries: 0,
        forceNewJob: true,
      };
      setSummary(null);
      setSteps((prev) => prev.map((s) => (s.id === "upload" ? { ...s, status: "done", detail: `${job.pdfName ?? "PDF"} · uploaded earlier` } : s)));
      setPhase("running");
      void runFrom("gemini");
    } finally {
      setResumeBusy(false);
    }
  };

  const discardResumable = async () => {
    if (!lastJob) return;
    const job = lastJob;
    setLastJob(null);
    if (job.status === "running" || job.status === "queued") {
      try {
        await cancelAiImport(job.id);
      } catch {
        /* nothing to do — the server will age it out */
      }
    } else if (job.status === "completed" && !job.importedAt) {
      // Finished but never saved: mark it consumed so it is not offered again.
      void ackAiImport(job.id).catch(() => {});
    }
    // Failed, cancelled or already imported: nothing to tell the server — just hide it.
  };

  // ─── Retry actions ───
  const retryFailed = () => {
    if (!failure) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.autoRetries = 0; // a click is a fresh attempt, with its own automatic retry
    if (failure.stepId === "parse") {
      // Re-reading the same reply would fail the same way — ask Gemini again.
      discardReply(ctx);
      void runFrom("gemini");
      return;
    }
    void runFrom(failure.stepId);
  };
  /**
   * "Do this step again": same PDF, and everything after the step runs on its
   * own. A parse redo is a Gemini redo — re-reading the same reply would fail
   * the same way. A Gemini redo abandons the current job (cancelled if it is
   * still running, marked consumed if it finished) and forces a fresh one.
   */
  const redoFrom = (stepId: StepId) => {
    const ctx = ctxRef.current;
    if (!ctx || committing || !REDOABLE.has(stepId)) return;
    const from: StepId = stepId === "parse" ? "gemini" : stepId;
    if (from === "gemini") {
      if (ctx.jobId && !ctx.rawOutput) void cancelAiImport(ctx.jobId).catch(() => {});
      discardReply(ctx);
      ctx.jobId = null;
      ctx.jobStartedAt = null;
      ctx.forceNewJob = true;
    }
    ctx.autoRetries = 0;
    void runFrom(from);
  };

  const retryWithRecommended = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.model = DEFAULT_AI_IMPORT_MODEL;
    ctx.jobId = null;
    ctx.jobStartedAt = null;
    ctx.rawOutput = null;
    ctx.autoRetries = 0;
    setModel(DEFAULT_AI_IMPORT_MODEL);
    void runFrom("gemini");
  };
  const startOver = () => {
    tokenRef.current += 1;
    setPhase("setup");
    setSteps(freshSteps());
    setFailure(null);
  };
  /**
   * From the summary: run the whole import again with the same PDF. Setup keeps
   * the chosen file and its upload, and shows the fresh question count so the
   * creator decides add-or-replace with the numbers in front of them.
   */
  const runAgainSamePdf = () => {
    tokenRef.current += 1;
    setSteps(freshSteps());
    setFailure(null);
    setSummary(null);
    setPhase("setup");
    loadStatus();
  };

  const importAnotherLanguage = () => {
    const other = supportedLanguages.find((l) => l !== summary?.language);
    tokenRef.current += 1;
    setSteps(freshSteps());
    setFailure(null);
    setSummary(null);
    if (other) setLanguage(other);
    setMode("append");
    setPhase("setup");
    loadStatus();
  };

  // ─── Close handling ───
  const geminiActive = phase === "running" && steps.find((s) => s.id === "gemini")?.status === "active";
  const handleOpenChange = (next: boolean) => {
    if (!next && committing) return; // never mid-write
    // Everything after the upload is resumable: Gemini's job outlives the tab, and
    // a finished reply is offered again for two hours.
    if (!next && phase === "running" && !failure && steps.some((s) => s.status === "active" && s.id !== "upload")) {
      toast({
        title: geminiActive ? "Gemini keeps working" : "Import paused",
        description: "Reopen Import from PDF any time to pick this run up where it is.",
      });
    }
    if (!next) tokenRef.current += 1;
    onOpenChange(next);
  };

  // ─── Render ───
  const modelOpt = aiImportModel(model);
  const sectionsForLang = sectionsByLang[language] ?? [];
  const canStart = !!pdfFile && !loadingStatus;
  // A blocked "replace" runs as "append" (startRun coerces it) — the chips
  // must show that truth, not the stale click.
  const effectiveMode: "append" | "replace" = mode === "replace" && replaceBlockedReason ? "append" : mode;
  const saveStep = steps.find((s) => s.id === "save");
  const saveProgress = saveStep?.progress;
  const activeIndex = steps.findIndex((s) => s.status === "active");
  // Client-side steps die with the dialog; the finished Gemini job survives
  // and is offered again on the next open. Upload is too quick to matter.
  const localWorkActive =
    phase === "running" && !geminiActive && !committing && !failure && activeIndex > 0;
  const runLanguage = ctxRef.current?.language ?? language;
  const runModel = aiImportModel(ctxRef.current?.model ?? model);
  const reviewCount = summary ? summary.needsReview.length + summary.skipped.length : 0;
  const reviewOpen = showReview || reviewCount <= 6;
  const otherLanguage = summary ? supportedLanguages.find((l) => l !== summary.language) : undefined;

  // Focus follows the moment: the write shield when it covers the screen, the
  // Retry button when a step stops — otherwise keyboard users hear nothing.
  const shieldRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (committing) shieldRef.current?.focus();
  }, [committing]);
  useEffect(() => {
    if (failure) retryRef.current?.focus();
  }, [failure]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* A flex column, not the primitive's grid: a grid track grows to the
          widest nowrap child (a long PDF name once pushed everything past the
          panel edge), a flex column never does. Header and footer stay put,
          only the middle scrolls. */}
      <DialogContent
        className={`flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 supports-[height:1dvh]:max-h-[88dvh] ${
          committing ? "[&>button:last-child]:invisible" : ""
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {phase === "setup" && (
          <>
            <DialogHeader className={HEADER}>
              <DialogTitle className="flex items-center gap-2 leading-tight">
                <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                Import from PDF
              </DialogTitle>
              <DialogDescription>Gemini reads the paper and fills this exam with its questions.</DialogDescription>
            </DialogHeader>

            <div className={BODY}>
              {/* Last run — Continue when it can be resumed; Read again always: the PDF is
                  already in storage, so a bad read is fixed without finding the file again. */}
              {lastJob && (() => {
                const running = lastJob.status === "queued" || lastJob.status === "running";
                const ageMin = Math.max(1, Math.round((Date.now() - new Date(lastJob.createdAt).getTime()) / 60000));
                const what = running
                  ? lastJob.resumable
                    ? "is still running"
                    : "did not finish"
                  : lastJob.status === "completed"
                    ? lastJob.importedAt
                      ? "was imported"
                      : "finished — not saved yet"
                    : lastJob.status === "cancelled"
                      ? "was cancelled"
                      : `failed${lastJob.error ? ` — ${lastJob.error}` : ""}`;
                const icon = running && lastJob.resumable
                  ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  : lastJob.status === "completed"
                    ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    : lastJob.status === "failed"
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                      : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
                return (
                  <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {icon}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium [overflow-wrap:anywhere]">
                          Last run · {langLabel(lastJob.language)} import {what}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {aiImportModel(lastJob.model).label} · {lastJob.pdfName ?? "PDF"} · {ageMin} min ago
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 pl-6 sm:pl-0">
                      <Button size="sm" variant="ghost" onClick={discardResumable} disabled={resumeBusy}>
                        {lastJob.resumable ? "Start fresh" : "Dismiss"}
                      </Button>
                      <Button
                        size="sm"
                        variant={lastJob.resumable ? "outline" : "default"}
                        onClick={readAgainFromLastJob}
                        disabled={resumeBusy || loadingStatus}
                        title="Ask Gemini to read this PDF again with the choices below, then continue"
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Read again
                      </Button>
                      {lastJob.resumable && (
                        <Button size="sm" onClick={resumeJob} disabled={resumeBusy}>
                          {resumeBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                          {lastJob.status === "completed" ? "Finish import" : "Continue"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* PDF — a real button, so Enter/Space and focus come free; the
                  remove control sits beside it in the DOM, not inside it. */}
              <section className="space-y-2">
                <FieldLabel id="ai-import-paper-label">Exam paper</FieldLabel>
                <div
                  className="relative"
                  // The handlers sit on the card, not the button: a drop on the
                  // remove X must also be caught, or the browser opens the PDF in
                  // this tab and the app is gone.
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(e) => {
                    // Zone → remove X (or back) leaves one child for the other — still inside the card.
                    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
                    setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <button
                    type="button"
                    aria-labelledby={pdfFile ? "ai-import-paper-label ai-import-paper-name" : "ai-import-paper-label ai-import-paper-cta"}
                    aria-describedby="ai-import-paper-hint"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex w-full min-w-0 items-center gap-3 rounded-lg border-2 p-4 text-left transition-colors ${FOCUS} ${pdfFile ? "pr-14" : ""} ${
                      dragging
                        ? "border-dashed border-primary bg-primary/5"
                        : pdfFile
                          ? "border-solid border-primary/30 bg-primary/[0.04]"
                          : "border-dashed border-border bg-card/40 hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                        pdfFile ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {pdfFile ? <FileText className="h-5 w-5" aria-hidden="true" /> : <FileUp className="h-5 w-5" aria-hidden="true" />}
                    </span>
                    <span className="block min-w-0 flex-1">
                      {pdfFile ? (
                        <>
                          <span id="ai-import-paper-name" className="line-clamp-2 text-sm font-medium leading-5 [overflow-wrap:anywhere]" title={pdfFile.name}>
                            {pdfFile.name}
                          </span>
                          <span id="ai-import-paper-hint" className="mt-0.5 block text-xs text-muted-foreground">
                            {(pdfFile.size / 1024 / 1024).toFixed(1)} MB · click to choose a different file
                          </span>
                        </>
                      ) : (
                        <>
                          <span id="ai-import-paper-cta" className="block text-sm font-medium">Drop the PDF here, or click to choose</span>
                          <span id="ai-import-paper-hint" className="mt-0.5 block text-xs text-muted-foreground">
                            Question paper with or without the answer key · up to {MAX_PDF_MB} MB
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                  {pdfFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${pdfFile.name}`}
                      onClick={() => setPdfFile(null)}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </section>

              {/* Language */}
              {supportedLanguages.length > 1 && (
                <section className="space-y-2">
                  <FieldLabel
                    id="ai-import-language-label"
                    hint="Bilingual paper? Run once per language — each run reads only that language's questions."
                  >
                    Language in this run
                  </FieldLabel>
                  <RadioGroupPrimitive.Root
                    value={language}
                    onValueChange={setLanguage}
                    orientation="horizontal"
                    aria-labelledby="ai-import-language-label"
                    aria-describedby="ai-import-language-label-hint"
                    className="flex flex-wrap gap-2"
                  >
                    {supportedLanguages.map((code) => {
                      const count = langStatus[code]?.questionCount ?? 0;
                      return (
                        <RadioGroupPrimitive.Item
                          key={code}
                          value={code}
                          className={`${PICK} ${FOCUS} flex items-center gap-1.5 px-3 py-2 text-sm`}
                        >
                          <span className="font-medium">{langLabel(code)}</span>
                          {code === primaryLanguage && (
                            <Tag className="bg-muted text-muted-foreground">Primary</Tag>
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            · {loadingStatus ? "…" : `${count} question${count === 1 ? "" : "s"}`}
                          </span>
                        </RadioGroupPrimitive.Item>
                      );
                    })}
                  </RadioGroupPrimitive.Root>
                </section>
              )}

              {/* Model */}
              <section className="space-y-2">
                <FieldLabel id="ai-import-model-label">Model</FieldLabel>
                <RadioGroupPrimitive.Root
                  value={model}
                  onValueChange={(v) => setModel(v as AiImportModelId)}
                  aria-labelledby="ai-import-model-label"
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {AI_IMPORT_MODELS.map((m) => (
                    <RadioGroupPrimitive.Item
                      key={m.id}
                      value={m.id}
                      className={`group ${PICK} ${FOCUS} flex min-w-0 flex-col gap-2 p-3 text-left`}
                    >
                      <span className="flex w-full items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 group-data-[state=checked]:border-primary"
                        >
                          <RadioGroupPrimitive.Indicator className="h-2 w-2 rounded-full bg-primary" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold leading-5">{m.label}</span>
                            {m.badge && <Tag className="bg-primary/10 text-primary dark:text-foreground">{m.badge}</Tag>}
                          </span>
                          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{m.eta}</span>
                        </span>
                      </span>
                      <span className="block text-sm leading-5">{m.headline}</span>
                      <span className="block text-xs leading-5 text-muted-foreground">{m.detail}</span>
                    </RadioGroupPrimitive.Item>
                  ))}
                </RadioGroupPrimitive.Root>
              </section>

              {/* Existing questions */}
              {existingQs > 0 && (
                <section className="space-y-2">
                  <FieldLabel
                    id="ai-import-mode-label"
                    hint={`${langLabel(language)} already has ${existingQs} question${existingQs === 1 ? "" : "s"}.`}
                  >
                    Existing questions
                  </FieldLabel>
                  <RadioGroupPrimitive.Root
                    value={effectiveMode}
                    onValueChange={(v) => setMode(v as "append" | "replace")}
                    aria-labelledby="ai-import-mode-label"
                    aria-describedby="ai-import-mode-label-hint"
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <ChoiceChip value="append">Add after them</ChoiceChip>
                    <ChoiceChip
                      value="replace"
                      disabled={!!replaceBlockedReason}
                      describedBy={replaceBlockedReason ? "ai-import-replace-blocked" : undefined}
                    >
                      Replace them
                    </ChoiceChip>
                  </RadioGroupPrimitive.Root>
                  {replaceBlockedReason && (
                    <p id="ai-import-replace-blocked" className="text-xs text-muted-foreground">
                      {replaceBlockedReason}
                    </p>
                  )}
                </section>
              )}

              {/* What will happen — the consequential facts, structured, not a footnote. */}
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-semibold">What happens next</p>
                <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs leading-relaxed">
                  <dt className="text-muted-foreground">Sections</dt>
                  <dd className="min-w-0">
                    {sectionsForLang.length > 0 ? (
                      <>
                        Questions are matched to your {sectionsForLang.length} {langLabel(language)} section
                        {sectionsForLang.length === 1 ? "" : "s"}:
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {sectionsForLang.map((s, i) => (
                            <span
                              key={`${s.name}-${i}`}
                              className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-foreground/80 [overflow-wrap:anywhere]"
                            >
                              {s.name}
                            </span>
                          ))}
                        </span>
                      </>
                    ) : (
                      <>This exam has no {langLabel(language)} sections yet — the paper's own section names are used.</>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">New sections</dt>
                  <dd>A section the paper has and this exam does not is created for you, timed at about one minute per question (at least 10) — change it afterwards.</dd>
                  <dt className="text-muted-foreground">Afterwards</dt>
                  <dd>You get a summary of what landed and what to check before publishing.</dd>
                </dl>
              </div>
            </div>

            <DialogFooter className={FOOTER}>
              <p className="mr-auto hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
                {langLabel(language)} · {modelOpt.label} ·{" "}
                {existingQs > 0
                  ? effectiveMode === "replace"
                    ? `replaces the ${existingQs} existing`
                    : `adds after the ${existingQs} existing`
                  : "first import for this language"}
              </p>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={startRun} disabled={!canStart}>
                Import questions
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "running" && (
          <>
            <DialogHeader className={HEADER}>
              <DialogTitle className="flex items-center gap-2 leading-tight">
                {failure ? (
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                )}
                {failure ? `${langLabel(runLanguage)} import stopped` : `Importing ${langLabel(runLanguage)} questions`}
              </DialogTitle>
              <DialogDescription role="status">
                {failure
                  ? "Retry the step below, or start over."
                  : geminiActive
                    ? `${runModel.label} is reading the paper on Google's servers — you can close this window and come back.`
                    : committing
                      ? "Saving questions — keep this tab open."
                      : "Each step ticks off as it finishes."}
              </DialogDescription>
            </DialogHeader>

            <div className={BODY}>
              <ol className="divide-y overflow-hidden rounded-lg border" aria-label="Import steps">
                {steps.map((s, i) => (
                  <StepRow
                    key={s.id}
                    step={s}
                    index={i}
                    nowMs={nowMs}
                    onRedo={
                      !committing && !failure && REDOABLE.has(s.id) && (s.status === "active" || s.status === "done")
                        ? () => redoFrom(s.id)
                        : undefined
                    }
                  />
                ))}
              </ol>
              {/* Announce step changes only — never the per-second clock. After the
                  list, so the body's space-y does not treat it as the first row. */}
              <p className="sr-only" aria-live="polite">
                {activeIndex >= 0 ? `Step ${activeIndex + 1} of ${steps.length}: ${STEP_DOING[steps[activeIndex].id]}` : ""}
              </p>

              {failure && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 dark:bg-destructive/10">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                    {/* Only the words are the alert — not the three buttons under them. */}
                    <div role="alert" className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        Stopped at step {STEP_ORDER.indexOf(failure.stepId) + 1}: {STEP_DOING[failure.stepId]}
                      </p>
                      <p className="mt-1 max-h-40 overflow-y-auto break-words text-xs leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
                        {failure.message}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {steps.filter((s) => s.status === "done" || s.status === "skipped").length} of {steps.length} steps finished.
                        {ctxRef.current?.autoRetries ? " Gemini was retried once automatically before stopping." : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 sm:pl-8">
                    <Button ref={retryRef} size="sm" onClick={retryFailed}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Retry this step
                    </Button>
                    {failure.canSwitchModel && (
                      <Button size="sm" variant="outline" onClick={retryWithRecommended}>
                        Switch to {aiImportModel(DEFAULT_AI_IMPORT_MODEL).label} and retry
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={startOver}>
                      Start over
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className={FOOTER}>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={committing}>
                {committing ? "Saving…" : geminiActive ? "Close — keep running" : localWorkActive ? "Close — resume later" : "Close"}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "done" && summary && (
          <>
            <DialogHeader className={HEADER}>
              <DialogTitle className="flex items-start gap-2 leading-snug">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  {summary.totalQuestions} question{summary.totalQuestions === 1 ? "" : "s"} imported into{" "}
                  {langLabel(summary.language)}
                </span>
              </DialogTitle>
              <DialogDescription>
                {aiImportModel(summary.model).label} · {formatElapsed(summary.elapsedMs)} ·{" "}
                {summary.mode === "replace" ? "replaced the earlier questions" : "added to this exam"}
                {summary.pdfAttached ? " · PDF attached to the sections" : ""}
              </DialogDescription>
            </DialogHeader>

            <div className={BODY}>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Questions imported per section</caption>
                  <tbody className="divide-y">
                    {summary.perSection.map((s) => (
                      <tr key={s.name}>
                        <td className="px-3 py-2.5 [overflow-wrap:anywhere]">
                          <span className="font-medium">{s.name}</span>
                          {s.created && (
                            <Tag className="ml-2 bg-primary/10 align-middle text-primary dark:text-foreground">new · {s.minutes ?? "—"} min</Tag>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                          <span className="font-medium">{s.count}</span>{" "}
                          <span className="text-muted-foreground">question{s.count === 1 ? "" : "s"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summary.perSection.length > 1 && (
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{summary.totalQuestions}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {(() => {
                // Questions that should carry an answer: placeholders never do.
                const answerable = Math.max(0, summary.totalQuestions - summary.placeholders);
                const pills = [
                  answerable > 0 && (
                    summary.answersMarked === 0 ? (
                      <Pill key="answers" tone="warn">
                        No answers marked — {answerable} question{answerable === 1 ? "" : "s"} need one
                      </Pill>
                    ) : summary.answersMarked < answerable ? (
                      <Pill key="answers" tone="warn">
                        {summary.answersMarked} of {answerable} answers marked
                      </Pill>
                    ) : (
                      <Pill key="answers" tone="good">
                        All {answerable} answer{answerable === 1 ? "" : "s"} marked
                      </Pill>
                    )
                  ),
                  summary.figures > 0 && (
                    <Pill key="figures" tone="good">
                      {summary.figures} figure{summary.figures === 1 ? "" : "s"} attached
                    </Pill>
                  ),
                  summary.figuresFailed > 0 && (
                    <Pill key="figures-failed" tone="warn">
                      {summary.figuresFailed} figure{summary.figuresFailed === 1 ? "" : "s"} not cut
                    </Pill>
                  ),
                  summary.labelsCleaned > 0 && <Pill key="labels">
                      {summary.labelsCleaned} option label{summary.labelsCleaned === 1 ? "" : "s"} cleaned
                    </Pill>,
                  summary.placeholders > 0 && (
                    <Pill key="placeholders" tone="warn">
                      {summary.placeholders} placeholder{summary.placeholders === 1 ? "" : "s"} need options
                    </Pill>
                  ),
                ].filter(Boolean);
                return pills.length > 0 ? <div className="flex flex-wrap gap-2">{pills}</div> : null;
              })()}

              {/* Why answers are missing — only when Gemini actually told us. */}
              {(() => {
                const k = summary.answerKey;
                if (!k || summary.answersMarked >= summary.totalQuestions - summary.placeholders) return null;
                const line =
                  k.found === false
                    ? "Gemini found no answer key in this PDF — mark the answers in the editor, or import a version of the paper that includes its key."
                    : k.found === true && k.applied === false
                      ? "Gemini found an answer key but could not match it to this paper, so it marked nothing rather than guess."
                      : null;
                if (!line && !k.note) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    {line}
                    {k.note && (
                      <>
                        {line ? " " : ""}
                        <span className="italic">{k.note}</span>
                      </>
                    )}
                  </p>
                );
              })()}

              {reviewCount > 0 && (
                <div className="rounded-lg border">
                  {reviewCount > 6 ? (
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${FOCUS}`}
                      onClick={() => setShowReview((v) => !v)}
                      aria-expanded={reviewOpen}
                      aria-controls={reviewOpen ? "ai-import-review-list" : undefined}
                    >
                      <ReviewHeading summary={summary} />
                      {reviewOpen ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-sm font-medium">
                      <ReviewHeading summary={summary} />
                    </div>
                  )}
                  {reviewOpen && (
                    <ul id="ai-import-review-list" className="max-h-56 divide-y overflow-y-auto border-t text-xs">
                      {summary.needsReview.map((r, i) => (
                        <li key={`r${i}`} className="flex flex-col gap-0.5 px-3 py-1.5 sm:flex-row sm:gap-3">
                          <span className="flex gap-2 text-muted-foreground sm:w-40 sm:shrink-0">
                            <span className="min-w-0 truncate" title={r.section}>
                              {r.section}
                            </span>
                            {/* Gemini keys its notes on the PDF's printed number; the
                                editor renumbers by position, so show where it landed. */}
                            <span className="shrink-0 tabular-nums text-foreground">
                              {r.examQNo ? `Q${r.examQNo}` : `Q${r.q_no}`}
                              {r.examQNo && (
                                <span className="ml-1 font-normal text-muted-foreground">(PDF Q{r.q_no})</span>
                              )}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 break-words">{r.reason}</span>
                        </li>
                      ))}
                      {summary.needsReview.length > 0 && summary.skipped.length > 0 && (
                        <li className="bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Skipped by Gemini
                        </li>
                      )}
                      {summary.skipped.map((r, i) => (
                        <li key={`s${i}`} className="flex flex-col gap-0.5 px-3 py-1.5 sm:flex-row sm:gap-3">
                          <span className="flex gap-2 text-muted-foreground sm:w-40 sm:shrink-0">
                            <span className="rounded bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-wider">skipped</span>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {r.q_no ? `PDF Q${r.q_no}` : r.page ? `p.${r.page}` : ""}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 break-words">{r.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Gemini reads well but not perfectly — skim the numbers in maths questions
                {summary.figuresFailed > 0 ? ", and re-snip the figures that couldn't be cut in the question editor," : ""} before you
                publish.
              </p>
            </div>

            <DialogFooter className={FOOTER}>
              {supportedLanguages.length > 1 && otherLanguage && (
                <Button type="button" variant="outline" onClick={importAnotherLanguage}>
                  Import {langLabel(otherLanguage)} next
                </Button>
              )}
              <Button type="button" variant="outline" onClick={runAgainSamePdf}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Run again with this PDF
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Back to the exam
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Write shield — nothing else is clickable while rows land. Rendered inside
            the panel, not portaled to body: Radix's focus trap would yank focus straight
            back out of a body portal, and a body portal inherits pointer-events:none. */}
        {committing && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-background/80 backdrop-blur-sm"
              role="alertdialog"
              aria-labelledby="ai-import-shield-title"
              aria-describedby="ai-import-shield-warning"
            >
              <div ref={shieldRef} tabIndex={-1} className="mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-xl focus:outline-none">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  <p id="ai-import-shield-title" className="text-sm font-semibold">
                    Saving questions…
                  </p>
                  {saveProgress && saveProgress.total > 0 && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {saveProgress.done}/{saveProgress.total}
                    </span>
                  )}
                </div>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Questions saved"
                  {...(saveProgress && saveProgress.total > 0
                    ? { "aria-valuemin": 0, "aria-valuemax": saveProgress.total, "aria-valuenow": saveProgress.done }
                    : {})}
                >
                  {saveProgress && saveProgress.total > 0 ? (
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round((saveProgress.done / saveProgress.total) * 100))}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                  )}
                </div>
                {saveStep?.startedAt && (
                  <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted-foreground">
                    <span>Elapsed {formatElapsed(nowMs - saveStep.startedAt)}</span>
                    <span>
                      {saveProgress && saveProgress.done >= 1 && saveProgress.total > saveProgress.done
                        ? `~${formatElapsed(((nowMs - saveStep.startedAt) / saveProgress.done) * (saveProgress.total - saveProgress.done))} left`
                        : saveProgress && saveProgress.total > 0 && saveProgress.done >= saveProgress.total
                          ? "Finishing…"
                          : "Estimating…"}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span id="ai-import-shield-warning">
                    <strong>Don't refresh, press Back, or close this tab.</strong> Questions are written one by one —
                    leaving now would keep only part of them.
                  </span>
                </div>
              </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

/** Field caption — a group label, so a span (a <label> here would label nothing) — with an optional hint. */
function FieldLabel({ id, hint, children }: { id?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span id={id} className="block text-sm font-medium leading-none">
        {children}
      </span>
      {hint && (
        <p id={id ? `${id}-hint` : undefined} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Tiny inline marker (Recommended, Primary, new · N min). A span, so it is legal inside a button. */
function Tag({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${className}`}>
      {children}
    </span>
  );
}

/** One option of the add/replace radio group — a Radix item, so arrow keys work. */
function ChoiceChip({
  value,
  disabled,
  describedBy,
  children,
}: {
  value: "append" | "replace";
  disabled?: boolean;
  describedBy?: string;
  children: React.ReactNode;
}) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`${PICK} ${FOCUS} px-3 py-2 text-left text-sm`}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" }) {
  return (
    <Badge
      variant="secondary"
      className={`pointer-events-none whitespace-nowrap font-medium ${
        tone === "warn"
          ? "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200"
          : tone === "good"
            ? "bg-success/10 text-success hover:bg-success/10"
            : ""
      }`}
    >
      {children}
    </Badge>
  );
}

function ReviewHeading({ summary }: { summary: Summary }) {
  return (
    <span className="min-w-0">
      Check these before publishing
      <span className="ml-2 text-xs font-normal text-muted-foreground">
        {summary.needsReview.length > 0 && `${summary.needsReview.length} to review`}
        {summary.needsReview.length > 0 && summary.skipped.length > 0 && " · "}
        {summary.skipped.length > 0 && `${summary.skipped.length} skipped by Gemini`}
      </span>
    </span>
  );
}

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "Not started",
  active: "In progress",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

function StepRow({
  step,
  index,
  nowMs,
  onRedo,
}: {
  step: Step;
  index: number;
  nowMs: number;
  /** Present when this step can be run again right now (same PDF, then the next steps). */
  onRedo?: () => void;
}) {
  const icon = (() => {
    switch (step.status) {
      case "done":
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "skipped":
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      case "active":
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          </span>
        );
      case "failed":
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        );
      default:
        return (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] tabular-nums text-muted-foreground">
            {index + 1}
          </span>
        );
    }
  })();

  const active = step.status === "active";
  const muted = step.status === "pending" || step.status === "skipped";
  const elapsed = active && step.startedAt ? Math.max(0, nowMs - step.startedAt) : null;
  const limit = step.engine === "live" ? LIVE_WALL_CLOCK_MS : SLOW_GEMINI_MS;
  const slow = step.id === "gemini" && elapsed !== null && elapsed > limit;
  const numeric = active && step.progress && step.progress.total > 0 ? step.progress : null;

  return (
    <li className={`flex items-start gap-3 px-3 py-2.5 ${active ? "bg-primary/5 shadow-[inset_2px_0_0_hsl(var(--primary))]" : ""}`}>
      <div className="mt-0.5 shrink-0">
        {icon}
        <span className="sr-only">{STATUS_TEXT[step.status]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <p className={`min-w-0 text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>
            {step.status === "active" || step.status === "failed" ? STEP_DOING[step.id] : step.label}
          </p>
          {elapsed !== null ? (
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatElapsed(elapsed)}
              {step.eta && <span className="hidden sm:inline"> · {step.eta}</span>}
            </p>
          ) : step.detail ? (
            <p className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:max-w-[55%] sm:truncate sm:text-right" title={step.detail}>
              {step.detail}
            </p>
          ) : null}
        </div>
        {step.retryNote && (active || step.status === "failed") && (
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{step.retryNote}</p>
        )}
        {active && (slow || step.live) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {slow
              ? step.engine === "live"
                ? "Past the server's 2½-minute limit — this run will be reported as failed. Switch to Gemini 3.5 Flash, which runs in the background."
                : "Taking longer than usual — long papers can run to 10 minutes. You can close this window and come back."
              : step.live}
          </p>
        )}
        {numeric ? (
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={step.label}
            aria-valuemin={0}
            aria-valuemax={numeric.total}
            aria-valuenow={numeric.done}
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.round((numeric.done / numeric.total) * 100))}%` }}
            />
          </div>
        ) : active && step.id === "gemini" ? (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
          </div>
        ) : null}
      </div>
      {onRedo && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          title="Do this step again with the same PDF, then continue"
          aria-label={`Do this step again: ${STEP_DOING[step.id]}`}
          onClick={onRedo}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
