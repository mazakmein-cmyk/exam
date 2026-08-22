import { supabase } from "@/integrations/supabase/client";
import type { QuestionState } from "./examService";

/**
 * Saving answers while the exam is still running.
 *
 * Until now nothing was written until the student pressed submit, so a closed
 * tab, a dead battery or a dropped connection lost the whole sitting silently.
 * This writes each answer as it is made, into the same `responses` rows the
 * submit path will later overwrite.
 *
 * Three rules this deliberately follows:
 *
 * 1. IT NEVER WRITES is_correct. A student can read their own responses rows,
 *    so grading mid-exam would hand them an answer key: change an option, read
 *    the row back, see whether it says true. Grading stays in the submit path.
 *    Rows left behind by an abandoned attempt therefore carry is_correct NULL,
 *    which the analytics summary already re-grades server-side.
 *
 * 2. IT IS NEVER FATAL. A failed flush must not interrupt someone sitting an
 *    exam, and it costs nothing: the submit path rewrites every row anyway. The
 *    only cost of a lost flush is that an ABANDONED attempt misses those
 *    answers, which is still strictly better than losing all of them.
 *
 * 3. IT UPSERTS. This requires the unique index from
 *    20260829000000_responses_one_row_per_question.sql. Without it Postgres
 *    rejects the ON CONFLICT target and every flush would APPEND, so one
 *    sitting would pile up thousands of rows. The index is a hard prerequisite,
 *    not an optimisation — see `progressSaveSupported`.
 */

/** How long to wait after the last change before writing. */
const FLUSH_DEBOUNCE_MS = 1500;

export type ProgressRow = {
  attempt_id: string;
  question_id: string;
  selected_answer: any;
  is_marked_for_review: boolean;
  time_spent_seconds: number;
  status: QuestionState["status"];
};

/**
 * Build the row for one question. `??` not `||` on the answer: a selected
 * answer of 0 is a real choice, not a blank — the same rule the submit path
 * uses.
 */
export function progressRow(
  attemptId: string,
  questionId: string,
  state: QuestionState | undefined
): ProgressRow {
  return {
    attempt_id: attemptId,
    question_id: questionId,
    selected_answer: state?.selectedAnswer ?? null,
    is_marked_for_review: state?.isMarkedForReview || false,
    time_spent_seconds: state?.timeSpentSeconds || 0,
    status: state?.status ?? "untouched",
  };
}

/**
 * Write the given rows, replacing whatever was there for those questions.
 * Resolves to false on any failure — callers must not treat that as fatal.
 */
export async function flushProgress(rows: ProgressRow[]): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const { error } = await supabase
      .from("responses")
      .upsert(rows as any, { onConflict: "attempt_id,question_id" });
    if (error) {
      // A missing unique index shows up here as 42P10. Worth saying out loud:
      // it means in-exam saving is silently doing nothing.
      console.warn("exam progress flush failed", error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("exam progress flush threw", e);
    return false;
  }
}

/**
 * A debouncing queue, one per sitting. Collects dirty question ids and writes
 * them in one request, so holding a key in a text answer costs one write rather
 * than one per character.
 */
export function createProgressQueue(opts: {
  /** Row builder for a question, or null when it cannot be saved yet. */
  buildRow: (questionId: string) => ProgressRow | null;
  debounceMs?: number;
  /** Injectable for tests; defaults to the real write. */
  flush?: (rows: ProgressRow[]) => Promise<boolean>;
}) {
  const debounceMs = opts.debounceMs ?? FLUSH_DEBOUNCE_MS;
  const write = opts.flush ?? flushProgress;
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let stopped = false;

  const drain = async () => {
    timer = null;
    if (dirty.size === 0) return;
    // Take the batch before awaiting, so changes made during the write are kept
    // for the next one instead of being dropped.
    const batch = Array.from(dirty);
    dirty.clear();
    const rows = batch
      .map(opts.buildRow)
      .filter((r): r is ProgressRow => r !== null);
    if (rows.length === 0) return;
    const ok = await write(rows);
    // Put them back on failure so the next flush (or the final one) retries.
    if (!ok) batch.forEach(id => dirty.add(id));
  };

  return {
    /** Note that a question changed; schedules a write. */
    touch(questionId: string) {
      if (stopped) return;
      dirty.add(questionId);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        inFlight = inFlight.then(drain);
      }, debounceMs);
    },
    /** Write everything pending now — on navigation, submit, or tab hide. */
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = inFlight.then(drain);
      await inFlight;
    },
    /** Stop accepting work. Does not flush; call flushNow first if wanted. */
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    /** Test seam. */
    pendingCount() {
      return dirty.size;
    },
  };
}
