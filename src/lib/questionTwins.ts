/**
 * questionTwins.ts — keep a question's language twins structurally in step.
 *
 * A bilingual paper stores one parsed_questions row per language, linked by
 * question_group_id. The owner's rule: STRUCTURE — a question existing, being
 * excluded, its final order — is decided in the primary language and mirrored
 * to every twin; a secondary language edits CONTENT only.
 *
 * Until now each site hand-rolled its own mirror (ExamDetail's add and delete
 * did; ManualFixEditor's add and exclude did not, and the AI add created no twin
 * at all). One helper, so the shape of a placeholder and the scope of a mirror
 * cannot drift between pages.
 */

import { supabase } from "@/integrations/supabase/client";

/** The fields a placeholder copies from the primary row just inserted. */
export type TwinSource = {
  question_group_id: string | null;
  answer_type: string;
  options?: unknown;
  correct_answer?: unknown;
  option_image_urls?: (string | null)[] | null;
};

/**
 * Ids of the other-language sections in the same section group. Empty for a
 * single-language exam or a section with no group, which makes every mirror
 * below a no-op — the callers need no isMultiLang branch of their own.
 */
export async function fetchSiblingSectionIds(
  sectionId: string,
  sectionGroupId: string | null | undefined
): Promise<string[]> {
  if (!sectionGroupId) return [];
  const { data } = await supabase
    .from("sections")
    .select("id")
    .eq("section_group_id", sectionGroupId)
    .neq("id", sectionId);
  return (data || []).map((s: { id: string }) => s.id);
}

/**
 * One empty placeholder per sibling section for a question just inserted in the
 * primary language. Faithful to the block ExamDetail.handleAddQuestion always
 * ran: the translator fills the text; option COUNT and the answer key are
 * carried (the key is a set of indices, so it means the same thing in every
 * language); figures are language-independent and ride along; q_no is the
 * sibling's next free number.
 */
export async function createTwinPlaceholders(
  primary: TwinSource,
  siblingSectionIds: string[]
): Promise<void> {
  if (!primary.question_group_id || siblingSectionIds.length === 0) return;

  const isChoice = primary.answer_type === "single" || primary.answer_type === "multi";
  const blankOptions = Array.isArray(primary.options)
    ? (primary.options as unknown[]).map(() => "")
    : ["", ""];

  for (const sectionId of siblingSectionIds) {
    const { count } = await supabase
      .from("parsed_questions")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId);

    await supabase.from("parsed_questions").insert({
      section_id: sectionId,
      q_no: (count || 0) + 1,
      text: "",
      answer_type: primary.answer_type,
      options: isChoice ? blankOptions : null,
      correct_answer: primary.correct_answer,
      ...(primary.option_image_urls ? { option_image_urls: primary.option_image_urls } : {}),
      requires_review: true,
      is_excluded: false,
      is_finalized: false,
      question_group_id: primary.question_group_id,
    } as any);
  }
}

/**
 * Apply a structural change made on the primary row to its twins — the exclude
 * flag, the finalised order. Scoped to the sibling sections so a stray
 * question_group_id can never reach another exam's rows. A legacy row with no
 * group id has no twins to reach; it is left alone rather than guessed at.
 */
export async function mirrorToTwins(
  questionGroupId: string | null | undefined,
  siblingSectionIds: string[],
  patch: Record<string, unknown>
): Promise<void> {
  if (!questionGroupId || siblingSectionIds.length === 0) return;
  await supabase
    .from("parsed_questions")
    .update(patch)
    .eq("question_group_id", questionGroupId)
    .in("section_id", siblingSectionIds);
}
