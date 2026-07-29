const fs = require('fs');
const file = 'src/services/liveExamService.ts';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('pdf_url?: string | null;')) {
  content = content.replace('section_group_id: string | null;', 'section_group_id: string | null;\n    pdf_url?: string | null;');
}

const duplicateFn = `
export const duplicateLiveExam = async (examId: string): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 1. Fetch original
  const original = await fetchLiveExam(examId);
  const sections = await fetchLiveSections(examId, original.primary_language || 'en');
  const questions = await fetchAllLiveQuestions(examId, original.primary_language || 'en');

  // 2. Create new exam
  const { data: newExam, error: examError } = await supabase
    .from('live_exams')
    .insert({
      user_id: user.id,
      name: original.name + ' (Copy)',
      description: original.description,
      instruction: original.instruction,
      status: 'draft',
      supported_languages: original.supported_languages,
      primary_language: original.primary_language,
      total_questions: original.total_questions,
    })
    .select('id')
    .single();

  if (examError || !newExam) throw new Error(examError?.message || 'Error duplicating live exam');
  const newExamId = newExam.id;

  // 3. Copy sections and questions
  for (const sec of sections) {
    const { data: newSec, error: secError } = await supabase
      .from('live_sections')
      .insert({
        live_exam_id: newExamId,
        name: sec.name,
        sort_order: sec.sort_order,
        language: sec.language,
        section_group_id: sec.section_group_id,
        pdf_url: sec.pdf_url
      })
      .select('id')
      .single();

    if (secError || !newSec) continue;

    const secQuestions = questions.filter(q => q.live_section_id === sec.id);
    for (const q of secQuestions) {
      await supabase.from('live_questions').insert({
        live_section_id: newSec.id,
        q_no: q.q_no,
        text: q.text,
        options: q.options,
        answer_type: q.answer_type,
        correct_answer: q.correct_answer,
        time_seconds: q.time_seconds,
        image_url: q.image_url,
        image_urls: q.image_urls,
        question_group_id: q.question_group_id,
        global_index: q.global_index,
        section_label: q.section_label
      });
    }
  }

  return newExamId;
};
`;

if (!content.includes('export const duplicateLiveExam')) {
  content += '\n' + duplicateFn;
}

fs.writeFileSync(file, content);
console.log('Added duplicateLiveExam and pdf_url type');
