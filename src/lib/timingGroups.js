/**
 * timingGroups.js — the arithmetic behind section timing groups ("Session I:
 * two subjects, one 45-minute pool").
 *
 * Plain JS (no imports) on purpose, same as examNavigation.js: every rule here
 * is exercised directly by node in src/__tests__/section-timing-groups.test.mjs,
 * with no bundler and no DOM.
 *
 * The model: in LOCKED mode (allow_section_switching off) the paper is a
 * sequence of TIMING UNITS, derived by walking the sitting language's sections
 * in sort order and coalescing consecutive runs that share a timing group.
 *
 *   solo unit   one ungrouped section — its own time_minutes, exactly the
 *               locked behavior every existing exam already has.
 *   group unit  2+ adjacent sections sharing one pool — free movement between
 *               them, one clock (the group's time_minutes, else the sum of the
 *               members'). Between units, locked rules hold: sat in order,
 *               a submitted unit stays closed, time never carries over.
 *
 * FREE mode (allow_section_switching = true) is the whole paper on one clock —
 * a grouping inside it means nothing, so every caller checks isFreeNavigation
 * FIRST and only derives units when the paper is locked. These functions never
 * read allow_section_switching themselves; keeping that gate in one place
 * (examNavigation.isFreeNavigation) is what lets its absent-means-locked rule
 * stay the single source of truth.
 *
 * The language rule: timing_group_id is stored on PRIMARY-language section
 * rows ONLY. Secondary rows derive their grouping through the language-twin
 * link (section_group_id → primary twin → its timing_group_id) — the same
 * single-source shape the marks module uses for scoring config, and for the
 * same reason: one copy of the structure cannot go out of sync between
 * languages. resolveTimingGroupIds below is that derivation.
 *
 * Absent means ungrouped, everywhere: the migration is applied by hand, so the
 * app routinely reads section rows with no timing_group_id key at all, and a
 * groups fetch against a database without the table simply errors into [].
 * Every function here treats missing/null/unknown as "no grouping", which is
 * byte-for-byte the behavior every existing exam already has.
 */

/** @typedef {{ id: string, name?: string, time_minutes?: number|null, language?: string|null, section_group_id?: string|null, timing_group_id?: string|null }} GroupableSectionLike */
/** @typedef {{ id: string, name?: string, name_translations?: Record<string, string>|null, time_minutes?: number|null }} TimingGroupLike */
/**
 * @typedef {Object} TimingUnit
 * @property {"solo"|"group"} kind
 * @property {string|null} groupId       The timing group id, group units only.
 * @property {TimingGroupLike|null} group The group row, group units only.
 * @property {string[]} sectionIds       Members in paper order. Solo units hold one.
 * @property {number} minutes            The unit's clock. 0 = unset (callers show "—", never NaN).
 */

/**
 * Which timing group does each section belong to, for EVERY language row?
 *
 * Primary-language rows read their own column; secondary rows resolve through
 * their language twin. A row with no twin link (legacy single-language data)
 * or no primary counterpart resolves to ungrouped — defensive, never a crash.
 *
 * @param {GroupableSectionLike[]|null|undefined} allSections  Every language's rows.
 * @param {string|null|undefined} primaryLanguage
 * @returns {Map<string, string>} sectionId → timingGroupId (ungrouped ids absent)
 */
export function resolveTimingGroupIds(allSections, primaryLanguage) {
  const resolved = new Map();
  if (!Array.isArray(allSections) || allSections.length === 0) return resolved;
  const primary = typeof primaryLanguage === "string" && primaryLanguage ? primaryLanguage : "en";

  // A row counts as primary when it says so, or when it predates languages
  // entirely (language null/absent) — the same legacy fallback the pages use.
  const isPrimaryRow = (s) => {
    const lang = s?.language;
    return lang === primary || lang === null || lang === undefined;
  };

  /** section_group_id → timing_group_id, from primary rows only. */
  const byTwinLink = new Map();
  for (const s of allSections) {
    if (!s || !isPrimaryRow(s)) continue;
    const groupId = typeof s.timing_group_id === "string" && s.timing_group_id ? s.timing_group_id : null;
    if (groupId) resolved.set(s.id, groupId);
    if (s.section_group_id && groupId) byTwinLink.set(s.section_group_id, groupId);
  }

  for (const s of allSections) {
    if (!s || isPrimaryRow(s) || resolved.has(s.id)) continue;
    const viaTwin = s.section_group_id ? byTwinLink.get(s.section_group_id) : undefined;
    if (viaTwin) resolved.set(s.id, viaTwin);
  }

  return resolved;
}

/**
 * The one display-name rule, shared by the builder, the runner, the intro,
 * the review page and the instruction engine — so the label a student reads in
 * the instructions is always the label on the screen it describes. Falling
 * back to the primary name is deliberate: a real label in the wrong language
 * beats an invented placeholder.
 *
 * @param {TimingGroupLike|null|undefined} group
 * @param {string} [lang]
 * @returns {string}
 */
export function groupDisplayName(group, lang) {
  if (!group) return "";
  const translated = group.name_translations?.[lang];
  if (typeof translated === "string" && translated.trim()) return translated;
  return typeof group.name === "string" ? group.name : "";
}

/**
 * A section's positive clock, or 0. Mirrors sumSectionMinutes' tolerance.
 * @param {GroupableSectionLike|null|undefined} section
 */
function positiveMinutes(section) {
  const minutes = Number(section?.time_minutes);
  return Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
}

/**
 * A group's pool: the explicit override when usable, else the member sum —
 * the same override-or-sum rule totalExamMinutes already follows.
 * @param {TimingGroupLike|null|undefined} group
 * @param {GroupableSectionLike[]} members
 * @returns {number} minutes, 0 = unset
 */
export function groupPoolMinutes(group, members) {
  const chosen = Number(group?.time_minutes);
  if (Number.isFinite(chosen) && chosen > 0) return Math.floor(chosen);
  return (Array.isArray(members) ? members : []).reduce(
    (total, s) => total + positiveMinutes(s),
    0
  );
}

/**
 * Coalesce one language's sections (already in sort order) into timing units.
 *
 * LOCKED-mode structure only — callers check isFreeNavigation first; in free
 * mode the whole paper is one clock and grouping means nothing.
 *
 * Rules the tests pin:
 *  • Consecutive sections sharing a resolved group id form one group unit.
 *  • A group id split into two non-adjacent runs (corrupt order) coalesces per
 *    maximal run — two units, never a crash and never a merged skip-over.
 *  • A run of ONE member behaves solo (its own clock): a group that has lost
 *    all but one section must not hand that section a pool it no longer shares.
 *  • Unknown/missing group data (no resolved entry, unknown group id) → solo.
 *
 * @param {GroupableSectionLike[]|null|undefined} sections  ONE language's rows, in paper order.
 * @param {TimingGroupLike[]|null|undefined} groups         The exam's timing group rows.
 * @param {Map<string, string>|null|undefined} resolvedIds  From resolveTimingGroupIds.
 * @returns {TimingUnit[]}
 */
export function timingUnits(sections, groups, resolvedIds) {
  const list = Array.isArray(sections) ? sections.filter(Boolean) : [];
  if (list.length === 0) return [];

  const groupById = new Map();
  for (const g of Array.isArray(groups) ? groups : []) {
    if (g && typeof g.id === "string") groupById.set(g.id, g);
  }

  const groupIdOf = (s) => {
    const id = resolvedIds instanceof Map ? resolvedIds.get(s.id) : undefined;
    // A membership pointing at a group row we cannot see (mid-delete, partial
    // fetch) reads as ungrouped — a solo clock is the behavior that cannot
    // surprise anyone.
    return id && groupById.has(id) ? id : null;
  };

  /** @type {TimingUnit[]} */
  const units = [];
  for (let i = 0; i < list.length; ) {
    const groupId = groupIdOf(list[i]);
    if (!groupId) {
      units.push({
        kind: "solo",
        groupId: null,
        group: null,
        sectionIds: [list[i].id],
        minutes: positiveMinutes(list[i]),
      });
      i += 1;
      continue;
    }
    // Maximal contiguous run of this group.
    const members = [];
    let j = i;
    while (j < list.length && groupIdOf(list[j]) === groupId) {
      members.push(list[j]);
      j += 1;
    }
    if (members.length === 1) {
      units.push({
        kind: "solo",
        groupId: null,
        group: null,
        sectionIds: [members[0].id],
        minutes: positiveMinutes(members[0]),
      });
    } else {
      units.push({
        kind: "group",
        groupId,
        group: groupById.get(groupId) ?? null,
        sectionIds: members.map((s) => s.id),
        minutes: groupPoolMinutes(groupById.get(groupId), members),
      });
    }
    i = j;
  }
  return units;
}

/**
 * @param {TimingUnit[]|null|undefined} units
 * @param {string|null|undefined} sectionId
 * @returns {TimingUnit|null}
 */
export function unitContaining(units, sectionId) {
  if (!Array.isArray(units) || !sectionId) return null;
  return units.find((u) => u.sectionIds.includes(sectionId)) ?? null;
}

/** Does this paper actually use grouping — is there at least one real group unit? */
export function hasGroupUnits(units) {
  return Array.isArray(units) && units.some((u) => u.kind === "group");
}

/**
 * The paper's total under grouping: pools once per group, solo clocks as-is.
 * (sumSectionMinutes would double-represent an overridden pool.)
 * @param {TimingUnit[]|null|undefined} units
 * @returns {number} minutes, never negative
 */
export function sumUnitMinutes(units) {
  if (!Array.isArray(units)) return 0;
  return units.reduce((total, u) => total + (Number.isFinite(u?.minutes) && u.minutes > 0 ? u.minutes : 0), 0);
}

/**
 * Membership repair after a drag in the builder — the contiguity invariant.
 *
 * Groups must stay contiguous runs, and a single-item drag can break that in
 * exactly two ways, each with one predictable fix:
 *
 *   • The dragged section lands STRICTLY INSIDE another group's run (a member
 *     of that group on BOTH sides) → it joins that group. Dropping something
 *     into the middle of Session I and not being in Session I would give the
 *     student a section sandwiched between two halves of one clock.
 *   • The dragged section is a member and lands touching NO member of its own
 *     group → it leaves the group. (Its old neighbours close ranks, so the
 *     remaining members are still contiguous.)
 *
 * Landing at the EDGE of a foreign group (member on one side only) joins
 * nothing — edges are ambiguous and silently growing a shared clock is worse
 * than making the creator drop one slot further in.
 *
 * @param {GroupableSectionLike[]} orderedSections  ONE language's rows, in the NEW order.
 * @param {string} draggedId
 * @param {Map<string, string>} resolvedIds         sectionId → timingGroupId (this language).
 * @returns {{ sectionId: string, timingGroupId: string|null }|null} the one change, or null
 */
export function membershipChangeAfterReorder(orderedSections, draggedId, resolvedIds) {
  const list = Array.isArray(orderedSections) ? orderedSections : [];
  const at = list.findIndex((s) => s?.id === draggedId);
  if (at === -1) return null;

  const groupOf = (index) => {
    const s = list[index];
    if (!s) return null;
    const id = resolvedIds instanceof Map ? resolvedIds.get(s.id) : undefined;
    return id ?? null;
  };

  const own = groupOf(at);
  const before = at > 0 ? groupOf(at - 1) : null;
  const after = at < list.length - 1 ? groupOf(at + 1) : null;

  // Strictly inside a foreign group: join it.
  if (before !== null && before === after && before !== own) {
    return { sectionId: draggedId, timingGroupId: before };
  }
  // A member that no longer touches its own group: leave it.
  if (own !== null && before !== own && after !== own) {
    return { sectionId: draggedId, timingGroupId: null };
  }
  return null;
}
