/**
 * JsonUploadDialog.tsx — Modal for per-language JSON upload.
 *
 * Three views:
 *   1. Languages — one row per language with status + Paste / Upload buttons.
 *   2. Paste     — a textarea that runs the same parser as the file path on
 *                  every edit (debounced), so a bad paste is diagnosed inline.
 *   3. Preview   — parse report + mismatch panel + Replace/Append + Confirm.
 *
 * Both sources — a chosen .json file and pasted text — funnel through
 * openPreview(), so the preview, the create-sections re-parse, auto-snip and
 * the commit never know which one the user picked.
 *
 * The parent provides `commitJson` which does the DB writes, and a `dataSource`
 * adapter (see jsonUploadSources.ts) which owns every table-specific read/write
 * so the same dialog serves both mock exams and live exams.
 */
import { useEffect, useRef, useState, useMemo, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadQuestionImage } from "@/lib/questionImageUpload";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  X,
  Copy,
  Info,
  FileJson,
  Loader2,
  Pencil,
  Plus,
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
import {
  buildSectionCreationPlan,
  type JsonUploadDataSource,
  type LangStatus,
  type NewSectionSpec,
  type SectionMeta,
} from "@/components/jsonUploadSources";

const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));

type DialogErrorCode = FatalErrorCode | "file_too_large" | "file_read_error";

/**
 * A failed load, as shown in the languages view. `text` is the raw JSON that
 * failed, when there is any — it powers "Edit & retry here", which drops that
 * text into the paste view with the same error underneath it, instead of
 * sending the user back to a text editor and a second file-picker round-trip.
 */
type DialogError = {
  code: DialogErrorCode;
  message: string;
  text?: string;
  lang?: string;
};

type JsonSource = "file" | "paste";

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
  latex_over_escaped_fixed: "double-escaped LaTeX backslashes auto-collapsed",
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

/** Compact size for the paste view's status line: "812 B", "48.2 KB", "1.3 MB". */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type CommitResult = { ok: boolean };

export type CommitJsonExtras = {
  /** Map of `${sectionName}::${questionIndex}` → uploaded snip URL. */
  snipUrls?: Map<string, string>;
  /** Public URL of the uploaded PDF (saved to matched sections' pdf_url). */
  uploadedPdfUrl?: string;
  /**
   * Called after each question lands so the dialog's blocking overlay can
   * show real progress. Commit loops write row-by-row; without this the user
   * stares at a frozen button, assumes a hang, and refreshes — truncating
   * the import halfway.
   */
  onProgress?: (done: number, total: number) => void;
};

export type JsonUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  supportedLanguages: string[];
  primaryLanguage: string;
  docsUrl?: string;
  /**
   * Fired after the dialog itself writes sections (inline rename, create-
   * missing-sections). The page behind the modal renders its own cached
   * section list — without this hook it keeps showing the pre-dialog state
   * until a manual refresh. Import commits are the page's own code and
   * resync themselves.
   */
  onSectionsChanged?: () => void | Promise<void>;
  /** Table-specific reads/writes — mockExamJsonSource or liveExamJsonSource. */
  dataSource: JsonUploadDataSource;
  commitJson: (
    report: ParseReport,
    mode: "replace" | "append",
    language: string,
    extras?: CommitJsonExtras
  ) => Promise<CommitResult>;
};

export default function JsonUploadDialog({
  open,
  onOpenChange,
  examId,
  supportedLanguages,
  primaryLanguage,
  docsUrl,
  onSectionsChanged,
  dataSource,
  commitJson,
}: JsonUploadDialogProps) {
  const { toast } = useToast();

  const [view, setView] = useState<"languages" | "paste" | "preview">("languages");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [langStatus, setLangStatus] = useState<Record<string, LangStatus>>({});
  const [sectionsByLang, setSectionsByLang] = useState<Record<string, SectionMeta[]>>({});

  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("append");
  const [committing, setCommitting] = useState(false);
  // Stage + counts for the blocking import overlay (null = indeterminate).
  const [commitProgress, setCommitProgress] = useState<{
    stage: string;
    done: number;
    total: number;
  } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [lastError, setLastError] = useState<DialogError | null>(null);

  // ─── Paste-text state ───
  // The textarea's contents live here, not in the paste view, so they survive
  // Back / re-entering the view, and so a failed file load can seed them.
  // Keyed by language: switching rows clears a paste meant for another one.
  const [pasteText, setPasteText] = useState("");
  const [pasteLang, setPasteLang] = useState<string | null>(null);
  // Which route produced the current report — Back from the preview returns
  // to the paste box (text intact) when that is where the user came from.
  const [reportSource, setReportSource] = useState<JsonSource | null>(null);

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

  // Section id currently being persisted by an inline rename (drives its spinner).
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);

  // ─── Create-missing-sections state (mismatch fix #1) ───
  // Raw file text is kept so the report can be RE-parsed after sections are
  // created — the parser skips question validation for unmatched sections, so
  // patching matchedSectionId into the old report would import zero questions.
  const [rawJsonText, setRawJsonText] = useState<string | null>(null);
  const [showCreateSections, setShowCreateSections] = useState(false);
  const [creatingSections, setCreatingSections] = useState(false);
  // Per-section minutes drafts, keyed by JSON section name (mock exams only).
  const [sectionTimeDrafts, setSectionTimeDrafts] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async (): Promise<Record<string, SectionMeta[]> | null> => {
    setLoadingStatus(true);
    try {
      const byLang = await dataSource.loadSectionsByLang(examId, supportedLanguages);
      setSectionsByLang(byLang);

      const nextStatus = await dataSource.loadLangStatus(examId, supportedLanguages, byLang);
      setLangStatus(nextStatus);
      return byLang;
    } catch (err: any) {
      console.error("JsonUploadDialog loadStatus error:", err);
      toast({
        title: "Couldn't load exam state",
        description: err?.message ?? "Try closing and reopening the dialog.",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoadingStatus(false);
    }
  }, [dataSource, examId, supportedLanguages, toast]);

  /**
   * Persist an inline section-name rename, then patch local state so the chips
   * + upload matching reflect the new name without a full reload. Returns true
   * when the edit closes (saved or a no-op).
   */
  const handleRenameSection = useCallback(
    async (lang: string, sectionId: string, rawName: string): Promise<boolean> => {
      const name = rawName.trim();
      const current = sectionsByLang[lang]?.find((s) => s.id === sectionId);
      if (!current) return false;

      if (!name) {
        toast({
          title: "Name can't be empty",
          description: "Enter a section name.",
          variant: "destructive",
        });
        return false;
      }
      if (name === current.name) return true; // unchanged — just close the editor

      const isDuplicate = (sectionsByLang[lang] ?? []).some(
        (s) => s.id !== sectionId && s.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (isDuplicate) {
        toast({
          title: "Duplicate section name",
          description: `"${name}" already exists in ${langLabel(lang)}.`,
          variant: "destructive",
        });
        return false;
      }

      setSavingSectionId(sectionId);
      try {
        await dataSource.renameSection(sectionId, name);

        setSectionsByLang((prev) => ({
          ...prev,
          [lang]: (prev[lang] ?? []).map((s) => (s.id === sectionId ? { ...s, name } : s)),
        }));
        toast({ title: "Section renamed", description: `Now "${name}".` });
        // Let the page behind the modal pick up the new name right away.
        void onSectionsChanged?.();
        return true;
      } catch (err: any) {
        toast({
          title: "Couldn't rename section",
          description: err?.message ?? "Try again.",
          variant: "destructive",
        });
        return false;
      } finally {
        setSavingSectionId(null);
      }
    },
    [dataSource, sectionsByLang, toast, onSectionsChanged]
  );

  useEffect(() => {
    if (open) {
      setView("languages");
      setReport(null);
      setSelectedLang(null);
      setMode("append");
      setLastError(null);
      setRawJsonText(null);
      setPasteText("");
      setPasteLang(null);
      setReportSource(null);
      setShowCreateSections(false);
      setSectionTimeDrafts({});
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

  // While a commit runs, leaving truncates the import mid-write: questions
  // land row by row, so a refresh keeps whatever happened to finish. Two
  // guards for the two exits the overlay can't cover:
  //  - beforeunload → native "leave site?" prompt on refresh / tab close.
  //  - popstate sentinel → the SPA back button becomes a no-op: we park an
  //    extra history entry and instantly re-push it whenever it's popped.
  useEffect(() => {
    if (!committing) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    window.history.pushState({ jsonImportGuard: true }, "");
    const onPopState = () => {
      window.history.pushState({ jsonImportGuard: true }, "");
      toast({
        title: "Import in progress",
        description: "Please wait — leaving now would keep only part of your questions.",
      });
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      // Pop the sentinel (if still on top) so Back needs one press, not two.
      if ((window.history.state as any)?.jsonImportGuard) window.history.back();
    };
  }, [committing, toast]);

  /**
   * One ParseContext builder for every parse that works from current state —
   * the file path, the paste view's live check and its Continue. The
   * create-sections flow deliberately builds its own against the FRESH
   * section list it just loaded (see handleCreateSections).
   */
  const buildParseContext = useCallback(
    (lang: string): ParseContext => ({
      language: lang,
      selectedLanguage: lang,
      isPrimary: lang === primaryLanguage,
      supportedLanguages,
      examSectionsForLanguage: sectionsByLang[lang] ?? [],
    }),
    [primaryLanguage, supportedLanguages, sectionsByLang]
  );

  /**
   * The single hand-off into the preview. Whatever produced `text` — a .json
   * file or the paste box — everything downstream (mismatch panel,
   * create-sections re-parse, auto-snip, commit) runs from here unchanged.
   */
  const openPreview = (text: string, result: ParseReport, source: JsonSource) => {
    setReport(result);
    setRawJsonText(text);
    setReportSource(source);
    setSectionTimeDrafts({});
    setMode("append");
    setLastError(null);
    setView("preview");
  };

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
    // The error banner lives in the languages view, but the picker can also
    // be opened from the paste view ("Upload a .json file instead") — so every
    // failure below returns there, where the banner is visible.
    const fail = (error: DialogError) => {
      setLastError(error);
      setView("languages");
    };

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const msg = `Max 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
      toast({ title: "File too large", description: msg, variant: "destructive" });
      fail({ code: "file_too_large", message: msg, lang: selectedLang });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (err: any) {
      const msg = err?.message ?? "File read failed.";
      toast({ title: "Couldn't read file", description: msg, variant: "destructive" });
      fail({ code: "file_read_error", message: msg, lang: selectedLang });
      return;
    }

    const result = parseExamJson(text, buildParseContext(selectedLang));
    if (!result.ok) {
      const msg = result.fatalReason ?? "Unknown error.";
      toast({ title: "Couldn't load JSON", description: msg, variant: "destructive" });
      // Always set an error even if the parser somehow forgot to set a code.
      // The raw text rides along so the banner can offer "Edit & retry here".
      fail({ code: result.errorCode ?? "invalid_json", message: msg, text, lang: selectedLang });
      return;
    }

    openPreview(text, result, "file");
  };

  // ─── Paste-text flow ───
  const handlePasteClick = (lang: string) => {
    if (pasteLang !== lang) {
      // A paste drafted for another language row could only ever produce a
      // language_mismatch error here — start clean.
      setPasteText("");
      setPasteLang(lang);
    }
    setSelectedLang(lang);
    setLastError(null);
    setView("paste");
  };

  // Stable per language + section list: the paste view memoises its live
  // check on this identity, so a fresh closure per render would re-parse the
  // whole paste on every keystroke and defeat the debounce.
  const parsePaste = useMemo(() => {
    const lang = selectedLang;
    if (!lang) return null;
    return (text: string) => parseExamJson(text, buildParseContext(lang));
  }, [selectedLang, buildParseContext]);

  const handlePasteContinue = (text: string, result: ParseReport) => {
    openPreview(text, result, "paste");
  };

  /** "Edit & retry here" on a failed file: same text, same error, now editable. */
  const handleEditFailedText = () => {
    if (!lastError?.text) return;
    const lang = lastError.lang ?? selectedLang ?? primaryLanguage;
    setPasteText(lastError.text);
    setPasteLang(lang);
    setSelectedLang(lang);
    setLastError(null);
    setView("paste");
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
    setCommitProgress(null);
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
        setCommitProgress({ stage: "Uploading source PDF…", done: 0, total: 1 });
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not signed in.");
          const pdfPath = `${user.id}/${examId}/json-pdf-${selectedLang}-${Date.now()}.pdf`;
          const { error: pdfErr } = await supabase.storage
            .from(dataSource.storageBucket)
            .upload(pdfPath, pdfFile, { upsert: true, contentType: "application/pdf" });
          if (pdfErr) throw pdfErr;
          const { data: pub } = supabase.storage
            .from(dataSource.storageBucket)
            .getPublicUrl(pdfPath);
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

      // Step 2: Upload all snip blobs. Student-visible images go to the PUBLIC
      // question-images bucket via uploadQuestionImage (the private exam-pdfs
      // bucket 403s public URLs for non-owners); the helper falls back to
      // exam-pdfs if the bucket migration hasn't been applied. Path starts
      // with user.id to satisfy the `auth.uid()::text = foldername(name)[1]`
      // INSERT policy — same pattern as ExamDetail's and ManualFixEditor's
      // image uploads.
      const snipUrls = new Map<string, string>();
      if (!skipImages && snipResults.size > 0) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Not signed in.");
          // Sequential to avoid hammering Supabase Storage; small batch in typical exams.
          const uploadable = Array.from(snipResults.entries()).filter(
            ([, v]) => v.blob.size > 0 // failed snips have empty blobs — skip
          );
          setCommitProgress({
            stage: "Uploading question images…",
            done: 0,
            total: uploadable.length,
          });
          let uploadedCount = 0;
          for (const [key, val] of uploadable) {
            const safeKey = key.replace(/[^A-Za-z0-9_-]/g, "_");
            const snipPath = `${user.id}/${examId}/auto-snip-${safeKey}-${Date.now()}.png`;
            // Student-visible image → public question-images bucket (with
            // automatic exam-pdfs fallback if that bucket doesn't exist yet).
            const publicUrl = await uploadQuestionImage(snipPath, val.blob);
            snipUrls.set(key, publicUrl);
            uploadedCount++;
            setCommitProgress({
              stage: "Uploading question images…",
              done: uploadedCount,
              total: uploadable.length,
            });
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
      setCommitProgress({
        stage: "Creating sections & questions…",
        done: 0,
        total: totalAccepted,
      });
      const res = await commitJson(report, mode, selectedLang, {
        snipUrls: snipUrls.size > 0 ? snipUrls : undefined,
        uploadedPdfUrl,
        onProgress: (done, total) =>
          setCommitProgress({ stage: "Creating sections & questions…", done, total }),
      });

      if (res.ok) {
        setView("languages");
        setReport(null);
        setRawJsonText(null);
        setReportSource(null);
        // The imported text has done its job — don't offer it again.
        setPasteText("");
        setPasteLang(null);
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
      setCommitProgress(null);
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

  // ─── Create-missing-sections flow ────────────────────────────────────
  const unmatchedForCreate = useMemo(
    () =>
      report?.perSection
        .filter((s) => s.matchedSectionId === null)
        .map((s) => ({ name: s.jsonName, questionCount: s.questionCountInJson })) ?? [],
    [report]
  );

  const isValidMinutes = (v: string | undefined): boolean => {
    if (!v || !v.trim()) return false;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 999;
  };

  const allSectionTimesValid =
    !dataSource.requiresSectionTime ||
    unmatchedForCreate.every((u) => isValidMinutes(sectionTimeDrafts[u.name]));

  const handleCreateSections = async () => {
    if (!report || unmatchedForCreate.length === 0) return;
    if (dataSource.requiresSectionTime && !allSectionTimesValid) return;

    setCreatingSections(true);
    try {
      const specs: NewSectionSpec[] = unmatchedForCreate.map((u) => ({
        name: u.name,
        ...(dataSource.requiresSectionTime
          ? { timeMinutes: Number(sectionTimeDrafts[u.name]) }
          : {}),
      }));
      const rows = buildSectionCreationPlan(specs, sectionsByLang, supportedLanguages);
      await dataSource.createSections(examId, rows);

      // Refresh sections + counts, then RE-parse the same file against the new
      // section list: the parser never validated questions inside unmatched
      // sections, so the old report can't simply be patched.
      const byLang = await loadStatus();
      const lang = report.language;
      let rematched = false;
      if (rawJsonText && byLang) {
        const result = parseExamJson(rawJsonText, {
          language: lang,
          selectedLanguage: lang,
          isPrimary: lang === primaryLanguage,
          supportedLanguages,
          examSectionsForLanguage: byLang[lang] ?? [],
        });
        if (result.ok) {
          setReport(result);
          rematched = true;
          // Newly matched sections may reference PDF images — clear old snips
          // so the auto-snip pipeline re-runs over the full matched set.
          setSnipResults((prev) => {
            prev.forEach((v) => v.thumbUrl && URL.revokeObjectURL(v.thumbUrl));
            return new Map();
          });
        }
      }

      setShowCreateSections(false);
      setSectionTimeDrafts({});
      // The page behind the modal caches its section list — sync it now so
      // the new sections are already there when the dialog closes.
      void onSectionsChanged?.();
      if (rematched) {
        toast({
          title: `${specs.length} section${specs.length === 1 ? "" : "s"} created`,
          description:
            supportedLanguages.length > 1
              ? `Created in every language (${supportedLanguages.map(langLabel).join(", ")}) — review below, then confirm the import.`
              : "The JSON now matches — review below, then confirm the import.",
        });
      } else {
        // Sections exist but the preview couldn't refresh — tell the user how
        // to get back to a clean state instead of leaving a stale mismatch.
        toast({
          title: "Sections created",
          description: "Couldn't refresh this preview — go back and upload the file again.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Couldn't create sections",
        description: err?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setCreatingSections(false);
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
      ? dataSource.replaceBlockedReason(statusForLang!.submittedAttemptCount)
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
    if (matchedCount === 0) {
      // An exam with no sections at all is the expected first-import state,
      // not a mismatch — point at the create step instead.
      if (report.examSectionNames.length === 0) {
        return report.isPrimary ? "Create sections to continue" : "Add the primary language first";
      }
      return "No sections match — fix and re-upload";
    }
    if (unmatchedCount > 0) {
      const total = matchedCount + unmatchedCount;
      return `Import ${matchedCount} of ${total} sections (${unmatchedCount} skipped)`;
    }
    return "Confirm Upload";
  }, [committing, report, matchedSections.length, imagesPending, pdfFile, snipping]);

  return (
    <Dialog open={open} onOpenChange={(o) => !committing && onOpenChange(o)}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          // Esc is muscle memory while editing text. With a paste in progress
          // it must not throw the whole thing away — Back and the X button
          // still close as usual.
          if (view === "paste" && pasteText.trim()) e.preventDefault();
        }}
      >
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
            savingSectionId={savingSectionId}
            onRenameSection={handleRenameSection}
            docsUrl={docsUrl}
            lastError={lastError}
            onDismissError={() => setLastError(null)}
            onUploadClick={handleUploadClick}
            onPasteClick={handlePasteClick}
            onEditFailedText={lastError?.text ? handleEditFailedText : undefined}
            onClose={() => onOpenChange(false)}
          />
        ) : view === "paste" && selectedLang && parsePaste ? (
          <PasteJsonView
            lang={selectedLang}
            isPrimary={selectedLang === primaryLanguage}
            sectionNames={(sectionsByLang[selectedLang] ?? []).map((s) => s.name)}
            value={pasteText}
            onChange={setPasteText}
            parse={parsePaste}
            docsUrl={docsUrl}
            onBack={() => setView("languages")}
            onChooseFile={() => handleUploadClick(selectedLang)}
            onContinue={handlePasteContinue}
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
              // Pasted text goes back to the box for fixing; a file goes back
              // to the language list.
              setView(reportSource === "paste" ? "paste" : "languages");
              setReport(null);
              setRawJsonText(null);
              setReportSource(null);
            }}
            onCreateSectionsClick={() => setShowCreateSections(true)}
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
            showMarks={dataSource.showMarks}
            requiresSectionTime={dataSource.requiresSectionTime}
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

        {/* Create-missing-sections modal — mismatch fix #1. Cancel/X writes
            nothing; sections are only created on the Create button. */}
        {showCreateSections && report && (
          <Dialog
            open
            onOpenChange={(o) => {
              if (!o && !creatingSections) setShowCreateSections(false);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" />
                  {report.examSectionNames.length === 0
                    ? "Create sections from your JSON"
                    : "Create missing sections"}
                </DialogTitle>
                <DialogDescription>
                  {dataSource.requiresSectionTime
                    ? "These sections from your JSON will be added to this exam. Set a time for each — it's required."
                    : "These sections from your JSON will be added to this exam. Question timers come from the JSON itself."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {unmatchedForCreate.map((u) => {
                  const draft = sectionTimeDrafts[u.name] ?? "";
                  const invalid =
                    dataSource.requiresSectionTime && draft.trim() !== "" && !isValidMinutes(draft);
                  return (
                    <div
                      key={u.name}
                      className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={u.name}>
                          {u.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {u.questionCount} question{u.questionCount === 1 ? "" : "s"} in JSON
                        </div>
                      </div>
                      {dataSource.requiresSectionTime && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={999}
                            step={1}
                            value={draft}
                            onChange={(e) =>
                              setSectionTimeDrafts((prev) => ({
                                ...prev,
                                [u.name]: e.target.value,
                              }))
                            }
                            disabled={creatingSections}
                            placeholder="e.g. 60"
                            aria-label={`Time in minutes for ${u.name}`}
                            className={`w-24 rounded-md border bg-background px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 ${
                              invalid ? "border-red-500" : ""
                            }`}
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {dataSource.requiresSectionTime && !allSectionTimesValid && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Enter a whole number of minutes (1–999) for every section to continue.
                </p>
              )}

              {supportedLanguages.length > 1 && (
                <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Each section is also created in{" "}
                    <strong>
                      {supportedLanguages
                        .filter((l) => l !== (report.language ?? ""))
                        .map(langLabel)
                        .join(", ")}
                    </strong>{" "}
                    with the same name, so translations stay paired. Rename those from the upload
                    screen when you add that language's JSON.
                  </span>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateSections(false)}
                  disabled={creatingSections}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSections}
                  disabled={creatingSections || !allSectionTimesValid || unmatchedForCreate.length === 0}
                >
                  {creatingSections && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create {unmatchedForCreate.length} section
                  {unmatchedForCreate.length === 1 ? "" : "s"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

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

        {/* Import-in-progress shield. Full-screen and portaled to <body> so it
            sits above the whole app and nothing else is clickable while rows
            are being written. DialogContent is transformed (centering), which
            would re-anchor a `fixed` child to the dialog box — hence the
            portal. Refresh/Back are separately guarded by the effects above. */}
        {committing &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm"
              role="alertdialog"
              aria-modal="true"
              aria-label="Import in progress — do not close this tab"
            >
              <div className="mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  <p className="text-sm font-semibold">
                    {commitProgress?.stage ?? "Importing…"}
                  </p>
                  {commitProgress && commitProgress.total > 0 && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {commitProgress.done}/{commitProgress.total}
                    </span>
                  )}
                </div>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  {commitProgress && commitProgress.total > 0 ? (
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((commitProgress.done / commitProgress.total) * 100))}%`,
                      }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                  )}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>Don't refresh, press Back, or close this tab.</strong> Questions are
                    written one by one — leaving now would keep only part of your sections and
                    questions.
                  </span>
                </div>
              </div>
            </div>,
            document.body
          )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Section Name Editor ───────────────────────────────────────────────
// Renders one language's sections as chips; clicking a chip turns it into an
// inline text field that persists on Enter / ✓ and reverts on Esc / ✕.

function SectionNameEditor({
  lang,
  sections,
  savingSectionId,
  onRename,
}: {
  lang: string;
  sections: SectionMeta[];
  savingSectionId: string | null;
  onRename: (lang: string, sectionId: string, newName: string) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (s: SectionMeta) => {
    setEditingId(s.id);
    setDraft(s.name);
  };
  const cancel = () => {
    setEditingId(null);
    setDraft("");
  };
  const commit = async () => {
    if (!editingId) return;
    const ok = await onRename(lang, editingId, draft);
    if (ok) cancel();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-foreground/80">{langLabel(lang)}</span>
        <span className="text-muted-foreground/50">·</span>
        <span>
          {sections.length} section{sections.length === 1 ? "" : "s"}
        </span>
      </div>

      {sections.length === 0 ? (
        <p className="text-xs italic text-muted-foreground/70">No sections yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => {
            const isEditing = editingId === s.id;
            const isSaving = savingSectionId === s.id;

            if (isEditing) {
              return (
                <div
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/60 bg-background py-0.5 pl-2 pr-1 shadow-sm"
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commit();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancel();
                      }
                    }}
                    disabled={isSaving}
                    aria-label={`Rename section ${s.name}`}
                    className="bg-transparent text-xs text-foreground outline-none disabled:opacity-60"
                    style={{ width: `${Math.min(Math.max(draft.length, 6) + 1, 36)}ch` }}
                  />
                  <button
                    type="button"
                    onClick={commit}
                    disabled={isSaving}
                    aria-label="Save name"
                    className="rounded p-0.5 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-950/40"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={isSaving}
                    aria-label="Cancel rename"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => startEdit(s)}
                title="Click to rename"
                className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className="truncate max-w-[16rem]">{s.name}</span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Language Picker View ──────────────────────────────────────────────

function LanguagePickerView({
  loadingStatus,
  supportedLanguages,
  primaryLanguage,
  langStatus,
  sectionsByLang,
  savingSectionId,
  onRenameSection,
  docsUrl,
  lastError,
  onDismissError,
  onUploadClick,
  onPasteClick,
  onEditFailedText,
  onClose,
}: {
  loadingStatus: boolean;
  supportedLanguages: string[];
  primaryLanguage: string;
  langStatus: Record<string, LangStatus>;
  sectionsByLang: Record<string, SectionMeta[]>;
  savingSectionId: string | null;
  onRenameSection: (lang: string, sectionId: string, newName: string) => Promise<boolean>;
  docsUrl?: string;
  lastError: DialogError | null;
  onDismissError: () => void;
  onUploadClick: (lang: string) => void;
  onPasteClick: (lang: string) => void;
  /** Present only when the failed load left text behind that can be edited. */
  onEditFailedText?: () => void;
  onClose: () => void;
}) {
  const errorFixUrl =
    lastError && docsUrl
      ? `${docsUrl}#${errorCodeToAnchor[lastError.code]}`
      : null;
  const anySections = supportedLanguages.some((l) => (sectionsByLang[l]?.length ?? 0) > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-primary" />
          Upload JSON
        </DialogTitle>
        <DialogDescription>
          Paste the JSON your AI produced, or upload the .json file — one per language. Section
          names in the JSON must match this exam's section names exactly.
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
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {onEditFailedText && (
                    <button
                      type="button"
                      onClick={onEditFailedText}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-background px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/40"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      Edit &amp; retry here
                    </button>
                  )}
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

        {/* Exam sections — reference + inline rename. JSON section names must
            match these, so let the admin fix a name without leaving the dialog. */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">Exam sections</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {anySections
                  ? "Your JSON's section names must match these. Click a name to rename it."
                  : "None yet — no need to add them first. Import your JSON and the preview creates every section it names."}
              </p>
            </div>
            {docsUrl && (
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Get the prompt →
              </a>
            )}
          </div>

          <div className="mt-3 space-y-3">
            {supportedLanguages.map((lang) => (
              <SectionNameEditor
                key={lang}
                lang={lang}
                sections={sectionsByLang[lang] ?? []}
                savingSectionId={savingSectionId}
                onRename={onRenameSection}
              />
            ))}
          </div>
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
              return (
                <div
                  key={lang}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
                      {sectionCount === 0 ? (
                        "No sections yet — importing creates them from your JSON."
                      ) : hasContent ? (
                        `${status.questionCount} question${status.questionCount === 1 ? "" : "s"} across ${status.sectionCount} section${status.sectionCount === 1 ? "" : "s"}`
                      ) : (
                        "No questions yet"
                      )}
                    </div>
                  </div>
                  {/* Two ways in, one preview. Paste is the short path — no
                      save-as, no encoding dropdown — so it carries the emphasis
                      until the language has content; after that both step back
                      and the preview's Replace/Append choice does the talking.
                      Neither is gated on sections existing: an exam with none
                      yet gets them created from the JSON on the preview. */}
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={hasContent ? "outline" : "default"}
                      onClick={() => onPasteClick(lang)}
                    >
                      <ClipboardPaste className="h-4 w-4 mr-2" />
                      Paste JSON
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onUploadClick(lang)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload file
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Add the <strong>primary</strong> language first — a secondary language's questions pair
            back to primary by position.
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

// ─── Paste JSON View ───────────────────────────────────────────────────
// A textarea that is checked as you go. The same parser the file path runs
// re-runs (debounced) on every edit, so a bad paste is diagnosed inline —
// with the offending text still in front of the user — instead of after a
// save-as-UTF-8 round-trip through a text editor and a second file picker.

const PASTE_CHECK_DEBOUNCE_MS = 350;

function PasteJsonView({
  lang,
  isPrimary,
  sectionNames,
  value,
  onChange,
  parse,
  docsUrl,
  onBack,
  onChooseFile,
  onContinue,
}: {
  lang: string;
  isPrimary: boolean;
  sectionNames: string[];
  value: string;
  onChange: (next: string) => void;
  /** The dialog's parser, already bound to this language's ParseContext. */
  parse: (text: string) => ParseReport;
  docsUrl?: string;
  onBack: () => void;
  onChooseFile: () => void;
  onContinue: (text: string, report: ParseReport) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Debounced copy of `value` — the check runs against this, not every keystroke.
  const [checked, setChecked] = useState(value);

  useEffect(() => {
    if (checked === value) return;
    const id = window.setTimeout(() => setChecked(value), PASTE_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [value, checked]);

  // Land focus in the box so Ctrl+V works the moment the view opens.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const isEmpty = value.trim() === "";
  const checking = !isEmpty && checked !== value;
  // Byte size is measured on the debounced text only — a Blob per keystroke
  // over a multi-megabyte paste is wasted work.
  const sizeBytes = useMemo(() => (checked ? new Blob([checked]).size : 0), [checked]);
  const tooLarge = sizeBytes > MAX_FILE_SIZE_BYTES;
  const report = useMemo<ParseReport | null>(
    () => (checked.trim() && !tooLarge ? parse(checked) : null),
    [checked, tooLarge, parse]
  );

  const canContinue = !checking && !isEmpty && !tooLarge && !!report?.ok;

  // Gated on the LIVE text: after Clear, `checked` lags `value` by one
  // debounce, and a stale error must not flash for that window.
  const errorCode: DialogErrorCode | null = isEmpty
    ? null
    : tooLarge
      ? "file_too_large"
      : report && !report.ok
        ? (report.errorCode ?? "invalid_json")
        : null;
  const fixUrl = errorCode && docsUrl ? `${docsUrl}#${errorCodeToAnchor[errorCode]}` : null;

  const okSummary = useMemo(() => {
    if (!report?.ok) return null;
    const sections = report.perSection.length;
    const questions = report.perSection.reduce((n, s) => n + s.questionCountInJson, 0);
    const parts = [
      `${sections} section${sections === 1 ? "" : "s"}`,
      `${questions} question${questions === 1 ? "" : "s"}`,
    ];
    if (report.repairApplied) parts.push("syntax auto-repaired");
    return parts.join(" · ");
  }, [report]);
  const unmatchedCount = report?.ok ? report.unmatchedSections.length : 0;

  const handleContinue = () => {
    if (canContinue && report) onContinue(value, report);
  };

  const handleClear = () => {
    onChange("");
    textareaRef.current?.focus();
  };

  const fixLink = fixUrl && (
    <a
      href={fixUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline dark:text-red-300"
    >
      See how to fix this →
    </a>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClipboardPaste className="h-5 w-5 text-primary" />
          <span>
            Paste JSON{" "}
            <span className="font-normal text-muted-foreground">· {langLabel(lang)}</span>
          </span>
          {isPrimary && (
            <Badge variant="secondary" className="text-[10px] uppercase">
              Primary
            </Badge>
          )}
        </DialogTitle>
        <DialogDescription>
          Paste the whole reply from your AI. The{" "}
          <span className="font-mono text-xs">&lt;&lt;&lt;EXAM_JSON_START&gt;&gt;&gt;</span>{" "}
          markers, code fences and any explanation around the JSON are stripped automatically.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 mt-2">
        {sectionNames.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Section names in this exam ({langLabel(lang)}):{" "}
            {sectionNames.map((name, i) => (
              <span key={`${name}-${i}`}>
                <span className="font-medium text-foreground/80">{name}</span>
                {i < sectionNames.length - 1 && (
                  <span className="text-muted-foreground/50"> · </span>
                )}
              </span>
            ))}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isPrimary
              ? "This exam has no sections yet — the ones named in your JSON will be created on the next screen."
              : `This exam has no sections yet — import the primary language first; its sections are mirrored to ${langLabel(lang)}.`}
          </p>
        )}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              handleContinue();
            }
          }}
          placeholder={`Paste here — the reply starts like:\n{\n  "schema_version": "1.0",\n  "language": "${lang}",\n  "sections": [ … ]\n}`}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={`JSON for ${langLabel(lang)}`}
          aria-invalid={errorCode ? true : undefined}
          className="min-h-[40vh] resize-y font-mono text-xs leading-relaxed"
        />

        {/* Status line — a polite live region so screen readers hear the verdict. */}
        <div className="flex min-h-[1.5rem] items-start justify-between gap-3" aria-live="polite">
          <div className="flex min-w-0 flex-1 items-start gap-2 text-xs">
            {isEmpty ? (
              <span className="text-muted-foreground">
                Waiting for your paste — Ctrl+V (⌘V on Mac).
              </span>
            ) : checking ? (
              <>
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Checking…</span>
              </>
            ) : tooLarge ? (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-700 dark:text-red-300">
                  Too large — max 10 MB. {fixLink}
                </span>
              </>
            ) : report && !report.ok ? (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-700 dark:text-red-300">
                  Couldn't read this JSON yet — details below.
                </span>
              </>
            ) : report?.ok ? (
              <>
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
                <span className="min-w-0">
                  <span className="font-medium text-green-700 dark:text-green-300">Readable</span>
                  <span className="text-muted-foreground"> — {okSummary}</span>
                  {unmatchedCount > 0 && sectionNames.length === 0 ? (
                    // Nothing to match against is the expected first-import
                    // state, so it reads as a next step, not a warning.
                    <span className="block text-muted-foreground">
                      {isPrimary
                        ? `This exam has no sections yet — the next screen creates ${unmatchedCount === 1 ? "it" : `all ${unmatchedCount}`} from your JSON.`
                        : "This exam has no sections yet — import the primary language first."}
                    </span>
                  ) : unmatchedCount > 0 ? (
                    <span className="block text-amber-700 dark:text-amber-400">
                      {unmatchedCount} section name{unmatchedCount === 1 ? " isn't" : "s aren't"}{" "}
                      in this exam — you can rename or create{" "}
                      {unmatchedCount === 1 ? "it" : "them"} on the next screen.
                    </span>
                  ) : null}
                </span>
              </>
            ) : null}
          </div>
          {!isEmpty && (
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatBytes(sizeBytes)}</span>
              <button
                type="button"
                onClick={handleClear}
                className="hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {!isEmpty && !checking && report && !report.ok && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-900 dark:text-red-200">
              {report.fatalReason ?? "Couldn't read this JSON."}
            </pre>
            {fixLink && <div className="mt-2">{fixLink}</div>}
          </div>
        )}
      </div>

      <DialogFooter className="mt-2 gap-2 sm:justify-between sm:space-x-0">
        <Button type="button" variant="ghost" onClick={onChooseFile}>
          <Upload className="h-4 w-4 mr-2" />
          Upload a .json file instead
        </Button>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button type="button" onClick={handleContinue} disabled={!canContinue}>
            {checking ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Continue to preview
            {!checking && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </div>
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
  onCreateSectionsClick,
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
  showMarks,
  requiresSectionTime,
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
  onCreateSectionsClick: () => void;
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
  showMarks: boolean;
  /** Mock exams need minutes per new section; live exams take timing from the JSON. */
  requiresSectionTime: boolean;
}) {
  const isSecondary = !report.isPrimary;
  const hasMismatch = report.unmatchedSections.length > 0;
  // No sections at all is the expected first-import state, not a mismatch.
  const examHasNoSections = report.examSectionNames.length === 0;
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
          {showMarks && report.marksConfig?.exam_default && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Marks: yes
            </Badge>
          )}
          {showMarks && report.marksIgnoredReason && (
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
              Marks: ignored (secondary)
            </Badge>
          )}
        </div>

        {/* No sections yet — the first import of a fresh exam. The JSON's
            sections become the exam's sections in one step. Primary only:
            sections are mirrored to every language from the primary JSON, so
            a secondary upload here is told to go via primary. */}
        {hasMismatch && examHasNoSections && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            {report.isPrimary ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">This exam has no sections yet</h3>
                </div>
                <p className="mb-3 text-sm text-muted-foreground">
                  Create{" "}
                  {report.unmatchedSections.length === 1
                    ? "it"
                    : `all ${report.unmatchedSections.length}`}{" "}
                  from your JSON in one step — each keeps its name and its questions.
                  {requiresSectionTime
                    ? " You'll set a time for each."
                    : " Question timers come from the JSON."}
                </p>
                <ul className="mb-4 flex flex-wrap gap-1.5">
                  {report.perSection.map((s, i) => (
                    <li
                      key={`${s.jsonName}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      <span className="font-medium">{s.jsonName}</span>
                      <span className="text-muted-foreground">
                        · {s.questionCountInJson} Q{s.questionCountInJson === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
                <Button type="button" size="sm" onClick={onCreateSectionsClick}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create {report.unmatchedSections.length} section
                  {report.unmatchedSections.length === 1 ? "" : "s"}…
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h3 className="font-semibold">Add the primary language first</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This exam has no sections yet. They are created from the{" "}
                    <strong>{langLabel(primaryLanguage)}</strong> JSON and mirrored to{" "}
                    {langLabel(report.language)}, so import {langLabel(primaryLanguage)} before
                    this one.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section-name mismatch panel */}
        {hasMismatch && !examHasNoSections && (
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

            {/* Fastest fix — create the missing sections right here. Primary
                uploads only: sections born from a secondary upload would have
                no primary counterpart, so their questions could never pair. */}
            {report.isPrimary && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-400 bg-white p-3 dark:bg-amber-950/40">
                <div className="text-sm text-amber-900 dark:text-amber-200">
                  <strong>Fastest fix:</strong> add {report.unmatchedSections.length === 1 ? "this section" : "these sections"} to the exam now.
                </div>
                <Button type="button" size="sm" onClick={onCreateSectionsClick}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create {report.unmatchedSections.length} missing section
                  {report.unmatchedSections.length === 1 ? "" : "s"}…
                </Button>
              </div>
            )}

            <p className="text-sm text-amber-900 mb-2">
              <strong>{report.isPrimary ? "Or fix it another way:" : "Two ways to fix this:"}</strong>
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
            {showMarks && (
              <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Marks config in this JSON will be ignored — marks are managed on the{" "}
                  <strong>{langLabel(primaryLanguage)}</strong> (primary) language only.
                </span>
              </div>
            )}
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
                    : examHasNoSections && report.isPrimary
                      ? `${s.questionCountInJson} Q${s.questionCountInJson === 1 ? "" : "s"} — created with the section`
                      : "Not in this exam — section will be skipped"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {s.matchedSectionId
                  ? "✓ match"
                  : examHasNoSections && report.isPrimary
                    ? "+ new"
                    : "✗ no match"}
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
