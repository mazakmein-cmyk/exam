/**
 * duplicateExamContent.ts — the field-level rules for copying an exam.
 *
 * Two flows duplicate an exam (ExamDetail's page menu and Dashboard's card
 * menu) and each used to hand-list the columns it carried. They drifted, and
 * every drift was silent: one dropped question_group_id, so a bilingual copy
 * failed the publish gate on every question and shipped as English-only; the
 * other dropped option_image_urls and image_region, so figure questions lost
 * their crops. BOTH dropped answer_hint, confidence, final_order and
 * section_label, and neither carried the marks module at all.
 *
 * So the rule here is inverted. Copy EVERY column off the source row except
 * the few that MUST change, which are named below with the reason they are
 * named. A column added to sections or parsed_questions tomorrow rides along
 * on its own — nobody has to remember two call sites.
 */
import { supabase } from "@/integrations/supabase/client";
import { TIMING_GROUP_COLUMN } from "@/lib/timingGroupSettings";

/**
 * Section columns that must not be carried verbatim:
 *  - id, created_at   the copy is a new row
 *  - exam_id          it belongs to the new exam
 *  - section_group_id remapped, so the copy's languages pair with EACH OTHER
 *                     and never reach back into the original
 *  - timing_group_id  copyTimingGroups() builds fresh pools and assigns them.
 *                     Carrying the old id would point the copy's sections at
 *                     the ORIGINAL exam's timing group.
 */
const SECTION_COPY_SKIP = [
  "id",
  "created_at",
  "exam_id",
  "section_group_id",
  TIMING_GROUP_COLUMN,
];

/** Same idea for questions. question_group_id is remapped, never dropped. */
const QUESTION_COPY_SKIP = ["id", "created_at", "section_id", "question_group_id"];

/** Scoring rows are identified by their own id and their foreign key. */
const SCORING_COPY_SKIP = ["id", "created_at", "updated_at"];

function omitColumns(
  row: Record<string, unknown>,
  skip: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!skip.includes(key)) out[key] = value;
  }
  return out;
}

/**
 * Old group id to new group id, minting one new id per distinct source group
 * and reusing it for every row in that group. The caller keeps the map across
 * ALL sections of the paper, which is the whole point: a question's English
 * and Hindi rows live in different sections and must come out sharing one id.
 */
export function remapGroupId(
  sourceGroupId: string | null | undefined,
  map: Map<string, string>
): string | null {
  if (!sourceGroupId) return null;
  if (!map.has(sourceGroupId)) map.set(sourceGroupId, crypto.randomUUID());
  return map.get(sourceGroupId)!;
}

export function buildSectionCopyRow(
  sourceSection: Record<string, unknown>,
  newExamId: string,
  newSectionGroupId: string | null
): Record<string, unknown> {
  return {
    ...omitColumns(sourceSection, SECTION_COPY_SKIP),
    exam_id: newExamId,
    section_group_id: newSectionGroupId,
  };
}

export function buildQuestionCopyRow(
  sourceQuestion: Record<string, unknown>,
  newSectionId: string,
  newQuestionGroupId: string | null
): Record<string, unknown> {
  return {
    ...omitColumns(sourceQuestion, QUESTION_COPY_SKIP),
    section_id: newSectionId,
    question_group_id: newQuestionGroupId,
  };
}

/**
 * Record old question id to new question id for one section's insert, so the
 * marks config can follow the questions it belongs to.
 *
 * PostgREST returns a bulk insert's rows in the order they were supplied, but
 * liveExamService deliberately avoids depending on that, so this does not
 * depend on it either: the pairing is accepted ONLY if the returned q_no
 * sequence matches the supplied one exactly. Anything else leaves the map
 * untouched for this section, and the section simply copies no marks config.
 * A missing override falls back to the exam default; a WRONG one would score
 * a student's paper against another question's marks.
 */
export function pairInsertedQuestionIds(
  sourceRows: { id: string; q_no: number }[],
  insertedRows: { id: string; q_no: number }[] | null | undefined,
  into: Map<string, string>
): void {
  const inserted = insertedRows ?? [];
  if (inserted.length !== sourceRows.length) return;
  const paired = new Map<string, string>();
  for (let i = 0; i < sourceRows.length; i++) {
    if (inserted[i].q_no !== sourceRows[i].q_no) return;
    paired.set(sourceRows[i].id, inserted[i].id);
  }
  for (const [oldId, newId] of paired) into.set(oldId, newId);
}

async function copyScopedScoring(
  table: string,
  fkColumn: string,
  idMap: Map<string, string>
): Promise<void> {
  const sourceIds = Array.from(idMap.keys());
  if (sourceIds.length === 0) return;

  const CHUNK = 200;
  for (let i = 0; i < sourceIds.length; i += CHUNK) {
    const chunk = sourceIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from(table as never)
      .select("*")
      .in(fkColumn, chunk);
    if (error || !data || data.length === 0) continue;

    const rows = (data as unknown as Record<string, unknown>[])
      .map((row) => {
        const newFk = idMap.get(row[fkColumn] as string);
        if (!newFk) return null;
        return { ...omitColumns(row, SCORING_COPY_SKIP), [fkColumn]: newFk };
      })
      .filter((row): row is Record<string, unknown> => row !== null);
    if (rows.length === 0) continue;

    await supabase.from(table as never).insert(rows as never);
  }
}

/**
 * Carry the marks module onto the copy: the exam default, the per-section
 * overrides and the per-question overrides. Duplicating a paper and silently
 * losing its negative marking is exactly the kind of thing a creator finds
 * out about from a student.
 *
 * Strictly additive and fail-soft, like copyTimingGroups. By the time this
 * runs the copy's exam, sections and questions are already committed, and a
 * database without the marks module (or a stale PostgREST cache) must not
 * turn a good duplicate into a failed one.
 */
export async function copyScoringSettings(
  sourceExamId: string,
  newExamId: string,
  sectionIdMap: Map<string, string>,
  questionIdMap: Map<string, string>
): Promise<void> {
  try {
    const { data: examDefault } = await supabase
      .from("exam_scoring_defaults" as never)
      .select("*")
      .eq("exam_id", sourceExamId)
      .maybeSingle();

    if (examDefault) {
      await supabase
        .from("exam_scoring_defaults" as never)
        .insert({
          ...omitColumns(examDefault as Record<string, unknown>, SCORING_COPY_SKIP),
          exam_id: newExamId,
        } as never);
    }

    await copyScopedScoring("section_scoring_defaults", "section_id", sectionIdMap);
    await copyScopedScoring("question_scoring_config", "question_id", questionIdMap);
  } catch {
    // Deliberately swallowed — see the contract above.
  }
}
