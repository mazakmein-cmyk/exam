/**
 * liveExamService.ts
 * ------------------
 * CRUD operations and business logic for the Live Exam module.
 * Completely separate from the mock-exam examService.ts.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────

export type LiveExamStatus = "draft" | "published" | "live" | "ended";

export type LiveExam = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instruction: string | null;
  status: LiveExamStatus;
  share_code: string;
  started_at: string | null;
  ended_at: string | null;
  current_question_index: number;
  current_question_unlocked_at: string | null;
  supported_languages: string[];
  primary_language: string;
  total_questions: number;
  created_at: string;
  updated_at: string;
};

export type LiveSection = {
  id: string;
  live_exam_id: string;
  name: string;
  sort_order: number;
  language: string;
  section_group_id: string | null;
    pdf_url?: string | null;
  created_at: string;
};

export type LiveQuestion = {
  id: string;
  live_section_id: string;
  q_no: number;
  text: string;
  options: any;
  answer_type: string;
  /** Present for creators only; the student view never includes it.
   *  Students learn answers via fetchRevealedAnswers after a timer ends. */
  correct_answer?: any;
  time_seconds: number;
  image_url: string | null;
  image_urls: string[] | null;
  question_group_id: string | null;
  global_index: number;
  section_label: string | null;
  created_at: string;
};

export type LiveParticipant = {
  id: string;
  live_exam_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
  is_active: boolean;
  total_correct: number;
  total_answered: number;
  total_time_ms: number;
  rank: number | null;
};

export type LiveResponse = {
  id: string;
  live_exam_id: string;
  live_question_id: string;
  user_id: string;
  selected_answer: any;
  /** null until the question's timer (+grace) has ended — the server masks it */
  is_correct: boolean | null;
  time_taken_ms: number;
  submitted_at: string;
  /** 0-based play-order position; stable across languages */
  question_ordinal: number;
};

export type LiveQuestionAnalytics = {
  id: string;
  live_exam_id: string;
  live_question_id: string;
  total_responses: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  option_distribution: Record<string, number>;
  avg_time_correct_ms: number | null;
  fastest_time_ms: number | null;
  fastest_user_id: string | null;
  fastest_user_name: string | null;
  computed_at: string;
};

// ─── Create Live Exam ────────────────────────────────────────

export type CreateLiveExamData = {
  name: string;
  description?: string;
  instruction?: string;
  supported_languages?: string[];
  primary_language?: string;
  sections: { name: string; sectionGroupId: string }[];
};

export async function createLiveExam(data: CreateLiveExamData): Promise<LiveExam> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: exam, error: examError } = await supabase
    .from("live_exams")
    .insert({
      user_id: user.id,
      name: data.name,
      description: data.description || null,
      instruction: data.instruction || null,
      supported_languages: data.supported_languages || ["en"],
      primary_language: data.primary_language || "en",
    })
    .select()
    .single();

  if (examError) throw examError;

  // Create sections for each language
  if (data.sections.length > 0) {
    const languages = data.supported_languages || ["en"];
    const allSections: any[] = [];

    for (const lang of languages) {
      data.sections.forEach((section, index) => {
        allSections.push({
          live_exam_id: exam.id,
          name: section.name,
          sort_order: index,
          language: lang,
          section_group_id: section.sectionGroupId,
        });
      });
    }

    const { error: sectionsError } = await supabase
      .from("live_sections")
      .insert(allSections);

    if (sectionsError) throw sectionsError;
  }

  return exam as unknown as LiveExam;
}

// ─── Fetch Live Exams (Creator Dashboard) ────────────────────

export async function fetchMyLiveExams(): Promise<LiveExam[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("live_exams")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as LiveExam[];
}

// ─── Fetch Single Live Exam ──────────────────────────────────

export async function fetchLiveExam(examId: string): Promise<LiveExam> {
  const { data, error } = await supabase
    .from("live_exams")
    .select("*")
    .eq("id", examId)
    .single();

  if (error) throw error;
  return data as unknown as LiveExam;
}

// ─── Fetch Live Exam by Share Code ───────────────────────────

export async function fetchLiveExamByShareCode(shareCode: string): Promise<LiveExam> {
  const { data, error } = await supabase
    .from("live_exams")
    .select("*")
    .eq("share_code", shareCode.toUpperCase())
    .single();

  if (error) throw error;
  return data as unknown as LiveExam;
}

// ─── Update Live Exam ────────────────────────────────────────

export async function updateLiveExam(
  examId: string,
  updates: Partial<Pick<LiveExam, "name" | "description" | "instruction" | "status" | "supported_languages" | "primary_language" | "total_questions">>
): Promise<LiveExam> {
  const { data, error } = await supabase
    .from("live_exams")
    .update(updates)
    .eq("id", examId)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as LiveExam;
}

// ─── Delete Live Exam ────────────────────────────────────────

export async function deleteLiveExam(examId: string): Promise<void> {
  const { error } = await supabase
    .from("live_exams")
    .delete()
    .eq("id", examId);

  if (error) throw error;
}

// ─── Duplicate Live Exam ─────────────────────────────────────

/**
 * Deep-copies a live exam into a fresh draft owned by the caller.
 *
 * Live exams need different rules from the mock-exam duplicate:
 *  - Session state is never inherited. The copy is a `draft` with its own
 *    share_code, no started_at/ended_at, and current_question_index back at -1 —
 *    a copy of a running exam must not start life with "question 7 is unlocked".
 *  - Run data (participants, responses, analytics) is deliberately left behind.
 *    Duplicating is precisely how a creator re-runs the same quiz with a new
 *    batch, so a clean leaderboard is the point.
 *  - Cross-language links (section_group_id / question_group_id) are remapped to
 *    fresh ids that preserve the *shape* of the original linkage. The copy's
 *    en/hi rows stay paired with each other and never alias the original's
 *    groups, so editing the copy can't reach into the exam it came from.
 *  - q_no / global_index / time_seconds are preserved verbatim: play order and
 *    per-question timers are the exam.
 */
export async function duplicateLiveExam(examId: string): Promise<LiveExam> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const exam = await fetchLiveExam(examId);

  // Sort explicitly so the old→new id maps below never depend on the row order
  // PostgREST happens to return (sort_order alone ties across languages).
  const sections = [...(await fetchLiveSections(examId))].sort(
    (a, b) =>
      a.language.localeCompare(b.language) ||
      a.sort_order - b.sort_order ||
      a.id.localeCompare(b.id)
  );

  const sectionIds = sections.map(s => s.id);
  let questions: LiveQuestion[] = [];
  if (sectionIds.length > 0) {
    const { data, error } = await supabase
      .from("live_questions")
      .select("*")
      .in("live_section_id", sectionIds)
      .order("global_index", { ascending: true })
      .order("q_no", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;
    questions = (data || []) as unknown as LiveQuestion[];
  }

  // total_questions counts one language (it drives the control room's progress),
  // so recount from what we're actually copying instead of trusting a stale value.
  const primarySectionIds = new Set(
    sections.filter(s => s.language === exam.primary_language).map(s => s.id)
  );
  const primaryCount = questions.filter(q => primarySectionIds.has(q.live_section_id)).length;

  const { data: newExam, error: examError } = await supabase
    .from("live_exams")
    .insert({
      user_id: user.id,
      name: `${exam.name} (Copy)`,
      description: exam.description,
      instruction: exam.instruction,
      supported_languages: exam.supported_languages,
      primary_language: exam.primary_language,
      total_questions: primaryCount,
      // status, share_code and current_question_index fall through to their
      // column defaults on purpose — draft, a brand-new code, -1.
    })
    .select()
    .single();

  if (examError) throw examError;

  try {
    // Client-generated section ids let questions be mapped without a second
    // round-trip or any reliance on INSERT ... RETURNING ordering.
    const sectionIdMap = new Map<string, string>();
    const sectionGroupIdMap = new Map<string, string>();

    if (sections.length > 0) {
      const newSections = sections.map(s => {
        const newId = crypto.randomUUID();
        sectionIdMap.set(s.id, newId);

        let newGroupId: string | null = null;
        if (s.section_group_id) {
          if (!sectionGroupIdMap.has(s.section_group_id)) {
            sectionGroupIdMap.set(s.section_group_id, crypto.randomUUID());
          }
          newGroupId = sectionGroupIdMap.get(s.section_group_id)!;
        }

        return {
          id: newId,
          live_exam_id: newExam.id,
          name: s.name,
          sort_order: s.sort_order,
          language: s.language,
          section_group_id: newGroupId,
          // The snipped PDF is immutable in storage; sharing the URL is safe and
          // avoids re-uploading a file the creator already has.
          pdf_url: s.pdf_url ?? null,
        };
      });

      const { error: secError } = await supabase.from("live_sections").insert(newSections);
      if (secError) throw secError;
    }

    const questionGroupIdMap = new Map<string, string>();
    const newQuestions = questions
      .filter(q => sectionIdMap.has(q.live_section_id))
      .map(q => {
        let newGroupId: string | null = null;
        if (q.question_group_id) {
          if (!questionGroupIdMap.has(q.question_group_id)) {
            questionGroupIdMap.set(q.question_group_id, crypto.randomUUID());
          }
          newGroupId = questionGroupIdMap.get(q.question_group_id)!;
        }

        return {
          live_section_id: sectionIdMap.get(q.live_section_id)!,
          q_no: q.q_no,
          text: q.text,
          options: q.options,
          answer_type: q.answer_type,
          correct_answer: q.correct_answer ?? null,
          time_seconds: q.time_seconds,
          image_url: q.image_url,
          image_urls: q.image_urls,
          question_group_id: newGroupId,
          global_index: q.global_index,
          section_label: q.section_label,
        };
      });

    // Chunked: a bilingual exam doubles the row count, and one oversized insert
    // failing would strand a half-copied exam.
    const CHUNK = 200;
    for (let i = 0; i < newQuestions.length; i += CHUNK) {
      const { error: qError } = await supabase
        .from("live_questions")
        .insert(newQuestions.slice(i, i + CHUNK));

      if (qError) throw qError;
    }
  } catch (err) {
    // A partial copy is worse than none — the creator would have to work out
    // which sections made it. Drop the shell (sections/questions cascade) and
    // report the real failure.
    await supabase.from("live_exams").delete().eq("id", newExam.id);
    throw err;
  }

  return newExam as unknown as LiveExam;
}

// ─── Sections CRUD ───────────────────────────────────────────

export async function fetchLiveSections(examId: string, language?: string): Promise<LiveSection[]> {
  let query = supabase
    .from("live_sections")
    .select("*")
    .eq("live_exam_id", examId)
    .order("sort_order", { ascending: true });

  if (language) {
    query = query.eq("language", language);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as LiveSection[];
}

export async function createLiveSection(
  examId: string,
  name: string,
  sortOrder: number,
  language: string = "en",
  sectionGroupId?: string
): Promise<LiveSection> {
  const { data, error } = await supabase
    .from("live_sections")
    .insert({
      live_exam_id: examId,
      name,
      sort_order: sortOrder,
      language,
      section_group_id: sectionGroupId || undefined,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as LiveSection;
}

export async function updateLiveSection(
  sectionId: string,
  updates: Partial<Pick<LiveSection, "name" | "sort_order" | "pdf_url">>
): Promise<void> {
  const { error } = await supabase
    .from("live_sections")
    .update(updates)
    .eq("id", sectionId);

  if (error) throw error;
}

export async function deleteLiveSection(sectionId: string): Promise<void> {
  const { error } = await supabase
    .from("live_sections")
    .delete()
    .eq("id", sectionId);

  if (error) throw error;
}

// ─── Questions CRUD ──────────────────────────────────────────

export async function fetchLiveQuestions(sectionId: string): Promise<LiveQuestion[]> {
  const { data, error } = await supabase
    .from("live_questions")
    .select("*")
    .eq("live_section_id", sectionId)
    .order("q_no", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as LiveQuestion[];
}

export async function fetchAllLiveQuestions(examId: string, language?: string): Promise<LiveQuestion[]> {
  // First get sections, then get questions
  const sections = await fetchLiveSections(examId, language);
  const sectionIds = sections.map(s => s.id);

  if (sectionIds.length === 0) return [];

  // Tiebreaks must match the server's ordinal computation
  // (ORDER BY global_index, q_no, id in the RPCs).
  const { data, error } = await supabase
    .from("live_questions")
    .select("*")
    .in("live_section_id", sectionIds)
    .order("global_index", { ascending: true })
    .order("q_no", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as LiveQuestion[];
}

/**
 * Student-safe question fetch: reads the live_questions_student view,
 * which never contains correct_answer. Use fetchRevealedAnswers to get
 * answers for questions whose timer has ended.
 */
export async function fetchAllLiveQuestionsStudent(examId: string, language?: string): Promise<LiveQuestion[]> {
  const sections = await fetchLiveSections(examId, language);
  const sectionIds = sections.map(s => s.id);

  if (sectionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("live_questions_student")
    .select("*")
    .in("live_section_id", sectionIds)
    .order("global_index", { ascending: true })
    .order("q_no", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as LiveQuestion[];
}

/**
 * Correct answers for every question whose timer (+2s grace) has ended,
 * or all questions once the exam has ended. Keyed by live_question_id
 * (all languages included).
 */
export async function fetchRevealedAnswers(examId: string): Promise<Map<string, any>> {
  const { data, error } = await supabase
    .rpc("get_revealed_live_answers", { p_live_exam_id: examId });

  if (error) throw error;
  const map = new Map<string, any>();
  ((data || []) as { live_question_id: string; correct_answer: any }[]).forEach(row => {
    map.set(row.live_question_id, row.correct_answer);
  });
  return map;
}

export async function createLiveQuestion(question: {
  live_section_id: string;
  q_no: number;
  text: string;
  options?: any;
  answer_type: string;
  correct_answer?: any;
  time_seconds: number;
  image_url?: string;
  image_urls?: string[];
  question_group_id?: string;
  global_index: number;
  section_label?: string;
}): Promise<LiveQuestion> {
  const { data, error } = await supabase
    .from("live_questions")
    .insert(question)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as LiveQuestion;
}

export async function updateLiveQuestion(
  questionId: string,
  updates: Partial<Omit<LiveQuestion, "id" | "created_at">>
): Promise<void> {
  const { error } = await supabase
    .from("live_questions")
    .update(updates)
    .eq("id", questionId);

  if (error) throw error;
}

export async function deleteLiveQuestion(questionId: string): Promise<void> {
  const { error } = await supabase
    .from("live_questions")
    .delete()
    .eq("id", questionId);

  if (error) throw error;
}

/** Distinct question_group_ids present in the given sections (nulls dropped). */
export async function fetchLiveQuestionGroupIds(sectionIds: string[]): Promise<string[]> {
  if (sectionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("live_questions")
    .select("question_group_id")
    .in("live_section_id", sectionIds);

  if (error) throw error;
  const ids = (data || [])
    .map((q: any) => q.question_group_id)
    .filter((g: any): g is string => g != null);
  return Array.from(new Set(ids));
}

/** Bulk delete every question in the given sections (JSON import, Replace mode). */
export async function deleteLiveQuestionsInSections(sectionIds: string[]): Promise<void> {
  if (sectionIds.length === 0) return;

  const { error } = await supabase
    .from("live_questions")
    .delete()
    .in("live_section_id", sectionIds);

  if (error) throw error;
}

/**
 * Bulk delete the language siblings of a set of questions: rows inside
 * `sectionIds` whose question_group_id is one of `groupIds`.
 *
 * Chunked because group ids go into the URL — a few hundred UUIDs is enough
 * for PostgREST/Kong to reject the request with 414, which would leave a
 * Replace half-applied (primary emptied, siblings surviving).
 */
export async function deleteLiveQuestionsByGroupIds(
  groupIds: string[],
  sectionIds: string[]
): Promise<void> {
  if (groupIds.length === 0 || sectionIds.length === 0) return;

  const CHUNK = 100;
  for (let i = 0; i < groupIds.length; i += CHUNK) {
    const { error } = await supabase
      .from("live_questions")
      .delete()
      .in("question_group_id", groupIds.slice(i, i + CHUNK))
      .in("live_section_id", sectionIds);

    if (error) throw error;
  }
}

/** Question count for one language — the exam's true total_questions. */
export async function countLiveQuestions(examId: string, language: string): Promise<number> {
  const sections = await fetchLiveSections(examId, language);
  const sectionIds = sections.map(s => s.id);
  if (sectionIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("live_questions")
    .select("id", { count: "exact", head: true })
    .in("live_section_id", sectionIds);

  if (error) throw error;
  return count || 0;
}

// ─── Live Session Control (Creator) ──────────────────────────

/** Start the live session: server stamps status='live' + started_at with DB time */
export async function startLiveSession(examId: string): Promise<LiveExam> {
  const { data, error } = await supabase
    .rpc("start_live_session", { p_live_exam_id: examId });

  if (error) throw error;
  return data as unknown as LiveExam;
}

/**
 * Unlock the next question. The server increments current_question_index
 * and stamps current_question_unlocked_at with DB time (clients never
 * supply timestamps, so a skewed creator clock can't shift the timer).
 */
export async function unlockNextQuestion(examId: string): Promise<LiveExam> {
  const { data, error } = await supabase
    .rpc("unlock_next_live_question", { p_live_exam_id: examId });

  if (error) throw error;
  return data as unknown as LiveExam;
}

/**
 * End the live session. The server also back-fills analytics for any
 * unlocked question that never got them and recomputes final rankings.
 */
export async function endLiveSession(examId: string): Promise<LiveExam> {
  const { data, error } = await supabase
    .rpc("end_live_session", { p_live_exam_id: examId });

  if (error) throw error;
  return data as unknown as LiveExam;
}

/** Compute analytics for a specific question via the RPC function */
export async function computeQuestionAnalytics(
  examId: string,
  questionId: string
): Promise<LiveQuestionAnalytics> {
  const { data, error } = await supabase
    .rpc("compute_live_question_analytics", {
      p_live_exam_id: examId,
      p_live_question_id: questionId,
    });

  if (error) throw error;
  return data as unknown as LiveQuestionAnalytics;
}

// ─── Fetch My Participated Live Exams (Student Dashboard) ────

export async function fetchMyParticipatedLiveExams(): Promise<any[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("live_participants")
    .select(`
      *,
      live_exam:live_exams (
        id,
        name,
        description,
        status,
        share_code,
        created_at
      )
    `)
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/** Recompute rankings for all participants */
export async function computeRankings(examId: string): Promise<void> {
  const { error } = await supabase
    .rpc("compute_live_rankings", {
      p_live_exam_id: examId,
    });

  if (error) throw error;
}

// ─── Participants (Student) ──────────────────────────────────

/** Join a live exam as a participant */
export async function joinLiveExam(examId: string): Promise<LiveParticipant> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get display name from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, full_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.full_name || profile?.username || user.email?.split("@")[0] || "Anonymous";

  const { data, error } = await supabase
    .from("live_participants")
    .upsert({
      live_exam_id: examId,
      user_id: user.id,
      display_name: displayName,
      is_active: true,
    }, { onConflict: "live_exam_id,user_id" })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as LiveParticipant;
}

/** Fetch participants / leaderboard for an exam */
export async function fetchLeaderboard(examId: string, limit?: number): Promise<LiveParticipant[]> {
  let query = supabase
    .from("live_participants")
    .select("*")
    .eq("live_exam_id", examId)
    .order("rank", { ascending: true, nullsFirst: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as LiveParticipant[];
}

/** Get total participant count */
export async function getParticipantCount(examId: string): Promise<number> {
  const { count, error } = await supabase
    .from("live_participants")
    .select("*", { count: "exact", head: true })
    .eq("live_exam_id", examId);

  if (error) throw error;
  return count || 0;
}

// ─── Responses (Student) ─────────────────────────────────────

/**
 * Submit a response. Grading, timing, the current-question check, and the
 * 2s grace window all happen server-side; the first submission is final.
 * The returned row has is_correct masked (null) until the timer ends.
 */
export async function submitLiveResponse(data: {
  live_exam_id: string;
  live_question_id: string;
  selected_answer: any;
}): Promise<LiveResponse> {
  const { data: response, error } = await supabase
    .rpc("submit_live_response", {
      p_live_exam_id: data.live_exam_id,
      p_live_question_id: data.live_question_id,
      p_selected_answer: data.selected_answer,
    });

  if (error) throw error;
  return response as unknown as LiveResponse;
}

/**
 * Fetch the current user's responses for a live exam. is_correct is masked
 * (null) for any question whose timer hasn't fully ended yet.
 */
export async function fetchMyResponses(examId: string): Promise<LiveResponse[]> {
  const { data, error } = await supabase
    .rpc("get_my_live_responses", { p_live_exam_id: examId });

  if (error) throw error;
  return (data || []) as unknown as LiveResponse[];
}

// ─── Analytics ───────────────────────────────────────────────

/** Fetch analytics for all questions in an exam */
export async function fetchAllAnalytics(examId: string): Promise<LiveQuestionAnalytics[]> {
  const { data, error } = await supabase
    .from("live_question_analytics")
    .select("*")
    .eq("live_exam_id", examId)
    .order("computed_at", { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as LiveQuestionAnalytics[];
}

/** Fetch analytics for a single question */
export async function fetchQuestionAnalytics(
  examId: string,
  questionId: string
): Promise<LiveQuestionAnalytics | null> {
  const { data, error } = await supabase
    .from("live_question_analytics")
    .select("*")
    .eq("live_exam_id", examId)
    .eq("live_question_id", questionId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as LiveQuestionAnalytics | null;
}

/** Fetch response count for a specific question (for creator's live view) */
export async function fetchResponseCount(
  examId: string,
  questionId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("live_responses")
    .select("*", { count: "exact", head: true })
    .eq("live_exam_id", examId)
    .eq("live_question_id", questionId);

  if (error) throw error;
  return count || 0;
}
