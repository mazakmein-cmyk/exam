import { useEffect, useState, Fragment, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingUp, Clock, Target, Users, BookOpen, Eye, CheckCircle2, ChevronDown, ChevronRight, Info } from "lucide-react";
// Aliased: the chart library's Tooltip already owns the bare name on this page.
import { Tooltip as InfoTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizeAnswerText } from "@/lib/answerNormalize.js";
import { fileExpiredAttempts } from "@/services/attemptFiling";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SEO from "@/components/SEO";
import { formatDuration } from "@/lib/utils";
import { fetchTimingGroups } from "@/lib/timingGroupSettings";
import { groupDisplayName, groupPoolMinutes, resolveTimingGroupIds } from "@/lib/timingGroups.js";
import { getRowBudget, allocateRows, BUDGET_UNLIMITED } from "@/lib/rowBudget";

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
  /**
   * Identity of the section this question belongs to — section_group_id, which
   * is one id shared by every language variant. NOT the name: names are
   * translated per language (ExamIntro walks siblings to localise them), so
   * keying on one both splits a translated section and merges two sections a
   * creator left on the same default name.
   */
  sectionKey: string;
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
import { studentSectionColumns } from "@/lib/sectionColumns";

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
  // Every section's language and birthday. Completion is judged against the
  // sections that existed WHEN A SITTING STARTED, so the section list itself —
  // not just today's last id — has to be in hand.
  const [sectionMeta, setSectionMeta] = useState<{
    id: string;
    language: string;
    created_at: string;
    name: string;
    time_minutes: number;
    sort_order: number;
    section_group_id: string | null;
  }[]>([]);
  /** Which language authored the paper; its row labels every merged section. */
  const [primaryLanguage, setPrimaryLanguage] = useState<string | null>(null);
  const [questionStats, setQuestionStats] = useState<QuestionStats[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionStats | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  /**
   * Sections the creator explicitly asked to see in full, by identity. Exempt
   * from the row budget and contributing nothing to it, so revealing one
   * section never changes what another is showing.
   */
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  /** Set by "View all": drops the budget for the whole table in one click. */
  const [showAllRows, setShowAllRows] = useState(false);
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
  const toggleSection = (sectionKey: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionKey)) {
      newCollapsed.delete(sectionKey);
    } else {
      newCollapsed.add(sectionKey);
    }
    setCollapsedSections(newCollapsed);
  };

  /** "View more" on one section: show the rest of it, and keep it shown. */
  const expandSection = (sectionKey: string) => {
    setExpandedSections(prev => new Set(prev).add(sectionKey));
  };

  // Lazy filing of abandoned attempts (resume spec) — this page is the other
  // place a student reliably lands. Fire-and-forget, once per tab session; a
  // filed attempt shows up on the next load rather than racing this one.
  useEffect(() => {
    void fileExpiredAttempts();
  }, []);

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
    setSectionMeta([]);
    setPrimaryLanguage(null);
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

        // Resolved before the batch below: it decides whether the hand-migrated
        // timing_group_id can be named. Probed once per session and cached.
        const sectionCols = await studentSectionColumns();

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
          { data: engagedRaw, error: engagedError },
        ] = await Promise.all([
          supabase.from("exams").select("name, user_id, primary_language").eq("id", examId).single(),
          supabase
            .from("sections")
            // A named column list, not select("*"). The wide select was also
            // handing this page's readers pdf_url and pdf_name — a link to the
            // source question paper and its original file name — and /analytics
            // is a STUDENT route. Nothing here reads either field.
            //
            // studentSectionColumns still solves what the old comment was about:
            // it names the hand-migrated timing_group_id only when the column
            // exists, so timing groups keep working on both sides of that
            // migration instead of the query failing pre-migration.
            .select(sectionCols as "*")
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
                  section_group_id,
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
                section:sections!inner(id, name, exam_id, sort_order, language, section_group_id)
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
          // Which sittings actually answered something. Counted in the database
          // against the same mock_has_answer the marks engine uses for a skip,
          // so viewing a question is not answering it.
          (supabase.rpc as any)("get_exam_engaged_attempts", { p_exam_id: examId }),
        ]);

        // Zero rows (PGRST116) is RLS hiding an unpublished exam from a
        // non-owner — an ownership answer, not a failure.
        if (examError && (examError as any).code !== "PGRST116") throw examError;
        // Ownership gate. This branch renders the creator dashboard, and until
        // now RLS alone decided what it showed — a student pasting ?examId=
        // walked into a hollow creator UI, and any future base-table read
        // would quietly reopen the leak. Both ids are already in hand from
        // requests this page always made, so the gate costs nothing.
        if (!examData || (examData as any).user_id !== user.id) {
          navigate(role === "creator" ? "/dashboard" : "/analytics", { replace: true });
          return;
        }
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
        // Missing function = not migrated yet. Fall back to "every attempt
        // counts", which is exactly the behaviour this replaces, rather than
        // blanking a dashboard over a metric definition.
        const engagedMigrated =
          !engagedError || !/does not exist|schema cache/i.test(engagedError.message || "");
        if (engagedError && !engagedMigrated) {
          console.warn(
            "get_exam_engaged_attempts missing — counting every start as an attempt. " +
            "Apply 20260845000000_engaged_attempts.sql.",
            engagedError
          );
        } else if (engagedError) {
          throw engagedError;
        }
        const engagedIds = new Set<string>(((engagedRaw as any) || []) as string[]);
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

        if (allSections && allSections.length > 0) {
          const langMap = new Map<string, any[]>();
          allSections.forEach(s => {
            const lang = s.language || 'en';
            if (!langMap.has(lang)) langMap.set(lang, []);
            langMap.get(lang)!.push(s);
          });
          
          // The opener of each language variant delimits a sitting.
          langMap.forEach((secs) => {
            localFirstIds.add(secs[0].id);
          });

          setFirstSectionIds(localFirstIds);
          setSectionMeta(
            allSections.map((sec: any) => ({
              id: sec.id,
              language: sec.language || "en",
              created_at: sec.created_at,
              name: sec.name || "Unknown Section",
              time_minutes: sec.time_minutes || 0,
              sort_order: sec.sort_order || 0,
              section_group_id: sec.section_group_id || null,
            }))
          );
          setPrimaryLanguage((examData as any)?.primary_language || null);
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
            // A sitting counts once the student answered something. Before the
            // migration lands every attempt counts, as it always did.
            engaged: engagedMigrated ? engagedIds.has(attempt.id) : true,
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
              /** Was any section of this sitting actually handed in? */
              hasSubmitted: boolean;
              /** Did anyone answer anything in it? */
              hasEngaged: boolean;
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
              // Marks are written by the grader, and the grader only runs on
              // submission — so an abandoned section has marks_score NULL by
              // construction, not because the creator forgot to configure one.
              // Letting it answer "does this sitting have marks?" is what let a
              // single closed tab switch the whole board to correct-count
              // ranking. Only handed-in sections get a say, which is exactly
              // what get_my_exam_ranks does: it filters to submitted BEFORE its
              // bool_and(has_marks).
              const marksCounted = counted.filter(a => a.submitted_at);
              return {
                userId: uid,
                // Unchanged on purpose: what the board SHOWS and ranks by is not
                // what this fix is about, and abandoned rows still contribute
                // their real score the way they always have.
                totalScore: counted.reduce((s, a) => s + (a.score || 0), 0),
                totalQuestions: counted.reduce((s, a) => s + (a.total_questions || 0), 0),
                totalMarks: counted.reduce((s, a) => s + marksOf(a).value, 0),
                sessionHasMarks:
                  marksCounted.length > 0 && marksCounted.every(a => marksOf(a).hasMarks),
                hasSubmitted: marksCounted.length > 0,
                // `atts`, not `counted`: an engaged attempt that lost the
                // per-section tie-break still proves the sitting was real.
                hasEngaged: atts.some(a => a.engaged !== false),
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

            // Rank by marks when every session has marks; otherwise by RAW
            // CORRECT COUNT — the owner's decision (2026-08-23), and exactly
            // what get_my_exam_ranks does (`ELSE r.total_score`). This board
            // used to fall back to accuracy % here, so the same cohort ranked
            // one way on the creator's screen and another on every student's
            // badge whenever sittings differed in size.
            // A sitting where nothing was answered is not a result. Every tile
            // on this page already ignores those (see engagedAttempts); leaving
            // them here put a 0/N ghost on Top Students whenever an exam had
            // fewer than three real sittings. Before 20260845000000 lands
            // `engaged` is true for everything, so this filter is a no-op and
            // the board is exactly what it is today.
            const board = sessions.filter(s => s.hasEngaged);

            // Only sittings that were handed in get a vote on the ranking basis.
            // An abandoned one cannot have marks, so counting it guaranteed the
            // gate failed — one closed tab silently demoted the whole exam to
            // correct-count ranking and inverted it, promoting the guesser over
            // the student who left the risky questions alone.
            const gateSessions = board.filter(s => s.hasSubmitted);
            const rankByMarks =
              gateSessions.length > 0 && gateSessions.every(s => s.sessionHasMarks);
            const rankValueOf = (s: LbSession) =>
              rankByMarks ? s.totalMarks : s.totalScore;

            board.sort((a, b) => {
              const va = rankValueOf(a);
              const vb = rankValueOf(b);
              if (vb !== va) return vb - va;
              // Display order only — equal values share the rank below, as they
              // do in the SQL's RANK(). Fewer questions faced sorts first.
              return a.totalQuestions - b.totalQuestions;
            });

            // Competition-style ranking
            const rankedSessions: (LbSession & { rank: number })[] = [];
            for (let i = 0; i < board.length; i++) {
              const s = board[i];
              let rank = i + 1;
              if (i > 0 && rankValueOf(s) === rankValueOf(board[i - 1])) {
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

          // ONE ROW PER QUESTION, NOT PER TRANSLATION.
          //
          // A bilingual paper stores a separate parsed_questions row per
          // language — that is how a Hindi student sees Hindi text — linked to
          // its primary twin by question_group_id, a pairing PublishExamDialog
          // refuses to ship without. This page grouped by section NAME, which
          // every language variant shares, so a 25-question paper listed 50
          // rows: each question twice, each copy carrying only the students who
          // sat in that language. The whole-class number — the only one a
          // creator actually wants — appeared nowhere on the screen.
          //
          // Pooling here rather than in SQL keeps get_exam_analytics counting
          // rows where they live; which language a student read is a
          // presentation detail, and this is the presentation layer.
          const primaryLang = (examData as any)?.primary_language || null;
          const questionGroups = new Map<string, any[]>();
          (questionsData || []).forEach((q: any) => {
            // Single-language exams have no group id — the question is its own
            // group, so this collapses to exactly the old behaviour.
            const key = q.question_group_id || q.id;
            if (!questionGroups.has(key)) questionGroups.set(key, []);
            questionGroups.get(key)!.push(q);
          });

          const labelNorm = (v: any) => String(v ?? "").trim().toLowerCase();

          const finalStats: QuestionStats[] = Array.from(questionGroups.values()).map(rows => {
            // Content comes from the primary language: it is the paper the
            // creator authored, and the option text every dialog renders.
            const primary =
              rows.find((r: any) => (r.section?.language || null) === primaryLang) || rows[0];

            const aggs = rows
              .map((r: any) => statByQuestion.get(r.id))
              .filter(Boolean) as any[];
            const pool = (field: string) => aggs.reduce((n, a) => n + (a[field] ?? 0), 0);

            const totalAttempts = pool("total_attempts");
            const correctCount = pool("correct_count");
            const totalTime = pool("total_time_seconds");

            // The winning wrong answer is stored as the option TEXT it matched,
            // so it cannot be pooled as a string: the same choice is spelled one
            // way in English and another in Hindi, and a Hindi label would
            // highlight nothing on a primary-language paper. Resolve each
            // translation's label to an option INDEX within its own options,
            // take the index the larger cohort chose, and render the primary
            // paper's wording for it.
            //
            // The weight is that translation's TOTAL wrong count, not the count
            // for this particular label — the summary ships only the winning
            // label, not the tally behind it. A proxy, and monotonic in cohort
            // size, which is all it is used for: choosing between two languages.
            const indexWeight = new Map<number, number>();
            let fallbackLabel: string | null = null;
            let fallbackWrong = -1;

            rows.forEach((r: any) => {
              const agg = statByQuestion.get(r.id);
              const label = agg?.most_common_wrong;
              if (typeof label !== "string" || label.trim() === "") return;
              const wrong = agg?.wrong_count ?? 0;
              if (wrong > fallbackWrong) {
                fallbackWrong = wrong;
                fallbackLabel = label;
              }
              const opts = Array.isArray(r.options) ? r.options : [];
              const idx = opts.findIndex((o: any) => labelNorm(o) === labelNorm(label));
              if (idx >= 0) indexWeight.set(idx, (indexWeight.get(idx) || 0) + wrong);
            });

            let mostCommonWrong: string | null = fallbackLabel;
            if (indexWeight.size > 0) {
              const winningIndex = [...indexWeight.entries()].sort(
                (a, b) => b[1] - a[1] || a[0] - b[0]
              )[0][0];
              const primaryOptions = Array.isArray(primary.options) ? primary.options : [];
              // Falls back to the label when the primary paper has no option at
              // that index — a numeric or short-answer question, where the label
              // is language-independent anyway.
              mostCommonWrong = primaryOptions[winningIndex] ?? fallbackLabel;
            }

            return {
              id: primary.id,
              q_no: primary.q_no,
              text: primary.text,
              // The section's identity, so the snippet dialog can match on it
              // instead of on a name that may be translated.
              sectionKey: primary.section.section_group_id || primary.section.id,
              sectionName: primary.section.name,
              sectionSortOrder: primary.section.sort_order,
              totalAttempts,
              correctCount,
              wrongCount: pool("wrong_count"),
              unansweredCount: pool("unanswered_count"),
              accuracy: totalAttempts > 0 ? (correctCount / totalAttempts) * 100 : 0,
              avgTime: totalAttempts > 0 ? totalTime / totalAttempts : 0,
              correctAnswer: primary.correct_answer,
              answerType: primary.answer_type,
              options: primary.options,

              imageUrl: primary.image_url,
              imageUrls: primary.image_urls,
              optionImageUrls: Array.isArray(primary.option_image_urls)
                ? primary.option_image_urls
                : null,
              reviewedCount: pool("reviewed_count"),
              // The full tally stays in the database; only the winning label is
              // shipped, already capped at 120 chars there. A blank label is a
              // cleared answer counted before 20260833000000 landed — not a
              // misconception anyone can act on.
              commonWrongAnswers: {},
              mostCommonWrong:
                typeof mostCommonWrong === "string" && mostCommonWrong.trim() !== ""
                  ? mostCommonWrong
                  : null,
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

  // Completed attempts for performance stats. `engaged` too, or a paper handed
  // in without a single answer would sit in the accuracy and time averages as a
  // real 0% while being excluded from Total Attempts and Completion — the two
  // halves of one dashboard disagreeing about who counts, which is the whole
  // problem this rule exists to end. See engagedAttempts below.
  const completedAttempts = attempts.filter(
    a => a.submitted_at && (!examId || (a as any).engaged !== false)
  );
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
    //
    // Attempts whose section/exam came back NULL (RLS hides an unpublished
    // exam) are KEPT — owner's decision (2026-08-23): nothing a student did
    // ever disappears. They row up labelled "(exam no longer available)", and
    // keeping them is what makes this list's count agree with the accuracy
    // and avg-time tiles, which have always been computed over the raw
    // attempts array. Filtering them out here showed "Total Mock Exams: 0"
    // above a non-zero accuracy.
    const sortedAttempts = [...attempts]
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
        // A null section/exam is RLS hiding an unpublished exam, not missing
        // data — say so instead of crashing or pretending it never happened.
        examName: first.section?.exam
          ? (first.section.exam.name || 'Unknown Exam')
          : '(exam no longer available)',
        date: new Date(first.submitted_at).toLocaleDateString(),
        sections: counted.map(a => a.section?.name || '—'),
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

  // A sitting is a sitting once the student answered something. Clicking Start
  // creates a row before any of that — the clock and resume both need one — so
  // every headline number below filters on `engaged` or it would count people
  // who bounced off the start screen as students who scored zero. Set by
  // get_exam_engaged_attempts; true for everything on an un-migrated database.
  // completedAttempts above applies the same filter for the same reason.
  const engagedAttempts = examId
    ? attempts.filter(a => (a as any).engaged !== false)
    : attempts;

  const totalAttempts = examId 
    ? (firstSectionIds.size > 0 ? engagedAttempts.filter(a => firstSectionIds.has(a.section_id)).length : 0)
    : studentSessionsList.length;

  // Completion, judged one sitting at a time.
  //
  // This used to be "submitted whichever section is last TODAY", a definition
  // re-applied to the whole history on every load. Appending a section
  // therefore un-completed every sitting that finished before it existed — a
  // paper 50 people completed read 0% — and because the two halves counted
  // different sections, the rate could also exceed 100%.
  //
  // A sitting is complete when it submitted every section that existed when it
  // STARTED. Editing the exam can no longer rewrite the past, and since each
  // sitting is opened by exactly one first-section attempt, `completed` is
  // counted out of the same sittings totalAttempts counts — the rate cannot
  // pass 100%.
  const completedSittings = (() => {
    if (!examId || firstSectionIds.size === 0 || sectionMeta.length === 0) return 0;

    const metaById = new Map(sectionMeta.map(sec => [sec.id, sec]));
    const byUser: Record<string, any[]> = {};
    engagedAttempts.forEach(a => {
      (byUser[a.user_id] ||= []).push(a);
    });

    let completed = 0;
    const judge = (sitting: any[]) => {
      const opener = metaById.get(sitting[0].section_id);
      // Section deleted since: nothing survives to judge the sitting against.
      if (!opener) return;
      const startedAt = new Date(sitting[0].created_at).getTime();
      if (Number.isNaN(startedAt)) return;
      // Same language only — a Hindi sitting is not incomplete for skipping the
      // English sections.
      const required = sectionMeta.filter(
        sec =>
          sec.language === opener.language &&
          new Date(sec.created_at).getTime() <= startedAt
      );
      if (required.length === 0) return;
      const submitted = new Set(
        sitting.filter(a => a.submitted_at).map(a => a.section_id)
      );
      if (required.every(sec => submitted.has(sec.id))) completed++;
    };

    Object.values(byUser).forEach(list => {
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      let cur: any[] | null = null;
      sorted.forEach(a => {
        if (firstSectionIds.has(a.section_id)) {
          if (cur) judge(cur);
          cur = [a];
        } else if (cur) {
          cur.push(a);
        }
        // An attempt before any first-section attempt has no datable start, so
        // it opens no sitting — it is not counted either side of the ratio.
      });
      if (cur) judge(cur);
    });

    return completed;
  })();

  const submittedCount = examId
    ? completedSittings
    : attempts.filter(a => a.submitted_at).length;

  const completionRate = totalAttempts > 0 ? (submittedCount / totalAttempts) * 100 : 0;

  // Repeat Attempts (Creator Only)
  // Repeat Attempts (Creator Only)
  const studentAttempts = engagedAttempts.reduce((acc: any, attempt) => {
    // Only count attempts for the first section to avoid counting section transitions as repeats
    if (examId && firstSectionIds.size > 0 && !firstSectionIds.has(attempt.section_id)) {
      return acc;
    }
    acc[attempt.user_id] = (acc[attempt.user_id] || 0) + 1;
    return acc;
  }, {});
  const repeatersCount = Object.values(studentAttempts).filter((count: any) => count > 1).length;

  const uniqueStudents = new Set(engagedAttempts.map(a => a.user_id)).size;

  const totalCorrectQs = validAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
  const totalAttemptedQs = validAttempts.reduce((sum, a) => sum + (a.total_questions || 0), 0);
  // Correct ÷ ALL questions — a SCORE percentage: skipping lowers it. It was
  // labelled "Accuracy" for a long time, which told a careful-but-slow student
  // they didn't know their concepts (issue 13).
  const overallAccuracy = totalAttemptedQs > 0 ? (totalCorrectQs / totalAttemptedQs) * 100 : 0;
  // Correct ÷ ANSWERED — true accuracy: of the shots taken, how many hit.
  // Attempts older than 20260838000000 carry no answered count and fall back
  // to the full-paper denominator, i.e. to the score% this tile used to show.
  const totalAnsweredQs = validAttempts.reduce(
    (sum, a) => sum + ((a as any).questions_answered ?? a.total_questions ?? 0),
    0
  );
  const trueAccuracy = totalAnsweredQs > 0 ? (totalCorrectQs / totalAnsweredQs) * 100 : 0;
  
  const totalTimeSpentQs = validAttempts.reduce((sum, a) => sum + (Math.round((a.avg_time_per_question || 0) * (a.total_questions || 0))), 0);
  // The speed tile divides by questions actually OPENED, not the paper's full
  // count — the full count made abandoning 90 of 100 questions read as being
  // 10x faster (issue 12). Attempts older than 20260838000000 carry no
  // visited count and fall back to the old denominator.
  const totalVisitedQs = validAttempts.reduce(
    (sum, a) => sum + ((a as any).questions_visited ?? a.total_questions ?? 0),
    0
  );
  const avgTimePerQuestion = totalVisitedQs > 0 ? totalTimeSpentQs / totalVisitedQs : 0;
  

  // For Student View: Trend of accuracy over attempts
  // For Creator View: Trend of average accuracy over time (grouped by day)
  const accuracyTrendData = examId
    ? (() => {
      // This line has to add up to the Total Attempts tile above it — both are
      // "sittings where the student answered something". It counted only
      // SUBMITTED ones, so the bars summed to less than the tile and there was
      // nothing on screen to explain the gap.
      //
      // Keyed on the day the paper was TAKEN, falling back to created_at:
      // an abandoned sitting has no submitted_at, and bucketing it by that
      // would file every one of them under "Invalid Date".
      const grouped: Record<string, any> = {};
      const dayOf = (attempt: any) => {
        const d = new Date(attempt.submitted_at || attempt.created_at);
        if (Number.isNaN(d.getTime())) return null;
        // Sort key is ISO so it orders lexicographically and never depends on
        // the viewer's date format; the label stays local for display.
        return {
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          label: d.toLocaleDateString(),
        };
      };
      const bucket = (day: { key: string; label: string }) => {
        if (!grouped[day.key]) {
          grouped[day.key] = { key: day.key, date: day.label, totalAccuracy: 0, scoreCount: 0, attemptCount: 0 };
        }
        return grouped[day.key];
      };

      // The Attempts line: every engaged sitting, matching the tile exactly.
      engagedAttempts.forEach((attempt: any) => {
        // Fallback: with no firstSectionIds determined, counting everything is
        // safer than counting nothing.
        if (firstSectionIds.size > 0 && !firstSectionIds.has(attempt.section_id)) return;
        const day = dayOf(attempt);
        if (day) bucket(day).attemptCount++;
      });

      // Accuracy is averaged over GRADED sittings only. Folding an abandoned
      // one in as a 0% would invent a score nobody was given.
      validAttempts.forEach((attempt: any) => {
        const day = dayOf(attempt);
        if (!day) return;
        const g = bucket(day);
        g.totalAccuracy += attempt.accuracy_percentage;
        g.scoreCount++;
      });

      return Object.values(grouped)
        .sort((a: any, b: any) => a.key.localeCompare(b.key))
        .map((g: any) => ({
          date: g.date,
          // null, not 0: a day with only abandoned sittings has no accuracy to
          // report, and recharts draws a gap rather than a dive to zero.
          accuracy: g.scoreCount > 0 ? parseFloat((g.totalAccuracy / g.scoreCount).toFixed(2)) : null,
          attempts: g.attemptCount,
        }));
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
  // A section's identity is its section_group_id — one id shared by every
  // language variant — not its name.
  //
  // Keying on the name did two opposite wrong things at once. Section names are
  // TRANSLATED per language (ExamIntro walks siblings via section_group_id to
  // localise them, and only time_minutes is mirrored on rename), so a creator
  // who renders the Hindi section in Hindi split one section into two rows with
  // half the cohort each. And every new section is created named "New Section",
  // so two a creator never renamed merged into one row averaging two unrelated
  // papers — hiding a weak section behind a strong one.
  //
  // The label, time limit and position come from the PRIMARY language's row
  // rather than whichever attempt happened to land first. time_minutes and
  // sort_order are mirrored across twins so those agree either way; the name and
  // the id behind the shared-pool badge do not.
  const sectionByKey = new Map<string, any>();
  sectionMeta.forEach(sec => {
    const key = sec.section_group_id || sec.id;
    const current = sectionByKey.get(key);
    // Primary wins; otherwise first seen, so a single-language exam is unchanged.
    if (!current || (primaryLanguage && sec.language === primaryLanguage)) {
      sectionByKey.set(key, sec);
    }
  });

  const sectionPerformance = validAttempts.reduce((acc: any, attempt) => {
    // Guard clause for missing section data
    if (!attempt.section) return acc;

    const key =
      (attempt.section as any).section_group_id || attempt.section_id;
    // Prefer the primary row's facts; fall back to this attempt's own section
    // when the section list has not loaded or the row has since been deleted.
    const label = sectionByKey.get(key);

    if (!acc[key]) {
      acc[key] = {
        key,
        name: label?.name || attempt.section.name || "Unknown Section",
        sectionId: label?.id || attempt.section_id,
        totalAttempts: 0,
        avgAccuracy: 0,
        totalAccuracy: 0,
        totalTime: 0,
        avgTime: 0,
        totalTimeSpent: 0,
        timeLimit: label?.time_minutes ?? attempt.section.time_minutes ?? 0,
        sortOrder: label?.sort_order ?? attempt.section.sort_order ?? 0,
        createdAt: label?.created_at || attempt.section.created_at || new Date().toISOString()
      };
    }
    acc[key].totalAttempts++;
    acc[key].totalAccuracy += attempt.accuracy_percentage;
    acc[key].totalTime += attempt.avg_time_per_question; // Keep for existing charts if needed
    acc[key].totalTimeSpent += (attempt.total_time_spent || 0);

    acc[key].avgAccuracy =
      parseFloat((acc[key].totalAccuracy / acc[key].totalAttempts).toFixed(2));
    acc[key].avgTime =
      acc[key].totalTime / acc[key].totalAttempts;

    return acc;
  }, {});

  /** Readable title for the snippet dialog, resolved from the selected identity. */
  const selectedSectionLabel =
    sectionByKey.get(selectedSectionKey || "")?.name ??
    questionStats.find(q => q.sectionKey === selectedSectionKey)?.sectionName ??
    "";

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
    engagedAttempts.forEach(a => {
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

  /**
   * How many rows this device is worth painting before the creator asks for
   * more. A device fact, not a data fact — resolved once per mount.
   */
  const rowBudget = useMemo(() => getRowBudget(), []);

  /**
   * Question Analysis rows, grouped by section and sorted, once per data change.
   *
   * This used to live inline in the JSX, which meant every unrelated re-render
   * on this page — opening a dialog, a tooltip, revealing a section — re-ran the
   * reduce and re-sorted every question. It also sorted the grouped arrays in
   * place while rendering. Both are why the table felt slow to interact with
   * even after it had painted.
   */
  const questionSections = useMemo(() => {
    const groups = questionStats.reduce((groups: Record<string, QuestionStats[]>, q) => {
      // By identity, not name: two sections left on the same default name would
      // otherwise share one heading.
      const group = groups[q.sectionKey] || [];
      group.push(q);
      groups[q.sectionKey] = group;
      return groups;
    }, {});

    return Object.entries(groups)
      .sort((a, b) => (a[1][0]?.sectionSortOrder || 0) - (b[1][0]?.sectionSortOrder || 0))
      .map(([sectionKey, questions]) => ({
        sectionKey,
        sectionName: questions[0]?.sectionName ?? "Unknown Section",
        // Copied before sorting: questionStats is state, and the inline version
        // reordered the caller's own arrays mid-render.
        questions: [...questions].sort((a, b) => a.q_no - b.q_no),
      }));
  }, [questionStats]);

  /**
   * Visible row count per section, in the same order. "View all" and a roomy
   * device are the same thing here: no budget, no controls.
   */
  const visibleRowCounts = useMemo(
    () => allocateRows(
      questionSections.map(s => s.questions.length),
      showAllRows ? BUDGET_UNLIMITED : rowBudget,
      questionSections.map(s => expandedSections.has(s.sectionKey)),
    ),
    [questionSections, rowBudget, showAllRows, expandedSections],
  );

  /**
   * Total rows behind a click right now — drives the header's "View all".
   *
   * Collapsed sections are skipped, deliberately WITHOUT refunding their budget:
   * allocateRows is STABLE by design (a section is charged whether or not it is
   * shown, so collapsing one never reflows another). But a collapsed section's
   * rows are hidden by the chevron, not by the budget — "View all" would lift
   * the budget and still paint nothing there, because rendering is gated on
   * !collapsed. Counting them made the header offer "View all" when every row
   * actually on screen was already visible.
   */
  const hiddenRowCount = questionSections.reduce(
    (n, section, i) =>
      collapsedSections.has(section.sectionKey)
        ? n
        : n + (section.questions.length - visibleRowCounts[i]),
    0,
  );

  /**
   * What "View all" will actually paint: every row of every OPEN section. The
   * label used to say questionStats.length, which counted rows inside collapsed
   * sections the click leaves collapsed.
   */
  const viewableQuestionCount = questionSections.reduce(
    (n, section) =>
      collapsedSections.has(section.sectionKey) ? n : n + section.questions.length,
    0,
  );

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
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Accuracy
                  <InfoTooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 cursor-help" aria-label="How accuracy is calculated" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      Of the questions you answered, how many were right.
                      Calculated as correct answers ÷ questions answered —
                      skipping a question doesn't lower it.
                    </TooltipContent>
                  </InfoTooltip>
                </span>
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-4xl font-black tracking-tight text-green-600 dark:text-green-500">{trueAccuracy.toFixed(1)}%</span>
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                Score: <span className="font-semibold text-foreground">{overallAccuracy.toFixed(1)}%</span>
                <InfoTooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 cursor-help" aria-label="How score is calculated" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] text-xs">
                    Correct answers ÷ all questions in your papers, skipped ones
                    included — so skipping lowers your score, not your accuracy.
                  </TooltipContent>
                </InfoTooltip>
              </div>
            </Card>

            <Card className="p-6 relative overflow-hidden group border-border/60 hover:-translate-y-0.5 transition-transform duration-200">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Avg Time / Attempted Question</span>
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
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Avg Score %
                    <InfoTooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 cursor-help" aria-label="How average score is calculated" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">
                        Correct answers ÷ all questions across every student's
                        attempt, skipped ones included.
                      </TooltipContent>
                    </InfoTooltip>
                  </span>
                  <span className="text-2xl font-black tracking-tight text-foreground block">{overallAccuracy.toFixed(1)}%</span>
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
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Avg Time / Attempted Q</span>
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
                    <tr key={section.key} className="hover:bg-muted/30">
                      <td className="px-2 py-3 font-medium">{section.name}</td>
                      <td className="px-2 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSectionKey(section.key)}>
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-semibold">Question Analysis</h3>
              {/* Only ever rendered when something is actually hidden, so a
                  device with room to spare shows no control at all. */}
              {hiddenRowCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowAllRows(true)}>
                  View all {viewableQuestionCount} questions
                </Button>
              )}
            </div>
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
                  {questionSections.map(({ sectionKey, sectionName, questions }, sectionIndex) => {
                    const visible = visibleRowCounts[sectionIndex];
                    const hidden = questions.length - visible;
                    const collapsed = collapsedSections.has(sectionKey);
                    return (
                    <Fragment key={sectionKey}>
                      <tr
                        className="bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleSection(sectionKey)}
                      >
                        <td colSpan={4} className="px-4 py-2 font-semibold text-primary">
                          <div className="flex items-center gap-2">
                            {collapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            {sectionName}
                            <Badge variant="outline" className="ml-2 text-xs font-normal">
                              {questions.length} questions
                            </Badge>
                            {/* The heading carries the count whether or not the
                                rows are on screen, so a section the budget could
                                not reach still announces its size. */}
                            {!collapsed && hidden > 0 && (
                              <span className="text-xs font-normal text-muted-foreground">
                                showing {visible}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {!collapsed && questions.slice(0, visible).map((q: QuestionStats) => (
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
                      {!collapsed && hidden > 0 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => expandSection(sectionKey)}>
                              View {hidden} more
                              <ChevronDown className="w-4 h-4 ml-1" />
                            </Button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Dialog open={!!selectedSectionKey} onOpenChange={(open) => !open && setSelectedSectionKey(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Section Snippet: {selectedSectionLabel}</DialogTitle>
            </DialogHeader>
            <div className="space-y-8">
              {questionStats
                .filter(q => q.sectionKey === selectedSectionKey)
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
                          const normalize = (val: any) => normalizeAnswerText(val);
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
              {questionStats.filter(q => q.sectionKey === selectedSectionKey).length === 0 && (
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
                      const normalize = (val: any) => normalizeAnswerText(val);
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
                        ) : (
                          // A row the server left unranked (issue 11): the
                          // grouping is re-derived from the paper AS IT IS NOW,
                          // so an attempt from before a restructure — or on an
                          // exam since unpublished — has no sitting to rank.
                          // Say so instead of leaving a silent gap. Rendered
                          // only after ranksResolved (the spinner above), so it
                          // never flashes while ranks are still loading.
                          <InfoTooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-border/60 bg-muted/50 text-muted-foreground cursor-help">
                                Unranked
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[250px] text-xs">
                              This attempt predates a change to the paper (or
                              its exam is no longer available), so it isn't
                              ranked against other students. Your score still
                              counts in your stats.
                            </TooltipContent>
                          </InfoTooltip>
                        );
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
