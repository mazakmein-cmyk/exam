import { useEffect, useState, Fragment, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingUp, Clock, Target, Users, BookOpen, Eye, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  reviewedCount: number;
  commonWrongAnswers: Record<string, number>;
  mostCommonWrong?: string | null;
}

import { useUserRole } from "@/hooks/use-user-role";

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
  // Creator leaderboard: top 3 sessions ranked by total score
  const [leaderboard, setLeaderboard] = useState<{ rank: number; userId: string; username: string; displayName: string; totalScore: number; totalQuestions: number }[]>([]);

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
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const from = searchParams.get("from");
        navigate(from === "marketplace" ? "/student-auth?from=marketplace" : "/student-auth");
        return;
      }

      let query = supabase
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
        .order("submitted_at", { ascending: false });

      if (examId) {
        // Creator View: Get all attempts for this exam (by joining sections)
        // Note: Supabase filtering on joined tables usually needs !inner for correct filtering, 
        // but since we are navigating from dashboard where we own the exam, we trust the ID. 
        // However, standard foreign key filtering in PostgREST:
        // attempts -> section -> exam_id.
        // We can do this by filtering on the joined column, but JS client requires specific syntax or embedded resource filtering.
        // Easier approach: Get sections for this exam first, then get attempts for those sections.

        // 1. Get Exam Name and Creator ID
        const { data: examData, error: examError } = await supabase
          .from("exams")
          .select("name, user_id")
          .eq("id", examId)
          .single();

        if (examError) throw examError;
        setExamName(examData.name);
        const examCreatorId = examData.user_id; // Store creator ID to filter out their attempts

        // 1.5 Get All Sections to determine First and Last (for analytics logic)
        const { data: allSections, error: sectionsError } = await supabase
          .from("sections")
          .select("id, sort_order, created_at, language")
          .eq("exam_id", examId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });

        if (sectionsError) throw sectionsError;

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

        // 2. Get attempts through sections
        const { data: sectionAttempts, error: attemptsError } = await supabase
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
          .eq("section.exam_id", examId) // This uses the inner join filter
          .order("submitted_at", { ascending: false });

        if (attemptsError) throw attemptsError;

        // Filter out the creator's own attempts from analytics
        const filteredAttempts = (sectionAttempts || []).filter(
          (attempt: any) => attempt.user_id !== examCreatorId
        );
        // NOTE: We do NOT setAttempts here yet. We need to correct them first.

        // 3. Get all questions for this exam to build stats
        const { data: questionsData, error: questionsError } = await supabase
          .from("parsed_questions")
          .select(`
            id, text, q_no, correct_answer, answer_type, options, image_url, image_urls,
            section:sections!inner(id, name, exam_id, sort_order)
          `)
          .eq("section.exam_id", examId);

        if (questionsError) throw questionsError;

        // 4. Get all responses for these attempts (chunked to avoid URL length limits)
        const attemptIds = filteredAttempts.map((a: any) => a.id);
        let responsesData: any[] = [];

        if (attemptIds.length > 0) {
          // Chunk attemptIds into batches of 200 to stay within Supabase URL limits
          const CHUNK_SIZE = 200;
          for (let i = 0; i < attemptIds.length; i += CHUNK_SIZE) {
            const chunk = attemptIds.slice(i, i + CHUNK_SIZE);
            const { data: respData, error: responsesError } = await supabase
              .from("responses")
              .select("question_id, is_correct, time_spent_seconds, selected_answer, attempt_id, is_marked_for_review")
              .in("attempt_id", chunk);

            if (responsesError) throw responsesError;
            if (respData) responsesData.push(...respData);
          }
        }

        // Helper for normalization
        const normalize = (val: any) => String(val).trim().toLowerCase();

        // Pre-build Maps for O(1) lookups (eliminates O(N²) .find()/.filter() inside loops)
        const responsesByAttempt = new Map<string, typeof responsesData>();
        responsesData.forEach(r => {
          if (!responsesByAttempt.has(r.attempt_id)) responsesByAttempt.set(r.attempt_id, []);
          responsesByAttempt.get(r.attempt_id)!.push(r);
        });

        const questionsById = new Map<string, any>();
        questionsData?.forEach((q: any) => questionsById.set(q.id, q));

        // Pre-compute question count per section (avoids .filter() inside every attempt loop)
        const questionCountBySection = new Map<string, number>();
        questionsData?.forEach((q: any) => {
          questionCountBySection.set(q.section.id, (questionCountBySection.get(q.section.id) || 0) + 1);
        });

        // 5. Compute attempt scores from DB-stored is_correct (set by examService on submit)
        // Fallback to re-grading only for legacy responses where is_correct is null
        const correctedAttempts = filteredAttempts.map((attempt: any) => {
          const attemptResponses = responsesByAttempt.get(attempt.id) || [];
          let correctCount = 0;
          let totalTime = 0;

          attemptResponses.forEach(r => {
            totalTime += (r.time_spent_seconds || 0);

            if (r.is_correct !== null && r.is_correct !== undefined) {
              // Trust the DB value (set by examService.ts on submit)
              if (r.is_correct) correctCount++;
            } else {
              // Fallback: re-grade only for legacy responses with null is_correct
              const question = questionsById.get(r.question_id);
              if (question && question.correct_answer) {
                const selected = r.selected_answer;
                const correct = question.correct_answer;
                let isCorrect = false;

                if (selected !== null && selected !== undefined) {
                  if (Array.isArray(correct)) {
                    const selectedArray = Array.isArray(selected) ? selected : [selected];
                    if (selectedArray.length === correct.length) {
                      const sortedSelected = [...selectedArray].map(normalize).sort();
                      const sortedCorrect = [...correct].map(normalize).sort();
                      isCorrect = sortedSelected.every((val, index) => val === sortedCorrect[index]);
                    }
                  } else if (typeof correct === 'object' && correct !== null) {
                    const val = (correct as any).answer || (correct as any).value;
                    isCorrect = normalize(val) === normalize(selected);
                  } else {
                    isCorrect = normalize(selected) === normalize(correct);
                  }
                }

                if (isCorrect) correctCount++;
              }
            }
          });

          const totalQuestions = questionCountBySection.get(attempt.section_id) || attempt.total_questions || 1;
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

        // Build attempt lookup Map for O(1) access in question stats aggregation
        const correctedAttemptsById = new Map<string, any>();
        correctedAttempts.forEach((a: any) => correctedAttemptsById.set(a.id, a));

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

            // Build sessions using same boundary logic as student ranking
            const sessions: { userId: string; totalScore: number; totalQuestions: number }[] = [];

            Object.entries(byUser).forEach(([uid, userAtts]) => {
              let cur: { userId: string; totalScore: number; totalQuestions: number } | null = null;
              const orphans: any[] = [];

              userAtts.forEach(att => {
                if (localFirstIds.has(att.section_id)) {
                  if (cur) sessions.push(cur);
                  cur = { userId: uid, totalScore: att.score || 0, totalQuestions: att.total_questions || 0 };
                } else if (cur) {
                  cur.totalScore += att.score || 0;
                  cur.totalQuestions += att.total_questions || 0;
                } else {
                  orphans.push(att);
                }
              });
              if (cur) sessions.push(cur);

              if (orphans.length > 0) {
                sessions.push({
                  userId: uid,
                  totalScore: orphans.reduce((s, a) => s + (a.score || 0), 0),
                  totalQuestions: orphans.reduce((s, a) => s + (a.total_questions || 0), 0),
                });
              }
            });

            // Sort by accuracy % descending, then by raw score descending
            sessions.sort((a, b) => {
              const pctA = a.totalQuestions > 0 ? a.totalScore / a.totalQuestions : 0;
              const pctB = b.totalQuestions > 0 ? b.totalScore / b.totalQuestions : 0;
              if (pctB !== pctA) return pctB - pctA;
              return b.totalScore - a.totalScore;
            });

            // Competition-style ranking (use for-loop to avoid self-referencing issue)
            const rankedSessions: (typeof sessions[0] & { rank: number })[] = [];
            for (let i = 0; i < sessions.length; i++) {
              const s = sessions[i];
              let rank = i + 1;
              if (i > 0) {
                const prevPct = sessions[i - 1].totalQuestions > 0
                  ? sessions[i - 1].totalScore / sessions[i - 1].totalQuestions : 0;
                const curPct = s.totalQuestions > 0 ? s.totalScore / s.totalQuestions : 0;
                if (curPct === prevPct) rank = rankedSessions[i - 1].rank;
              }
              rankedSessions.push({ ...s, rank });
            }

            // Take top 3
            const top3 = rankedSessions.slice(0, 3);

            if (top3.length > 0) {
              // Fetch profiles for top 3 unique user IDs
              const userIds = [...new Set(top3.map(s => s.userId))];
              const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, username, full_name')
                .in('id', userIds);

              const profileMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

              setLeaderboard(top3.map(s => {
                const profile = profileMap.get(s.userId) as any;
                const displayName = profile?.full_name || profile?.username || 'Unknown';
                const username = profile?.username || s.userId;
                return { rank: s.rank, userId: s.userId, username, displayName, totalScore: s.totalScore, totalQuestions: s.totalQuestions };
              }));
            }
          }
        } catch (lbErr) {
          console.error('Error computing leaderboard:', lbErr);
        }
        // --- End Leaderboard ---

        if (attemptIds.length > 0) {
          // ... Question stats calculation ...

          // 5. Calculate per-question stats
          const statsMap = new Map<string, QuestionStats>();

          // Initialize stats for all questions
          questionsData?.forEach((q: any) => {
            statsMap.set(q.id, {
              id: q.id,
              q_no: q.q_no,
              text: q.text,
              sectionName: q.section.name,
              sectionSortOrder: q.section.sort_order,
              totalAttempts: 0,
              correctCount: 0,
              wrongCount: 0,
              unansweredCount: 0,
              accuracy: 0,
              avgTime: 0,
              correctAnswer: q.correct_answer,
              answerType: q.answer_type,
              options: q.options,

              imageUrl: q.image_url,
              imageUrls: q.image_urls,
              reviewedCount: 0,
              commonWrongAnswers: {}
            });
          });

          const normalize = (val: any) => String(val).trim().toLowerCase();

          // Aggregate responses
          responsesData?.forEach((r: any) => {
            const stat = statsMap.get(r.question_id);
            if (stat) {
              // Only count stats for submitted attempts
              const attempt = correctedAttemptsById.get(r.attempt_id);
              if (!attempt || !attempt.submitted_at) return;

              stat.totalAttempts++;
              stat.avgTime += r.time_spent_seconds || 0;
              if (r.is_marked_for_review) stat.reviewedCount++;

              // Trust is_correct from DB (set by examService on submit)
              // Only re-grade for legacy responses where is_correct is null
              let isCorrect = false;

              if (r.is_correct !== null && r.is_correct !== undefined) {
                isCorrect = r.is_correct === true;
              } else if (stat.correctAnswer) {
                // Fallback: re-grade only for null is_correct (legacy data)
                const selected = r.selected_answer;
                const correct = stat.correctAnswer;

                if (selected !== null && selected !== undefined) {
                  if (Array.isArray(correct)) {
                    const selectedArray = Array.isArray(selected) ? selected : [selected];
                    if (selectedArray.length === correct.length) {
                      const sortedSelected = [...selectedArray].map(normalize).sort();
                      const sortedCorrect = [...correct].map(normalize).sort();
                      isCorrect = sortedSelected.every((val, index) => val === sortedCorrect[index]);
                    }
                  } else if (typeof correct === 'object' && correct !== null) {
                    const val = (correct as any).answer || (correct as any).value;
                    isCorrect = normalize(val) === normalize(selected);
                  } else {
                    isCorrect = normalize(selected) === normalize(correct);
                  }
                }
              }

              if (isCorrect) {
                stat.correctCount++;
              } else if (r.selected_answer === null) {
                stat.unansweredCount++;
              } else {
                stat.wrongCount++;
                const ansKey = Array.isArray(r.selected_answer) ? r.selected_answer.join(",") : String(r.selected_answer);
                stat.commonWrongAnswers[ansKey] = (stat.commonWrongAnswers[ansKey] || 0) + 1;
              }
            }
          });

          // Finalize averages
          const finalStats: QuestionStats[] = Array.from(statsMap.values()).map(stat => ({
            ...stat,
            accuracy: stat.totalAttempts > 0 ? (stat.correctCount / stat.totalAttempts) * 100 : 0,
            avgTime: stat.totalAttempts > 0 ? stat.avgTime / stat.totalAttempts : 0,
            mostCommonWrong: Object.entries(stat.commonWrongAnswers).sort((a, b) => b[1] - a[1])[0]?.[0] || null
          }));

          setQuestionStats(finalStats);
        } else {
          setQuestionStats([]);
        }

      } else {
        // Student View: Get only MY attempts
        const { data, error } = await query.eq("user_id", user.id);
        if (error) throw error;
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

            const { data: allExamSections } = await supabase
              .from("sections")
              .select("id, exam_id, sort_order, created_at, language")
              .in("exam_id", examIds)
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true });

            if (allExamSections && allExamSections.length > 0) {
              // Group sections by exam_id
              const sectionsByExam: Record<string, typeof allExamSections> = {};
              allExamSections.forEach(s => {
                if (!sectionsByExam[s.exam_id]) sectionsByExam[s.exam_id] = [];
                sectionsByExam[s.exam_id].push(s);
              });

              // Build firstSectionsMap (multi-language aware first sections per exam)
              const allSectionIds: string[] = [];
              Object.entries(sectionsByExam).forEach(([eid, sections]) => {
                const langMap = new Map<string, any[]>();
                sections.forEach(s => {
                  const l = s.language || 'en';
                  if (!langMap.has(l)) langMap.set(l, []);
                  langMap.get(l)!.push(s);
                  allSectionIds.push(s.id);
                });
                
                const firstIds = new Set<string>();
                langMap.forEach(secs => {
                  firstIds.add(secs[0].id);
                });
                firstSectionsMap[eid] = firstIds;
              });

              // Batch-fetch ALL attempts for ALL sections in ONE query
              const { data: allAttemptsBatch } = await supabase
                .from("attempts")
                .select("id, user_id, section_id, score, created_at")
                .in("section_id", allSectionIds)
                .order("created_at", { ascending: true });

              if (allAttemptsBatch && allAttemptsBatch.length > 0) {
                // Build a reverse lookup: section_id -> exam_id
                const sectionToExam: Record<string, string> = {};
                allExamSections.forEach(s => { sectionToExam[s.id] = s.exam_id; });

                // Group attempts by exam_id
                const attemptsByExam: Record<string, typeof allAttemptsBatch> = {};
                allAttemptsBatch.forEach(a => {
                  const eid = sectionToExam[a.section_id];
                  if (!eid) return;
                  if (!attemptsByExam[eid]) attemptsByExam[eid] = [];
                  attemptsByExam[eid].push(a);
                });

                // Process each exam's ranking (same logic as before, now without DB calls)
                for (const eid of examIds) {
                  const examAttempts = attemptsByExam[eid];
                  if (!examAttempts || examAttempts.length === 0) continue;

                  const firstSectionGroupIds = firstSectionsMap[eid];
                  if (!firstSectionGroupIds || firstSectionGroupIds.size === 0) continue;

                  // Group by user
                  const byUser: Record<string, any[]> = {};
                  examAttempts.forEach(a => {
                    if (!byUser[a.user_id]) byUser[a.user_id] = [];
                    byUser[a.user_id].push(a);
                  });

                  // Build sessions
                  const sessions: { attemptIds: string[]; totalScore: number }[] = [];

                  Object.values(byUser).forEach(userAtts => {
                    userAtts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                    let cur: { attemptIds: string[]; totalScore: number } | null = null;
                    const orphanAttempts: any[] = [];

                    userAtts.forEach(att => {
                      if (firstSectionGroupIds.has(att.section_id)) {
                        if (cur) sessions.push(cur);
                        cur = { attemptIds: [att.id], totalScore: att.score || 0 };
                      } else if (cur) {
                        cur.attemptIds.push(att.id);
                        cur.totalScore += (att.score || 0);
                      } else {
                        // Orphan attempt (no first-section start) — collect it
                        orphanAttempts.push(att);
                      }
                    });
                    if (cur) sessions.push(cur);

                    // Group orphan attempts into their own session so they still get ranked
                    if (orphanAttempts.length > 0) {
                      sessions.push({
                        attemptIds: orphanAttempts.map(a => a.id),
                        totalScore: orphanAttempts.reduce((sum, a) => sum + (a.score || 0), 0),
                      });
                    }
                  });

                  // Sort by score descending and apply competition ranking (in-place)
                  sessions.sort((a, b) => b.totalScore - a.totalScore);
                  sessions.forEach((session, index) => {
                    if (index === 0) {
                      (session as any).rank = 1;
                    } else {
                      (session as any).rank = session.totalScore === sessions[index - 1].totalScore
                        ? (sessions[index - 1] as any).rank
                        : index + 1;
                    }
                  });

                  const totalSessions = sessions.length;

                  // Map each attemptId to its rank
                  sessions.forEach((s: any) => {
                    s.attemptIds.forEach((aid: string) => {
                      rankMap[aid] = { rank: s.rank, total: totalSessions };
                    });
                  });
                }
              }
            }

            setExamRanks(rankMap);
            setFirstSectionsByExamId(firstSectionsMap);

          }
        } catch (rankErr) {
          console.error("Error computing history ranks:", rankErr);
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
      setLoading(false);
    }
  };



  // --- Calculations ---

  // Completed attempts for performance stats
  const completedAttempts = attempts.filter(a => a.submitted_at);
  const validAttempts = examId ? completedAttempts : attempts;

  // Compute student history ranking sessions globally
  const studentSessionsList = useMemo(() => {
    if (examId || attempts.length === 0 || Object.keys(firstSectionsByExamId).length === 0) return [];
    
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

    Object.entries(byExam).forEach(([eid, examAtts]) => {
      const firstSectionGroupIds = firstSectionsByExamId[eid];
      let cur: any = null;
      const orphans: any[] = [];

      examAtts.forEach(att => {
        if (firstSectionGroupIds && firstSectionGroupIds.has(att.section_id)) {
          // Start a new session
          if (cur) sessionsList.push(cur);
          cur = {
            examName: att.section.exam.name || 'Unknown Exam',
            date: new Date(att.submitted_at).toLocaleDateString(),
            sections: [att.section.name || 'Unknown Section'],
            totalScore: att.score || 0,
            totalQuestions: att.total_questions || 0,
            totalTime: Math.round((att.avg_time_per_question || 0) * (att.total_questions || 0)),
            firstAttemptId: att.id,
            allAttemptIds: [att.id],
          };
        } else if (cur) {
          // Continue current session
          cur.sections.push(att.section.name || 'Unknown Section');
          cur.totalScore += att.score || 0;
          cur.totalQuestions += att.total_questions || 0;
          cur.totalTime += Math.round((att.avg_time_per_question || 0) * (att.total_questions || 0));
          cur.allAttemptIds.push(att.id);
        } else {
          // Orphan: no first section seen yet — treat as its own session
          orphans.push(att);
        }
      });
      if (cur) sessionsList.push(cur);

      // Each orphan attempt → individual session row
      orphans.forEach(att => {
        sessionsList.push({
          examName: att.section.exam.name || 'Unknown Exam',
          date: new Date(att.submitted_at).toLocaleDateString(),
          sections: [att.section.name || 'Unknown Section'],
          totalScore: att.score || 0,
          totalQuestions: att.total_questions || 0,
          totalTime: Math.round((att.avg_time_per_question || 0) * (att.total_questions || 0)),
          firstAttemptId: att.id,
          allAttemptIds: [att.id],
        });
      });
    });

    // Sort most recent first
    sessionsList.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

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
  
  const bestScore = Math.max(...validAttempts.map((a) => a.accuracy_percentage), 0);

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
            <h1 className="text-2xl font-bold leading-tight">{examId ? "Exam Analytics" : "My Performance"}</h1>
            {examId && <p className="text-sm text-muted-foreground">{examName}</p>}
          </div>
        </div>

        {/* Overall Stats */}
        {!examId ? (
          <div className="grid grid-cols-3 divide-x divide-border border rounded-xl mb-6 bg-card">
            <div className="flex flex-col items-center justify-center py-5 px-4 gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Exams Given</span>
              <span className="text-3xl font-bold">{totalAttempts}</span>
            </div>
            <div className="flex flex-col items-center justify-center py-5 px-4 gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Overall Accuracy/Q</span>
              <span className="text-3xl font-bold">{overallAccuracy.toFixed(1)}%</span>
            </div>
            <div className="flex flex-col items-center justify-center py-5 px-4 gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Time/Q</span>
              <span className="text-3xl font-bold">{avgTimePerQuestion.toFixed(1)}s</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Total Attempts</h3>
              </div>
              <p className="text-3xl font-bold">{totalAttempts}</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-500" />
                <h3 className="font-semibold">Total Unique Students</h3>
              </div>
              <p className="text-3xl font-bold">{uniqueStudents}</p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                <h3 className="font-semibold">Completion</h3>
              </div>
              <div className="flex flex-col">
                <p className="text-3xl font-bold">{Math.round(completionRate)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{submittedCount} / {totalAttempts} started</p>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-pink-500" />
                <h3 className="font-semibold">Repeaters</h3>
              </div>
              <div className="flex flex-col">
                <p className="text-3xl font-bold">{repeatersCount}</p>
                <p className="text-xs text-muted-foreground mt-1">students retook</p>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-green-500" />
                <h3 className="font-semibold">Overall Accuracy/Q</h3>
              </div>
              <p className="text-3xl font-bold">
                {overallAccuracy.toFixed(2)}%
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold">Avg Time/Q</h3>
              </div>
              <p className="text-3xl font-bold">
                {avgTimePerQuestion.toFixed(2)}s
              </p>
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
                        <p className="font-bold text-base leading-snug">{entry.totalScore}/{entry.totalQuestions}</p>
                        <p className="text-xs text-muted-foreground">{pct}%</p>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
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
                        {section.avgTime.toFixed(1)}s
                      </td>
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {(() => {
                          const avgSeconds = section.totalTimeSpent / section.totalAttempts;
                          const mins = Math.floor(avgSeconds / 60);
                          const secs = Math.round(avgSeconds % 60);
                          return `${mins} mins ${secs} sec / ${section.timeLimit} mins`;
                        })()}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
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
                            className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                          />
                        </div>
                      ) : null
                    )}
                    <div
                      className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert mb-4"
                      dangerouslySetInnerHTML={{ __html: question.text }}
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
                            const val = (correctVal as any).answer || (correctVal as any).value;
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
                              <span className="flex-1">{option}</span>
                              {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="bg-muted p-3 rounded-md mt-4">
                      <span className="font-semibold">Correct Answer: </span>
                      <span className="text-green-600 font-medium">
                        {Array.isArray(question.correctAnswer)
                          ? question.correctAnswer.join(", ")
                          : (typeof question.correctAnswer === 'object'
                            ? (question.correctAnswer.answer || JSON.stringify(question.correctAnswer))
                            : String(question.correctAnswer))}
                      </span>
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
                        className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                      />
                    </div>
                  ) : null
                )}
                <div
                  className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selectedQuestion.text }}
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
                        const val = (correctVal as any).answer || (correctVal as any).value;
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
                          <span className="flex-1">{option}</span>
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
                        ? (selectedQuestion.correctAnswer.answer || JSON.stringify(selectedQuestion.correctAnswer))
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
            <div className="border rounded-xl overflow-hidden bg-card">
              {attempts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No attempts recorded yet.</p>
              ) : Object.keys(firstSectionsByExamId).length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">Loading history...</p>
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
                        {group.sections.length} section{group.sections.length > 1 ? 's' : ''}&nbsp;&bull;&nbsp;{group.date}&nbsp;&bull;&nbsp;{Math.floor((group.totalTime || 0) / 60)}m {(group.totalTime || 0) % 60}s
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
                        <p className="font-semibold text-[15px] leading-snug">
                          {group.totalScore}/{group.totalQuestions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.totalQuestions > 0
                            ? ((group.totalScore / group.totalQuestions) * 100).toFixed(1)
                            : 0}%
                        </p>
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
