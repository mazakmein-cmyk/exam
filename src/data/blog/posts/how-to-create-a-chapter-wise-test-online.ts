import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-chapter-wise-test-online",
  title: "How to Create a Chapter-Wise Test Online",
  metaTitle: "Chapter Wise Test Online: How to Create One | MockSetu",
  metaDescription:
    "How to create a chapter wise test online: how long it should run, how many questions, whether to use negative marking, and how to turn the results into weak-topic data.",
  keywords:
    "chapter wise test online, create chapter wise test, topic wise test for students, chapter test for coaching class, online chapter test maker, how many questions in a chapter test, negative marking in chapter test, chapter wise mock test",
  excerpt:
    "A chapter test is the workhorse of a coaching programme: 20 to 25 questions, timed at the real exam's per-question pace, on one chapter. Here is how to size one, mark it, section it, and sequence a year of them.",
  publishedAt: "2026-09-22",
  updatedAt: "2026-09-22",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a teacher
    // building a chapter test to the student library instead.
    "For Creators",
    "Exam Creation",
    "chapter wise test",
    "coaching institutes",
    "test blueprint",
    "batch analytics",
  ],
  hero: {
    eyebrow: "Creator Playbook",
    h1: "How to Create a Chapter-Wise Test Online",
    lede: "One chapter, 20 to 25 questions, timed at the pace of the exam your batch is actually sitting. Everything else about a chapter test is a consequence of those three numbers.",
  },
  content: [
    {
      type: "p",
      text: "A chapter-wise test online should be 20 to 25 questions on one chapter, timed at the per-question pace of the target exam, with the same marking scheme that exam uses. For a NEET UG batch that is 25 questions in 25 minutes, because NEET is 180 questions in 180 minutes. For JEE Main it is roughly 20 questions in 48 minutes, because Paper 1 gives 180 minutes for 75 questions. Build it, publish it, and read the class accuracy per question afterwards. That last step is the whole reason chapter tests exist, and nothing in the process forces you to do it.",
    },
    {
      type: "p",
      text: "This is written for a competitive-exam batch, where a chapter test has to rehearse the real paper's pace and penalty. If you teach a school class instead, the formative version of the same idea — shorter, no penalty, a diagnosis at the end — is in [how school teachers can create online unit tests](/blog/how-school-teachers-can-create-online-unit-tests).",
    },
    {
      type: "h2",
      text: "How Long a Chapter-Wise Test Should Be",
    },
    {
      type: "p",
      text: "Do not pick a duration. Derive it. Divide the target exam's total minutes by its total questions, then multiply by your question count. NEET UG is 180 compulsory questions in 180 minutes: one minute each. JEE Main Paper 1 is 75 questions in 180 minutes: 2.4 minutes each. SSC MTS runs 90 questions across two 45-minute sessions, so one minute again. A 20-question chapter test is therefore 20 minutes for a NEET batch and 48 for a JEE batch — genuinely different animals at the same question count.",
    },
    {
      type: "p",
      text: "Resist the urge to be generous. Ninety minutes for 25 questions measures whether students know the chapter; the exam's pace measures whether they can use it, which is the only thing the exam will ever ask. Want an untimed knowledge check? Run it as homework and do not call it a test. The one honest exception is a batch's first encounter with a chapter, where the exam's pace plus about 30 percent tells you what they cannot solve rather than what they could not reach. Use the loose clock once, then never again.",
    },
    {
      type: "h2",
      text: "How Many Questions, and Which Ones",
    },
    {
      type: "p",
      text: "Twenty to twenty-five is the working range. Below 15 the paper is too thin to diagnose with: a question or two on each sub-topic cannot separate a weak idea from a badly written question. Above 30 you have stopped testing a chapter and started testing stamina — at the JEE pace derived above, 30 questions is 72 minutes of a weekday evening spent on one chapter.",
    },
    {
      type: "p",
      text: "Composition matters more than count. A paper built from the easy half of a chapter produces a comfortable class average and no information. Decide the spread before writing a single question — the instinct that [makes a full mock feel like the real paper](/blog/what-makes-a-mock-test-realistic) applies at chapter scale.",
    },
    {
      type: "ul",
      items: [
        "Eight to ten questions on the chapter's single highest-weightage idea, the one in almost every paper.",
        "Five to six on the standard applications students have drilled, to confirm the drill worked.",
        "Four to five combining this chapter with the one before it, because real papers ignore chapter boundaries.",
        "Three to four genuinely hard, so the top of the batch has somewhere to go and you can see who gets there.",
      ],
    },
    {
      type: "p",
      text: "Those four bands sum to 20 at the low end and 25 at the high. An obscure edge case swaps in for one of the hard questions; it never gets added on top.",
    },
    {
      type: "p",
      text: "For a JEE batch the per-chapter share of marks is public and stable enough to plan against; our [JEE Main chapter-wise weightage guide](/blog/jee-main-chapter-wise-weightage) is a reasonable place to decide which chapters deserve two tests.",
    },
    {
      type: "h2",
      text: "Negative Marking on a Chapter Test: Both Sides, Then a Decision",
    },
    {
      type: "p",
      text: "The case against: a chapter test is a diagnostic. You want to know what a student thinks the answer is, and negative marking buys silence instead. A scared student leaves eight blank, you learn nothing about those eight, and class accuracy is computed over a shrinking, self-selected denominator. The students who most need the diagnosis are the unsure ones, and they go quiet first.",
    },
    {
      type: "p",
      text: "The case for: a guessing penalty is not a scoring detail, it is a skill. JEE Main Paper 1 charges -1 in both Section A and Section B, across all 75 compulsory questions. SSC MTS Session II carries -1 while Session I carries none. Read your own target exam's current official bulletin rather than trusting a remembered number — schemes get revised. A student who sits thirty chapter tests with no penalty builds a bidding habit you cannot un-teach in the last two mocks of the year.",
    },
    {
      type: "p",
      text: "So: negative marking, matching the target exam exactly, from the second test on any chapter onwards. Run the first test on a brand-new chapter at zero penalty and tell the batch why — that one is for you, not for them. After that it stays on. The blanks cost you less than the habit buys, and a blank is not a void: a Most Skipped card ranks the questions the batch abandoned most often, so the silence itself is a reading.",
    },
    {
      type: "quote",
      text: "A chapter test without the exam's penalty measures knowledge. A chapter test with it measures judgement. Only one of those two is scored in June.",
    },
    {
      type: "p",
      text: "In MockSetu you set marks for a correct answer, a wrong answer and an unattempted question, per question. Multi-correct questions can award part marks or be all-or-nothing, the penalty can be charged once or per wrong option, and part marks round down, to nearest, up, or stay exact. That is enough to reproduce the per-question marking of every major Indian exam on a 20-question paper, so reproduce it rather than inventing a house scheme your students will never meet again. What it will not reproduce is the machinery around the marks — internal choice, a qualifying session scored apart from merit, shift normalisation — none of which belongs on a chapter test.",
    },
    {
      type: "h2",
      text: "When a Chapter Is Really Two Topics, Use Sections",
    },
    {
      type: "p",
      text: "Syllabus chapters are an accident of textbook layout. \"Current Electricity\" is one chapter and two distinct skills. \"Thermodynamics\" means different things in Physics and in Chemistry. When a chapter splits like that, do not average it into one score: split the paper into two sections and give each its own clock.",
    },
    {
      type: "p",
      text: "If the batch averages 71 percent on circuits and 34 percent on drift velocity and potentiometer, one whole-paper figure near 50 hides the entire finding; split it and the analytics report accuracy section by section. For a NEET batch that is two sections of 10 questions at 10 minutes each — the one-minute pace derived above, applied to each half. A JEE batch gets 24 minutes a side.",
    },
    {
      type: "p",
      text: "Two or more sections can also share one pooled clock — a timing group — if you would rather hand the NEET batch its 20 minutes across both halves and let students allocate it. Switching between sections can be locked or left open. Separate clocks with locked switching read cleanest for a diagnostic; a pooled clock with open switching is closer to exam-day time management.",
    },
    {
      type: "h2",
      text: "Sequencing Chapter Tests So They Add Up to a Syllabus",
    },
    {
      type: "p",
      text: "A pile of chapter tests is not a programme. Sequence the year before the term starts, the way you would plan [a full online test series](/blog/how-to-create-an-online-test-series): list every chapter with its share of marks, give the high-weightage ones two tests and the rest one, schedule each test 7 to 10 days after the chapter finishes in class, and run a cumulative test over every four chapters, because retention failures are not the failures a chapter test finds. Keep a one-line log of date, chapter, question count and class accuracy, and by February it tells you what to re-teach. Full-length mocks slot in only once that grid exists.",
    },
    {
      type: "h2",
      text: "Why Chapter Tests Make Weak-Topic Analysis Possible",
    },
    {
      type: "p",
      text: "A full-length mock averages the signal away. In a 180-question NEET paper, a chapter that is genuinely broken across your batch might carry six questions, and a slide in accuracy on six out of 180 moves the total less than one unusually hard section does. The weakness is in the data and it is invisible. On a 20-question chapter test the same weakness is the entire paper: a class accuracy in the low forties is not a signal you can miss, and because every student answered the same 20 questions under the same clock, the gap between question 7 and question 13 means something.",
    },
    {
      type: "p",
      text: "Be clear about what this data is. MockSetu's creator analytics are aggregated and anonymised: section-wise accuracy, accuracy and average time per question across everyone who attempted that question, and the questions most often left blank. You will not see a named student's paper, there is no per-student report card, and there is no CSV or Excel export. If your workflow depends on handing each parent an individual sheet, this is not the tool for that part of the job.",
    },
    {
      type: "h2",
      text: "Building the Test: The Actual Steps",
    },
    {
      type: "p",
      text: "The build is short once the blueprint exists, and all of it is free with no card. It is the sequence for [building a full-length online mock test](/blog/how-to-create-an-online-mock-test), compressed — fewer decisions, because the chapter has made most of them for you.",
    },
    {
      type: "ul",
      items: [
        "Create the exam with a name carrying the chapter and the batch — \"Physics · Current Electricity · 2027 Batch\" beats \"Test 4\" nine months later. A chapter test is a mock, which is what a new exam already is; the Mock / Previous Year field itself is switched on per creator on request, so if you never see it, nothing is wrong.",
        "Write the general and exam instructions, with the generator if you would rather not start from a blank box, then add your sections, each with its time in minutes.",
        "Enter the questions: rich text, maths as LaTeX rendered through KaTeX, images and image options, passages, and single-correct, multi-correct, numeric or text answers. For a diagram you do not want to retype, snip the question, an option or the passage out of the PDF as an image.",
        "Already have the paper as a PDF? Run MockSetu's extraction prompt, published at the [JSON upload guide](/json-upload-guide), in whatever AI you already use, then upload the JSON. The importer leaves numeric, TITA and match-the-column questions for manual entry.",
        "Set marks for correct, wrong and unattempted per question, matching the target exam.",
        "Preview it yourself — nothing is recorded on a creator preview — then publish in English, Hindi or both and share the link.",
      ],
    },
    {
      type: "p",
      text: "Edit the paper after writing the instructions and MockSetu warns you the two no longer agree — instruction drift. It catches the classic chapter-test error: duplicating last month's 25-question paper, cutting it to 20, and leaving \"25 questions, 25 minutes\" at the top of the instructions page. Get the answer key right before you publish, though. A published paper is locked for editing, so a correction means unpublishing first, and attempts already recorded keep the marks they were given — a key fixed afterwards reaches only the students who sit the paper next.",
    },
    {
      type: "p",
      text: "Know this before publishing. A published paper is public: anyone can attempt it, there is no private delivery to one batch, no paywall, no attempt limit and no question shuffling. Inside a coaching class that is usually fine, and it buys something real — a student can start a published mock as a guest with no account, on a phone or a laptop, which takes the sign-up wall out of the gap between sending out a test and getting attempts. A signed-in student who drops mid-exam can return within about five minutes on the same device. If you need an invigilated environment, say so out loud: there is no webcam proctoring, no lockdown browser and no tab-switch detection here.",
    },
    {
      type: "h2",
      text: "Reusing a Chapter Test With Next Year's Batch",
    },
    {
      type: "p",
      text: "The second year is where chapter tests pay for themselves. Duplicate the exam, rename it, swap three or four questions, and publish. Sections, their clocks, timing groups, instructions, every question and the marking scheme all come across — the exam-level marks plus any per-section or per-question override. Still open the marks on the copy before you publish. The marking is carried by a separate pass that runs after the paper itself is built and is deliberately allowed to fail without failing the duplicate, so if it misses, it misses quietly. And the three or four questions you swapped in are new, which means any per-question override the originals carried is not on them.",
    },
    {
      type: "p",
      text: "Reuse also buys the only year-on-year comparison worth anything. If last year's batch hit 58 percent class accuracy on Coordination Compounds and this year's hits 71 on the same blueprint, the teaching changed; if it hits 54, it did not, and you know in October rather than in May.",
    },
    {
      type: "p",
      text: "That is the loop: 20 questions, the exam's clock, the exam's penalty, class accuracy read per question, re-teach, duplicate next year. For the rest of the toolkit, the [guide for creators building papers on MockSetu](/for-creators) covers publishing, the public library and live exams. The chapter test is where a programme either gets its diagnostics or does not.",
    },
  ],
  faqs: [
    {
      question: "How many questions should a chapter-wise test have?",
      answer:
        "Twenty to twenty-five questions on a single chapter is the working range. Below about 15 the paper is too thin to diagnose with, because a question or two on each sub-topic cannot separate a weak idea from a badly written question. Above 30 you have started testing stamina rather than the chapter. Build it in four bands: eight to ten on the chapter's highest-weightage idea, five or six on drilled applications, four or five that combine it with the previous chapter, and three or four genuinely hard ones so the top of the batch is measured too. Those bands sum to 20 at the low end and 25 at the high.",
    },
    {
      question: "How long should a chapter test be?",
      answer:
        "Derive the duration from the target exam rather than choosing a round number. Divide the exam's total minutes by its total questions and multiply by your question count. NEET UG is 180 questions in 180 minutes, so a 25-question chapter test runs 25 minutes. JEE Main Paper 1 is 75 questions in 180 minutes, so a 20-question chapter test runs about 48 minutes. The only reasonable exception is the first test on a brand-new chapter: add roughly 30 percent there, so the paper shows you what students cannot solve rather than what they could not reach.",
    },
    {
      question: "Should a chapter-wise test have negative marking?",
      answer:
        "Yes, from the second test on any chapter onwards, matching the target exam's scheme exactly — and check that exam's current official bulletin for the scheme rather than a remembered number. JEE Main Paper 1 charges -1 in both Section A and Section B; SSC MTS carries -1 in Session II but none in Session I. Guessing restraint takes a year of repetitions to build and cannot be installed in the last two mocks. Run the very first test on a new chapter at zero penalty so students answer everything and you get a complete diagnostic, then switch the penalty on and leave it on.",
    },
    {
      question: "Can I split one chapter test into sections?",
      answer:
        "Yes, and you should when a syllabus chapter covers two distinct skills. On MockSetu each section can carry its own time in minutes, or two or more sections can share one pooled clock as a timing group, and section switching can be locked or left open. Separate clocks with locked switching give the cleanest diagnostic read because the two halves cannot borrow time from each other. A pooled clock with open switching is closer to real exam-day time management.",
    },
    {
      question: "Why are chapter tests better than full-length mocks for finding weak topics?",
      answer:
        "A full-length paper averages the signal away. In a 180-question NEET mock, one broken chapter might account for six questions, and a slide in accuracy on six questions out of 180 moves the total less than one unusually hard section does. On a 20-question chapter test the same weakness is the entire paper and shows up as a class accuracy figure nobody can miss. Because every student answered the same questions on the same chapter under the same clock, comparing question by question across the batch actually means something.",
    },
    {
      question: "Can I reuse a chapter test with next year's batch?",
      answer:
        "Yes. Duplicate the exam, rename it for the new batch, swap three or four questions, and publish. Sections, their clocks, timing groups, instructions, every question and the marking scheme all carry over. Check the marks on the copy anyway before publishing: they are copied by a pass that is allowed to fail quietly rather than fail the whole duplicate, and the questions you swapped in are new, so they carry no per-question override of their own. It is a fraction of the work of building the paper again, and it gives you a year-on-year comparison worth having: if the same blueprint produces 58 percent class accuracy one year and 71 the next, the teaching changed.",
    },
  ],
};

export default post;
