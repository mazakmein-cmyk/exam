import { useEffect, useState, Fragment, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingUp, Clock, Target, Users, BookOpen, Eye, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SEO from "@/components/SEO";
import { formatDuration } from "@/lib/utils";
import { fetchTimingGroups } from "@/lib/timingGroupSettings";
import { groupDisplayName, groupPoolMinutes, resolveTimingGroupIds } from "@/lib/timingGroups.js";

interface Attempt {
  id: string;
  section_id: string;
  created_at: string;
  submitted_at: string;
  score: number;
  total_questions: number;
  accuracy_percentage: number;
  avg_time_per_question: number;
  time_spent_seconds: number;
  total_time_spent?: number; // Added for internal calculation
  updated_at: string;
  user_id: string; // Needed for creator view
  section: {
    name: string;
    time_minutes?: number;
    sort_order?: number;
    created_at?: string;
    exam: {
      name: string;
    };
  };
}

interface QuestionStats {
  id: string;
  q_no: number;
  text: string;
  sectionName: string;
  sectionSortOrder: number;
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracy: number;
  avgTime: number;
  correctAnswer: any;
  answerType: string;
  options: any;
  imageUrl: string | null;
  imageUrls: string[] | null;
  optionImageUrls?: (string | null)[] | null;
  reviewedCount: number;
  commonWrongAnswers: Record<string, number>;
  mostCommonWrong?: string | null;
}

import { useUserRole } from "@/hooks/use-user-role";

/**
 * Read an object-shaped correct answer ({ answer: ... } / { value: ... }).
 * Tested against null/undefined rather than truthiness: a legitimate answer of
 * 0 (a NAT question answered zero), false, or "" would otherwise read as
 * "no answer stored" and mark every student wrong forever.
 */
const readObjectAnswer = (o: any) =>
  o?.answer !== undefined && o?.answer !== null ? o.answer : o?.value;

/** True when a stored correct answer is actually present (0 and "" count). */
const hasAnswerValue = (v: any) => v !== null && v !== undefined && v !== "";

/**
 * Which of two attempts on the same section is the one that counts.
 *
 * created_at, then id — the same key get_my_exam_ranks and ExamReview
 * de-duplicate on, so all three surfaces pick the same survivor. Picking by
 * submitted_at instead would diverge: the attempt row for every section is
 * created when the sitting opens, but submitted_at is written per section by
 * the browser as each one is handed in, so the two orders genuinely disagree
 * (and submitted_at is on the student's clock, not the server's).
 *
 * Compared as raw ISO text rather than through Date. PostgREST returns a fixed
 * canonical form with a constant offset, so string order is chronological order
 * at full microsecond precision, while `new Date()` truncates to milliseconds
 * and would turn a real gap into an arbitrary id tie-break.
 */
const laterAttempt = (a: any, b: any) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id > b.id);

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");
  const { role, loading: roleLoading } = useUserRole();

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [examName, setExamName] = useState<string>("");
  const [firstSectionIds, setFirstSectionIds] = useState<Set<string>>(new Set());
  const [lastSectionIds, setLastSectionIds] = useState<Set<string>>(new Set());
  const [questionStats, setQuestionStats] = useState<QuestionStats[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionStats | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Rank data for student history: maps attemptId -> { rank, total }
  const [examRanks, setExamRanks] = useState<Record<string, { rank: number; total: number }>>({}); 
  // Maps examId -> Set of firstSectionIds (used for session-based history grouping)
  const [firstSectionsByExamId, setFirstSectionsByExamId] = useState<Record<string, Set<string>>>({});
  /**
   * Timing-group pools by section id (creator view). A section in a group has
   * no time limit of its own — displaying its time_minutes as the denominator
   * would read a legitimate 40-of-45-pooled-minutes sitting as an overrun.
   */
  const [sharedPools, setSharedPools] = useState<Record<string, { minutes: number; name: string }>>({});
  // True once the rank pass has finished, however it finished. An empty
  // firstSectionsByExamId is a legitimate result (every attempted exam
  // unpublished, sections deleted, query failed), so it cannot double as
  // "still loading" or the history list spins forever.
  const [ranksResolved, setRanksResolved] = useState(false);
  // Creator leaderboard: top 3 sessions ranked by marks (when available) or score
  const [leaderboard, setLeaderboard] = useState<{ rank: number; userId: string; username: string; displayName: string; totalScore: number; totalQuestions: number; totalMarks: number; rankedByMarks: boolean }[]>([]);
  // Monotonic tag for in-flight fetches; see fetchData.
  const fetchSeqRef = useRef(0);
  const toggleSection = (sectionName: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionName)) {
      newCollapsed.delete(sectionName);
    } else {
      newCollapsed.add(sectionName);
    }
    setCollapsedSections(newCollapsed);
  };

  useEffect(() => {
    if (roleLoading) return;
    
    // For Creator side this type of analytics (Student overall performance) shouldn't be accessed
    if (role === 'creator' && !examId) {
      navigate('/dashboard', { replace: true });
      return;
    }

    fetchData();
  }, [examId, role, roleLoading]);

  const fetchData = async () => {
    // This component is reused across exams — only the ?examId changes — so
    // every load must (a) clear the previous exam's data up front, because some
    // setters below only run when the new exam has data, and (b) tag itself, so
    // a slower earlier request can't land on top of a newer one.
    const mySeq = ++fetchSeqRef.current;
    const isStale = () => fetchSeqRef.current !== mySeq;

    setLeaderboard([]);
    setQuestionStats([]);
    setAttempts([]);
    setExamName("");
    setFirstSectionIds(new Set());
    setLastSectionIds(new Set());
    setExamRanks({});
    setFirstSectionsByExamId({});

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const from = searchParams.get("from");
        navigate(from === "marketplace" ? "/student-auth?from=marketplace" : "/student-auth");
        return;
      }

      // PostgREST caps a single response at 1000 rows and does not say it
      // truncated, so every read that can outgrow that is paged. Both branches
      // use this. The sort always ends in id: paging over a non-total order
      // silently duplicates some rows and skips others.
      const PAGE = 1000;
      const fetchAllPages = async (
        run: (from: number, to: number) => any
      ): Promise<any[]> => {
        const rows: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await run(from, from + PAGE - 1);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < PAGE) return rows;
        }
      };

      // Built per page rather than once: a shared builder accumulates params
      // across calls, so reusing one instance would stack range() headers.
      const myAttemptsPage = (from: number, to: number) =>
        supabase
          .from("attempts")
          .select(`
            *,
            section:sections(
              name,
              exam_id,
              exam:exams(name)
            )
          `)
          .not("submitted_at", "is", null)
          .eq("user_id", user.id)
          .order("submitted_at", { ascending: false })
          .order("id")
          .range(from, to);

      if (examId) {
        // Creator View: Get all attempts for this exam (by joining sections)
        // Note: Supabase filtering on joined tables usually needs !inner for correct filtering, 
        // but since we are navigating from dashboard where we own the exam, we trust the ID. 
        // However, standard foreign key filtering in PostgREST:
        // attempts -> section -> exam_id.
        // We can do this by filtering on the joined column, but JS client requires specific syntax or embedded resource filtering.
        // Easier approach: Get sections for this exam first, then get attempts for those sections.

        // 1. Parallelize all independent exam-scoped fetches.
        // examData, allSections, sectionAttempts, and questionsData are all keyed by examId
        // with no dependency between them — fire them concurrently.
        const [
          { data: examData, error: examError },
          { data: allSections, error: sectionsError },
          sectionAttempts,
          questionsData,
          timingGroupRows,
          { data: summaryRaw, error: summaryError },
        ] = await Promise.all([
          supabase.from("exams").select("name, user_id, primary_language").eq("id", examId).single(),
          supabase
            .from("sections")
            // select * so the hand-migrated timing_group_id rides along when the
            // live schema has it — naming it in a list would fail pre-migration.
            .select("*")
            .eq("exam_id", examId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),
          fetchAllPages((from, to) =>
            supabase
              .from("attempts")
              .select(`
                *,
                section:sections!inner(
                  name,
                  time_minutes,
                  sort_order,
                  created_at,
                  exam:exams(name)
                )
              `)
              .eq("section.exam_id", examId)
              // nullsFirst: false is load-bearing, not cosmetic. Postgres sorts
              // DESC as NULLS FIRST, and an attempt row is created at section
              // start with submitted_at NULL — so every abandoned attempt sorts
              // ahead of every completed one.
              .order("submitted_at", { ascending: false, nullsFirst: false })
              .order("id")
              .range(from, to)
          ),
          fetchAllPages((from, to) =>
            supabase
              .from("parsed_questions")
              .select(`
                *,
                section:sections!inner(id, name, exam_id, sort_order)
              `)
              // Match what ExamSimulator actually serves (it filters identically):
              // counting excluded questions here inflates every attempt's
              // denominator and silently deflates everyone's accuracy.
              .eq("is_excluded", false)
              .eq("section.exam_id", examId)
              // q_no first, then id as the tiebreaker paging needs. Ordering by
              // id alone would be deterministic but random with respect to the
              // paper, and the Section Snippet dialog numbers questions by their
              // position in this array.
              .order("q_no")
              .order("id")
              .range(from, to)
          ),
          // Timing groups. [] on a database without the migration.
          fetchTimingGroups(examId),
          // Scoring and per-question counts, aggregated in the database. The
          // browser used to download every answer of every student to do this
          // and silently lost everything past the 1000-row cap, which rendered
          // real students at 0%. Payload is now a few numbers per attempt and
          // per question regardless of how many students sat the paper.
          (supabase.rpc as any)("get_exam_analytics", { p_exam_id: examId }),
        ]);

        if (examError) throw examError;
        // Migrations here are applied by hand, so the client can be live before
        // the function exists. Say which file to paste rather than throwing —
        // throwing blanks the whole dashboard, which reads exactly like an exam
        // nobody has attempted. Every other hand-migrated feature in this
        // codebase degrades the same way.
        if (summaryError) {
          if (/does not exist|schema cache/i.test(summaryError.message || "")) {
            toast({
              title: "Database update needed",
              description: "Run migration 20260828000000_exam_analytics_summary.sql, then reload.",
              variant: "destructive",
            });
          } else {
            throw summaryError;
          }
        }
        const summary = (summaryRaw as any) || { attempts: [], questions: [] };
        if (isStale()) return;
        setExamName(examData.name);
        const examCreatorId = examData.user_id; // Store creator ID to filter out their attempts

        if (sectionsError) throw sectionsError;

        // Shared-pool denominators for the Section Analytics table. Structure
        // resolves through primary rows; pools sum over the SAME language's
        // members, so a Hindi section shows the Hindi paper's pool.
        {
          const pools: Record<string, { minutes: number; name: string }> = {};
          if (timingGroupRows.length > 0) {
            const resolved = resolveTimingGroupIds(
              allSections || [],
              (examData as any).primary_language || "en"
            );
            for (const s of allSections || []) {
              const gid = resolved.get(s.id);
              if (!gid) continue;
              const group = timingGroupRows.find((g) => g.id === gid);
              if (!group) continue;
              const lang = (s as any).language || "en";
              const members = (allSections || []).filter(
                (x) => ((x as any).language || "en") === lang && resolved.get(x.id) === gid
              );
              if (members.length < 2) continue;
              pools[s.id] = {
                minutes: groupPoolMinutes(group, members as any),
                name: groupDisplayName(group, lang),
              };
            }
          }
          setSharedPools(pools);
        }

        const localFirstIds = new Set<string>();
        const localLastIds = new Set<string>();

        if (allSections && allSections.length > 0) {
          const langMap = new Map<string, any[]>();
          allSections.forEach(s => {
            const lang = s.language || 'en';
            if (!langMap.has(lang)) langMap.set(lang, []);
            langMap.get(lang)!.push(s);
          });
          
          // Add the first and last section elements per-language variant strictly
          langMap.forEach((secs) => {
            localFirstIds.add(secs[0].id);
            localLastIds.add(secs[secs.length - 1].id);
          });
          
          setFirstSectionIds(localFirstIds);
          setLastSectionIds(localLastIds);
        }

        // Filter out the creator's own attempts from analytics. The summary
        // excludes them too, so an unmatched id here simply scores zero.
        const filteredAttempts = (sectionAttempts || []).filter(
          (attempt: any) => attempt.user_id !== examCreatorId
        );
        const attemptIds = filteredAttempts.map((a: any) => a.id);

        // Scores come from get_exam_analytics: correct counts, time on task and
        // the section's served-question count, all counted where the rows live.
        const scoreByAttempt = new Map<string, any>();
        (summary.attempts || []).forEach((a: any) => scoreByAttempt.set(a.attempt_id, a));

        const correctedAttempts = filteredAttempts.map((attempt: any) => {
          const agg = scoreByAttempt.get(attempt.id);
          const correctCount = agg?.correct_count ?? 0;
          const totalTime = agg?.total_time_seconds ?? 0;
          // Same fallback chain as before: served-question count, then the
          // count frozen on the attempt, then 1 so nothing divides by zero.
          const totalQuestions = (agg?.section_question_count || 0) || attempt.total_questions || 1;
          const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

          return {
            ...attempt,
            score: correctCount,
            total_questions: totalQuestions,
            accuracy_percentage: accuracy,
            avg_time_per_question: totalQuestions > 0 ? totalTime / totalQuestions : 0,
            total_time_spent: totalTime
          };
        });

        if (isStale()) return;
        setAttempts(correctedAttempts);

        // --- Compute Top 3 Leaderboard for Creator View ---
        try {
          if (allSections && allSections.length > 0 && correctedAttempts.length > 0) {
            // Sort all corrected attempts chronologically
            const sortedAttempts = [...correctedAttempts].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            // Group by user
            const byUser: Record<string, any[]> = {};
            sortedAttempts.forEach(att => {
              if (!byUser[att.user_id]) byUser[att.user_id] = [];
              byUser[att.user_id].push(att);
            });

            // Build sessions using same boundary logic as student ranking.
            // Track marks alongside score; sessionHasMarks gates whether we
            // can rank by marks (must be true for every attempt in the session).
            type LbSession = {
              userId: string;
              totalScore: number;
              totalQuestions: number;
              totalMarks: number;
              sessionHasMarks: boolean;
            };
            const sessions: LbSession[] = [];

            const marksOf = (a: any) => {
              const hasMarks = a.marks_score !== null && a.marks_score !== undefined;
              return { hasMarks, value: hasMarks ? Number(a.marks_score) : 0 };
            };

            // Latest attempt per section wins, same rule as the student History
            // and get_my_exam_ranks. Summing repeats let a student who re-sat one
            // section stack scores past the paper maximum and top this board over
            // someone who did a clean run.
            //
            // Submitted beats abandoned, always, and that ordering comes first.
            // Unlike the student query this one deliberately keeps unsubmitted
            // rows, and get_exam_analytics scores them 0 out of the full section
            // — so letting a later abandoned row supersede a finished one would
            // delete a section the student actually completed. Merely having the
            // exam open in another tab would demote their own earlier run.
            const lbBeats = (a: any, b: any) => {
              const aDone = !!a.submitted_at;
              const bDone = !!b.submitted_at;
              if (aDone !== bDone) return aDone;
              return laterAttempt(a, b);
            };
            const closeLbSitting = (uid: string, atts: any[]): LbSession => {
              const latestBySection = new Map<string, any>();
              atts.forEach(a => {
                const prev = latestBySection.get(a.section_id);
                if (!prev || lbBeats(a, prev)) latestBySection.set(a.section_id, a);
              });
              const counted = Array.from(latestBySection.values());
              return {
                userId: uid,
                totalScore: counted.reduce((s, a) => s + (a.score || 0), 0),
                totalQuestions: counted.reduce((s, a) => s + (a.total_questions || 0), 0),
                totalMarks: counted.reduce((s, a) => s + marksOf(a).value, 0),
                sessionHasMarks: counted.every(a => marksOf(a).hasMarks),
              };
            };

            Object.entries(byUser).forEach(([uid, userAtts]) => {
              let cur: any[] | null = null;
              const orphans: any[] = [];

              userAtts.forEach(att => {
                if (localFirstIds.has(att.section_id)) {
                  if (cur) sessions.push(closeLbSitting(uid, cur));
                  cur = [att];
                } else if (cur) {
                  cur.push(att);
                } else {
                  orphans.push(att);
                }
              });
              if (cur) sessions.push(closeLbSitting(uid, cur));

              if (orphans.length > 0) {
                sessions.push(closeLbSitting(uid, orphans));
              }
            });

            // Rank by marks when every session has marks; otherwise fall back
            // to accuracy %. Same gating as ExamReview and the student rank.
            const rankByMarks = sessions.length > 0 && sessions.every(s => s.sessionHasMarks);
            const rankValueOf = (s: LbSession) =>
              rankByMarks
                ? s.totalMarks
                : (s.totalQuestions > 0 ? s.totalScore / s.totalQuestions : 0);

            sessions.sort((a, b) => {
              const va = rankValueOf(a);
              const vb = rankValueOf(b);
              if (vb !== va) return vb - va;
              // Tie-break on raw score so deterministic ordering survives.
              return b.totalScore - a.totalScore;
            });

            // Competition-style ranking
            const rankedSessions: (LbSession & { rank: number })[] = [];
            for (let i = 0; i < sessions.length; i++) {
              const s = sessions[i];
              let rank = i + 1;
              if (i > 0 && rankValueOf(s) === rankValueOf(sessions[i - 1])) {
                rank = rankedSessions[i - 1].rank;
              }
              rankedSessions.push({ ...s, rank });
            }

            // Take top 3
            const top3 = rankedSessions.slice(0, 3);

            if (top3.length > 0) {
              // Fetch profiles for top 3 unique user IDs
              const userIds = [...new Set(top3.map(s => s.userId))];
              // public_profiles, not profiles: RLS on the base table is own-row
              // only (20260803030000), so reading it here returns nothing and
              // every entry falls back to "Unknown". The view withholds
              // full_name by design, so the handle is what we display.
              const { data: profilesData } = await supabase
                .from('public_profiles')
                .select('id, username')
                .in('id', userIds);

              const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

              if (isStale()) return;

              setLeaderboard(top3.map(s => {
                const profile = profileMap.get(s.userId) as any;
                const displayName = profile?.username || 'Deleted user';
                // attempts.user_id has no FK to profiles, so a deleted account
                // leaves its attempts (and its Top-3 slot) behind. Never fall
                // back to s.userId: that publishes the raw auth UUID as a
                // "username" on the creator's leaderboard.
                const username = profile?.username || '—';
                return { rank: s.rank, userId: s.userId, username, displayName, totalScore: s.totalScore, totalQuestions: s.totalQuestions, totalMarks: s.totalMarks, rankedByMarks: rankByMarks };
              }));
            }
          }
        } catch (lbErr) {
          console.error('Error computing leaderboard:', lbErr);
        }
        // --- End Leaderboard ---

        if (attemptIds.length > 0) {
          // Per-question counts also come from get_exam_analytics, which counts
          // only responses on SUBMITTED attempts — an abandoned attempt must not
          // tell a creator a question was skipped. The question row supplies the
          // content (text, options, images) the detail dialogs render; the
          // summary supplies the numbers.
          const statByQuestion = new Map<string, any>();
          (summary.questions || []).forEach((q: any) => statByQuestion.set(q.question_id, q));

          const finalStats: QuestionStats[] = (questionsData || []).map((q: any) => {
            const agg = statByQuestion.get(q.id);
            const totalAttempts = agg?.total_attempts ?? 0;
            const correctCount = agg?.correct_count ?? 0;
            const totalTime = agg?.total_time_seconds ?? 0;

            return {
              id: q.id,
              q_no: q.q_no,
              text: q.text,
              sectionName: q.section.name,
              sectionSortOrder: q.section.sort_order,
              totalAttempts,
              correctCount,
              wrongCount: agg?.wrong_count ?? 0,
              unansweredCount: agg?.unanswered_count ?? 0,
              accuracy: totalAttempts > 0 ? (correctCount / totalAttempts) * 100 : 0,
              avgTime: totalAttempts > 0 ? totalTime / totalAttempts : 0,
              correctAnswer: q.correct_answer,
              answerType: q.answer_type,
              options: q.options,

              imageUrl: q.image_url,
              imageUrls: q.image_urls,
              optionImageUrls: Array.isArray(q.option_image_urls) ? q.option_image_urls : null,
              reviewedCount: agg?.reviewed_count ?? 0,
              // The full tally stays in the database; only the winning label is
              // shipped, already capped at 120 chars there.
              commonWrongAnswers: {},
              mostCommonWrong: agg?.most_common_wrong ?? null,
            };
          });

          // The leaderboard block above swallows its own errors, so control can
          // reach here without passing that block's staleness check.
          if (isStale()) return;
          setQuestionStats(finalStats);
        } else {
          setQuestionStats([]);
        }

      } else {
        // Student View: Get only MY attempts
        // Paged: one row per submitted SECTION, not per exam, so a daily user
        // of multi-section mocks crosses 1000 within months. Truncation here is
        // silent and sorts newest-first, so it quietly drops the oldest
        // sittings out of History and out of the all-time stat tiles.
        const data = await fetchAllPages(myAttemptsPage);
        setAttempts(data as any);

        // Compute ranks for each exam the student has attempted
        try {
          const studentAttempts = data as any[];
          if (studentAttempts && studentAttempts.length > 0) {
            // Get unique exam IDs from the student's attempts
            const examIds = [...new Set(
              studentAttempts
                .filter(a => a.section?.exam_id)
                .map(a => a.section.exam_id)
            )] as string[];

            // Batch-fetch all sections for all exams in ONE query (eliminates N+1 loop)
            const rankMap: Record<string, { rank: number; total: number }> = {};
            const firstSectionsMap: Record<string, Set<string>> = {};

            // Two separate ceilings, and both bite. Chunking the ids keeps the
            // query string under the URL length limit (a 414 would make every
            // rank badge vanish); paging each chunk keeps its RESPONSE under the
            // 1000-row cap. Without the paging, 100 exams x 10 sections — an
            // ordinary bilingual paper — silently loses rows, and losing a
            // per-language FIRST section makes every sitting on that exam start
            // one section late and split into duplicate History rows.
            // Ordering is redone in JS because it can't hold across chunks.
            const ID_CHUNK = 100;
            const fetchInChunks = async (
              ids: string[],
              run: (slice: string[], from: number, to: number) => any
            ): Promise<any[]> => {
              const out: any[] = [];
              for (let i = 0; i < ids.length; i += ID_CHUNK) {
                const slice = ids.slice(i, i + ID_CHUNK);
                out.push(...(await fetchAllPages((from, to) => run(slice, from, to))));
              }
              return out;
            };

            const allExamSections = (await fetchInChunks(examIds, (slice, from, to) =>
              supabase
                .from("sections")
                .select("id, exam_id, sort_order, created_at, language")
                .in("exam_id", slice)
                .order("id")
                .range(from, to)
            )).sort((a, b) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            if (allExamSections && allExamSections.length > 0) {
              // Group sections by exam_id
              const sectionsByExam: Record<string, typeof allExamSections> = {};
              allExamSections.forEach(s => {
                if (!sectionsByExam[s.exam_id]) sectionsByExam[s.exam_id] = [];
                sectionsByExam[s.exam_id].push(s);
              });

              // Build firstSectionsMap (multi-language aware first sections per
              // exam). Only the History grouping needs this now — the ranking
              // derives its own boundaries server-side by the same rule.
              Object.entries(sectionsByExam).forEach(([eid, sections]) => {
                const langMap = new Map<string, any[]>();
                sections.forEach(s => {
                  const l = s.language || 'en';
                  if (!langMap.has(l)) langMap.set(l, []);
                  langMap.get(l)!.push(s);
                });

                const firstIds = new Set<string>();
                langMap.forEach(secs => {
                  firstIds.add(secs[0].id);
                });
                firstSectionsMap[eid] = firstIds;
              });

            }

            // Commit the grouping before ranking is attempted. The History list
            // needs firstSectionsMap to show one row per sitting; ranks are a
            // badge on top. Letting a rank failure skip this setter shattered
            // the whole list into one row per section — which is exactly what a
            // client deployed ahead of this migration would have done to every
            // student at once.
            setFirstSectionsByExamId(firstSectionsMap);

            // Ranking runs in the database, not here. RLS only ever showed this
            // client its OWN attempts, so ranking locally compared a student
            // against their own retakes and printed it as a cohort placement.
            // get_my_exam_ranks sees every student's sittings with definer
            // rights and returns only this caller's rows — the rank and the size
            // of the field, never anyone else's score.
            //
            // Not gated on the sections query above: that read is RLS-filtered
            // to published exams, while the RPC reads with definer rights, so
            // gating it would drop the ranks of a student whose exams have all
            // been unpublished even though the server would still return them.
            const { data: rankRows, error: rankRowsError } = await (supabase.rpc as any)(
              "get_my_exam_ranks",
              { p_exam_ids: examIds }
            );
            if (rankRowsError) throw rankRowsError;

            (rankRows as any[] | null)?.forEach(r => {
              rankMap[r.attempt_id] = { rank: r.rank, total: r.total };
            });

            setExamRanks(rankMap);

          }
        } catch (rankErr) {
          console.error("Error computing history ranks:", rankErr);
        } finally {
          setRanksResolved(true);
        }
      }

    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      // A superseded fetch must not clear the spinner the newer one is showing,
      // or the page flashes its (deliberately reset) empty state mid-load.
      if (!isStale()) setLoading(false);
      // Backstop for the paths that never reach the rank pass at all — no
      // signed-in user, the attempts query throwing, the creator branch.
      setRanksResolved(true);
    }
  };



  // --- Calculations ---

  // Completed attempts for performance stats
  const completedAttempts = attempts.filter(a => a.submitted_at);
  const validAttempts = examId ? completedAttempts : attempts;

  // Compute student history ranking sessions globally
  const studentSessionsList = useMemo(() => {
    if (examId || attempts.length === 0) return [];
    // No early return on an empty firstSectionsByExamId. It is empty whenever the
    // rank pass found nothing to group by — every attempted exam unpublished, its
    // sections deleted, or the query failed — and bailing here left the student
    // staring at an empty panel. Falling through instead sends every attempt down
    // the orphan path, so they get one row per attempt: ungrouped, but their data.

    // Session-based grouping: a new session starts each time the user
    // hits the first section of an exam. Sorted by created_at ascending
    // so sessions are detected in chronological order.
    const sortedAttempts = [...attempts]
      .filter(a => a.section && a.section.exam)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Group by exam_id first, then detect sessions within each exam
    const sessionsList: any[] = [];

    // Get attempts per exam
    const byExam: Record<string, any[]> = {};
    sortedAttempts.forEach(att => {
      const eid = (att.section as any)?.exam_id || att.section_id || 'unknown';
      if (!byExam[eid]) byExam[eid] = [];
      byExam[eid].push(att);
    });

    // Latest attempt per section wins. Re-answering one section has to REPLACE
    // that section's score, not stack on top of it — otherwise a student who
    // redoes section 2 of a 3-section paper gets a row reading "4 sections,
    // 62/125", a total above what the paper is out of, and a rank badge that
    // disagrees with it because ExamReview and get_my_exam_ranks both already
    // de-duplicate. See laterAttempt for why the key is created_at.
    const countedAttempts = (atts: any[]) => {
      const latestBySection = new Map<string, any>();
      atts.forEach(a => {
        const prev = latestBySection.get(a.section_id);
        if (!prev || laterAttempt(a, prev)) latestBySection.set(a.section_id, a);
      });
      // Map iteration is first-seen order, so sections stay in sat order.
      return Array.from(latestBySection.values());
    };

    // Row ORDER is a different question from which attempt counts: a sitting
    // belongs where it finished, so this stays on submitted_at. Retargeting it
    // to created_at would silently reorder every row in the list.
    const finishTimeOf = (a: any) => new Date(a.submitted_at || a.created_at).getTime() || 0;

    // The display numbers can only be derived once a sitting is closed, because
    // until then we do not know which attempt is the latest for each section.
    const closeSitting = (atts: any[]) => {
      const counted = countedAttempts(atts);
      const marksOf = (a: any) => {
        const has = (a as any).marks_score !== null && (a as any).marks_score !== undefined;
        return { has, value: has ? Number((a as any).marks_score) : 0 };
      };
      const first = atts[0];
      return {
        examName: first.section.exam.name || 'Unknown Exam',
        date: new Date(first.submitted_at).toLocaleDateString(),
        sections: counted.map(a => a.section.name || 'Unknown Section'),
        totalScore: counted.reduce((s, a) => s + (a.score || 0), 0),
        totalQuestions: counted.reduce((s, a) => s + (a.total_questions || 0), 0),
        totalTime: counted.reduce(
          (s, a) => s + Math.round((a.avg_time_per_question || 0) * (a.total_questions || 0)),
          0
        ),
        firstAttemptId: first.id,
        // ALL ids, superseded ones included, so the rank resolves from whichever
        // attempt the server keyed it to.
        allAttemptIds: atts.map(a => a.id),
        totalMarks: counted.reduce((s, a) => s + marksOf(a).value, 0),
        sessionHasMarks: counted.every(a => marksOf(a).has),
        // A sitting sorts by when it finished, i.e. its latest section.
        sortTs: atts.reduce((m, a) => Math.max(m, finishTimeOf(a)), 0),
      };
    };

    Object.entries(byExam).forEach(([eid, examAtts]) => {
      const firstSectionGroupIds = firstSectionsByExamId[eid];
      let cur: any[] | null = null;
      const orphans: any[] = [];

      examAtts.forEach(att => {
        if (firstSectionGroupIds && firstSectionGroupIds.has(att.section_id)) {
          // Start a new sitting
          if (cur) sessionsList.push(closeSitting(cur));
          cur = [att];
        } else if (cur) {
          cur.push(att);
        } else {
          // Orphan: no first section seen yet — treat as its own sitting
          orphans.push(att);
        }
      });
      if (cur) sessionsList.push(closeSitting(cur));

      // Each orphan attempt → individual sitting row
      orphans.forEach(att => sessionsList.push(closeSitting([att])));
    });

    // Sort most recent first, on the real timestamp — never on `date`.
    // `date` is a toLocaleDateString() string, and re-parsing it is doubly
    // broken: on en-IN "2/7/2026" (2 July) parses as 7 February, so rows land
    // months out of place rather than merely unsorted; and a day-granularity
    // key makes every session on the same day compare equal, leaving the
    // oldest sitting at the top of a "most recent first" list.
    sessionsList.sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0));

    return sessionsList;
  }, [attempts, examId, firstSectionsByExamId]);

  // Overview Metrics
  // Logic: Total Attempts = Starts of the First Section
  // Logic: Completed = Submissions of the Last Section

  const totalAttempts = examId 
    ? (firstSectionIds.size > 0 ? attempts.filter(a => firstSectionIds.has(a.section_id)).length : 0)
    : studentSessionsList.length;

  const submittedCount = (examId && lastSectionIds.size > 0)
    ? attempts.filter(a => lastSectionIds.has(a.section_id) && a.submitted_at).length
    : (examId ? 0 : attempts.filter(a => a.submitted_at).length);

  const completionRate = totalAttempts > 0 ? (submittedCount / totalAttempts) * 100 : 0;

  // Repeat Attempts (Creator Only)
  // Repeat Attempts (Creator Only)
  const studentAttempts = attempts.reduce((acc: any, attempt) => {
    // Only count attempts for the first section to avoid counting section transitions as repeats
    if (examId && firstSectionIds.size > 0 && !firstSectionIds.has(attempt.section_id)) {
      return acc;
    }
    acc[attempt.user_id] = (acc[attempt.user_id] || 0) + 1;
    return acc;
  }, {});
  const repeatersCount = Object.values(studentAttempts).filter((count: any) => count > 1).length;

  const uniqueStudents = new Set(attempts.map(a => a.user_id)).size;

  const totalCorrectQs = validAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
  const totalAttemptedQs = validAttempts.reduce((sum, a) => sum + (a.total_questions || 0), 0);
  const overallAccuracy = totalAttemptedQs > 0 ? (totalCorrectQs / totalAttemptedQs) * 100 : 0;
  
  const totalTimeSpentQs = validAttempts.reduce((sum, a) => sum + (Math.round((a.avg_time_per_question || 0) * (a.total_questions || 0))), 0);
  const avgTimePerQuestion = totalAttemptedQs > 0 ? totalTimeSpentQs / totalAttemptedQs : 0;
  

  // For Student View: Trend of accuracy over attempts
  // For Creator View: Trend of average accuracy over time (grouped by day)
  const accuracyTrendData = examId
    ? (() => {
      // Group by date
      const grouped = validAttempts.reduce((acc: any, attempt) => {
        const date = new Date(attempt.submitted_at).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = { date, totalAccuracy: 0, scoreCount: 0, attemptCount: 0 };
        }

        // Always add to scoring metrics
        acc[date].totalAccuracy += attempt.accuracy_percentage;
        acc[date].scoreCount++;

        // Only count as an "Exam Attempt" if it's the first section
        // Fallback: If no firstSectionIds are determined, counting everything is safer than counting nothing
        if (firstSectionIds.size === 0 || firstSectionIds.has(attempt.section_id)) {
          acc[date].attemptCount++;
        }

        return acc;
      }, {});

      return Object.values(grouped).map((g: any) => ({
        date: g.date,
        accuracy: parseFloat((g.totalAccuracy / g.scoreCount).toFixed(2)),
        attempts: g.attemptCount
      })).reverse(); // Reverse to show chronological if fetched desc
    })()
    : validAttempts
      .slice()
      .reverse()
      .map((attempt, index) => ({
        attempt: `Attempt ${index + 1}`,
        accuracy: attempt.accuracy_percentage,
        date: new Date(attempt.submitted_at).toLocaleDateString(),
      }));

  // Section-wise performance
  // Section-wise performance
  const sectionPerformance = validAttempts.reduce((acc: any, attempt) => {
    // Guard clause for missing section data
    if (!attempt.section) return acc;

    const sectionName = attempt.section.name || "Unknown Section";
    if (!acc[sectionName]) {
      acc[sectionName] = {
        name: sectionName,
        sectionId: attempt.section_id,
        totalAttempts: 0,
        avgAccuracy: 0,
        totalAccuracy: 0,
        totalTime: 0,
        avgTime: 0,
        totalTimeSpent: 0,
        timeLimit: attempt.section.time_minutes || 0,
        sortOrder: attempt.section.sort_order || 0,
        createdAt: attempt.section.created_at || new Date().toISOString()
      };
    }
    acc[sectionName].totalAttempts++;
    acc[sectionName].totalAccuracy += attempt.accuracy_percentage;
    acc[sectionName].totalTime += attempt.avg_time_per_question; // Keep for existing charts if needed
    acc[sectionName].totalTimeSpent += (attempt.total_time_spent || 0);

    acc[sectionName].avgAccuracy =
      parseFloat((acc[sectionName].totalAccuracy / acc[sectionName].totalAttempts).toFixed(2));
    acc[sectionName].avgTime =
      acc[sectionName].totalTime / acc[sectionName].totalAttempts;

    return acc;
  }, {});

  const sectionData = Object.values(sectionPerformance).sort((a: any, b: any) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Score Distribution
  const scoreDistribution = [
    { range: '0-20%', count: 0 },
    { range: '21-40%', count: 0 },
    { range: '41-60%', count: 0 },
    { range: '61-80%', count: 0 },
    { range: '81-100%', count: 0 },
  ];

  if (firstSectionIds.size > 0) {
    // Group attempts by user
    const attemptsByUser: Record<string, Attempt[]> = {};
    attempts.forEach(a => {
      if (!attemptsByUser[a.user_id]) attemptsByUser[a.user_id] = [];
      attemptsByUser[a.user_id].push(a);
    });

    Object.values(attemptsByUser).forEach(userAttempts => {
      // Sort by time
      userAttempts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      let currentSessionScores: number[] = [];
      let sessionActive = false;

      userAttempts.forEach(attempt => {
        // Start of new session (delimited by First Section)
        if (firstSectionIds.has(attempt.section_id)) {
          // If previous session active, push its average
          if (sessionActive && currentSessionScores.length > 0) {
            const avg = currentSessionScores.reduce((a, b) => a + b, 0) / currentSessionScores.length;

            if (avg <= 20) scoreDistribution[0].count++;
            else if (avg <= 40) scoreDistribution[1].count++;
            else if (avg <= 60) scoreDistribution[2].count++;
            else if (avg <= 80) scoreDistribution[3].count++;
            else scoreDistribution[4].count++;
          }
          // Start new session
          sessionActive = true;
          currentSessionScores = [attempt.accuracy_percentage];
        } else {
          // Continue session
          if (sessionActive) {
            currentSessionScores.push(attempt.accuracy_percentage);
          }
        }
      });

      // Push the last session
      if (sessionActive && currentSessionScores.length > 0) {
        const avg = currentSessionScores.reduce((a, b) => a + b, 0) / currentSessionScores.length;

        if (avg <= 20) scoreDistribution[0].count++;
        else if (avg <= 40) scoreDistribution[1].count++;
        else if (avg <= 60) scoreDistribution[2].count++;
        else if (avg <= 80) scoreDistribution[3].count++;
        else scoreDistribution[4].count++;
      }
    });
  } else {
    // Fallback if no sections or not loaded (use individual attempts)
    validAttempts.forEach(attempt => {
      const acc = attempt.accuracy_percentage;
      if (acc <= 20) scoreDistribution[0].count++;
      else if (acc <= 40) scoreDistribution[1].count++;
      else if (acc <= 60) scoreDistribution[2].count++;
      else if (acc <= 80) scoreDistribution[3].count++;
      else scoreDistribution[4].count++;
    });
  }

  // Insights Data
  const mostSkipped = [...questionStats].sort((a, b) => b.unansweredCount - a.unansweredCount).slice(0, 5).filter(a => a.unansweredCount > 0);
  const mostReviewed = [...questionStats].sort((a, b) => ((b as any).reviewedCount || 0) - ((a as any).reviewedCount || 0)).slice(0, 5).filter(a => (a as any).reviewedCount > 0);
  const confusingQuestions = [...questionStats]
    .filter(q => (q as any).mostCommonWrong)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 5);


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const getBackPath = () => {
    const from = searchParams.get("from");
    if (from === "dashboard") return "/dashboard";
    if (from === "edit" && examId) return `/exam/${examId}`;
    if (from === "marketplace") return "/marketplace";
    return "/dashboard"; // Default fallback
  };



  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={examId ? "Exam Analytics | MockSetu" : "My Analytics | MockSetu"}
        description={examId ? "In-depth insights and metrics for your exam on MockSetu." : "View your personal mock test performance analytics on MockSetu."}
        path={examId ? `/analytics?examId=${examId}` : "/analytics"}
        noindex
      />
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(getBackPath())}
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 text-[11px] font-semibold text-[#A855F7] uppercase tracking-wider">
                {examId ? "Creator Dashboard" : "Performance Hub"}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{examId ? "Exam Analytics" : "My Performance"}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{examId ? `In-depth insights and metrics for "${examName}"` : "Track your test scores and history over time"}</p>
          </div>
        </div>

        {/* Overall Stats */}
        {!examId ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="p-6 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Mock Exams</span>
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black tracking-tight text-foreground">{totalAttempts}</span>
            </Card>

            <Card className="p-6 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Overall Accuracy</span>
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black tracking-tight text-green-600 dark:text-green-500">{overallAccuracy.toFixed(1)}%</span>
            </Card>

            <Card className="p-6 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Avg Time / Question</span>
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black tracking-tight text-foreground">{avgTimePerQuestion.toFixed(1)}s</span>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-[#6C3EF4]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#6C3EF4]/10 flex items-center justify-center text-[#6C3EF4]">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Total Attempts</span>
                  <span className="text-2xl font-black tracking-tight text-foreground">{totalAttempts}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Unique Students</span>
                  <span className="text-2xl font-black tracking-tight text-foreground">{uniqueStudents}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Completion</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black tracking-tight text-foreground">{Math.round(completionRate)}%</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Repeaters</span>
                  <span className="text-2xl font-black tracking-tight text-foreground">{repeatersCount}</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Accuracy / Q</span>
                  <span className="text-2xl font-black tracking-tight text-foreground">{overallAccuracy.toFixed(1)}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex flex-col gap-3">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-500">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Avg Time / Q</span>
                  <span className="text-2xl font-black tracking-tight text-foreground">{avgTimePerQuestion.toFixed(1)}s</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Top Students Leaderboard (Creator Only) */}
        {examId && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">🏅 Top Students</h3>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No student data available yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {leaderboard.map((entry, idx) => {
                  const medals = ['🏆', '🥈', '🥉'];
                  const medal = medals[idx] ?? `#${entry.rank}`;
                  const pct = entry.totalQuestions > 0
                    ? ((entry.totalScore / entry.totalQuestions) * 100).toFixed(1)
                    : '0.0';
                  const bgColors = [
                    'bg-amber-50 dark:bg-amber-950/30',
                    'bg-slate-50 dark:bg-slate-900/30',
                    'bg-orange-50 dark:bg-orange-950/20',
                  ];
                  return (
                    <div
                      key={`${entry.userId}-${idx}`}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg mb-1 last:mb-0 ${bgColors[idx] ?? ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none">{medal}</span>
                        <div>
                          <p className="font-semibold text-sm leading-snug">{entry.displayName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{entry.username}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {entry.rankedByMarks ? (
                          <>
                            <p className="font-bold text-base leading-snug tabular-nums">{Math.round(entry.totalMarks * 100) / 100} marks</p>
                            <p className="text-xs text-muted-foreground">{entry.totalScore}/{entry.totalQuestions} correct</p>
                          </>
                        ) : (
                          <>
                            <p className="font-bold text-base leading-snug">{entry.totalScore}/{entry.totalQuestions}</p>
                            <p className="text-xs text-muted-foreground">{pct}%</p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}



        {/* Advanced Analytics Charts (Creator Only) */}
        {examId && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <div>
                  <h3 className="text-lg font-semibold">Daily Total Attempts Over Time</h3>

                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={accuracyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="attempts"
                        stroke="#8884d8"
                        name="Attempts"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <div>
                  <h3 className="text-lg font-semibold">Score Distribution</h3>
                  <p className="text-sm text-muted-foreground mb-4">How students are performing</p>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="range"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Bar
                        dataKey="count"
                        fill="#8884d8"
                        radius={[4, 4, 0, 0]}
                        barSize={60}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Most Skipped</h3>
                {mostSkipped.length === 0 ? <p className="text-sm text-muted-foreground">No data available.</p> : (
                  <div className="space-y-4">
                    {mostSkipped.map(q => (
                      <div key={q.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex gap-2 items-center">
                          <span className="font-medium">Q{q.q_no}</span>
                          <Badge variant="outline" className="text-xs">{q.sectionName}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                            <Eye className="w-4 h-4 text-primary" />
                          </Button>
                        </div>
                        <Badge variant="secondary">{q.unansweredCount} skipped</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Most Reviewed</h3>
                {mostReviewed.length === 0 ? <p className="text-sm text-muted-foreground">No questions marked for review.</p> : (
                  <div className="space-y-4">
                    {mostReviewed.map(q => (
                      <div key={q.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex gap-2 items-center">
                          <span className="font-medium">Q{q.q_no}</span>
                          <Badge variant="outline" className="text-xs">{q.sectionName}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                            <Eye className="w-4 h-4 text-primary" />
                          </Button>
                        </div>
                        <Badge variant="outline">{q.reviewedCount} times</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Common Misconceptions</h3>
                {confusingQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No data available.</p> : (
                  <div className="space-y-4">
                    {confusingQuestions.map(q => (
                      <div key={q.id} className="flex flex-col gap-1 text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center">
                          <div className="flex gap-2 items-center">
                            <span className="font-medium">Q{q.q_no}</span>
                            <Badge variant="outline" className="text-xs">{q.sectionName}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                              <Eye className="w-4 h-4 text-primary" />
                            </Button>
                          </div>
                          <Badge variant="destructive" className="ml-auto text-xs">{q.wrongCount} wrongs</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Most chose wrong option: <span className="font-medium text-red-500">{q.mostCommonWrong}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {/* Section Analytics (Creator Only) */}
        {examId && sectionData.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Section Analytics</h3>
            <div className="overflow-x-auto pb-4">
              <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-2 py-3 text-left w-[20%] rounded-tl-lg">Section Name</th>
                    <th className="px-2 py-3 text-center w-[15%]">Section Snippet</th>

                    <th className="px-2 py-3 text-center w-[20%]">Avg Accuracy</th>
                    <th className="px-2 py-3 text-center w-[10%]">Avg Time/Q</th>
                    <th className="px-2 py-3 text-center w-[20%] rounded-tr-lg">Time (Avg / Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sectionData.map((section: any) => (
                    <tr key={section.name} className="hover:bg-muted/30">
                      <td className="px-2 py-3 font-medium">{section.name}</td>
                      <td className="px-2 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSectionName(section.name)}>
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </td>

                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${section.avgAccuracy >= 70 ? 'bg-green-500' : section.avgAccuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${section.avgAccuracy}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-9 text-right">{section.avgAccuracy.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {formatDuration(Math.round(section.avgTime))}
                      </td>
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {formatDuration(Math.round(section.totalTimeSpent / section.totalAttempts))} /{" "}
                        {sharedPools[section.sectionId]
                          // The pool is the only limit the runner enforces over a
                          // grouped section — its own minutes would read a fair
                          // 40-of-45-pooled sitting as an overrun.
                          ? `${sharedPools[section.sectionId].minutes}m shared`
                          : `${section.timeLimit}m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Question-Level Analytics (Creator Only) */}
        {examId && questionStats.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Question Analysis</h3>
            <div className="overflow-x-auto pb-4">
              <table className="w-full text-sm text-left min-w-[700px]">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-2 py-3 text-center w-[80px] rounded-tl-lg">Q. No</th>
                    <th className="px-2 py-3 text-center w-[150px]">Question Snippet</th>

                    <th className="px-2 py-3 text-center w-[30%]">Accuracy</th>
                    <th className="px-2 py-3 text-center w-[15%] rounded-tr-lg">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(
                    questionStats.reduce((groups: any, q) => {
                      const group = groups[q.sectionName] || [];
                      group.push(q);
                      groups[q.sectionName] = group;
                      return groups;
                    }, {})
                  ).sort((a: any, b: any) => {
                    const orderA = a[1][0]?.sectionSortOrder || 0;
                    const orderB = b[1][0]?.sectionSortOrder || 0;
                    return orderA - orderB;
                  }).map(([sectionName, questions]: [string, any]) => (
                    <Fragment key={sectionName}>
                      <tr
                        className="bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleSection(sectionName)}
                      >
                        <td colSpan={4} className="px-4 py-2 font-semibold text-primary">
                          <div className="flex items-center gap-2">
                            {collapsedSections.has(sectionName) ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            {sectionName}
                            <Badge variant="outline" className="ml-2 text-xs font-normal">
                              {questions.length} questions
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {!collapsedSections.has(sectionName) && questions.sort((a: any, b: any) => a.q_no - b.q_no).map((q: QuestionStats, idx: number) => (
                        <tr key={q.id} className="hover:bg-muted/30">
                          <td className="px-2 py-3 font-medium text-center">{q.q_no}</td>
                          <td className="px-2 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                              <Eye className="w-4 h-4 text-primary" />
                            </Button>
                          </td>

                          <td className="px-2 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${q.accuracy >= 70 ? 'bg-green-500' : q.accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${q.accuracy}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-9 text-right">{q.accuracy.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center text-muted-foreground">
                            {q.avgTime.toFixed(1)}s
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Dialog open={!!selectedSectionName} onOpenChange={(open) => !open && setSelectedSectionName(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Section Snippet: {selectedSectionName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-8">
              {questionStats
                .filter(q => q.sectionName === selectedSectionName)
                .map((question, qIdx) => (
                  <div key={question.id} className="border rounded-lg p-6 bg-card">
                    <h4 className="font-semibold mb-4 text-primary">Question {qIdx + 1}</h4>
                    {/* Images */}
                    {(
                      (question.imageUrls && question.imageUrls.length > 0) ? (
                        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {question.imageUrls.map((url, idx) => (
                            <div key={idx} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                              <img
                                src={url}
                                alt={`Question ${question.q_no} Image ${idx + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                              />
                            </div>
                          ))}
                        </div>
                      ) : question.imageUrl ? (
                        <div className="mb-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                          <img
                            src={question.imageUrl}
                            alt={`Question ${question.q_no}`}
                            loading="lazy"
                                decoding="async"
                                className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                          />
                        </div>
                      ) : null
                    )}
                    <div
                      className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert mb-4"
                      dangerouslySetInnerHTML={{ __html: renderMathInHtml(question.text) }}
                    />

                    {question.options && (
                      <div className="space-y-2">
                        <p className="font-semibold text-sm text-muted-foreground">Options:</p>
                        {((Array.isArray(question.options) ? question.options : []) as string[]).map((option, oIdx) => {
                          const correctVal = question.correctAnswer;
                          const normalize = (val: any) => String(val).trim().toLowerCase();
                          let isCorrect = false;

                          if (Array.isArray(correctVal)) {
                            isCorrect = correctVal.some((c: any) => normalize(c) === normalize(option));
                          } else if (typeof correctVal === 'object' && correctVal !== null) {
                            const val = readObjectAnswer(correctVal);
                            isCorrect = normalize(val) === normalize(option);
                          } else {
                            isCorrect = normalize(correctVal) === normalize(option);
                          }

                          return (
                            <div
                              key={oIdx}
                              className={`flex items-center gap-3 p-3 rounded-md border ${isCorrect ? "bg-green-50 border-green-500 dark:bg-green-950" : "bg-background border-border"}`}
                            >
                              <span className="font-medium text-sm">{String.fromCharCode(65 + oIdx)})</span>
                              <div className="flex-1 min-w-0">
                                {String(option ?? "").trim() !== "" && (
                                  <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                                )}
                                {question.optionImageUrls?.[oIdx] && (
                                  <img
                                    src={question.optionImageUrls[oIdx]!}
                                    alt={`Option ${String.fromCharCode(65 + oIdx)}`}
                                    className="max-h-28 max-w-full rounded-md border border-border/60 mt-1"
                                  />
                                )}
                              </div>
                              {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="bg-muted p-3 rounded-md mt-4">
                      <span className="font-semibold">Correct Answer: </span>
                      <span
                        className="text-green-600 font-medium"
                        dangerouslySetInnerHTML={{
                          __html: renderMathInRichText(Array.isArray(question.correctAnswer)
                            ? question.correctAnswer.join(", ")
                            : (typeof question.correctAnswer === 'object'
                              ? (hasAnswerValue(readObjectAnswer(question.correctAnswer)) ? String(readObjectAnswer(question.correctAnswer)) : JSON.stringify(question.correctAnswer))
                              : String(question.correctAnswer)))
                        }}
                      />
                    </div>
                  </div>
                ))}
              {questionStats.filter(q => q.sectionName === selectedSectionName).length === 0 && (
                <p className="text-muted-foreground text-center">No questions found for this section.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedQuestion} onOpenChange={(open) => !open && setSelectedQuestion(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Question Details</DialogTitle>
            </DialogHeader>
            {selectedQuestion && (
              <div className="space-y-4">
                {/* Images */}
                {(
                  (selectedQuestion.imageUrls && selectedQuestion.imageUrls.length > 0) ? (
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedQuestion.imageUrls.map((url, idx) => (
                        <div key={idx} className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                          <img
                            src={url}
                            alt={`Question Image ${idx + 1}`}
                            loading="lazy"
                            decoding="async"
                            className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  ) : selectedQuestion.imageUrl ? (
                    <div className="mb-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                      <img
                        src={selectedQuestion.imageUrl}
                        alt="Question"
                        loading="lazy"
                            decoding="async"
                            className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                      />
                    </div>
                  ) : null
                )}
                <div
                  className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderMathInHtml(selectedQuestion.text) }}
                />

                {selectedQuestion.options && (
                  <div className="space-y-2 mt-4">
                    <p className="font-semibold text-sm text-muted-foreground">Options:</p>
                    {((Array.isArray(selectedQuestion.options) ? selectedQuestion.options : []) as string[]).map((option, idx) => {
                      const correctVal = selectedQuestion.correctAnswer;
                      const normalize = (val: any) => String(val).trim().toLowerCase();
                      let isCorrect = false;

                      if (Array.isArray(correctVal)) {
                        isCorrect = correctVal.some((c: any) => normalize(c) === normalize(option));
                      } else if (typeof correctVal === 'object' && correctVal !== null) {
                        const val = readObjectAnswer(correctVal);
                        isCorrect = normalize(val) === normalize(option);
                      } else {
                        isCorrect = normalize(correctVal) === normalize(option);
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-md border relative ${isCorrect
                            ? "bg-green-50 border-green-500 dark:bg-green-950"
                            : (selectedQuestion.mostCommonWrong && normalize(selectedQuestion.mostCommonWrong) === normalize(option))
                              ? "bg-red-50 border-red-500 dark:bg-red-950"
                              : "bg-background border-border"
                            }`}
                        >
                          <span className="font-medium text-sm">{String.fromCharCode(65 + idx)})</span>
                          <div className="flex-1 min-w-0">
                            {String(option ?? "").trim() !== "" && (
                              <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                            )}
                            {selectedQuestion.optionImageUrls?.[idx] && (
                              <img
                                src={selectedQuestion.optionImageUrls[idx]!}
                                alt={`Option ${String.fromCharCode(65 + idx)}`}
                                className="max-h-28 max-w-full rounded-md border border-border/60 mt-1"
                              />
                            )}
                          </div>
                          {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {!isCorrect && selectedQuestion.mostCommonWrong && normalize(selectedQuestion.mostCommonWrong) === normalize(option) && (
                            <Badge variant="destructive" className="text-[10px] h-5 px-1.5 ml-2 whitespace-nowrap">
                              Most Common Wrong Answer
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="bg-muted p-3 rounded-md">
                  <span className="font-semibold">Correct Answer: </span>
                  <span className="text-green-600 font-medium">
                    {Array.isArray(selectedQuestion.correctAnswer)
                      ? selectedQuestion.correctAnswer.join(", ")
                      : (typeof selectedQuestion.correctAnswer === 'object'
                        ? (hasAnswerValue(readObjectAnswer(selectedQuestion.correctAnswer)) ? String(readObjectAnswer(selectedQuestion.correctAnswer)) : JSON.stringify(selectedQuestion.correctAnswer))
                        : String(selectedQuestion.correctAnswer))}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Recent Attempts List (Student Only) */}
        {!examId && (
          <div className="mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">History</h3>
            <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50 shadow-sm">
              {attempts.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 md:p-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/15 to-[#A855F7]/8 border border-[#6C3EF4]/15 flex items-center justify-center mb-4">
                    <BookOpen className="h-8 w-8 text-[#A855F7]/70" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">No history yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">When you take exams, your detailed performance tracking and score history will appear here.</p>
                </div>
              ) : !ranksResolved ? (
                <div className="flex items-center justify-center py-12">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (() => {
                const getRankForGroup = (group: any) => {
                  for (const id of group.allAttemptIds) {
                    if (examRanks[id]) return examRanks[id];
                  }
                  return null;
                };

                return studentSessionsList.map((group: any, idx: number) => (
                  <div
                    key={group.firstAttemptId}
                    className={`flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                      idx !== 0 ? 'border-t border-border' : ''
                    }`}
                    onClick={() => navigate(`/exam/review/${group.firstAttemptId}`)}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="font-semibold text-[15px] leading-snug truncate">{group.examName}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.sections.length} section{group.sections.length > 1 ? 's' : ''}&nbsp;&bull;&nbsp;{group.date}&nbsp;&bull;&nbsp;{formatDuration(group.totalTime || 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      {(() => {
                        const rankInfo = getRankForGroup(group);
                        return rankInfo ? (
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                            rankInfo.rank === 1
                              ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800'
                              : 'bg-primary/10 text-primary border-primary/20'
                          }`}>
                            {rankInfo.rank === 1 && <span>🏆</span>}
                            #{rankInfo.rank}<span className="opacity-60">/{rankInfo.total}</span>
                          </span>
                        ) : null;
                      })()}
                      <div className="text-right">
                        {group.sessionHasMarks ? (
                          <>
                            <p className="font-semibold text-[15px] leading-snug tabular-nums">
                              {Math.round(group.totalMarks * 100) / 100} marks
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {group.totalScore}/{group.totalQuestions} correct
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-[15px] leading-snug">
                              {group.totalScore}/{group.totalQuestions}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {group.totalQuestions > 0
                                ? ((group.totalScore / group.totalQuestions) * 100).toFixed(1)
                                : 0}%
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
