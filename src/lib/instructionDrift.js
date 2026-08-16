/**
 * instructionDrift.js — "does the written Exam Instruction still describe this
 * paper?", asked in one place.
 *
 * The editor asks about the tab in front of the creator, from state that may be
 * a keystroke ahead of the row. The publish dialog asks about the languages
 * about to go live, from a row it just fetched — and on the Dashboard there is
 * no editor state to ask about at all. The question differs; the derivation
 * must not. Two screens deriving this separately is how one warns about a paper
 * the other thinks is fine, at the exact moment the creator is deciding whether
 * to publish it.
 *
 * Plain .js with no React or Supabase imports, like its pure siblings, so the
 * tests can assert on real drift sentences in bare Node.
 */
import { auditInstructionTiming, describeTimingDrift } from "./instructionTimingAudit.js";
import { reconcileTimingLine } from "./examInstructionEngine.js";
import { hasGroupUnits, timingUnits } from "./timingGroups.js";

/**
 * The timing half of the question — free, because how a paper is clocked is
 * already in hand wherever this is called. The counts half needs a fetch and
 * lives in auditInstructionShape; callers that have paid for facts pass its
 * answer alongside this one.
 *
 * @param {{
 *   text: string,
 *   sections: Array<{id: string, name: string, time_minutes: number}>,
 *   resolvedGroupIds: Map<string, string>,
 *   timingGroups: Array<{id: string, time_minutes: number|null}>,
 *   groups: Record<string, {name: string, minutes: number|null}>|null,
 *   allowSectionSwitching: boolean,
 *   totalMinutes: number|null,
 *   lang: string,
 * }} input
 * @returns {{drift: string, autoCorrected: boolean}|null}
 */
export function auditInstructionDrift({
  text,
  sections,
  resolvedGroupIds,
  timingGroups,
  groups,
  allowSectionSwitching,
  totalMinutes,
  lang,
}) {
  const rows = Array.isArray(sections) ? sections : [];
  const allGroups = Array.isArray(timingGroups) ? timingGroups : [];

  // Grouped papers audit against UNIT clocks (pools once per group, solo
  // clocks as-is) — a grouped member's own minutes is a number no candidate
  // ever sees, so prose claiming it must be flagged, not allowed. Units are
  // derived ONLY in locked mode: an array of all-solo units would push
  // auditInstructionTiming down its grouped branch and invent drift.
  const units =
    !allowSectionSwitching && allGroups.length > 0
      ? timingUnits(rows, allGroups, resolvedGroupIds)
      : [];

  const drift = describeTimingDrift(
    auditInstructionTiming(text, {
      allowSectionSwitching,
      totalMinutes,
      sectionMinutes: rows.map((s) => s.time_minutes),
      unitMinutes: hasGroupUnits(units) ? units.map((u) => u.minutes) : null,
    })
  );
  if (!drift) return null;

  // Whether the intro can fix this sentence for candidates on the fly, which
  // decides what to ask of the creator: regenerate the whole text, or edit a
  // sentence only they can rewrite.
  const { changed: autoCorrected } = reconcileTimingLine(
    text || "",
    {
      sections: rows.map((s) => ({
        name: s.name,
        minutes: s.time_minutes,
        questionCount: null,
        groupId: resolvedGroupIds.get(s.id) ?? null,
      })),
      allowSectionSwitching,
      totalMinutes,
      groups,
      marking: null,
      answerTypes: null,
      languageNames: null,
    },
    lang
  );
  return { drift, autoCorrected };
}
