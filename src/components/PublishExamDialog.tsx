import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tableHasColumn } from "@/lib/dbFeatures";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { readNavigationSettings } from "@/lib/examSettings";
import { fetchTimingGroups } from "@/lib/timingGroupSettings";
import { groupDisplayName, resolveTimingGroupIds } from "@/lib/timingGroups.js";
import { auditInstructionDrift } from "@/lib/instructionDrift.js";
import {
  auditInstructionShape,
  canGenerateFor,
  generateExamInstruction,
} from "@/lib/examInstructionEngine.js";
import {
  describeInstructionNotice,
  hasMeaningfulText,
  instructionsNeedReview,
  markInstructionsReviewed,
} from "@/lib/instructionFreshness.js";
import { collectExamFacts } from "@/services/examInstructionFacts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LangError {
  type:
    | "no_sections"
    | "no_questions"
    | "blank_questions"
    | "invalid_question"
    | "missing_answer"
    | "section_missing_in_lang"
    | "question_count_mismatch"
    | "empty_text_parity"
    | "option_count_mismatch"
    | "answer_type_mismatch"
    | "not_linked_to_primary";
  sectionName: string;
  sectionId: string;
  qNos: number[];
  detail?: string;
}

/**
 * Does this question carry a usable answer key?
 *
 * Stricter than a null check on purpose. A half-filled editor row or a JSON
 * import leaves behind `"   "` and `["", ""]`, and both grade every candidate
 * wrong exactly like a null does — scoreSCQ compares the selected option
 * against them and never matches. Option index 0 is a real answer, so this
 * tests for emptiness rather than falsiness.
 */
function hasAnswerKey(ca: unknown): boolean {
  if (ca === null || ca === undefined) return false;
  if (Array.isArray(ca)) {
    return ca.some((v) => v !== null && v !== undefined && String(v).trim() !== "");
  }
  return String(ca).trim() !== "";
}

/**
 * How many options would a candidate actually see?
 *
 * Counting `options.length` is not the same question. Draft saves and
 * translated rows both store option slots that are blank strings, and a blank
 * slot renders as an unlabelled button nobody can choose. An option counts when
 * it has text OR an attached image — figure questions are legitimately
 * text-free — so the count is over content, not slots.
 */
function filledOptionCount(q: any): number {
  const opts = Array.isArray(q.options) ? q.options : [];
  const imgs = Array.isArray(q.option_image_urls) ? q.option_image_urls : [];
  return opts.filter((o: any, i: number) => {
    const text = String(o ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return text !== "" || !!imgs[i];
  }).length;
}

interface PublishExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  examName: string;
  isPublishing: boolean;
  onSuccess: (isPublishing: boolean, publishedLanguages: string[]) => void;
  onNavigateToQuestion?: (sectionId: string, qNo: number) => void;
  /**
   * The dialog rewrote the stored Exam Instruction. The editor needs to know:
   * it is holding its own copy in state, and its next Save would otherwise put
   * the old text straight back over the new one.
   */
  onInstructionsRegenerated?: (translations: Record<string, string>) => void;
}

export default function PublishExamDialog({
  open,
  onOpenChange,
  examId,
  examName,
  isPublishing,
  onSuccess,
  onNavigateToQuestion,
  onInstructionsRegenerated,
}: PublishExamDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [publishLangErrors, setPublishLangErrors] = useState<Record<string, LangError[]>>({});
  const [supportedLangsToPublish, setSupportedLangsToPublish] = useState<string[]>([]);
  const [selectedLangsForPublish, setSelectedLangsForPublish] = useState<string[]>([]);
  const [validating, setValidating] = useState(true);
  // marksWarning carries severity so the dialog can render an error-level
  // banner (red) when the exam has NO marking scheme configured at any layer,
  // distinct from the amber warning shown for partial coverage.
  const [marksWarning, setMarksWarning] = useState<{ severity: "warning" | "error"; text: string } | null>(null);

  // ── The instructions disclaimer ──────────────────────────────────────────
  // Same contract as marksWarning: advisory, never a gate. The exam editor
  // shows this too, but a creator who publishes from the Dashboard never opens
  // the editor — and this is the last moment before candidates read the text.
  //
  // `paper` is what regeneration needs and the audit already paid for, kept so
  // the Regenerate button does not re-fetch the whole paper per click.
  const [instructionFindings, setInstructionFindings] = useState<
    { lang: string; langName: string; headline: string; body: string; canFix: boolean }[]
  >([]);
  const [paper, setPaper] = useState<{
    exam: any;
    allSections: any[];
    timingGroups: any[];
    resolvedGroupIds: Map<string, string>;
    primaryLanguage: string;
    supportedLanguages: string[];
    stored: Record<string, string>;
  } | null>(null);
  const [regeneratingLang, setRegeneratingLang] = useState<string | null>(null);
  // The previous text, per language, so a regeneration can be put back — the
  // same promise the editor's Generate button makes with useUndoableFill. A
  // one-click irreversible overwrite of someone's prose is a worse deal than
  // the stale sentence it replaced.
  const [undoableText, setUndoableText] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Every open starts clean. An undo offer left over from a previous open
      // would promise to restore text that is no longer in `paper.stored`.
      setInstructionFindings([]);
      setUndoableText({});
      setPaper(null);
      if (isPublishing) {
        validateExam();
      } else {
        setValidating(false);
      }
    }
  }, [open, isPublishing, examId]);

  const validateExam = async () => {
    setValidating(true);
    setPublishLangErrors({});
    setSupportedLangsToPublish([]);
    setSelectedLangsForPublish([]);

    try {
      const supportsOptionImages = await tableHasColumn("parsed_questions", "option_image_urls");

      // select("*") rather than a column list: the instruction audit needs
      // allow_section_switching and total_time_minutes, and those arrive by
      // hand-pasted migration — naming a column PostgREST has not seen fails
      // the WHOLE query and would block publishing outright on an un-migrated
      // database. The star returns whatever the live schema actually has.
      const { data: examData } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      const supportedLangs = (examData as any)?.supported_languages || ["en"];
      setSupportedLangsToPublish(supportedLangs);

      // Same reasoning for sections (timing_group_id ships behind the pending
      // grouping migration), plus an explicit order: timingUnits coalesces only
      // CONSECUTIVE members, so an unordered result splits a pooled group into
      // solos and the audit compares against the wrong clocks.
      const { data: sections, error: sectionsError } = await supabase
        .from("sections")
        .select("*")
        .eq("exam_id", examId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (sectionsError) throw sectionsError;

      if (!sections || sections.length === 0) {
        toast({
          title: "Cannot Publish Exam",
          description: "This exam has no sections. Please add at least one section with questions.",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      const errorsMap: Record<string, LangError[]> = {};

      for (const lang of supportedLangs) {
        const langErrors: LangError[] = [];
        const langSections = sections.filter((s: any) => s.language === lang);

        if (langSections.length === 0) {
          langErrors.push({ type: "no_sections", sectionName: "", sectionId: "", qNos: [] });
        } else {
          for (const sec of langSections) {
            const { count, error: countError } = await supabase
              .from("parsed_questions")
              .select("id", { count: "exact", head: true })
              .eq("section_id", sec.id);

            if (countError) throw countError;
            if (count === 0) {
              langErrors.push({ type: "no_questions", sectionName: sec.name, sectionId: sec.id, qNos: [] });
            }

            // option_image_urls ships behind a hand-applied migration, so ask
            // before selecting it — naming an absent column fails the whole
            // query and would block publishing outright.
            const { data: secQs } = await supabase
              .from("parsed_questions")
              .select(
                "q_no, text, image_url, image_urls, options, answer_type, correct_answer" +
                  (supportsOptionImages ? ", option_image_urls" : "")
              )
              .eq("section_id", sec.id)
              .order("q_no", { ascending: true });

            // A question is only truly blank if it has no image either
            const trulyBlankQs = (secQs || []).filter(
              (q: any) => {
                const stripped = (q.text || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
                return stripped === "" && !q.image_url && (!Array.isArray(q.image_urls) || q.image_urls.length === 0);
              }
            );

            if (trulyBlankQs.length > 0) {
              langErrors.push({
                type: "blank_questions",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: trulyBlankQs.map((q: any) => q.q_no),
              });
            }

            const invalidQs = (secQs || []).filter((q: any) => {
              const at = q.answer_type;
              if (!at) return true;
              if (at === "subjective") return false;

              if (at === "single" || at === "multi") {
                if (filledOptionCount(q) < 2) return true;
              }

              return false;
            });

            if (invalidQs.length > 0) {
              langErrors.push({
                type: "invalid_question",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: invalidQs.map((q: any) => q.q_no),
              });
            }

            // ── Answer-key gate: every language, not just primary ──
            // Grading reads correct_answer off the row the candidate actually
            // sat — examService fetches by the attempt's own question ids, and
            // only the marks CONFIG is resolved back to the primary twin. So a
            // Hindi row with an empty key marks every Hindi candidate wrong on
            // that question while its English twin scores fine, and nothing on
            // screen says so. Gating this on `isPrimary` let that ship.
            //
            // Subjective questions stay exempt: they are graded by hand and
            // have no key to enter. Typeless rows are reported by the
            // invalid_question check above, so they are skipped here rather
            // than listed twice.
            const missingAnswerQs = (secQs || []).filter((q: any) => {
              const at = q.answer_type;
              if (!at || at === "subjective") return false;
              return !hasAnswerKey(q.correct_answer);
            });

            if (missingAnswerQs.length > 0) {
              langErrors.push({
                type: "missing_answer",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: missingAnswerQs.map((q: any) => q.q_no),
              });
            }
          }
        }

        errorsMap[lang] = langErrors;
      }

      // ── Per-language parity gate (non-primary must mirror primary) ──
      // For each non-primary language, verify section + question parity
      // with primary: same sections (linked by section_group_id), same
      // question counts, non-empty text, matching options/answer_type, and
      // proper question_group_id linkage. Failures join the same channel
      // as existing errors so the UI surfaces them without restructuring.
      const primaryLangForParity = (examData as any)?.primary_language || "en";
      if (supportedLangs.length > 1) {
        const allSecIds = (sections as any[]).map((s) => s.id);
        const { data: allQs } = await supabase
          .from("parsed_questions")
          .select(
            "id, section_id, q_no, text, options, answer_type, question_group_id, image_url, image_urls"
          )
          .in("section_id", allSecIds)
          .order("q_no", { ascending: true });

        const qsBySection = new Map<string, any[]>();
        for (const q of (allQs || []) as any[]) {
          const arr = qsBySection.get(q.section_id) || [];
          arr.push(q);
          qsBySection.set(q.section_id, arr);
        }

        const primarySections = (sections as any[]).filter(
          (s) => s.language === primaryLangForParity
        );

        for (const lang of supportedLangs) {
          if (lang === primaryLangForParity) continue;
          const langName = getLangName(lang);
          const langErrors = errorsMap[lang] || [];

          for (const primSec of primarySections) {
            const groupId = primSec.section_group_id;
            const secSec = groupId
              ? (sections as any[]).find(
                  (s) => s.language === lang && s.section_group_id === groupId
                )
              : undefined;

            if (!secSec) {
              langErrors.push({
                type: "section_missing_in_lang",
                sectionName: primSec.name,
                sectionId: primSec.id,
                qNos: [],
              });
              continue;
            }

            const primQs = qsBySection.get(primSec.id) || [];
            const secQs = qsBySection.get(secSec.id) || [];

            if (primQs.length !== secQs.length) {
              langErrors.push({
                type: "question_count_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: [],
                detail: `has ${secQs.length} question${secQs.length === 1 ? "" : "s"} in ${langName}; primary has ${primQs.length}`,
              });
            }

            const overlap = Math.min(primQs.length, secQs.length);
            const emptyTextQNos: number[] = [];
            const optionMismatchQNos: number[] = [];
            const answerTypeMismatchQNos: number[] = [];
            const notLinkedQNos: number[] = [];

            for (let i = 0; i < overlap; i++) {
              const p = primQs[i];
              const s = secQs[i];

              if (!s.question_group_id || s.question_group_id !== p.question_group_id) {
                notLinkedQNos.push(s.q_no);
              }
              const sText = typeof s.text === "string" ? s.text : "";
              const stripped = sText.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
              const sHasImage =
                !!s.image_url ||
                (Array.isArray(s.image_urls) && s.image_urls.length > 0);
              if (stripped === "" && !sHasImage) {
                emptyTextQNos.push(s.q_no);
              }
              const pOptsLen = Array.isArray(p.options) ? p.options.length : 0;
              const sOptsLen = Array.isArray(s.options) ? s.options.length : 0;
              if (pOptsLen !== sOptsLen) {
                optionMismatchQNos.push(s.q_no);
              }
              if (p.answer_type !== s.answer_type) {
                answerTypeMismatchQNos.push(s.q_no);
              }
            }

            if (emptyTextQNos.length > 0) {
              langErrors.push({
                type: "empty_text_parity",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: emptyTextQNos,
              });
            }
            if (optionMismatchQNos.length > 0) {
              langErrors.push({
                type: "option_count_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: optionMismatchQNos,
                detail: `Q${optionMismatchQNos.join(", Q")} ${optionMismatchQNos.length > 1 ? "have" : "has"} a different option count vs primary`,
              });
            }
            if (answerTypeMismatchQNos.length > 0) {
              langErrors.push({
                type: "answer_type_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: answerTypeMismatchQNos,
                detail: `Q${answerTypeMismatchQNos.join(", Q")} ${answerTypeMismatchQNos.length > 1 ? "have" : "has"} a different answer type vs primary`,
              });
            }
            if (notLinkedQNos.length > 0) {
              langErrors.push({
                type: "not_linked_to_primary",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: notLinkedQNos,
                detail: `Q${notLinkedQNos.join(", Q")} not linked to primary (question_group_id mismatch)`,
              });
            }
          }

          errorsMap[lang] = langErrors;
        }
      }

      setPublishLangErrors(errorsMap);

      await auditStoredInstructions(examData, sections as any[], supportedLangs);

      const currentlyPublished = (examData as any)?.published_languages || [];
      setSelectedLangsForPublish(currentlyPublished.length > 0 ? currentlyPublished : []);

      try {
        const primaryLang = (examData as any)?.primary_language || "en";
        const isMultiLang = supportedLangs.length > 1;
        const primarySections = isMultiLang
          ? (sections || []).filter((s: any) => s.language === primaryLang)
          : (sections || []);
        const allSectionIds = primarySections.map((s: any) => s.id);
        const { data: allQsData } = await supabase
          .from("parsed_questions")
          .select("id, section_id")
          .in("section_id", allSectionIds);
        if (allQsData && allQsData.length > 0) {
          // A question is "scored" if any of these exist:
          //   - exam-level default      (exam_scoring_defaults row)
          //   - section-level override  (section_scoring_defaults row for its section)
          //   - question-level override (question_scoring_config row for itself)
          // Previously this code only checked question-level overrides, so an exam
          // with a perfectly fine exam-level default looked "0% scored" and silently
          // showed no warning — and an exam with no marks anywhere also showed
          // nothing, letting creators publish completely unscored exams.
          const [examDefaultRes, sectionDefaultsRes, questionConfigsRes] = await Promise.all([
            supabase
              .from("exam_scoring_defaults" as any)
              .select("id")
              .eq("exam_id", examId)
              .maybeSingle(),
            allSectionIds.length > 0
              ? supabase
                  .from("section_scoring_defaults" as any)
                  .select("section_id")
                  .in("section_id", allSectionIds)
              : Promise.resolve({ data: [] as any[] } as any),
            supabase
              .from("question_scoring_config" as any)
              .select("question_id")
              .in("question_id", allQsData.map((q: any) => q.id)),
          ]);

          const hasExamDefault = !!(examDefaultRes as any).data;
          const sectionIdsWithConfig = new Set<string>(
            (((sectionDefaultsRes as any).data) || []).map((r: any) => r.section_id)
          );
          const questionIdsWithConfig = new Set<string>(
            (((questionConfigsRes as any).data) || []).map((r: any) => r.question_id)
          );

          let unscored = 0;
          for (const q of allQsData as any[]) {
            const hasQ = questionIdsWithConfig.has(q.id);
            const hasS = sectionIdsWithConfig.has(q.section_id);
            if (!hasQ && !hasS && !hasExamDefault) unscored++;
          }

          if (unscored === allQsData.length) {
            setMarksWarning({
              severity: "error",
              text:
                "No marking scheme is configured for this exam. Students will submit and see their results without any marks.",
            });
          } else if (unscored > 0) {
            setMarksWarning({
              severity: "warning",
              text: `${unscored} of ${allQsData.length} questions are unscored and will count as 0 marks.`,
            });
          } else {
            setMarksWarning(null);
          }
        }
      } catch {
        // Non-fatal
      }
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.message || "Failed to validate exam",
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setValidating(false);
    }
  };

  /** The sections a candidate sitting `lang` actually gets, in the paper's order. */
  const sectionsFor = (allSections: any[], lang: string, primaryLanguage: string) => {
    const own = allSections.filter((s) => (s.language || primaryLanguage) === lang);
    return own.length > 0 ? own : [];
  };

  /**
   * Does the stored instruction text still describe this paper?
   *
   * Audited per language, but only for a language that has BOTH its own
   * instruction text and its own section rows. Without that gate an exam with
   * English prose and `hi` merely listed as supported would audit the English
   * text against the English sections twice and print the same sentence under
   * an "Hindi —" heading — and then offer a button that writes a Hindi-keyed
   * translation the creator never authored.
   *
   * Failures here are swallowed: a disclaimer that could not be computed must
   * not stop someone publishing.
   */
  const auditStoredInstructions = async (examRow: any, allSections: any[], supportedLangs: string[]) => {
    try {
      const primaryLanguage = examRow?.primary_language || "en";
      const nav = readNavigationSettings(examRow);
      const timingGroups = await fetchTimingGroups(examId);
      const resolvedGroupIds = resolveTimingGroupIds(allSections, primaryLanguage);

      const trans: Record<string, string> = { ...(examRow?.exam_instruction_translations || {}) };
      if (Object.keys(trans).length === 0 && examRow?.exam_instruction) {
        trans.en = examRow.exam_instruction;
      }

      setPaper({
        exam: examRow,
        allSections,
        timingGroups,
        resolvedGroupIds,
        primaryLanguage,
        supportedLanguages: supportedLangs,
        stored: trans,
      });

      const findings: typeof instructionFindings = [];
      for (const lang of supportedLangs) {
        const text = (trans[lang] || "").trim();
        const langSections = sectionsFor(allSections, lang, primaryLanguage);
        if (!hasMeaningfulText(text) || langSections.length === 0) continue;

        const groups =
          timingGroups.length > 0
            ? Object.fromEntries(
                timingGroups.map((g: any) => [
                  g.id,
                  { name: groupDisplayName(g, lang), minutes: g.time_minutes ?? null },
                ])
              )
            : null;

        const timingDrift = auditInstructionDrift({
          text,
          sections: langSections,
          resolvedGroupIds,
          timingGroups,
          groups,
          allowSectionSwitching: nav.allow_section_switching,
          totalMinutes: nav.total_time_minutes,
          lang,
        });

        // The counts half needs the same fetch generation needs. Only paid for
        // when there is text that could be contradicted.
        let shapeDrift = null;
        try {
          const facts = await collectExamFacts({
            examId,
            sections: langSections,
            allSections,
            primaryLanguage,
            allowSectionSwitching: nav.allow_section_switching,
            totalTimeMinutes: nav.total_time_minutes,
            resolvedGroupIds,
            groups,
            lang,
            supportedLanguages: supportedLangs,
          });
          shapeDrift = auditInstructionShape(text, facts, lang);
        } catch {
          // A count we could not read is not a claim we can disprove.
        }

        const notice = describeInstructionNotice({
          timingDrift,
          shapeDrift,
          needsReview: false, // per-exam, not per-language — handled once below
          hasText: true,
        });
        if (notice) {
          findings.push({
            lang,
            langName: getLangName(lang),
            headline: notice.headline,
            body: notice.body,
            canFix: canGenerateFor(lang),
          });
        }
      }

      // Nothing was contradicted — because there may be nothing to contradict.
      // Both remaining cases are facts about the exam rather than about any one
      // language's text, so they are said once, without a language prefix.
      //
      // "No instruction anywhere" is asked across every language, not per
      // language: on a two-language exam the intro falls back to the other
      // language's text (ExamIntro prefers trans[lang] then trans.en), so a
      // missing Hindi variant is not the same thing as a paper that tells
      // candidates nothing at all.
      const anyMeaningful = Object.values(trans).some((t) => hasMeaningfulText(t));
      if (findings.length === 0 && (!anyMeaningful || instructionsNeedReview(examId))) {
        const notice = describeInstructionNotice({
          timingDrift: null,
          shapeDrift: null,
          blank: { examInstruction: !anyMeaningful && allSections.length > 0, generalInstruction: false },
          needsReview: instructionsNeedReview(examId),
          hasText: anyMeaningful,
        });
        if (notice) {
          findings.push({
            lang: primaryLanguage,
            langName: "",
            headline: notice.headline,
            body: notice.body,
            // Offer the fix only when there is a paper to write about and a
            // copy pack to write it in.
            canFix: !anyMeaningful && allSections.length > 0 && canGenerateFor(primaryLanguage),
          });
        }
      }

      setInstructionFindings(findings);
    } catch {
      setInstructionFindings([]);
    }
  };

  /**
   * Rewrite one language's Exam Instruction from the paper, and persist it.
   *
   * The editor's button writes to a textarea and waits for Save; this one has
   * no textarea and no Save to wait for — from the Dashboard there is no editor
   * in the session at all. So it writes the row, and keeps the previous text in
   * state so Undo can put it back. Undo is the whole reason this is offered at
   * all: the banner directly above it may be saying "this wording is yours".
   */
  const regenerateInstruction = async (lang: string) => {
    if (!paper || regeneratingLang) return;
    setRegeneratingLang(lang);
    try {
      const nav = readNavigationSettings(paper.exam);
      const langSections = sectionsFor(paper.allSections, lang, paper.primaryLanguage);
      const groups =
        paper.timingGroups.length > 0
          ? Object.fromEntries(
              paper.timingGroups.map((g: any) => [
                g.id,
                { name: groupDisplayName(g, lang), minutes: g.time_minutes ?? null },
              ])
            )
          : null;

      // What the intro will ACTUALLY offer, which this screen alone knows: the
      // languages ticked for publishing. Generating "available in English and
      // Hindi — choose your language" while publishing English only would
      // describe a chooser the candidate is never shown. Before anything is
      // ticked, the valid languages are the best available answer.
      const candidateLanguages =
        selectedLangsForPublish.length > 0
          ? selectedLangsForPublish
          : supportedLangsToPublish.filter((l) => (publishLangErrors[l]?.length ?? 0) === 0);

      const facts = await collectExamFacts({
        examId,
        sections: langSections,
        allSections: paper.allSections,
        primaryLanguage: paper.primaryLanguage,
        allowSectionSwitching: nav.allow_section_switching,
        totalTimeMinutes: nav.total_time_minutes,
        resolvedGroupIds: paper.resolvedGroupIds,
        groups,
        lang,
        supportedLanguages: paper.supportedLanguages,
        candidateLanguages,
      });

      const text = generateExamInstruction(facts, lang);
      if (!text) {
        toast({
          title: "Nothing generated",
          description: "There is not enough set up on this exam to describe yet.",
        });
        return;
      }

      const previous = paper.stored[lang] || "";
      const nextMap = { ...paper.stored, [lang]: text };
      const { error } = await supabase
        .from("exams")
        .update({
          exam_instruction_translations: nextMap,
          // The same legacy-mirror rule the editor's save uses. Two writers
          // owning one column have to agree about it, or a Hindi-primary exam
          // ends up with an English scalar and a Hindi map that disagree.
          exam_instruction: nextMap["en"] || nextMap[paper.primaryLanguage] || null,
        } as never)
        .eq("id", examId);
      if (error) throw error;

      setUndoableText((prev) => ({ ...prev, [lang]: previous }));
      setPaper((prev) => (prev ? { ...prev, stored: nextMap } : prev));
      setInstructionFindings((prev) => prev.filter((f) => f.lang !== lang));
      // Written straight from the paper — nothing left for the creator to go
      // back and check. Cleared here rather than only in the editor's callback,
      // because publishing from the Dashboard has no editor to call back to.
      markInstructionsReviewed(examId);
      onInstructionsRegenerated?.(nextMap);
      toast({
        title: "Instructions rewritten",
        description: `The ${getLangName(lang)} Exam Instruction now describes the paper as it stands.`,
      });
    } catch (error: any) {
      toast({
        title: "Could not rewrite",
        description: error.message || "The instructions were left as they were.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingLang(null);
    }
  };

  /** Put back exactly what was there before the regeneration. */
  const undoRegeneration = async (lang: string) => {
    if (!paper || regeneratingLang) return;
    setRegeneratingLang(lang);
    try {
      const nextMap = { ...paper.stored, [lang]: undoableText[lang] ?? "" };
      const { error } = await supabase
        .from("exams")
        .update({
          exam_instruction_translations: nextMap,
          exam_instruction: nextMap["en"] || nextMap[paper.primaryLanguage] || null,
        } as never)
        .eq("id", examId);
      if (error) throw error;

      setPaper((prev) => (prev ? { ...prev, stored: nextMap } : prev));
      setUndoableText((prev) => {
        const next = { ...prev };
        delete next[lang];
        return next;
      });
      onInstructionsRegenerated?.(nextMap);
      toast({ title: "Put back", description: "The previous wording has been restored." });
    } catch (error: any) {
      toast({
        title: "Could not undo",
        description: error.message || "The rewritten text is still in place.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingLang(null);
    }
  };

  const handleExecute = async () => {
    if (isPublishing && selectedLangsForPublish.length === 0) {
      toast({
        title: "No Languages Selected",
        description: "Please select at least one language to publish.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const payloadLangs = isPublishing ? selectedLangsForPublish : [];

      const { error } = await supabase
        .from("exams")
        .update({ is_published: isPublishing, published_languages: payloadLangs })
        .eq("id", examId);

      if (error) throw error;

      toast({
        title: isPublishing ? "Published" : "Unpublished",
        description: isPublishing
          ? `Exam is now visible in Marketplace${payloadLangs.length > 1 ? ` in ${payloadLangs.length} languages` : ""}`
          : "Exam removed from Marketplace",
      });

      onSuccess(isPublishing, payloadLangs);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update publish status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getLangName = (code: string) => {
    if (code === "en") return "English";
    if (code === "hi") return "Hindi";
    return code.toUpperCase();
  };

  const getErrorMessage = (err: LangError, langName: string): string => {
    if (err.type === "no_sections") return `No sections set up for ${langName} yet`;
    if (err.type === "no_questions") return `"${err.sectionName}" has no questions yet`;
    if (err.type === "blank_questions") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "are" : "is"} missing ${langName} text`;
    }
    if (err.type === "invalid_question") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "have" : "has"} no question type or fewer than 2 options`;
    }
    if (err.type === "missing_answer") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "have" : "has"} no correct answer marked`;
    }
    if (err.type === "section_missing_in_lang") {
      return `Section "${err.sectionName}" missing in ${langName}`;
    }
    if (err.type === "question_count_mismatch") {
      return `"${err.sectionName}" ${err.detail ?? "— question count differs from primary"}`;
    }
    if (err.type === "empty_text_parity") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "have" : "has"} empty text in ${langName}`;
    }
    if (err.type === "option_count_mismatch" || err.type === "answer_type_mismatch" || err.type === "not_linked_to_primary") {
      return `"${err.sectionName}" — ${err.detail ?? "parity issue vs primary"}`;
    }
    return "Validation issue";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* AlertDialogContent is fixed and vertically centred with no max height,
          so content taller than the viewport is clipped at BOTH ends with
          nothing to scroll it — and the footer goes with it. This dialog can
          now carry a marks warning, a per-language instructions warning and a
          language list at once, so an advisory banner could have put the
          Publish button out of reach. A warning that blocks publishing is not
          advisory, whatever the copy says. */}
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{isPublishing ? "Publish Exam" : "Unpublish Exam"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="mt-2 outline-none">
              {validating ? (
                <div className="flex justify-center items-center py-6 text-muted-foreground">
                  Evaluating exam content...
                </div>
              ) : isPublishing ? (
                <div className="space-y-4 text-sm text-muted-foreground outline-none">
                  <p>Select the languages you want to publish for "{examName}".</p>
                  {marksWarning && (
                    <div
                      className={
                        marksWarning.severity === "error"
                          ? "flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-400"
                          : "flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400"
                      }
                    >
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <span>{marksWarning.text}</span>
                    </div>
                  )}

                  {/* The instructions disclaimer — same family as the marks
                      warning above, and the same promise: it never gates the
                      Publish button. It sits here because this is the last
                      moment before candidates read the text, and a creator who
                      publishes from the Dashboard never sees the editor's copy
                      of this warning at all. */}
                  {instructionFindings.map((finding) => (
                    <div
                      key={finding.lang + finding.headline}
                      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400"
                    >
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <div className="min-w-0 flex-1">
                        <p className="leading-relaxed">
                          <span className="font-semibold">
                            {finding.langName ? `${finding.langName} — ` : ""}
                            {finding.headline}{" "}
                          </span>
                          {finding.body}
                        </p>
                        {finding.canFix && (
                          <button
                            type="button"
                            disabled={regeneratingLang !== null}
                            onClick={() => regenerateInstruction(finding.lang)}
                            className="mt-1.5 font-semibold underline hover:text-amber-900 dark:hover:text-amber-300 disabled:opacity-50"
                          >
                            {regeneratingLang === finding.lang ? "Rewriting…" : "Regenerate from exam"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* The undo offer stands on its own after the warning it
                      resolved has gone: the creator has just had prose replaced
                      by a machine, seconds before publishing it. */}
                  {Object.keys(undoableText).map((lang) => (
                    <div
                      key={`undo-${lang}`}
                      className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-400"
                    >
                      <span className="shrink-0 mt-0.5">✓</span>
                      <div className="min-w-0 flex-1">
                        <p className="leading-relaxed">
                          The {getLangName(lang)} Exam Instruction now describes the paper as it
                          stands. Your previous wording was replaced.
                        </p>
                        <button
                          type="button"
                          disabled={regeneratingLang !== null}
                          onClick={() => undoRegeneration(lang)}
                          className="mt-1.5 font-semibold underline hover:text-emerald-900 dark:hover:text-emerald-300 disabled:opacity-50"
                        >
                          {regeneratingLang === lang ? "Restoring…" : "Undo — put back what was here before"}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <span className="font-semibold text-foreground">Select All Valid</span>
                      <Switch
                        checked={
                          selectedLangsForPublish.length > 0 &&
                          selectedLangsForPublish.length ===
                            supportedLangsToPublish.filter((l) => publishLangErrors[l]?.length === 0).length
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLangsForPublish(
                              supportedLangsToPublish.filter((l) => publishLangErrors[l]?.length === 0)
                            );
                          } else {
                            setSelectedLangsForPublish([]);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-4">
                      {supportedLangsToPublish.map((lang) => {
                        const hasErrors = publishLangErrors[lang] && publishLangErrors[lang].length > 0;
                        const langName = getLangName(lang);

                        return (
                          <div key={lang} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={hasErrors ? "text-destructive font-medium" : "text-foreground"}>
                                  {langName}
                                </span>
                                {hasErrors && (
                                  <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
                                    {publishLangErrors[lang].length} issue
                                    {publishLangErrors[lang].length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              <Switch
                                checked={selectedLangsForPublish.includes(lang)}
                                disabled={hasErrors}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedLangsForPublish((prev) => [...prev, lang]);
                                  } else {
                                    setSelectedLangsForPublish((prev) => prev.filter((l) => l !== lang));
                                  }
                                }}
                              />
                            </div>
                            {hasErrors && (
                              <div className="space-y-2 rounded-md bg-red-50 border border-red-200 p-3">
                                {publishLangErrors[lang].map((err, i) => (
                                  <div key={i} className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-red-700 leading-relaxed">
                                      {getErrorMessage(err, langName)}
                                    </span>
                                    {(err.type === "blank_questions" || err.type === "invalid_question" || err.type === "missing_answer") && onNavigateToQuestion && (
                                      <button
                                        type="button"
                                        className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800 underline whitespace-nowrap"
                                        onClick={() => {
                                          onOpenChange(false);
                                          onNavigateToQuestion(err.sectionId, err.qNos[0]);
                                        }}
                                      >
                                        Go fix →
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="block mt-2">
                  Are you sure you want to unpublish "{examName}"? This will remove the exam from the Marketplace.
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Closing mid-rewrite would leave the row changed with the undo
              offer gone — from the Dashboard, with nothing to show what
              happened. */}
          <AlertDialogCancel disabled={loading || regeneratingLang !== null}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleExecute}
            disabled={validating || loading || regeneratingLang !== null}
            className={isPublishing ? "bg-primary" : "bg-orange-500 hover:bg-orange-600"}
          >
            {loading ? "Saving..." : isPublishing ? "Publish" : "Unpublish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
