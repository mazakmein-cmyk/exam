/**
 * JsonUploadDialog.tsx — Modal for per-language JSON upload.
 *
 * Two views:
 *   1. Languages — one row per language with status + Upload button.
 *   2. Preview   — parse report + mismatch panel + Replace/Append + Confirm.
 *
 * The parent (ExamDetail) provides `commitJson` which does the DB writes.
 * This component owns its own data fetching for language status and section names.
 */
import { useEffect, useRef, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  ArrowLeft,
  AlertTriangle,
  Check,
  X,
  Copy,
  Info,
  FileJson,
  Loader2,
} from "lucide-react";
import {
  parseExamJson,
  buildRenamePrompt,
  MAX_FILE_SIZE_BYTES,
  type ParseReport,
  type ParseContext,
  type FatalErrorCode,
  type RepairCategory,
} from "@/services/jsonImportParser";
import { autoSnip, type SnipRequest } from "@/services/autoSnipper";

const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));

type DialogErrorCode = FatalErrorCode | "file_too_large" | "file_read_error";

const errorCodeToAnchor: Record<DialogErrorCode, string> = {
  invalid_json: "fix-invalid-json",
  schema_version: "fix-schema-version",
  language_mismatch: "fix-language-mismatch",
  no_sections: "fix-missing-sections",
  file_too_large: "fix-file-too-large",
  file_read_error: "fix-file-read",
};

const repairCategoryLabel: Record<RepairCategory, string> = {
  unescaped_quotes: "unescaped quotes inside strings",
  trailing_commas: "trailing commas",
  comments_stripped: "comments stripped",
  smart_quotes: "smart/curly quotes converted",
  single_quotes: "single-quoted values",
  python_literals: "Python True/False/None converted",
  markdown_fences: "markdown code fences stripped",
  prose_around_object: "explanatory prose around the JSON trimmed",
  array_wrapper: "single-element array wrapper unwrapped",
  data_wrapper: "'data' key wrapper unwrapped",
  auto_repaired: "syntax auto-fixed",
  mojibake_fixed: "UTF-8 encoding (mojibake) auto-repaired",
  latex_escapes_fixed: "LaTeX backslashes auto-doubled",
};

const AVAILABLE_LANGUAGES: Record<string, { label: string; nativeLabel?: string }> = {
  en: { label: "English" },
  hi: { label: "Hindi", nativeLabel: "हिंदी" },
};

function langLabel(code: string): string {
  return AVAILABLE_LANGUAGES[code]?.label ?? code.toUpperCase();
}

/**
 * Human-readable duration formatter for the auto-snip progress strip.
 * Rules: < 1s = "<1s"; < 60s = whole seconds; otherwise minutes (+ seconds).
 * No fractional seconds or millisecond noise — the underlying signal is
 * itself coarse-grained (interval = 500 ms, render-event-driven).
 */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return "<1s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min} min` : `${min}m ${sec}s`;
}

export type CommitResult = { ok: boolean };

export type CommitJsonExtras = {
  /** Map of `${sectionName}::${questionIndex}` → uploaded snip URL. */
  snipUrls?: Map<string, string>;
  /** Public URL of the uploaded PDF (saved to matched sections' pdf_url). */
  uploadedPdfUrl?: string;
};

export type JsonUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  supportedLanguages: string[];
  primaryLanguage: string;
  docsUrl?: string;
  commitJson: (
    report: ParseReport,
    mode: "replace" | "append",
    language: string,
    extras?: CommitJsonExtras
  ) => Promise<CommitResult>;
};

type LangStatus = {
  questionCount: number;
  sectionCount: number;
  submittedAttemptCount: number;
};

type SectionMeta = { id: string; name: string; sort_order: number };

export default function JsonUploadDialog({
  open,
  onOpenChange,
  examId,
  supportedLanguages,
  primaryLanguage,
  docsUrl,
  commitJson,
}: JsonUploadDialogProps) {
  const { toast } = useToast();

  const [view, setView] = useState<"languages" | "preview">("languages");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [langStatus, setLangStatus] = useState<Record<string, LangStatus>>({});
  const [sectionsByLang, setSectionsByLang] = useState<Record<string, SectionMeta[]>>({});

  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("append");
  const [committing, setCommitting] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [lastError, setLastError] = useState<{ code: DialogErrorCode; message: string } | null>(
    null
  );

  // ─── Auto-snip state (§12) ───
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [snipping, setSnipping] = useState(false);
  const [snipProgress, setSnipProgress] = useState<{
    msg: string;
    done: number;
    total: number;
  } | null>(null);
  const [snipResults, setSnipResults] = useState<
    Map<string, { blob: Blob; thumbUrl: string; warning?: string }>
  >(new Map());
  // ETA state — driven by a setInterval ticker while snipping is active.
  // `snipStartTime` is set when work begins; `nowMs` ticks ~2x/sec so the
  // displayed elapsed/remaining stays live between progress events.
  const snipStartTimeRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [skipImages, setSkipImages] = useState(false);
  const [resnipForKey, setResnipForKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const { data: sectionsData, error: sectionsErr } = await supabase
        .from("sections")
        .select("id, name, language, sort_order")
        .eq("exam_id", examId);

      if (sectionsErr) throw sectionsErr;

      const byLang: Record<string, SectionMeta[]> = {};
      for (const lang of supportedLanguages) {
        byLang[lang] = (sectionsData || [])
          .filter((s: any) => s.language === lang)
          .map((s: any) => ({ id: s.id as string, name: s.name as string, sort_order: (s.sort_order as number) ?? 0 }))
          .sort((a, b) => a.sort_order - b.sort_order);
      }
      setSectionsByLang(byLang);

      const nextStatus: Record<string, LangStatus> = {};
      for (const lang of supportedLanguages) {
        const sectionIds = byLang[lang]?.map((s) => s.id) ?? [];
        if (sectionIds.length === 0) {
          nextStatus[lang] = { questionCount: 0, sectionCount: 0, submittedAttemptCount: 0 };
          continue;
        }
        const [qRes, aRes] = await Promise.all([
          supabase
            .from("parsed_questions")
            .select("id", { count: "exact", head: true })
            .in("section_id", sectionIds),
          supabase
            .from("attempts")
            .select("id", { count: "exact", head: true })
            .in("section_id", sectionIds)
            .not("submitted_at", "is", null),
        ]);
        nextStatus[lang] = {
          questionCount: qRes.count ?? 0,
          sectionCount: sectionIds.length,
          submittedAttemptCount: aRes.count ?? 0,
        };
      }
      setLangStatus(nextStatus);
    } catch (err: any) {
      console.error("JsonUploadDialog loadStatus error:", err);
      toast({
        title: "Couldn't load exam state",
        description: err?.message ?? "Try closing and reopening the dialog.",
        variant: "destructive",
      });
    } finally {
      setLoadingStatus(false);
    }
  }, [examId, supportedLanguages, toast]);

  useEffect(() => {
    if (open) {
      setView("languages");
      setReport(null);
      setSelectedLang(null);
      setMode("append");
      setLastError(null);
      setPdfFile(null);
      setSnipping(false);
      setSnipProgress(null);
      setSkipImages(false);
      setResnipForKey(null);
      // Revoke blob URLs from any prior session.
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setSnipResults((prev) => {
        prev.forEach((v) => URL.revokeObjectURL(v.thumbUrl));
        return new Map();
      });
      loadStatus();
    }
  }, [open, loadStatus]);

  // Cleanup blob URLs on unmount as a final safety net.
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      snipResults.forEach((v) => URL.revokeObjectURL(v.thumbUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live ETA ticker — only runs while snipping is active. Updates `nowMs`
  // every 500ms so elapsed-time and ETA recompute live (snipProgress only
  // changes on discrete events like "page rendered"; this fills the gap).
  useEffect(() => {
    if (!snipping) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [snipping]);

  const handleUploadClick = (lang: string) => {
    setSelectedLang(lang);
    // Defer click so React state lands before the file picker opens
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !selectedLang) return;

    setLastError(null);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const msg = `Max 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
      toast({ title: "File too large", description: msg, variant: "destructive" });
      setLastError({ code: "file_too_large", message: msg });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (err: any) {
      const msg = err?.message ?? "File read failed.";
      toast({ title: "Couldn't read file", description: msg, variant: "destructive" });
      setLastError({ code: "file_read_error", message: msg });
      return;
    }

    const ctx: ParseContext = {
      language: selectedLang,
      selectedLanguage: selectedLang,
      isPrimary: selectedLang === primaryLanguage,
      supportedLanguages,
      examSectionsForLanguage: sectionsByLang[selectedLang] ?? [],
    };

    const result = parseExamJson(text, ctx);
    if (!result.ok) {
      const msg = result.fatalReason ?? "Unknown error.";
      toast({ title: "Couldn't load JSON", description: msg, variant: "destructive" });
      // Always set an error even if the parser somehow forgot to set a code
      setLastError({ code: result.errorCode ?? "invalid_json", message: msg });
      return;
    }

    setReport(result);
    setMode("append");
    setView("preview");
  };

  // ─── PDF picker + auto-snip pipeline ───
  const handlePdfPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "PDF too large",
        description: `Max 50 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }
    // Revoke any prior blob URL (from a previous PDF pick) before swapping.
    setPdfBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    // Clear any prior snip results + their thumbnail object URLs so the snip
    // effect's `snipResults.size > 0` guard doesn't block a re-snip against
    // the new PDF.
    setSnipResults((prev) => {
      prev.forEach((v) => {
        if (v.thumbUrl) URL.revokeObjectURL(v.thumbUrl);
      });
      return new Map();
    });
    setPdfFile(file);
    setSkipImages(false);
  };

  // When both report + pdfFile are ready, run the snip pipeline once.
  useEffect(() => {
    if (!report || !pdfFile || skipImages || snipping) return;
    if (!report.hasImageRegions) return;
    if (snipResults.size > 0) return; // already snipped for this report

    const requests: SnipRequest[] = [];
    for (const sec of report.perSection) {
      if (!sec.matchedSectionId) continue;
      sec.accepted.forEach((q, qIdx) => {
        if (!q.imageRegion) return;
        requests.push({
          key: `${sec.jsonName}::${qIdx}`,
          page: q.imageRegion.page,
          bbox: q.imageRegion.bbox,
        });
      });
    }
    if (requests.length === 0) return;

    // No `cancelled` flag here on purpose. The effect re-runs as soon as
    // `setSnipping(true)` (or any other state setter below) triggers a render,
    // and React fires the previous render's cleanup before the new effect body.
    // A cleanup that flips a cancelled flag would therefore disable every
    // onProgress / .then / .catch / .finally callback, leaving the progress
    // strip frozen at "Opening PDF…" forever even though autoSnip is happily
    // working in the background. The guards at the top of the effect already
    // prevent duplicate launches (snipping/snipResults.size). Letting state
    // updates fire from a stale closure after an unrelated unmount only costs
    // us a React dev-mode warning, not correctness.
    snipStartTimeRef.current = Date.now();
    setNowMs(Date.now());
    setSnipping(true);
    setSnipProgress({ msg: "Opening PDF…", done: 0, total: requests.length });

    autoSnip(pdfFile, requests, {
      paddingPct: report.imagePaddingPct,
      onProgress: (msg, done, total) => {
        setSnipProgress({ msg, done, total });
      },
    })
      .then((results) => {
        const next = new Map<
          string,
          { blob: Blob; thumbUrl: string; warning?: string }
        >();
        for (const r of results) {
          if (r.blob.size === 0) {
            next.set(r.key, { blob: r.blob, thumbUrl: "", warning: r.warning });
            continue;
          }
          next.set(r.key, {
            blob: r.blob,
            thumbUrl: URL.createObjectURL(r.blob),
            warning: r.warning,
          });
        }
        setSnipResults(next);
      })
      .catch((err: any) => {
        // eslint-disable-next-line no-console
        console.error("[JsonUploadDialog] autoSnip failed:", err);
        toast({
          title: "Couldn't extract images",
          description: err?.message ?? "Failed to render PDF.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setSnipping(false);
        setSnipProgress(null);
      });
  }, [report, pdfFile, skipImages, snipResults.size, snipping, toast]);

  // Replace a single snip with a manually re-cropped Blob (from PdfSnipper).
  const handleResnipBlob = (key: string, blob: Blob) => {
    setSnipResults((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing?.thumbUrl) URL.revokeObjectURL(existing.thumbUrl);
      next.set(key, { blob, thumbUrl: URL.createObjectURL(blob) });
      return next;
    });
    setResnipForKey(null);
  };

  const handleConfirm = async () => {
    if (!report || !selectedLang) return;
    setCommitting(true);
    try {
      // Block confirm if images are required, not skipped, and we don't have snips yet.
      if (report.hasImageRegions && !skipImages && pdfFile && snipResults.size === 0) {
        toast({
          title: "Images still being extracted",
          description: "Please wait for snipping to finish.",
          variant: "destructive",
        });
        return;
      }

      // Step 1: Upload PDF (if provided) so the section's pdf_url points at it
      // for future per-question manual re-snipping.
      let uploadedPdfUrl: string | undefined;
      if (pdfFile && !skipImages) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not signed in.");
          const pdfPath = `${user.id}/${examId}/json-pdf-${selectedLang}-${Date.now()}.pdf`;
          const { error: pdfErr } = await supabase.storage
            .from("exam-pdfs")
            .upload(pdfPath, pdfFile, { upsert: true, contentType: "application/pdf" });
          if (pdfErr) throw pdfErr;
          const { data: pub } = supabase.storage.from("exam-pdfs").getPublicUrl(pdfPath);
          uploadedPdfUrl = pub.publicUrl;
        } catch (err: any) {
          toast({
            title: "Couldn't upload PDF",
            description: err?.message ?? "Try again.",
            variant: "destructive",
          });
          return;
        }
      }

      // Step 2: Upload all snip blobs to the same `exam-pdfs` bucket the rest
      // of the app uses for PDFs and manual passage images. Path starts with
      // user.id so the bucket's `auth.uid()::text = foldername(name)[1]` RLS
      // policy is satisfied — same pattern as
      // [ExamDetail.tsx:2226](src/pages/ExamDetail.tsx#L2226) and
      // [ManualFixEditor.tsx:150](src/pages/ManualFixEditor.tsx#L150).
      const snipUrls = new Map<string, string>();
      if (!skipImages && snipResults.size > 0) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not signed in.");
          // Sequential to avoid hammering Supabase Storage; small batch in typical exams.
          for (const [key, val] of snipResults) {
            if (val.blob.size === 0) continue; // failed snip — skip upload
            const safeKey = key.replace(/[^A-Za-z0-9_-]/g, "_");
            const snipPath = `${user.id}/${examId}/auto-snip-${safeKey}-${Date.now()}.png`;
            const { error: snipErr } = await supabase.storage
              .from("exam-pdfs")
              .upload(snipPath, val.blob, { upsert: true, contentType: "image/png" });
            if (snipErr) throw snipErr;
            const { data: pub } = supabase.storage
              .from("exam-pdfs")
              .getPublicUrl(snipPath);
            snipUrls.set(key, pub.publicUrl);
          }
        } catch (err: any) {
          toast({
            title: "Couldn't upload snips",
            description: err?.message ?? "Some images failed to upload.",
            variant: "destructive",
          });
          return;
        }
      }

      // Step 3: Commit with extras.
      const res = await commitJson(report, mode, selectedLang, {
        snipUrls: snipUrls.size > 0 ? snipUrls : undefined,
        uploadedPdfUrl,
      });

      if (res.ok) {
        setView("languages");
        setReport(null);
        setPdfFile(null);
        // Revoke blob URLs from this session.
        setPdfBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setSnipResults((prev) => {
          prev.forEach((v) => v.thumbUrl && URL.revokeObjectURL(v.thumbUrl));
          return new Map();
        });
        await loadStatus();
      }
    } finally {
      setCommitting(false);
    }
  };

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the text manually and copy it.",
        variant: "destructive",
      });
    }
  };

  // ─── Derived values for preview view ─────────────────────────────────
  const matchedSections = useMemo(
    () => report?.perSection.filter((s) => s.matchedSectionId !== null) ?? [],
    [report]
  );
  const totalAccepted = useMemo(
    () => matchedSections.reduce((sum, s) => sum + s.accepted.length, 0),
    [matchedSections]
  );
  const totalSkipped = useMemo(
    () =>
      matchedSections.reduce((sum, s) => sum + s.skipped.length, 0) +
      (report?.extractionSummary?.skipped?.length ?? 0),
    [matchedSections, report]
  );
  const aiWarnings = useMemo(
    () => (report?.extractionSummary?.needs_manual_review as any[]) ?? [],
    [report]
  );
  const renamePrompt = useMemo(() => {
    if (!report || report.unmatchedSections.length === 0) return "";
    const jsonSectionNames = report.perSection.map((s) => s.jsonName);
    return buildRenamePrompt(report.examSectionNames, jsonSectionNames);
  }, [report]);

  const langOfReport = report?.language ?? selectedLang ?? "";
  const statusForLang = langOfReport ? langStatus[langOfReport] : undefined;
  const existingQs = statusForLang?.questionCount ?? 0;
  const replaceBlockedReason =
    (statusForLang?.submittedAttemptCount ?? 0) > 0
      ? `Cannot Replace — ${statusForLang!.submittedAttemptCount} student submission${statusForLang!.submittedAttemptCount > 1 ? "s" : ""} exist in this language. Use Append.`
      : null;

  // Are images required and still pending? (Have regions, not skipped, but no PDF or no snips yet)
  const imagesPending =
    !!report &&
    report.hasImageRegions &&
    !skipImages &&
    (!pdfFile || snipping || snipResults.size === 0);

  const confirmDisabled =
    committing ||
    !report ||
    totalAccepted === 0 ||
    (mode === "replace" && !!replaceBlockedReason) ||
    imagesPending;

  const confirmLabel = useMemo(() => {
    if (committing) return "Importing…";
    if (!report) return "Confirm Upload";
    if (imagesPending) {
      if (!pdfFile) return "Attach PDF to continue";
      if (snipping) return "Cutting images…";
      return "Confirm Upload";
    }
    const matchedCount = matchedSections.length;
    const unmatchedCount = report.unmatchedSections.length;
    if (matchedCount === 0) return "No sections match — fix and re-upload";
    if (unmatchedCount > 0) {
      const total = matchedCount + unmatchedCount;
      return `Import ${matchedCount} of ${total} sections (${unmatchedCount} skipped)`;
    }
    return "Confirm Upload";
  }, [committing, report, matchedSections.length, imagesPending, pdfFile, snipping]);

  return (
    <Dialog open={open} onOpenChange={(o) => !committing && onOpenChange(o)}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChosen}
        />

        {view === "languages" ? (
          <LanguagePickerView
            loadingStatus={loadingStatus}
            supportedLanguages={supportedLanguages}
            primaryLanguage={primaryLanguage}
            langStatus={langStatus}
            sectionsByLang={sectionsByLang}
            docsUrl={docsUrl}
            lastError={lastError}
            onDismissError={() => setLastError(null)}
            onUploadClick={handleUploadClick}
            onClose={() => onOpenChange(false)}
          />
        ) : report ? (
          <PreviewView
            report={report}
            mode={mode}
            onModeChange={setMode}
            committing={committing}
            existingQs={existingQs}
            replaceBlockedReason={replaceBlockedReason}
            matchedSections={matchedSections}
            totalAccepted={totalAccepted}
            totalSkipped={totalSkipped}
            aiWarnings={aiWarnings}
            renamePrompt={renamePrompt}
            copyState={copyState}
            onCopyPrompt={handleCopyPrompt}
            onBack={() => {
              setView("languages");
              setReport(null);
            }}
            onConfirm={handleConfirm}
            confirmDisabled={confirmDisabled}
            confirmLabel={confirmLabel}
            primaryLanguage={primaryLanguage}
            pdfFile={pdfFile}
            pdfBlobUrl={pdfBlobUrl}
            snipping={snipping}
            snipProgress={snipProgress}
            snipResults={snipResults}
            skipImages={skipImages}
            onSkipImagesToggle={setSkipImages}
            onPdfPickClick={() => pdfInputRef.current?.click()}
            onResnipRequest={setResnipForKey}
            snipStartTime={snipStartTimeRef.current}
            nowMs={nowMs}
          />
        ) : null}

        {/* PDF file picker (hidden) */}
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handlePdfPick}
        />

        {/* Re-snip overlay — uses PdfSnipper to manually crop a single question */}
        {resnipForKey && pdfBlobUrl && (
          <Dialog open onOpenChange={(o) => !o && setResnipForKey(null)}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Re-snip image</DialogTitle>
                <DialogDescription>
                  Drag a box around the figure you want for this question, then click "Use this
                  crop".
                </DialogDescription>
              </DialogHeader>
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading PDF viewer…
                  </div>
                }
              >
                <PdfSnipper
                  pdfUrl={pdfBlobUrl}
                  onSnip={(blob) => handleResnipBlob(resnipForKey, blob)}
                />
              </Suspense>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResnipForKey(null)}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Language Picker View ──────────────────────────────────────────────

function LanguagePickerView({
  loadingStatus,
  supportedLanguages,
  primaryLanguage,
  langStatus,
  sectionsByLang,
  docsUrl,
  lastError,
  onDismissError,
  onUploadClick,
  onClose,
}: {
  loadingStatus: boolean;
  supportedLanguages: string[];
  primaryLanguage: string;
  langStatus: Record<string, LangStatus>;
  sectionsByLang: Record<string, SectionMeta[]>;
  docsUrl?: string;
  lastError: { code: DialogErrorCode; message: string } | null;
  onDismissError: () => void;
  onUploadClick: (lang: string) => void;
  onClose: () => void;
}) {
  const errorFixUrl =
    lastError && docsUrl
      ? `${docsUrl}#${errorCodeToAnchor[lastError.code]}`
      : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary" />
          Upload JSON
        </DialogTitle>
        <DialogDescription>
          Upload one JSON file per language. Section names in the JSON must match this exam's section
          names exactly.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 mt-2">
        {lastError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 dark:bg-red-950/30 dark:border-red-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                  Couldn't load your JSON
                </p>
                <p className="text-xs text-red-800 dark:text-red-300 mt-1 leading-relaxed break-words">
                  {lastError.message}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  {errorFixUrl && (
                    <a
                      href={errorFixUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300 hover:underline"
                    >
                      See how to fix this →
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="text-xs text-red-700/70 dark:text-red-300/70 hover:text-red-900 dark:hover:text-red-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {docsUrl && (
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Get the prompt →
          </a>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          {supportedLanguages.map((lang) => {
            const names = sectionsByLang[lang]?.map((s) => s.name) ?? [];
            return (
              <div key={lang}>
                <span className="font-semibold">Section names ({langLabel(lang)}):</span>{" "}
                {names.length > 0 ? names.join(" · ") : <span className="italic">no sections yet</span>}
              </div>
            );
          })}
        </div>

        <div className="border-t pt-4 space-y-3">
          {loadingStatus ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            supportedLanguages.map((lang) => {
              const status = langStatus[lang] ?? {
                questionCount: 0,
                sectionCount: 0,
                submittedAttemptCount: 0,
              };
              const hasContent = status.questionCount > 0;
              const isPrimary = lang === primaryLanguage;
              const sectionCount = sectionsByLang[lang]?.length ?? 0;
              const canUpload = sectionCount > 0;
              return (
                <div
                  key={lang}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{langLabel(lang)}</span>
                      {isPrimary && (
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {!canUpload ? (
                        <span className="text-amber-600">
                          No sections yet — add sections before uploading JSON.
                        </span>
                      ) : hasContent ? (
                        `${status.questionCount} question${status.questionCount === 1 ? "" : "s"} across ${status.sectionCount} section${status.sectionCount === 1 ? "" : "s"}`
                      ) : (
                        "No questions yet"
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={hasContent ? "outline" : "default"}
                    onClick={() => onUploadClick(lang)}
                    disabled={!canUpload}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {hasContent ? "Replace" : "Upload JSON"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Upload <strong>primary</strong> first — secondary uploads pair questions back to primary
            by position.
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Preview View ──────────────────────────────────────────────────────

function PreviewView({
  report,
  mode,
  onModeChange,
  committing,
  existingQs,
  replaceBlockedReason,
  matchedSections,
  totalAccepted,
  totalSkipped,
  aiWarnings,
  renamePrompt,
  copyState,
  onCopyPrompt,
  onBack,
  onConfirm,
  confirmDisabled,
  confirmLabel,
  primaryLanguage,
  pdfFile,
  pdfBlobUrl: _pdfBlobUrl,
  snipping,
  snipProgress,
  snipResults,
  skipImages,
  onSkipImagesToggle,
  onPdfPickClick,
  onResnipRequest,
  snipStartTime,
  nowMs,
}: {
  report: ParseReport;
  mode: "replace" | "append";
  onModeChange: (m: "replace" | "append") => void;
  committing: boolean;
  existingQs: number;
  replaceBlockedReason: string | null;
  matchedSections: ParseReport["perSection"];
  totalAccepted: number;
  totalSkipped: number;
  aiWarnings: any[];
  renamePrompt: string;
  copyState: "idle" | "copied";
  onCopyPrompt: (prompt: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
  confirmLabel: string;
  primaryLanguage: string;
  pdfFile: File | null;
  pdfBlobUrl: string | null;
  snipping: boolean;
  snipProgress: { msg: string; done: number; total: number } | null;
  snipResults: Map<string, { blob: Blob; thumbUrl: string; warning?: string }>;
  skipImages: boolean;
  onSkipImagesToggle: (skip: boolean) => void;
  onPdfPickClick: () => void;
  onResnipRequest: (key: string) => void;
  snipStartTime: number | null;
  nowMs: number;
}) {
  const isSecondary = !report.isPrimary;
  const hasMismatch = report.unmatchedSections.length > 0;
  const examOnly = report.examOnlySections;
  const summary = report.extractionSummary;

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={onBack} disabled={committing}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            Preview JSON — {langLabel(report.language)}
          </DialogTitle>
        </div>
        {summary && (summary.source_pdf || summary.model) && (
          <DialogDescription className="ml-10">
            {summary.source_pdf && <>Source: <span className="font-mono">{summary.source_pdf}</span></>}
            {summary.source_pdf && summary.model && <span className="mx-2">·</span>}
            {summary.model && <>Model: <span className="font-mono">{summary.model}</span></>}
          </DialogDescription>
        )}
      </DialogHeader>

      <div className="space-y-4 mt-2">
        {/* Auto-repair notice */}
        {report.repairApplied && report.repairCategories.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  We auto-fixed your JSON before importing
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  Your question content is unchanged — only JSON syntax was corrected.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.repairCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                    >
                      {repairCategoryLabel[cat] ?? cat}
                    </span>
                  ))}
                </div>
                <a
                  href="/json-upload-guide#fix-invalid-json"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-amber-800 dark:text-amber-300 hover:underline"
                >
                  What does this mean? →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Stats strip */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            {matchedSections.length + report.unmatchedSections.length} section
            {matchedSections.length + report.unmatchedSections.length === 1 ? "" : "s"} in JSON
          </Badge>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            {totalAccepted} valid
          </Badge>
          {totalSkipped > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              {totalSkipped} skipped
            </Badge>
          )}
          {report.marksConfig?.exam_default && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Marks: yes
            </Badge>
          )}
          {report.marksIgnoredReason && (
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              Marks: ignored (secondary)
            </Badge>
          )}
        </div>

        {/* Section-name mismatch panel */}
        {hasMismatch && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-amber-900">
                {report.unmatchedSections.length} section
                {report.unmatchedSections.length === 1 ? "" : "s"} in your JSON don't match this exam
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  Your JSON has
                </div>
                <ul className="space-y-1">
                  {report.perSection.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {s.matchedSectionId ? (
                        <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      )}
                      <span className={s.matchedSectionId ? "text-muted-foreground" : "font-medium"}>
                        "{s.jsonName}"
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                  This exam expects
                </div>
                <ul className="space-y-1">
                  {report.examSectionNames.map((n, i) => (
                    <li key={i} className="text-muted-foreground">
                      "{n}"
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-sm text-amber-900 mb-2">
              <strong>Two ways to fix this:</strong>
            </p>
            <ol className="text-sm text-amber-900 space-y-1 mb-3 list-decimal pl-5">
              <li>Rename your <strong>exam</strong> sections (in this app) to match the JSON, or</li>
              <li>
                Rename the JSON sections via AI. Copy this prompt, paste it into the AI you originally
                used, then paste your JSON below it:
              </li>
            </ol>

            <div className="relative">
              <pre className="text-[11px] leading-snug bg-white border rounded p-3 max-h-60 overflow-auto whitespace-pre-wrap font-mono">
                {renamePrompt}
              </pre>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="absolute top-2 right-2"
                onClick={() => onCopyPrompt(renamePrompt)}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {copyState === "copied" ? "Copied!" : "Copy prompt"}
              </Button>
            </div>

            <p className="text-xs text-amber-900 mt-2">
              After AI returns the corrected JSON, save it and upload again here.
            </p>
          </div>
        )}

        {/* Exam-only sections info */}
        {examOnly.length > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-slate-50 border p-3 text-xs text-slate-700">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              The following exam section{examOnly.length === 1 ? "" : "s"} aren't in this JSON and will
              be left untouched: {examOnly.map((n) => `"${n}"`).join(", ")}.
            </span>
          </div>
        )}

        {/* Secondary banner */}
        {isSecondary && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Marks config in this JSON will be ignored — marks are managed on the{" "}
                <strong>{langLabel(primaryLanguage)}</strong> (primary) language only.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This language must mirror primary to publish. Empty questions, count mismatches, and
                missing sections are accepted at upload but will block publish until fixed.
              </span>
            </div>
          </div>
        )}

        {/* Auto-snip — PDF picker + progress + thumbnails (§12) */}
        {report.hasImageRegions && (
          <AutoSnipPanel
            pdfFile={pdfFile}
            snipping={snipping}
            snipProgress={snipProgress}
            snipResults={snipResults}
            skipImages={skipImages}
            onSkipImagesToggle={onSkipImagesToggle}
            onPdfPickClick={onPdfPickClick}
            onResnipRequest={onResnipRequest}
            report={report}
            snipStartTime={snipStartTime}
            nowMs={nowMs}
          />
        )}

        {/* Section list */}
        <div className="rounded-lg border divide-y">
          {report.perSection.map((s, idx) => (
            <div key={idx} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {s.matchedSectionId ? (
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span className="font-medium truncate">{s.jsonName}</span>
                </div>
                <div className="text-xs text-muted-foreground ml-6">
                  {s.matchedSectionId
                    ? `${s.accepted.length} Q${s.accepted.length === 1 ? "" : "s"} valid${s.skipped.length > 0 ? ` · ${s.skipped.length} skipped` : ""}`
                    : "Not in this exam — section will be skipped"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {s.matchedSectionId ? "✓ match" : "✗ no match"}
              </div>
            </div>
          ))}
        </div>

        {/* Skipped detail */}
        {matchedSections.some((s) => s.skipped.length > 0) && (
          <details className="rounded-md border bg-slate-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Skipped questions ({matchedSections.reduce((n, s) => n + s.skipped.length, 0)})
            </summary>
            <div className="px-3 py-2 space-y-1 text-xs text-muted-foreground">
              {matchedSections.map((s) =>
                s.skipped.map((sk, i) => (
                  <div key={`${s.jsonName}-${i}`}>
                    <span className="font-medium">{s.jsonName}</span> #{sk.index + 1}: {sk.reasons.join("; ")}
                  </div>
                ))
              )}
            </div>
          </details>
        )}

        {/* AI-flagged warnings */}
        {aiWarnings.length > 0 && (
          <details className="rounded-md border bg-amber-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              AI-flagged for review ({aiWarnings.length}) — these will be created
            </summary>
            <div className="px-3 py-2 space-y-1 text-xs text-amber-800">
              {aiWarnings.map((w, i) => (
                <div key={i}>
                  {w.section ? <>{w.section} </> : null}
                  {typeof w.q_no === "number" ? `#${w.q_no}: ` : ""}
                  {w.reason ?? JSON.stringify(w)}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Parser warnings */}
        {(report.globalWarnings.length > 0 ||
          matchedSections.some((s) => s.warnings.length > 0)) && (
          <details className="rounded-md border bg-slate-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Other warnings</summary>
            <div className="px-3 py-2 space-y-1 text-xs text-muted-foreground">
              {report.globalWarnings.map((w, i) => (
                <div key={`g-${i}`}>{w}</div>
              ))}
              {matchedSections.map((s) =>
                s.warnings.map((w, i) => (
                  <div key={`${s.jsonName}-w-${i}`}>
                    <span className="font-medium">{s.jsonName}:</span> {w}
                  </div>
                ))
              )}
            </div>
          </details>
        )}

        {/* Replace / Append */}
        {existingQs > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">
              {langLabel(report.language)} already has {existingQs} question{existingQs === 1 ? "" : "s"}.
            </p>
            <RadioGroup value={mode} onValueChange={(v) => onModeChange(v as "replace" | "append")}>
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="replace"
                  id="mode-replace"
                  disabled={!!replaceBlockedReason}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="mode-replace"
                  className={replaceBlockedReason ? "text-muted-foreground cursor-not-allowed" : ""}
                >
                  <div className="text-sm">Replace all existing questions in this language</div>
                  <div className="text-xs text-muted-foreground">
                    {replaceBlockedReason ?? "Destructive — deletes existing questions and their cascades."}
                  </div>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="append" id="mode-append" className="mt-0.5" />
                <Label htmlFor="mode-append">
                  <div className="text-sm">Append within each section (default, safe)</div>
                  <div className="text-xs text-muted-foreground">
                    New questions get added after existing ones in each matched section.
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
      </div>

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onBack} disabled={committing}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={mode === "replace" && !confirmDisabled ? "bg-destructive hover:bg-destructive/90" : ""}
        >
          {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Auto-snip panel (PDF picker + progress + thumbnails) ───

function AutoSnipPanel({
  pdfFile,
  snipping,
  snipProgress,
  snipResults,
  skipImages,
  onSkipImagesToggle,
  onPdfPickClick,
  onResnipRequest,
  report,
  snipStartTime,
  nowMs,
}: {
  pdfFile: File | null;
  snipping: boolean;
  snipProgress: { msg: string; done: number; total: number } | null;
  snipResults: Map<string, { blob: Blob; thumbUrl: string; warning?: string }>;
  skipImages: boolean;
  onSkipImagesToggle: (skip: boolean) => void;
  onPdfPickClick: () => void;
  onResnipRequest: (key: string) => void;
  report: ParseReport;
  snipStartTime: number | null;
  nowMs: number;
}) {
  // Count of questions that have an image_region.
  const totalRegions = useMemo(() => {
    let n = 0;
    for (const sec of report.perSection) {
      if (!sec.matchedSectionId) continue;
      for (const q of sec.accepted) if (q.imageRegion) n++;
    }
    return n;
  }, [report]);

  // Build flat list of questions with regions for the thumbnail grid.
  const questionsWithRegions = useMemo(() => {
    const out: {
      key: string;
      sectionName: string;
      qNo: number;
      stem: string;
      region: NonNullable<ParseReport["perSection"][number]["accepted"][number]["imageRegion"]>;
    }[] = [];
    for (const sec of report.perSection) {
      if (!sec.matchedSectionId) continue;
      sec.accepted.forEach((q, qIdx) => {
        if (!q.imageRegion) return;
        // Strip passage-section wrapper for thumbnail label readability.
        const cleaned = (q.text || "").replace(
          /<div class="passage-section">[\s\S]*?<\/div><div class="question-section">/,
          ""
        ).replace(/<\/div>$/, "").replace(/<[^>]*>/g, "");
        out.push({
          key: `${sec.jsonName}::${qIdx}`,
          sectionName: sec.jsonName,
          qNo: q.q_no,
          stem: cleaned,
          region: q.imageRegion,
        });
      });
    }
    return out;
  }, [report]);

  // PDF not picked yet (and not skipped): show the prompt to attach it.
  if (!pdfFile && !skipImages) {
    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 dark:bg-blue-950/30 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Upload className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              This JSON references {totalRegions} image{totalRegions === 1 ? "" : "s"} from your PDF
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
              Attach the source PDF and we'll cut out each image automatically. You can review the
              thumbnails before confirming.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <Button type="button" size="sm" onClick={onPdfPickClick}>
                <Upload className="h-4 w-4 mr-2" />
                Choose PDF…
              </Button>
              <button
                type="button"
                onClick={() => onSkipImagesToggle(true)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Skip image extraction (text only)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Skipped — show a small note + an undo.
  if (skipImages) {
    return (
      <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/30 p-3 text-sm flex items-center justify-between gap-3">
        <span className="text-muted-foreground">
          Skipping image extraction — the {totalRegions} image-bearing question{totalRegions === 1 ? "" : "s"}{" "}
          will be created without pictures.
        </span>
        <button
          type="button"
          onClick={() => onSkipImagesToggle(false)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Undo
        </button>
      </div>
    );
  }

  // Snipping in progress.
  if (snipping) {
    const pct = snipProgress && snipProgress.total > 0
      ? Math.round((snipProgress.done / snipProgress.total) * 100)
      : 0;

    // ─── Real ETA ───
    // Honesty rule: until at least one unit of work has completed
    // (snipProgress.done >= 1) we have no per-unit cost data, so we show
    // elapsed time only and say "Estimating remaining time…". After the
    // first unit, extrapolate linearly: elapsed / done × remaining. No
    // hand-tuned constants, no fixed-cost assumptions.
    const elapsedMs =
      snipStartTime !== null ? Math.max(0, nowMs - snipStartTime) : 0;
    const done = snipProgress?.done ?? 0;
    const total = snipProgress?.total ?? 0;
    const remaining = Math.max(0, total - done);
    const etaMs =
      done >= 1 && elapsedMs > 0 ? (elapsedMs / done) * remaining : null;

    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 dark:bg-blue-950/30 dark:border-blue-800">
        <div className="flex items-center gap-3 mb-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {snipProgress?.msg ?? "Working…"}
          </span>
          <span className="ml-auto text-xs text-blue-800 dark:text-blue-300">
            {snipProgress ? `${snipProgress.done}/${snipProgress.total}` : ""}
          </span>
        </div>
        <div className="h-1.5 w-full bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-blue-800/80 dark:text-blue-300/80 tabular-nums">
          <span>Elapsed: {formatDuration(elapsedMs)}</span>
          <span>
            {etaMs === null
              ? "Estimating remaining time…"
              : `~${formatDuration(etaMs)} remaining`}
          </span>
        </div>
      </div>
    );
  }

  // Done — show thumbnail grid.
  if (snipResults.size > 0) {
    const failedCount = Array.from(snipResults.values()).filter((v) => v.blob.size === 0).length;
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold">
              {snipResults.size - failedCount} image{snipResults.size - failedCount === 1 ? "" : "s"} extracted
              {failedCount > 0 && (
                <span className="text-red-600 ml-2">· {failedCount} failed</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Check the thumbnails. If anything looks off, click "Re-snip" to drag a new region.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onPdfPickClick}>
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Use a different PDF
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {questionsWithRegions.map((q) => {
            const snip = snipResults.get(q.key);
            return (
              <div
                key={q.key}
                className="rounded-md border bg-background overflow-hidden"
              >
                <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                  {snip?.thumbUrl ? (
                    <img
                      src={snip.thumbUrl}
                      alt={`Snip for Q${q.qNo}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-red-600 px-2 text-center">
                      {snip?.warning ?? "no snip"}
                    </span>
                  )}
                </div>
                <div className="px-3 py-2 border-t">
                  <div className="text-[11px] text-muted-foreground truncate">
                    {q.sectionName} · Q{q.qNo}
                    {q.region.bbox ? null : " · whole page"}
                  </div>
                  <div className="text-xs text-foreground truncate mt-0.5">{q.stem}</div>
                  {snip?.warning && (
                    <div className="text-[11px] text-amber-600 mt-1 truncate" title={snip.warning}>
                      ⚠ {snip.warning}
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1.5 h-7 text-xs"
                    onClick={() => onResnipRequest(q.key)}
                  >
                    Re-snip…
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
