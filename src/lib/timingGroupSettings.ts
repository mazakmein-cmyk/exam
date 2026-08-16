/**
 * timingGroupSettings.ts — reads and writes for section timing groups, whose
 * table and column arrive by hand-pasted migration
 * (20260824000000_add_section_timing_groups.sql).
 *
 * Same contract as examSettings.ts, for the same reason: naming a column or
 * table PostgREST has not seen fails the WHOLE request, so every write gates
 * on `tableHasColumn` first and reports "missing-migration" instead of losing
 * the creator's save with an opaque error. Reads are absent-tolerant: a fetch
 * against a database without the table resolves to [], which every consumer
 * treats as "no groups" — exactly today's behavior.
 */
import { supabase } from "@/integrations/supabase/client";
import { tableHasColumn } from "@/lib/dbFeatures";

export const TIMING_GROUP_COLUMN = "timing_group_id";
export const TIMING_GROUPS_TABLE = "section_timing_groups";
export const TIMING_GROUPS_MIGRATION = "20260824000000_add_section_timing_groups.sql";

export type TimingGroupRow = {
  id: string;
  exam_id: string;
  name: string;
  name_translations: Record<string, string> | null;
  time_minutes: number | null;
};

export type TimingGroupSaveResult = {
  ok: boolean;
  reason?: "missing-migration" | "error";
  message?: string;
  group?: TimingGroupRow;
};

/**
 * Does the live schema know about timing groups yet? One probe covers both the
 * table and the sections column — they land in the same migration.
 */
export function hasTimingGroupSchema(): Promise<boolean> {
  return tableHasColumn("sections", TIMING_GROUP_COLUMN);
}

/**
 * The exam's timing groups. [] on ANY failure — a database without the table
 * (42P01), a stale PostgREST cache, a network drop — because "no groups" is
 * the safe reading everywhere this is consumed: the paper simply runs in the
 * per-section mode it always had.
 */
export async function fetchTimingGroups(examId: string): Promise<TimingGroupRow[]> {
  try {
    const { data, error } = await supabase
      .from(TIMING_GROUPS_TABLE as never)
      .select("*")
      .eq("exam_id", examId);
    if (error) return [];
    return (data ?? []) as unknown as TimingGroupRow[];
  } catch {
    return [];
  }
}

/**
 * Create a group over the given PRIMARY-language section ids, in one flow:
 * insert the row, then point the members at it. A failure after the insert
 * deletes the orphan row so a retry never finds a half-made group.
 *
 * `poolMinutes` materializes the pool at creation (the builder passes the
 * member sum): the members' own minute boxes give way to the group's clock,
 * so the pool must be a number the creator can SEE and edit, not an invisible
 * sum that would silently change when membership does.
 */
export async function createTimingGroup(
  examId: string,
  name: string,
  primarySectionIds: string[],
  poolMinutes?: number | null
): Promise<TimingGroupSaveResult> {
  if (!(await hasTimingGroupSchema())) return { ok: false, reason: "missing-migration" };

  const pool = Number(poolMinutes);
  const { data, error } = await supabase
    .from(TIMING_GROUPS_TABLE as never)
    .insert({
      exam_id: examId,
      name,
      time_minutes: Number.isFinite(pool) && pool > 0 ? Math.floor(pool) : null,
    } as never)
    .select()
    .single();
  if (error || !data) return { ok: false, reason: "error", message: error?.message };
  const group = data as unknown as TimingGroupRow;

  const { error: memberError } = await supabase
    .from("sections")
    .update({ [TIMING_GROUP_COLUMN]: group.id } as never)
    .in("id", primarySectionIds);
  if (memberError) {
    await supabase.from(TIMING_GROUPS_TABLE as never).delete().eq("id", group.id);
    return { ok: false, reason: "error", message: memberError.message };
  }

  return { ok: true, group };
}

/** Patch a group row (name, name_translations, time_minutes). Partial. */
export async function updateTimingGroup(
  groupId: string,
  patch: Partial<Pick<TimingGroupRow, "name" | "name_translations" | "time_minutes">>
): Promise<TimingGroupSaveResult> {
  if (!(await hasTimingGroupSchema())) return { ok: false, reason: "missing-migration" };
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data, error } = await supabase
    .from(TIMING_GROUPS_TABLE as never)
    .update(patch as never)
    .eq("id", groupId)
    .select()
    .single();
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true, group: data as unknown as TimingGroupRow };
}

/**
 * Point PRIMARY-language sections at a group (or ungroup them with null).
 */
export async function setTimingGroupMembership(
  primarySectionIds: string[],
  groupId: string | null
): Promise<TimingGroupSaveResult> {
  if (!(await hasTimingGroupSchema())) return { ok: false, reason: "missing-migration" };
  if (primarySectionIds.length === 0) return { ok: true };

  const { error } = await supabase
    .from("sections")
    .update({ [TIMING_GROUP_COLUMN]: groupId } as never)
    .in("id", primarySectionIds);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

/**
 * Delete a group. Membership clears itself — sections.timing_group_id is
 * ON DELETE SET NULL — so this never blocks and never leaves pointers behind.
 */
export async function deleteTimingGroup(groupId: string): Promise<TimingGroupSaveResult> {
  if (!(await hasTimingGroupSchema())) return { ok: false, reason: "missing-migration" };
  const { error } = await supabase
    .from(TIMING_GROUPS_TABLE as never)
    .delete()
    .eq("id", groupId);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

/**
 * Copy an exam's timing groups onto its duplicate. Used by BOTH duplicate-exam
 * flows (ExamDetail and Dashboard), like navigationCopyPatch. Quietly a no-op
 * on an un-migrated database — a duplicate there lands ungrouped, which is all
 * that database can express anyway. Membership is rewritten through
 * `sectionIdMap` (old section id → new section id); only mapped members are
 * written, so a partial copy degrades to fewer members, never to a crash.
 */
export async function copyTimingGroups(
  sourceExamId: string,
  newExamId: string,
  sectionIdMap: Map<string, string>,
  sourceSections: { id: string; timing_group_id?: string | null }[]
): Promise<void> {
  if (!(await hasTimingGroupSchema())) return;
  const groups = await fetchTimingGroups(sourceExamId);
  if (groups.length === 0) return;

  for (const group of groups) {
    const memberOldIds = sourceSections
      .filter((s) => s.timing_group_id === group.id)
      .map((s) => s.id);
    const memberNewIds = memberOldIds
      .map((id) => sectionIdMap.get(id))
      .filter((id): id is string => Boolean(id));
    // A pool needs two members. Copying a thinner group would recreate exactly
    // the invisible junk row the builder's pruning exists to remove.
    if (memberNewIds.length < 2) continue;

    const { data, error } = await supabase
      .from(TIMING_GROUPS_TABLE as never)
      .insert({
        exam_id: newExamId,
        name: group.name,
        name_translations: group.name_translations,
        time_minutes: group.time_minutes,
      } as never)
      .select()
      .single();
    if (error || !data) continue;

    await supabase
      .from("sections")
      .update({ [TIMING_GROUP_COLUMN]: (data as unknown as TimingGroupRow).id } as never)
      .in("id", memberNewIds);
  }
}
