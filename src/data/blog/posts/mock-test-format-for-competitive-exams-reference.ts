import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "mock-test-format-for-competitive-exams-reference",
  title: "Mock Test Format for Competitive Exams: A Paper Setter's Reference",
  metaTitle: "Mock Test Format for Competitive Exams: A Checklist | MockSetu",
  metaDescription:
    "The mock test format checklist for paper setters: question count, section split, sectional or pooled clock, switching rules, question types, languages and screen.",
  keywords:
    "mock test format, competitive exam paper pattern, exam format checklist, how many questions in a mock test, mock test structure, paper setter reference, section switching exam, per-section clock",
  excerpt:
    "A mock test format is seven decisions, not one number. Here is the checklist to fill before you build the paper, the three formats that can be stated with confidence, and what to do for every other exam.",
  publishedAt: "2026-10-02",
  updatedAt: "2026-10-02",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a paper setter
    // to a student pillar. Never add "SSC MTS" or "JEE Main" here.
    "For Creators",
    "Templates",
    "Exam Creation",
    "exam pattern",
    "sectional timing",
  ],
  hero: {
    eyebrow: "Paper Setter's Reference",
    h1: "Mock Test Format for Competitive Exams: A Paper Setter's Reference",
    lede: "Seven things decide whether a paper is a mock or just a question set: count, split, clock, switching, marking, question types, and the languages and screen. This is the checklist, and the formats that can be stated without guessing.",
  },
  content: [
    {
      type: "p",
      text: "A mock test format is not one number. It is seven decisions: how many questions, how they split across sections, how long the paper runs and on what clock, whether a candidate may move between sections, what right and wrong answers are worth, which question types appear, and which languages and on-screen furniture a candidate meets. Get the clock or the switching rule wrong and you have built a paper that trains pacing for an exam that does not exist.",
    },
    {
      type: "p",
      text: "Below is the checklist in full, then the three formats that can be stated with confidence, then the honest part: for every other exam, fill the same checklist from the official bulletin rather than copying a number off a blog. Marking is covered in the [negative marking schemes of Indian exams](/blog/negative-marking-schemes-of-indian-exams-for-paper-setters) reference, so this one stays on structure and timing.",
    },
    { type: "h2", text: "The Seven Things a Format Has to Pin Down" },
    {
      type: "p",
      text: "Fill these in before you open a question bank. Every one is a line in the official bulletin, and a sheet that answers all seven can be handed to a colleague who builds the paper without asking you anything.",
    },
    {
      type: "ul",
      items: [
        "Question count, total and per section - and whether every question is compulsory or there is internal choice.",
        "Section names and the subject each covers, in the order the real paper presents them.",
        "Total duration, and whether the clock runs per section, pooled across a group of sections, or once for the whole paper.",
        "Section switching: may a candidate leave a section and come back, or does a finished section lock behind them.",
        "Marks for correct, wrong and unattempted - per section, because two sections of one paper can differ.",
        "Question types present: single-correct, multi-correct, numeric entry, text entry, passage sets, diagram-heavy items.",
        "Languages the paper is conducted in, and the on-screen furniture a candidate expects: palette, mark for review, instructions page, auto-submit.",
      ],
    },
    { type: "h2", text: "Question Count and the Per-Section Split" },
    {
      type: "p",
      text: "The total count is the easy half. The split is where mocks drift. A paper advertised as 100 questions in 120 minutes tells a candidate almost nothing; the same 100 as four sections of 25 with a hard clock on each is a different exam entirely. Students build their attempt order around the split, and a mock with the wrong split rehearses the wrong plan.",
    },
    {
      type: "p",
      text: "Write the split as one line per section before you build anything: name, question count, question types, time, marks. Three sums must then reconcile. Questions times marks per question equals the section total; section totals equal the paper total; section minutes equal the stated duration, unless the exam genuinely pools them. Marks that do not add up are visible on the instructions page before a student answers anything.",
    },
    {
      type: "p",
      text: "Record whether all questions are compulsory. Internal choice can be withdrawn without much noise - JEE Main's Section B dropped its attempt-any-5-of-10 option from the 2025 cycle - so an old pattern note on a coaching site can be a cycle or two stale. If the current bulletin does not explicitly grant choice, treat the paper as compulsory.",
    },
    { type: "h2", text: "Sectional Clocks, Pooled Clocks and One Timer" },
    {
      type: "p",
      text: "Three shapes cover almost everything: one clock for the whole paper, a clock per section, or a pooled window where two or more sections share one block of time. MockSetu does all three - but on MockSetu the clock and the switching rule are one decision rather than two. With switching locked you set a time in minutes on each section, and adjacent sections can share one pooled clock as a timing group, so a 90-minute block covering two sections need not be faked as two fixed 45-minute halves. Leave switching open and those per-section minutes stop acting as clocks: the whole paper then runs on a single timer - the total you set, or the sum of the sections if you set none. That is how to build one undivided clock without collapsing a sectioned paper into a single section. Either way the paper auto-submits when time expires.",
    },
    {
      type: "quote",
      text: "A mock that gets the clock wrong does not just misreport a score. It rehearses a pacing plan for an exam the student will never sit.",
    },
    { type: "h2", text: "Section Switching: Locked or Open" },
    {
      type: "p",
      text: "In some exams a candidate roams the whole paper freely and returns to an earlier section near the end. In others a section closes when its clock runs out, turning the exam into a sequence of small, unforgiving papers, and a strategy built for one is actively harmful in the other. On MockSetu switching can be locked or left open, as a property of the paper rather than something the student can change. If the real exam locks sections, lock yours - the discomfort of finding you cannot go back is exactly what the mock exists to teach.",
    },
    { type: "h2", text: "Which Question Types the Paper Actually Contains" },
    {
      type: "p",
      text: "A format that says 100 MCQs when the real paper mixes 80 MCQs with 20 numerical-entry items is not a small inaccuracy. Numerical entry has no options to eliminate and takes longer, so converting those into four-option questions inflates both the score and the confidence. A reading set behaves differently again: the passage has to be read before the first mark is available at all.",
    },
    {
      type: "p",
      text: "MockSetu supports single-correct, multi-correct, numeric and text answer types, reading passages, images, image options, and maths written as LaTeX so an equation renders rather than sitting there as broken text. You can also snip a question, an option or a passage straight out of the source PDF as an image rather than retyping a diagram-heavy item. For bulk entry there is the [JSON import route](/json-upload-guide): run MockSetu's published extraction prompt in ChatGPT, Claude or Gemini, then upload the JSON it returns. Two limits to plan around: that route leaves numeric, TITA and match-the-column questions as placeholders to fill by hand in the editor, and there is no subjective or essay grading at all.",
    },
    { type: "h2", text: "Languages and the On-Screen Furniture" },
    {
      type: "p",
      text: "Which languages a paper is conducted in is a line in the bulletin like any other, and a candidate who has practised only in English sits a bilingual paper reading two columns at once. A paper can be built in English, in Hindi or in both, and on a bilingual paper the student picks their language on the instructions page before the clock starts - chosen once, not toggled mid-paper. If your students sit the exam in Hindi, an English-only mock is a format error, not a convenience.",
    },
    {
      type: "p",
      text: "The screen shares that seventh line with languages, and this reference treats it briefly because [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic) argues the interface out in full. In short: a question palette, mark for review, an instructions page whose table lists each section with its question count, its maximum marks and - on a paper sat section by section - its clock, fullscreen, auto-submit, and the language chosen on that page before the clock starts. What is absent is worth saying plainly - no webcam or AI proctoring, no lockdown browser, no tab-switch detection. For self-paced practice that is the right trade; for a high-stakes selection test it is not.",
    },
    { type: "h2", text: "JEE Main Paper 1: 75 Questions, 300 Marks, 180 Minutes" },
    {
      type: "p",
      text: "Paper 1 runs 75 questions across Physics, Chemistry and Mathematics, 25 per subject, split within each subject into Section A with 20 multiple-choice questions and Section B with 5 numerical-value questions. All 75 are compulsory. The paper is 300 marks over 180 minutes, with +4 for a correct answer and -1 for a wrong one in both sections.",
    },
    {
      type: "ul",
      items: [
        "Build six sections - Section A and Section B for each subject - or three subject sections with the Section B items grouped inside.",
        "The old attempt-any-5-of-10 choice in Section B was discontinued from the 2025 cycle. A mock still offering 10 numericals with a choice of 5 models a paper that no longer exists.",
        "Section B numericals carry the same +4 and -1 as the MCQs.",
        "180 minutes for the full paper: decide and state whether your mock pools that across subjects or splits it.",
        "Students can check your paper against the [JEE Main pattern page](/mock-test/jee-main) before they attempt it.",
      ],
    },
    { type: "h2", text: "NEET UG: 180 Compulsory Questions, 720 Marks, 180 Minutes" },
    {
      type: "p",
      text: "NEET UG runs 180 compulsory questions for 720 marks in 180 minutes - exactly one minute per question, the single most important fact about its format and the reason pacing dominates preparation for it. There is no internal choice to model. For the subject-wise split, the marking rule and the current section arrangement, read the information bulletin rather than an older mock: an inherited pattern is the commonest way a good mock goes stale.",
    },
    { type: "h2", text: "SSC MTS: One Paper, Two Sessions, Two Different Rules" },
    {
      type: "p",
      text: "SSC MTS is 90 questions for 270 marks, conducted as two sessions of 45 minutes each. The halves do not behave the same way. Session I is qualifying only and carries no negative marking. Session II counts for merit and carries a penalty of 1 mark per wrong answer. Modelling that as one undivided 90-minute paper with a uniform rule is the error that makes an SSC MTS mock useless, because the guessing strategy differs completely between the two halves.",
    },
    {
      type: "p",
      text: "Build it as a two-section paper with a 45-minute clock and its own marking rule on each. Whether a candidate may return to Session I once Session II opens is a question for the current SSC notice - check it, and if the notice closes the first session, lock section switching so your mock closes it too. Note also that this two-session shape is specific to MTS and must never be generalised to staff-selection papers at large: every other one gets built from its own current notification.",
    },
    { type: "h2", text: "Every Other Exam: Fill the Checklist, Do Not Guess It" },
    {
      type: "p",
      text: "For any exam not listed above, the pattern must come from the conducting body's current information bulletin - not from memory, and not from a blog post, this one included. Every line on the checklist above is repeated confidently online and revised quietly in the notification. A mock built on last year's bulletin looks perfectly correct and teaches the wrong paper.",
    },
    {
      type: "p",
      text: "The method is dull and it works: open the current year's notification rather than a coaching summary, fill the seven lines straight off it, and write the bulletin date into the exam description so a future you knows which cycle the mock models. Where a detail is not stated officially anywhere, leave it out rather than invent it, and say so in the instructions.",
    },
    { type: "h2", text: "Turning the Format Sheet Into a Built Paper" },
    {
      type: "p",
      text: "Once the seven lines are filled, building is mechanical: a name, category and description, the general and exam instructions - there is a generator if you would rather edit a draft than face a blank box - the languages, the sections with their time in minutes, and the marks for correct, wrong and unattempted. If the Mock / Previous Year field is on your account, mark a reproduced past paper as Previous Year, because it sets different expectations from one you wrote yourself - that field is switched on per creator on request, so if you have not been granted it you will not see it at all. The build is walked through screen by screen in [how to create an online mock test](/blog/how-to-create-an-online-mock-test); what goes into each slot is [how to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions).",
    },
    {
      type: "p",
      text: "Two things catch format errors before a student does. When you publish, MockSetu checks the exam instruction against the paper as it now stands and flags a line that no longer matches - still claiming 100 questions after you added a section, or describing the old clock - with a button to rewrite it from the exam. The check is deliberately narrow: it only judges lines its own generator wrote, so a sentence you typed yourself is never called stale and still has to be reread by hand. And you can preview the exam end to end with nothing recorded, the quickest way to find that section 3 has a 40-minute clock you meant to make 45.",
    },
    { type: "h2", text: "A Pre-Publish Check on the Format Alone" },
    {
      type: "p",
      text: "Run this before the paper goes out. It catches the errors students write to you about.",
    },
    {
      type: "ul",
      items: [
        "Counts and marks reconcile: question counts per section match the format sheet, questions times marks per question equals the section total, and section totals equal the paper total.",
        "Section minutes add up to the stated duration, or a pooled timing group is set where the real paper pools time.",
        "Section switching is locked or open to match the real exam, and the instructions say which.",
        "Every question type in the real paper is present, including the numeric, TITA and match-the-column placeholders the JSON import left for manual entry.",
        "A bilingual paper has both versions filled rather than one half-empty.",
        "The instructions page describes the paper you built, not the one you planned on Tuesday.",
        "You previewed the paper yourself, section by section, and read each section's clock off the screen.",
      ],
    },
    { type: "h2", text: "After It Is Published" },
    {
      type: "p",
      text: "A published mock goes into the public library in the languages you chose and can be opened and sat by anyone with no account at all - though a guest's finished paper is parked in their own browser and is only saved, scored and counted in your analytics once they sign in. That cuts both ways: published papers are public, so there is no private delivery to one batch only. Creator analytics are aggregated - section-wise accuracy, average time per attempted question, where the class as a whole struggled - with no per-student report card and no CSV or Excel export; the one place a name surfaces is a Top Students panel listing the public handles of the top three. The aggregate is where a format error shows itself: a section running well past your intended pace is more often a clock you set wrong than a weak class. One thing to get right before publishing rather than after - a published exam is locked for editing, and a grade is stamped at submission, so correcting an answer key later means unpublishing, fixing it and publishing again, and it corrects the paper only for everyone who sits it next. The scores already recorded stay exactly as they were. The [creator side of MockSetu](/for-creators) is where exams, sections and timing are configured, free and with no card.",
    },
  ],
  faqs: [
    {
      question: "What is the standard mock test format for competitive exams?",
      answer:
        "There is no single standard. A format is defined by seven things: total and per-section question count, total duration, whether the clock is pooled or per section, whether section switching is allowed, the marking rule per section, the question types present, and the languages offered. Each exam sets these differently, and any of them can change between cycles, so the format should always be read off the conducting body's current information bulletin rather than copied from an older mock.",
    },
    {
      question: "How many questions should a full-length mock test have?",
      answer:
        "Exactly as many as the real paper, split exactly as the real paper splits them. For JEE Main Paper 1 that is 75 questions, 25 per subject, as 20 multiple-choice plus 5 numerical-value items per subject, all compulsory. NEET UG is 180 compulsory questions. SSC MTS is 90 questions across two 45-minute sessions. A mock with a convenient round number instead of the real count teaches the wrong pacing and produces a score that cannot be compared to anything.",
    },
    {
      question: "Should a mock test use sectional timing or one overall timer?",
      answer:
        "Whichever the real exam uses. If the real paper time-locks each section, a single overall timer lets students borrow time they would not have on exam day and hides their worst pacing habit. On MockSetu the two are one setting. With section switching locked, each section carries its own time in minutes, and two or more adjacent sections can share one pooled clock as a timing group for papers that pool time across a block rather than fixing it per section. Leave switching open and the whole paper runs on a single timer instead.",
    },
    {
      question: "Can students move between sections during a mock test?",
      answer:
        "That depends on how you build it. Section switching can be locked or left open on the paper, and the choice should match the real exam. Locking matters most for papers whose sections carry their own clocks, where borrowing time from a later section would flatter a student's pacing. Read the current notification for the exam you are modelling to find out whether it allows a candidate back into a finished section, and build yours the same way. Whichever you choose, state it on the instructions page so the student is not discovering it at minute 44.",
    },
    {
      question: "Where do I find the official format for an exam that is not listed here?",
      answer:
        "The conducting body's information bulletin or official notification for the current cycle is the only source worth trusting. Read off question counts per section, total and sectional duration, whether sections are time-locked, the marking rule for each section separately, the question types, and the languages. Record the bulletin date in the exam description so you know which cycle the mock models. If a detail is not stated officially anywhere, leave it out rather than inventing it.",
    },
  ],
};

export default post;
