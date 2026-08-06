/**
 * reportInsights.js — the arithmetic behind the post-session analytics tabs.
 *
 * Everything here is a pure function of rows the creator can already read
 * (their RLS policies date back to the first live-exam migration), which is
 * what lets the deep-dive tabs exist with no new migration and no new RPC.
 *
 * Two ground-truth choices worth stating:
 *
 * RECOMPUTE PER-STUDENT NUMBERS FROM RESPONSES, don't trust participant
 * totals. `live_participants.total_correct` is written by
 * compute_live_rankings, which runs from the creator's tab on a timer — a
 * closed laptop at the wrong moment leaves totals stale while the response
 * rows underneath are complete. Responses are written synchronously by the
 * submit RPC and are therefore the record.
 *
 * ASKED ≠ AUTHORED. A session can end on question 7 of 40. Every view here
 * sizes itself on how many questions actually ran — derived from the pacing
 * log and the responses, never from the length of the question list.
 */

/**
 * A student has "dropped off" when they answered something and then missed at
 * least this many questions at the end of the session in a row.
 */
export const DROPOFF_TAIL = 2;

/** "Check in on" thresholds. Constants because a classroom will argue with them. */
export const LOW_ACCURACY_PCT = 50;
export const LOW_ACCURACY_MIN_ANSWERS = 3;
export const CONFUSION_REPEAT = 2;
export const CHECK_ON_MAX = 5;

/** @param {number[]} nums */
export function median(nums) {
  if (!nums || nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How many questions actually ran.
 *
 * The pacing log is authoritative (one row per unlock that was not undone),
 * but a pre-v2 session has no unlock log, so responses and analytics rows
 * vote too. The answer is the highest ordinal anyone can prove, plus one.
 *
 * @param {{
 *   pacing?: {ordinal?: number, question_ordinal?: number}[],
 *   responses?: {question_ordinal: number}[],
 *   analyticsOrdinals?: number[],
 * }} input
 * @returns {number}
 */
export function askedQuestionCount({ pacing = [], responses = [], analyticsOrdinals = [] } = {}) {
  let max = -1;
  for (const p of pacing) {
    const o = Number(p?.ordinal ?? p?.question_ordinal);
    if (Number.isInteger(o) && o > max) max = o;
  }
  for (const r of responses) {
    const o = Number(r?.question_ordinal);
    if (Number.isInteger(o) && o > max) max = o;
  }
  for (const o of analyticsOrdinals) {
    if (Number.isInteger(o) && o > max) max = o;
  }
  return max + 1;
}

/**
 * Questions in play order, each joined to its analytics row (or null when the
 * question never ran / analytics never computed).
 *
 * The ordinal IS the array index: `questions` must be the primary-language
 * list ordered by (global_index, q_no, id) — the same ordering every server
 * ordinal is derived from, via fetchAllLiveQuestions.
 *
 * @param {{ questions?: any[], analytics?: any[] }} input
 * @returns {{ ordinal: number, question: any, analytics: any|null, accuracyPct: number|null }[]}
 */
export function buildQuestionRows({ questions = [], analytics = [] } = {}) {
  const byId = new Map(analytics.map((a) => [a.live_question_id, a]));
  return questions.map((q, i) => {
    const a = byId.get(q.id) || null;
    const accuracyPct =
      a && a.total_responses > 0 ? Math.round((100 * a.correct_count) / a.total_responses) : null;
    return { ordinal: i, question: q, analytics: a, accuracyPct };
  });
}

/**
 * Points for the difficulty curve: one per asked question, in play order.
 * Questions nobody answered chart as null so the line shows a gap rather
 * than inventing a zero.
 *
 * @param {ReturnType<typeof buildQuestionRows>} questionRows
 * @param {number} askedCount
 * @returns {{ name: string, ordinal: number, accuracy: number|null, correct: number, responses: number }[]}
 */
export function accuracyByOrdinal(questionRows, askedCount) {
  return questionRows.slice(0, Math.max(0, askedCount)).map((row) => ({
    name: `Q${row.ordinal + 1}`,
    ordinal: row.ordinal,
    accuracy: row.accuracyPct,
    correct: row.analytics?.correct_count ?? 0,
    responses: row.analytics?.total_responses ?? 0,
  }));
}

/**
 * Per-student rows, recomputed from the response record.
 *
 * @param {{
 *   participants?: {user_id: string, display_name: string, joined_at: string, rank: number|null}[],
 *   responses?: {user_id: string, question_ordinal: number, is_correct: boolean|null, time_taken_ms: number}[],
 *   confusion?: {user_id: string}[],
 *   askedCount?: number,
 * }} input
 */
export function buildStudentRows({
  participants = [],
  responses = [],
  confusion = [],
  askedCount = 0,
} = {}) {
  /** @type {Map<string, any[]>} */
  const byUser = new Map();
  for (const r of responses) {
    const list = byUser.get(r.user_id);
    if (list) list.push(r);
    else byUser.set(r.user_id, [r]);
  }
  const confusionByUser = new Map();
  for (const c of confusion) {
    confusionByUser.set(c.user_id, (confusionByUser.get(c.user_id) || 0) + 1);
  }

  return participants.map((p) => {
    const own = byUser.get(p.user_id) || [];
    const answered = own.length;
    const correct = own.filter((r) => r.is_correct === true).length;
    const accuracyPct = answered > 0 ? Math.round((100 * correct) / answered) : null;
    const avgTimeMs =
      answered > 0
        ? Math.round(own.reduce((s, r) => s + (Number(r.time_taken_ms) || 0), 0) / answered)
        : null;
    let lastAnsweredOrdinal = -1;
    for (const r of own) {
      const o = Number(r.question_ordinal);
      if (Number.isInteger(o) && o > lastAnsweredOrdinal) lastAnsweredOrdinal = o;
    }
    const neverAnswered = answered === 0;
    const missedTail = askedCount - 1 - lastAnsweredOrdinal;
    const droppedOff = !neverAnswered && missedTail >= DROPOFF_TAIL;

    return {
      userId: p.user_id,
      name: p.display_name,
      rank: p.rank ?? null,
      joinedAt: p.joined_at,
      answered,
      correct,
      accuracyPct,
      avgTimeMs,
      lastAnsweredOrdinal,
      neverAnswered,
      droppedOff,
      confusionCount: confusionByUser.get(p.user_id) || 0,
      responses: own,
    };
  });
}

/**
 * Student × question grid.
 *
 * Cell states: 'correct' | 'wrong' | 'answered' | 'skipped'. 'answered' is a
 * response whose is_correct is null — impossible after a normal session end,
 * but the state exists so bad data renders as "answered, outcome unknown"
 * instead of silently counting as wrong.
 *
 * @param {{ studentRows?: ReturnType<typeof buildStudentRows>, askedCount?: number }} input
 * @returns {{ userId: string, name: string, cells: {state: string, timeMs: number|null}[] }[]}
 */
export function buildHeatmap({ studentRows = [], askedCount = 0 } = {}) {
  return studentRows.map((s) => {
    const cells = Array.from({ length: Math.max(0, askedCount) }, () => ({
      state: "skipped",
      timeMs: null,
    }));
    for (const r of s.responses) {
      const o = Number(r.question_ordinal);
      if (!Number.isInteger(o) || o < 0 || o >= cells.length) continue;
      cells[o] = {
        state: r.is_correct === true ? "correct" : r.is_correct === false ? "wrong" : "answered",
        timeMs: Number(r.time_taken_ms) || null,
      };
    }
    return { userId: s.userId, name: s.name, cells };
  });
}

/**
 * The short list a teacher acts on: who to talk to tomorrow, and why in words.
 *
 * @param {ReturnType<typeof buildStudentRows>} studentRows
 * @param {{ max?: number }} [opts]
 * @returns {{ row: any, reasons: string[], severity: number }[]}
 */
export function studentsToCheckOn(studentRows, { max = CHECK_ON_MAX } = {}) {
  const flagged = [];
  for (const row of studentRows) {
    const reasons = [];
    let severity = 0;
    if (row.neverAnswered) {
      reasons.push("joined but never answered");
      severity += 3;
    }
    if (
      row.accuracyPct !== null &&
      row.accuracyPct < LOW_ACCURACY_PCT &&
      row.answered >= LOW_ACCURACY_MIN_ANSWERS
    ) {
      reasons.push(`${row.accuracyPct}% accuracy`);
      severity += 2;
    }
    if (row.droppedOff) {
      reasons.push(`stopped answering after Q${row.lastAnsweredOrdinal + 1}`);
      severity += 2;
    }
    if (row.confusionCount >= CONFUSION_REPEAT) {
      reasons.push(`said "I'm lost" ${row.confusionCount} times`);
      severity += 1;
    }
    if (reasons.length > 0) flagged.push({ row, reasons, severity });
  }
  return flagged
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        (a.row.accuracyPct ?? 101) - (b.row.accuracyPct ?? 101) ||
        String(a.row.name).localeCompare(String(b.row.name))
    )
    .slice(0, max);
}

/**
 * The three headline numbers the recap's four tiles don't cover.
 *
 * @param {{ studentRows?: ReturnType<typeof buildStudentRows>, askedCount?: number }} input
 * @returns {{ medianCorrect: number|null, participationPct: number|null, dropOffCount: number }}
 */
export function overviewExtras({ studentRows = [], askedCount = 0 } = {}) {
  const medianCorrect = median(studentRows.map((s) => s.correct));
  // Per-student share clamped at 1: a response row whose ordinal is beyond
  // askedCount (inconsistent data) must not push participation past 100%.
  const participationPct =
    askedCount > 0 && studentRows.length > 0
      ? Math.round(
          (100 * studentRows.reduce((s, r) => s + Math.min(1, r.answered / askedCount), 0)) /
            studentRows.length
        )
      : null;
  const dropOffCount = studentRows.filter((s) => s.droppedOff || s.neverAnswered).length;
  return { medianCorrect, participationPct, dropOffCount };
}

/**
 * One row per asked question, describing how the room was paced.
 *
 * `extra_seconds` carries its sign on purpose (see LiveExamReport's pacing
 * comment): positive is granted time, negative is a question closed early via
 * "time's up". The talk gap is the stretch between one question's deadline
 * and the next unlock — the time the creator spent explaining. The last
 * question's gap runs to ended_at when it is known.
 *
 * @param {{
 *   pacing?: {ordinal: number, unlocked_at: string, extra_seconds: number, undo_count?: number}[],
 *   questions?: {time_seconds: number}[],
 *   endedAt?: string|null,
 * }} input
 */
export function pacingRows({ pacing = [], questions = [], endedAt = null } = {}) {
  const sorted = [...pacing].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  return sorted.map((p, i) => {
    const q = questions[p.ordinal] || null;
    const plannedSeconds = q ? Number(q.time_seconds) || 0 : null;
    const extra = Number(p.extra_seconds) || 0;
    const grantedSeconds = Math.max(0, extra);
    const closedEarly = extra < 0;
    /** How long the question was actually open (planned + signed extra). */
    const windowSeconds =
      plannedSeconds !== null ? Math.max(0, plannedSeconds + extra) : null;

    let talkGapSeconds = null;
    const unlockedMs = p.unlocked_at ? new Date(p.unlocked_at).getTime() : NaN;
    const nextMs =
      i + 1 < sorted.length
        ? new Date(sorted[i + 1].unlocked_at).getTime()
        : endedAt
          ? new Date(endedAt).getTime()
          : NaN;
    if (Number.isFinite(unlockedMs) && Number.isFinite(nextMs) && windowSeconds !== null) {
      talkGapSeconds = Math.max(0, Math.round((nextMs - unlockedMs) / 1000 - windowSeconds));
    }

    return {
      ordinal: p.ordinal,
      plannedSeconds,
      grantedSeconds,
      closedEarly,
      cutSeconds: closedEarly ? -extra : 0,
      windowSeconds,
      talkGapSeconds,
      undoCount: Number(p.undo_count) || 0,
    };
  });
}
