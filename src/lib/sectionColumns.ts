import { tableHasColumn } from "@/lib/dbFeatures";

/**
 * Which columns of `sections` a student's browser is allowed to receive.
 *
 * WHY THIS EXISTS
 * The exam-taking pages fetched sections with `select("*")` — give me every
 * column — and two of those columns describe the source question paper:
 *
 *   pdf_url   a link to the PDF the whole exam was built from. On the mock
 *             upload path the file name is preserved in it, so a URL can read
 *             `.../SSC-MTS-2025-Set-A-FINAL.pdf`.
 *   pdf_name  the original file name on its own. Written once by
 *             CreateExamDialog and read by NOTHING, so it was pure leak.
 *
 * Neither is read by any student-facing component. They were on the wire only
 * because nobody narrowed the query.
 *
 * The file itself is not reachable — the exam-pdfs bucket is private, so the
 * link 403s for anyone who is not its owner. Two reasons to stop sending it
 * anyway. First, that one bucket setting is all that stands between a
 * candidate's browser and the complete paper, and this project also runs a
 * PUBLIC bucket for question images, so the protection rests on nobody ever
 * confusing the two. Second, a link nobody uses cannot be worth the risk of
 * anyone ever having to think about it again.
 *
 * WHY A NAMED LIST AND NOT `*` MINUS SOMETHING
 * PostgREST has no "everything except" syntax, so the choice is between naming
 * what students get and naming nothing. Naming has one cost worth stating: a
 * column added by a future migration will NOT be selected until it is added
 * here, and the symptom is an undefined field rather than an error.
 *
 * That is the safer direction for this particular table. A new column defaults
 * to not being handed to candidates, which is the right default for something
 * that has already shipped two paper-describing fields to them by accident.
 *
 * Keep it in sync with the `sections` Row type in integrations/supabase/types.ts.
 *
 *
 * WHY THIS IS A FUNCTION AND NOT A CONSTANT
 * `sections.timing_group_id` is applied BY HAND (20260824000000) and is not in
 * the generated types. It is also load-bearing on exactly these pages:
 * resolveTimingGroupIds reads `s.timing_group_id` off the rows fetched here, so
 * a list that omits it does not error — it quietly resolves every section to no
 * group, and multi-section timed "parts" silently collapse into per-section
 * timers. Analytics.tsx keeps `select("*")` for precisely this reason and says
 * so in a comment.
 *
 * But naming a column that does not exist yet is a 400 on every un-migrated
 * database. So the column list has to be decided at runtime, which is what
 * tableHasColumn is for — it probes once and caches for the session, and evicts
 * its cache on a transient failure rather than disabling the feature for good.
 *
 * The `as "*"` cast at each call site is deliberate. supabase-js infers row
 * shape from the LITERAL TYPE of the string passed to `.select()`, so a runtime
 * string types every row as GenericStringError and every `section.id` in three
 * pages becomes a compile error. `as "*"` restores the full Row type. It is a
 * small lie in exactly one direction: the two omitted fields will be undefined
 * at runtime while TypeScript believes they are present. Nothing on the student
 * path reads either — that is the whole point of removing them — and a test
 * pins that.
 */
const BASE_COLUMNS =
  "id, exam_id, name, language, section_group_id, sort_order, time_minutes, total_questions, is_finalized, parsing_status, parsing_started_at, parsing_completed_at, questions_requiring_review, created_at";

export async function studentSectionColumns(): Promise<string> {
  const hasTimingGroup = await tableHasColumn("sections", "timing_group_id");
  return hasTimingGroup ? `${BASE_COLUMNS}, timing_group_id` : BASE_COLUMNS;
}
