/**
 * attemptFiling.ts — lazy filing of abandoned attempts (resume feature, piece 2).
 *
 * There is no scheduler on this stack (no pg_cron, no edge cron), so nothing
 * can auto-submit an abandoned attempt at the moment its window closes. The
 * agreed design: the attempt is SEALED the moment its rules say so — the
 * clock's deadline passing, or the 5-minute return window (enforced at resume
 * time by ExamSimulator) — and the PAPERWORK happens at the first opportunity
 * anyone's device gives us:
 *
 *   • the student's own next visit (Marketplace / Analytics mount) files every
 *     expired attempt of theirs, once per tab session;
 *   • the simulator's seal path files a specific sitting before starting the
 *     replacement attempt.
 *
 * Filing goes through saveExamAttempt with the attempt's STORED responses —
 * the same path a live submit takes — so the filed attempt is graded by the
 * server, gets its marks computed by the marks engine, and lands in rankings
 * as a completely normal sitting (the owner's decision: a timed-out attempt
 * is a normal attempt).
 *
 * COST: one SELECT per tab session to ask "anything to file?" (skipped
 * entirely for signed-out visitors — getSession is the local cache, no
 * network). The per-attempt work only happens when something was actually
 * abandoned, which is rare and cold.
 */

import { supabase } from "@/integrations/supabase/client";
import { studentQuestionsRelation } from "@/lib/dbFeatures";
import { saveExamAttempt, type QuestionState } from "./examService";

const SESSION_FLAG = "expiredAttemptsFiledThisSession";

type FilableAttempt = {
  id: string;
  section_id: string;
  time_spent_seconds: number | null;
};

/** Build the submit payload from what the abandoned sitting left behind. */
async function fileOne(userId: string, attempt: FilableAttempt): Promise<void> {
  // The full served-question list, so never-reached questions are graded as
  // skipped (they take the skip penalty — a timed-out attempt covers the whole
  // paper, per the agreed spec). The student view carries no answer keys; on a
  // database without it, the base table serves the same ids.
  const relation = await studentQuestionsRelation();
  const { data: questionRows } = await supabase
    .from(relation as any)
    .select("id")
    .eq("section_id", attempt.section_id)
    .eq("is_excluded", false);

  const { data: savedRows } = await supabase
    .from("responses")
    .select("*")
    .eq("attempt_id", attempt.id);

  const questionStates: Record<string, QuestionState> = {};
  let timeFromRows = 0;
  for (const r of (savedRows || []) as any[]) {
    questionStates[r.question_id] = {
      selectedAnswer: r.selected_answer ?? null,
      isMarkedForReview: !!r.is_marked_for_review,
      timeSpentSeconds: r.time_spent_seconds || 0,
      status: r.status ?? "untouched",
    } as QuestionState;
    timeFromRows += r.time_spent_seconds || 0;
  }

  // Prefer the section's real question list; an empty read (RLS on an
  // unpublished exam, mid-migration) falls back to the answered rows so the
  // work that WAS saved still files.
  const questions =
    questionRows && questionRows.length > 0
      ? (questionRows as any[]).map((q) => ({ id: q.id }))
      : Object.keys(questionStates).map((id) => ({ id }));
  if (questions.length === 0) return; // nothing served, nothing to file

  await saveExamAttempt({
    userId,
    sectionId: attempt.section_id,
    attemptId: attempt.id,
    // Time is what the sitting tracked, never the paperwork delay: a paper
    // filed a week later must not claim a week was spent on it.
    timeSpentSeconds: attempt.time_spent_seconds || timeFromRows,
    questions,
    questionStates,
  } as any);
}

async function fileRows(userId: string, rows: FilableAttempt[]): Promise<number> {
  let filed = 0;
  for (const row of rows) {
    // Per-attempt tolerance: one failed filing (network blip, deleted section)
    // must not block the rest — it simply retries on the next opportunity.
    try {
      await fileOne(userId, row);
      filed++;
    } catch (e) {
      console.warn("attempt filing failed; will retry next visit", row.id, e);
    }
  }
  return filed;
}

let sweepInFlight: Promise<number> | null = null;

/**
 * File every expired attempt the signed-in student left behind. Deadline-
 * passed ONLY — an attempt whose clock is still running is never touched, so
 * a sweep on one device can never file a sitting live on another.
 */
export async function fileExpiredAttempts(): Promise<number> {
  try {
    if (sessionStorage.getItem(SESSION_FLAG)) return 0;
  } catch {
    /* storage-less environments just sweep */
  }
  if (sweepInFlight) return sweepInFlight;

  sweepInFlight = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return 0;

    const { data, error } = await supabase
      .from("attempts")
      .select("id, section_id, time_spent_seconds")
      .eq("user_id", userId)
      .is("submitted_at", null)
      .not("clock_deadline_at", "is", null)
      .lt("clock_deadline_at", new Date().toISOString());
    if (error) return 0; // pre-clock databases have nothing filable

    try {
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* best-effort */
    }
    if (!data || data.length === 0) return 0;
    return fileRows(userId, data as FilableAttempt[]);
  })().finally(() => {
    sweepInFlight = null;
  });
  return sweepInFlight;
}

/**
 * The 5-minute seal (resume piece 1): file THIS scope's open sitting —
 * expired or not — so the caller's next start is a fresh attempt. Only the
 * simulator calls this, and only after its same-device heartbeat proved the
 * student was away past the window.
 */
export async function sealAndFileSections(
  userId: string,
  sectionIds: string[]
): Promise<number> {
  if (sectionIds.length === 0) return 0;
  const { data, error } = await supabase
    .from("attempts")
    .select("id, section_id, time_spent_seconds")
    .eq("user_id", userId)
    .in("section_id", sectionIds)
    .is("submitted_at", null)
    .not("clock_deadline_at", "is", null);
  if (error || !data || data.length === 0) return 0;
  return fileRows(userId, data as FilableAttempt[]);
}
