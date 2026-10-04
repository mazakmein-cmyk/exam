import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-previous-year-paper-mock-test",
  title: "How to Create a Previous Year Paper Mock Test (and Why It Draws Students)",
  metaTitle: "Previous Year Paper Mock Test: How to Build One | MockSetu",
  metaDescription:
    "A previous year paper mock test only helps if it is faithful. Tag it Previous Year, copy the original timing and marking, and transcribe the printed key.",
  keywords:
    "previous year paper mock test, create previous year paper online test, PYQ mock test, past year question paper online, upload previous year paper, previous year paper with answer key online, digitize previous year papers",
  excerpt:
    "A previous year paper is a reproduction, not an adaptation. Here is how to build one faithfully - paper type, shift code, original timing, the real marking scheme, and a key you transcribed rather than solved.",
  publishedAt: "2026-09-19",
  updatedAt: "2026-09-19",
  readingMinutes: 11,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a creator to
    // a student pillar. Never add "SSC MTS" or "JEE Main" here.
    "For Creators",
    "Exam Creation",
    "previous year papers",
    "answer keys",
    "question bank",
    "SSC",
  ],
  hero: {
    eyebrow: "For Educators",
    h1: "How to Create a Previous Year Paper Mock Test (and Why It Draws Students)",
    lede: "A past paper is worth publishing only if it is reproduced exactly. Five decisions - paper type, shift code, timing, marking, key - separate a faithful previous year paper from a mock with a year stamped on it.",
  },
  content: [
    {
      type: "p",
      text: "A previous year paper mock test is a past paper reproduced exactly: the same questions in the same order, the same sections, the same clock, the same marking scheme, and the official key. On MockSetu that comes down to five decisions - tag it Previous Year Paper rather than Mock, name it with the year and shift, rebuild the sections on the original timing, copy the marking scheme section by section, and transcribe the published key instead of solving the paper yourself. Get the key wrong and you have published a trap with a year stamped on it. For a paper you wrote yourself, [how to create an online mock test](/blog/how-to-create-an-online-mock-test) is the general version of this guide.",
    },
    {
      type: "p",
      text: "Fidelity is the whole specification. Fix an ambiguous question, drop two you could not read off a bad scan, or reorder the options, and what you have published is a mock inspired by a past paper rather than the 2024 paper - and aspirants cross-check against coaching keys and solution videos, so the divergence surfaces fast. If something in the source is genuinely unreadable, say so in the description rather than inventing a replacement.",
    },
    { type: "h2", text: "Step 1: tag it as a Previous Year Paper, not a Mock" },
    {
      type: "p",
      text: "MockSetu carries a paper type field on the exam with exactly two values: Mock Exam, a practice paper you wrote yourself, and Previous Year Paper, a paper that was actually set. Students filter the public library on it, so the tag is how a candidate hunting for real papers finds yours. An untagged paper reads as a Mock, which is the honest default: a paper claims to be the real thing only when somebody deliberately says so. The picker is off by default and switched on per creator on request, so if it is not on your account you will not see the field at all - ask for it, and meanwhile put the exam body, paper and year in the description.",
    },
    { type: "h2", text: "Step 2: put the year, the shift and the set code in the name" },
    {
      type: "p",
      text: "An exam run across several days and shifts does not have one paper per year - it has one per shift. A name like SSC MTS Previous Year Paper is nearly useless to a searcher; the year, the session date and the shift number are what they type. If the booklet carries a set or series code, include it: keys are published per set, and a set-B key laid over a set-A question order marks a correct paper wrong almost everywhere.",
    },
    {
      type: "p",
      text: "Use the description and the two instruction boxes to carry what a name cannot: the exam body, the total questions and marks, the duration, the marking rule, and where your key came from. MockSetu has an instruction generator if you would rather start from a draft, but the specifics have to be yours - including one honest line saying this is a reproduction published for practice, not an official release.",
    },
    { type: "h2", text: "Step 3: rebuild the sections on the original clock" },
    {
      type: "p",
      text: "Timing is where a reproduction drifts without anyone noticing. MockSetu gives each section its own clock in minutes, lets sections share one pooled clock through a timing group, lets you lock switching or leave it open, and auto-submits when time expires. Copy what the original did, not what is convenient to build.",
    },
    {
      type: "p",
      text: "SSC MTS is the clean example. The paper is 90 questions for 270 marks, run as two 45-minute sessions, so the faithful build is two sections of 45 minutes each rather than one 90-minute section - which would let a student borrow time from a session the real exam timed on its own. Whether a candidate may move back to the earlier session is the sort of rule to read off that year's instruction sheet before choosing between locked and open switching; do not set it from memory. If the original ran one pool across subjects, put those sections into a timing group instead. JEE Main Paper 1 runs 75 questions and 300 marks over 180 minutes with every question compulsory, so handing each subject its own 60-minute clock builds a different exam. The [mock test format reference](/blog/mock-test-format-for-competitive-exams-reference) is a starting point; the current bulletin is the authority.",
    },
    { type: "h2", text: "Step 4: copy the marking scheme, including the section where it changes" },
    {
      type: "p",
      text: "Per question, MockSetu takes marks for a correct answer, a wrong answer and an unattempted one. Multi-correct questions can carry partial credit or be all-or-nothing, the penalty can be charged once or per wrong option, and part marks can round down, to nearest, up, or stay exact with no rounding at all. Leave every dial where the original paper set it: adding partial credit the past paper did not give changes the score your student compares against a friend's.",
    },
    {
      type: "p",
      text: "The section where the scheme changes is the one people get wrong. In SSC MTS, Session I is qualifying only and carries no negative marking at all, while Session II counts for merit and deducts 1 for a wrong answer. Apply minus 1 across all 90 questions and every score your paper reports is wrong - worse, a candidate who should attempt everything in Session I learns to leave questions blank. JEE Main runs plus 4 and minus 1 in both Section A and Section B, and the old attempt-any-5-of-10 choice in Section B was discontinued from the 2025 cycle, so a 2023 paper and a 2025 paper of the same exam are not the same build. [Negative marking schemes of Indian exams](/blog/negative-marking-schemes-of-indian-exams-for-paper-setters) is written for paper setters.",
    },
    {
      type: "p",
      text: "Know what the platform will and will not catch here. MockSetu audits two things in your written instructions - the timing sentence and the line stating how many sections and questions the paper has - and flags them when the paper has moved underneath them. The marking scheme is not audited: the generator will write a marking line for you, but nothing re-reads it against the exam afterwards, so changing the scheme leaves that sentence standing and wrong. There is a separate nudge when you have changed the exam without reopening the instructions, but it only says worth a check. So the marking paragraph is the one you have to re-read yourself, which is awkward, because marking is usually the thing you adjusted last.",
    },
    { type: "h2", text: "Step 5: transcribe the official key. Do not solve the paper." },
    {
      type: "p",
      text: "The key is published. It exists. Solving a 90-question paper yourself takes an evening and injects your own error rate into the one document whose entire value is that it is the official record. Transcribe it instead, as its own pass with nothing else happening: open the key beside the question list and work down in blocks of ten, checking that the number you are reading is the number you are writing against. The defect to look for first is an off-by-one shift, which begins wherever a question was skipped, merged or split during extraction and stays invisible until a student finds it.",
    },
    {
      type: "p",
      text: "Two cases need a decision rather than a transcription. If the exam body dropped a question after challenges, follow the final revised key and say so in the description. If your source is a coaching key rather than an official one, say that too - a good guess is not the record. And fix the key before anyone sits the paper, because a correction does not reach backwards: a paper is graded and scored at the moment it is submitted, and the attempts already recorded keep the marks they were stamped with. Correcting the key fixes every sitting from then on and leaves the earlier cohort where it is. That is the real argument for the separate transcription pass - the first batch's scores are the ones you cannot take back. [Running the extraction prompt in ChatGPT](/blog/how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json) shows where the answer column tends to slip.",
    },
    {
      type: "quote",
      text: "A mock you wrote can be wrong and still be decent practice. A previous year paper that is wrong is just a mock with a year on it, and nobody went looking for that.",
    },
    { type: "h2", text: "Getting 90 questions in without typing 90 questions" },
    {
      type: "p",
      text: "Retyping is the part people quit on, and the part you can mostly skip. MockSetu's bulk route is JSON: the extraction prompt is published at the [JSON upload guide](/json-upload-guide), you run it in whatever AI assistant you already use against the paper you have, save the JSON, and upload the file. The import carries question text with its formatting, maths written as LaTeX, and reading passages. Figures travel as page coordinates rather than as pictures, so upload the source PDF alongside the JSON and MockSetu snips each figure out of it - hand it the JSON alone and you get a paper with no diagrams. Numeric, TITA and match-the-column questions are left for manual entry.",
    },
    {
      type: "p",
      text: "For anything the extractor mangles - a circuit diagram, a Hindi line that came back as garbage characters, a matched-columns table - snip it. MockSetu lets you clip a question, an option or a whole passage straight out of the PDF as an image, which is faster and more faithful than a transcription that drops a subscript. The [PDF to online test walkthrough](/blog/convert-pdf-question-paper-to-online-test) covers the extraction pass in detail. There is also a server-side Import from PDF button, but it is off by default and switched on per creator on request, so plan your build around the JSON route.",
    },
    { type: "h2", text: "Why a faithful past paper is worth publishing" },
    {
      type: "p",
      text: "There is a strategic half to this too. A candidate looking for a mock is browsing; a candidate looking for a specific year's shift 2 paper has already decided what they want and only needs to find whoever has it in a usable form. SSC MTS is that demand in miniature: a 90-question, 270-mark paper whose past shifts are easy to find as PDFs and hard to sit under a clock. A PDF teaches you the questions. A timed reproduction on an exam screen - palette, mark for review, auto-submit - teaches a candidate whether they can finish Session II in 45 minutes with a penalty running.",
    },
    {
      type: "p",
      text: "Publish to the public library in the language the paper was set in - English, Hindi, or both if you built it bilingual - share the link, and let the paper introduce you. A creator with a dozen faithful past papers and a Verified Creator badge, granted on request rather than automatically, is a different proposition from one with a dozen untitled mocks. If you are building a sequence, [the online test series playbook](/blog/how-to-create-an-online-test-series) covers ordering and cadence, and [what creators can build on MockSetu](/for-creators) is where to start.",
    },
    { type: "h2", text: "What a published previous year paper cannot do" },
    {
      type: "p",
      text: "The honest part, because this category oversells relentlessly. A published paper is public: anyone who finds it in the library can attempt it, and a student can start it as a guest without an account. There is no private delivery to one batch, no paywall, no subscription. There is no limit on attempts and no question shuffling, so the order you publish is the order everybody sees. There is no webcam or AI proctoring, no lockdown browser and no tab-switch detection - assume a determined reader has the source PDF open in another tab. There is no CSV or Excel export and no per-student report card.",
    },
    {
      type: "p",
      text: "Creator analytics are nearly all aggregate - section-wise accuracy, average time per attempted question, which questions the class got wrong. The one exception is a top-three leaderboard, which names those students by their handle. Read the per-question figures knowing they average over the students who attempted each question, so a question half the room skipped is described by the half that tried it. For a previous year paper the aggregate is the part you want anyway: which questions of the 2024 paper broke the cohort.",
    },
    { type: "h2", text: "The pre-publish checklist" },
    {
      type: "p",
      text: "Run this with the original PDF open beside the paper you built.",
    },
    {
      type: "ul",
      items: [
        "The paper type says Previous Year Paper, and the name carries the exam, year, session date and shift or set code.",
        "The question count matches the original, including the questions you were tempted to drop.",
        "Each section's time matches the original, and switching is locked or open as that year's instruction sheet describes it.",
        "Marks for correct, wrong and unattempted are set per section, with any no-negative-marking section explicitly zeroed rather than left to a default.",
        "Every answer came from the published key for the matching set code, and you spot-checked the first, middle and last question numbers for an off-by-one shift.",
        "Numeric, TITA and match-the-column questions were entered by hand and verified, since the JSON importer leaves them for you.",
        "Any dropped question is flagged in the description, and the key is named: official, revised after challenges, or a coaching key.",
        "You previewed the paper end to end and watched the clock run out and auto-submit fire.",
      ],
    },
    { type: "h2", text: "After it is live" },
    {
      type: "p",
      text: "Watch the aggregate. A previous year paper hands you a benchmark no mock can: cohort accuracy on a question whose difficulty is already settled, because the exam body set it and a national field attempted it. If your batch sits far below what the paper treated as straightforward, that is a syllabus gap rather than a bad question.",
    },
    {
      type: "p",
      text: "Then duplicate it. A previous year paper does not go stale - next year's batch needs the same shift paper, and the exam menu will duplicate it rather than make you build it again. The copy carries the questions, the sections, the section timing and the Previous Year Paper tag. Open the marks panel on it anyway and read the scheme back against the original, section by section, including any section you deliberately zeroed - a duplicate that scores differently from the paper it claims to reproduce is the one defect your students will find for you. A few cycles of that is how a creator ends up with a library of past papers nobody else can assemble quickly - and it starts with one paper transcribed properly rather than ten transcribed fast.",
    },
  ],
  faqs: [
    {
      question: "What is the difference between a mock test and a previous year paper mock test?",
      answer:
        "A mock test is a practice paper you wrote yourself. A previous year paper mock test is a reproduction of a paper that was actually set in a past exam, with the same questions, sections, timing, marking scheme and official answer key. On MockSetu this is an explicit field on the exam with two values, Mock Exam and Previous Year Paper, and students filter the public library on it. An untagged paper reads as a Mock, so a paper only claims to be the real thing when you deliberately say so.",
    },
    {
      question: "Should I solve the past paper myself to build the answer key?",
      answer:
        "No. The key is published, so transcribe it rather than solving the paper. Solving it yourself takes hours and injects your own error rate into the one document whose value is that it is the official record. Transcribe in a separate pass, in blocks of ten, checking question numbers as you go, because the defect to look for first is an off-by-one shift rather than a wrong answer. Do it before you publish: a paper is graded and scored when it is submitted, so fixing the key later corrects every sitting from then on but does not change the scores already recorded.",
    },
    {
      question: "Does the shift or set code of a previous year paper actually matter?",
      answer:
        "Yes, in two ways. Candidates search by year and shift, so a name without them is much harder to find. More importantly, answer keys are published per set, and the question order differs between sets. A key from one set laid over another set's question order will mark a correct paper wrong almost everywhere, and the few it agrees with by chance are what stop you noticing. Match the set code on the booklet to the set code on the key before you transcribe anything.",
    },
    {
      question: "How do I get a 90-question past paper in without retyping all of it?",
      answer:
        "Use the JSON route. MockSetu publishes its extraction prompt at the JSON upload guide; you run that prompt in whatever AI assistant you already use against the paper you have, save the JSON, and upload it. The import carries question text with its formatting, LaTeX maths and reading passages. Figures come through as page coordinates, so upload the source PDF with the JSON and MockSetu snips the pictures out of it; without the PDF you get a paper with no diagrams. Anything the extraction mangles can be snipped out of the PDF as an image instead of retyped. Numeric, TITA and match-the-column questions are left for manual entry, so plan time for those.",
    },
    {
      question: "Can I publish a previous year paper to only my own batch?",
      answer:
        "No. Publishing puts the paper in the public library, where anyone can find and attempt it, and there is no paid or private delivery to a single batch. There is also no limit on attempts, no question shuffling, and no proctoring, lockdown browser or tab-switch detection. For a past paper that is usually fine, since the source PDF is already circulating, but it means a published reproduction is a public resource rather than a controlled assessment.",
    },
  ],
};

export default post;
