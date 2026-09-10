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
 *
 * Every helper THROWS on a database error. The primary write has already
 * happened by the time a mirror runs, so a swallowed failure is the worst
 * outcome: the primary changed, the translation did not, and the creator saw a
 * success toast. Callers already catch and toast `error.message`, so the
 * messages here say exactly which half landed.
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
 * Throws on a read failure: a caller that cannot see the siblings must not go
 * on to make structural changes it cannot mirror.
 */
export async function fetchSiblingSectionIds(
  sectionId: string,
  sectionGroupId: string | null | undefined
): Promise<string[]> {
  if (!sectionGroupId) return [];
  const { data, error } = await supabase
    .from("sections")
    .select("id")
    .eq("section_group_id", sectionGroupId)
    .neq("id", sectionId);
  if (error) throw error;
  return (data || []).map((s: { id: string }) => s.id);
}

/**
 * One empty placeholder per sibling section for a question just inserted in the
 * primary language. The translator fills the text; option COUNT and the answer
 * key are carried (the key is a set of indices, so it means the same thing in
 * every language); figures are language-independent and ride along.
 *
 * Two details that matter for publish parity:
 *  - Option shape MIRRORS the primary exactly: an array of the same length, or
 *    null when the primary has none. Inventing ["", ""] for an options-less
 *    primary gave the twin two options against the primary's zero — an
 *    option_count_mismatch neither editor could repair from the translation.
 *  - q_no is max+1 on the sibling, the same rule ManualFixEditor uses for the
 *    primary. count+1 lands somewhere else the moment a gap exists, so the
 *    pair sat at different positions in the two papers.
 */
export async function createTwinPlaceholders(
  primary: TwinSource,
  siblingSectionIds: string[]
): Promise<void> {
  if (!primary.question_group_id || siblingSectionIds.length === 0) return;

  const isChoice = primary.answer_type === "single" || primary.answer_type === "multi";
  const mirroredOptions =
    isChoice && Array.isArray(primary.options)
      ? (primary.options as unknown[]).map(() => "")
      : null;

  for (const sectionId of siblingSectionIds) {
    const { data: top, error: topError } = await supabase
      .from("parsed_questions")
      .select("q_no")
      .eq("section_id", sectionId)
      .order("q_no", { ascending: false })
      .limit(1);
    if (topError) {
      throw new Error(
        `Saved in the primary language, but its translation placeholder could not be placed: ${topError.message}`
      );
    }
    const nextQNo = ((top?.[0] as { q_no?: number } | undefined)?.q_no ?? 0) + 1;

    const { error } = await supabase.from("parsed_questions").insert({
      section_id: sectionId,
      q_no: nextQNo,
      text: "",
      answer_type: primary.answer_type,
      options: mirroredOptions,
      correct_answer: primary.correct_answer,
      ...(primary.option_image_urls ? { option_image_urls: primary.option_image_urls } : {}),
      requires_review: true,
      is_excluded: false,
      is_finalized: false,
      question_group_id: primary.question_group_id,
    } as any);
    if (error) {
      throw new Error(
        `Saved in the primary language, but creating its translation placeholder failed: ${error.message}`
      );
    }
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
  const { error } = await supabase
    .from("parsed_questions")
    .update(patch)
    .eq("question_group_id", questionGroupId)
    .in("section_id", siblingSectionIds);
  if (error) {
    throw new Error(
      `Changed in the primary language, but mirroring it to the translations failed: ${error.message}`
    );
  }
}
