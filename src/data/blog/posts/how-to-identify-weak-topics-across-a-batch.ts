import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-identify-weak-topics-across-a-batch",
  title: "How to Identify Weak Topics Across a Batch, Not Just Weak Students",
  metaTitle: "Identify Weak Topics Across a Batch | MockSetu",
  metaDescription:
    "A full-length mock averages topic weakness away. How to build papers so topic signal survives, how to read section and question analytics, and what they cannot tell you.",
  keywords:
    "identify weak areas of students, weak topics batch analysis, topic wise test analysis, chapter wise performance report, section analytics for teachers, question analysis online test, find weak chapters class, batch performance analysis india",
  excerpt:
    "A batch-wide weakness hides inside a reasonable mean. Build the paper so topic signal survives the averaging, then read the denominator before you read the percentage.",
  publishedAt: "2026-10-20",
  updatedAt: "2026-10-20",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Teacher Analytics",
    "batch analysis",
    "chapter wise test",
    "question analysis",
    "diagnostic testing",
  ],
  hero: {
    eyebrow: "Teacher Analytics",
    h1: "How to Identify Weak Topics Across a Batch, Not Just Weak Students",
    lede: "A chapter nobody in the room understands can sit quietly inside a respectable class average. Finding it is a paper-building problem before it is a reporting problem.",
  },
  content: [
    {
      type: "p",
      text: "A weak topic hides inside a reasonable average. A batch can sit a full-length mock, finish on a mean that looks fine, and still carry a chapter nobody in the room understands. To find weak topics rather than weak students, build the paper so the topic signal survives the averaging, then read the two aggregated tables that keep it: Section Analytics and Question Analysis. Everything below is about making those two tables say something a teaching plan can act on.",
    },
    {
      type: "p",
      text: "This is the paper setter's half of the job. [How to analyse mock test results as a teacher](/blog/how-to-analyse-mock-test-results-as-a-teacher) walks the whole results page, and [question-level analytics](/blog/question-level-analytics-what-your-class-got-wrong-and-why) takes a single question apart. This article is the layer between them - the topic, which is the unit you actually teach to.",
    },
    {
      type: "h2",
      text: "Why a Full-Length Mock Averages a Weak Topic Away",
    },
    {
      type: "p",
      text: "Start with the arithmetic of a full paper. JEE Main Paper 1 runs 75 questions, 25 per subject, all compulsory. A single chapter contributes a handful of those. If the batch collapses on that chapter and holds steady everywhere else, the paper mean moves by the chapter's share of 75 - small enough to read as noise, small enough to be cancelled out by a good day in Chemistry. The mean is not malfunctioning. It is a summary, and summaries delete exactly the detail you came for.",
    },
    {
      type: "p",
      text: "The second problem is structural. Nothing in the exam editor tags a question with a chapter name. There is no topic field, no syllabus tree, and no filter that gathers every rotational-motion question across the papers you have run. The only grouping the analytics page understands is the section. So a topic has to BE a section, or the topic has to be the whole paper. That is not a workaround you apply afterwards; it is the decision you take before adding the first question.",
    },
    {
      type: "h2",
      text: "Make the Topic a Section, or Make It the Paper",
    },
    {
      type: "p",
      text: "Two shapes work, and the choice depends on whether you want the topic measured in isolation or measured under full-paper pressure. The first two items below are those shapes; the three after them are the build habits that keep either one readable.",
    },
    {
      type: "ul",
      items: [
        "A chapter test - one paper, one topic, so the paper mean IS the topic number. [How to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online) covers the build. Cleanest signal available, and the fastest to turn around.",
        "A topic-sectioned mock - one paper, one section per topic. Section Analytics then prints a row per topic with its own average accuracy and average time per question, next to how long that section was given.",
        "Rename every section before you publish. A new section is born called \"New Section\" with a number after it and a 60-minute clock, and the Section Analytics table prints that name straight back at you. A weak-topic table that reads \"New Section 3\" is a table nobody uses twice.",
        "Keep the section list stable across the term. The page identifies a section by its own identity rather than by its name, so renaming is safe - but deleting one and recreating it starts that topic's history again from zero.",
        "On a bilingual paper, do nothing special. The English and Hindi versions of a section are pooled into one row, and a question's counts are pooled across its translations, so the figure you read is the whole batch rather than half of it on each tab.",
      ],
    },
    {
      type: "h2",
      text: "How Many Questions Before the Number Means Anything",
    },
    {
      type: "p",
      text: "There is no threshold worth quoting, and anybody who hands you one is guessing. What carries the inference is not the count but the agreement. A topic result is trustworthy when its questions agree with each other and disagree with the rest of the paper. Suppose, hypothetically, one rotational-motion question comes back at 30 percent: that is a fact about one question. Now suppose four rotational-motion questions, each on a different sub-skill, all land between 25 and 40 percent while the rest of that section sits near 70. That is a fact about the chapter.",
    },
    {
      type: "p",
      text: "So build in the redundancy the inference needs. Put several questions on any topic you genuinely want to measure, and make them differ from each other - different sub-skill, different format, different difficulty - rather than three rewrites of one trick. Three clones tell you about one question, three times over. Then open Question Analysis, which lists every question grouped under its section with accuracy and average time on each row, and look at the spread inside the group before you look at its middle.",
    },
    {
      type: "h2",
      text: "Weak Topic, or Badly Written Question",
    },
    {
      type: "p",
      text: "A question everyone gets wrong looks identical to a topic nobody knows. Telling them apart takes a few minutes and saves a week of teaching the wrong thing.",
    },
    {
      type: "ul",
      items: [
        "Read the Common Misconceptions card. It lists the five questions with the most wrong answers and, for each, the wrong option the largest number of students picked. One option pulling the crowd is a misconception you can name and teach. Wrong answers spread evenly across the options is closer to guessing.",
        "Check the answer key yourself before blaming the batch. A key that is wrong scores every correct student as wrong, and that question will sit at the top of the misconceptions card looking like a crisis.",
        "Check Most Skipped. The five most-skipped questions are where a clock problem shows up first, and where a question sits in the paper explains a good deal of it.",
        "Check Most Reviewed. A question flagged for review by many students and then answered wrongly is a different failure from one answered wrongly in seconds.",
        "Compare a question against the others on its own topic. If one sits far below its neighbours, fix the question. If all of them sit together at the bottom, teach the chapter.",
        "Re-use the question in the next test. A question that behaves the same way on a fresh cohort is measuring something real.",
      ],
    },
    {
      type: "quote",
      text: "A single question everyone fails is a question problem until proven otherwise. It becomes a topic problem only when several different questions about that topic fail together.",
    },
    {
      type: "h2",
      text: "Read the Denominator Before You Read the Percentage",
    },
    {
      type: "p",
      text: "Every percentage a creator sees on this page counts a skipped question exactly as it counts a wrong one, and that single fact decides what a topic number is worth. The headline tile is Avg Score %: correct answers over all the questions in every student's attempt, blanks included. The Avg Accuracy column in Section Analytics treats a blank the same way, but it is assembled differently - each sitting's figure is correct answers over that section's full question count, and the column is the mean of those sittings - so the two need not agree even when nobody skips anything. Neither one, on its own, is evidence about what the batch knows.",
    },
    {
      type: "p",
      text: "Per-question accuracy is built the same way. When a section is handed in, a row is written for every question in it, answered or not, so the denominator behind a question's percentage is everyone who submitted that section rather than only those who chose an option. A question with low accuracy and a long skip count is not a topic the batch got wrong; it is a topic the batch never reached. Those two call for opposite responses - one is a teaching problem, the other is a pacing problem - and the Most Skipped card is what separates them. Sittings that were abandoned and never submitted contribute nothing to question statistics at all, which is worth remembering when a topic looks suspiciously strong.",
    },
    {
      type: "h2",
      text: "What These Numbers Are Not",
    },
    {
      type: "p",
      text: "Be clear about the limits before any of this reaches a parent or a staff meeting. Published papers are public: anyone with the link can attempt them, and there is no private or paid delivery to one batch, so the cohort behind a percentage is everyone who sat the paper, not only your students. Repeat sittings count again - the page carries Unique Students and Repeaters as separate tiles for exactly this reason - so a topic that a few keen students drilled twice will read stronger than it is.",
    },
    {
      type: "p",
      text: "There is no CSV or Excel export and no per-student report card, so this analysis lives on the screen and the handful of rows you need go into your own notes by hand. No names are attached to any section or question figure - those counts are aggregated - and the only students named anywhere on the page are the usernames on the top-three leaderboard. There is also no proctoring of any kind: no webcam, no lockdown browser, no tab-switch detection, no attempt limits. An unsupervised topic score is a diagnostic, and presenting it as an assessment is a claim the data cannot carry.",
    },
    {
      type: "h2",
      text: "The Teaching Response, and the Re-Test",
    },
    {
      type: "p",
      text: "A weak topic is only worth finding if something changes on Monday. Rank the weak topics by their weight in the exam you are preparing for rather than by how weak they are: a chapter the batch scores badly on that the bulletin barely touches loses to a middling chapter that carries a block of questions every cycle. Check the current official bulletin or paper analysis for the exam you are mirroring, and point students at [JEE Main chapter wise weightage](/blog/jee-main-chapter-wise-weightage) so they can see the same priority order you are working from.",
    },
    {
      type: "p",
      text: "Then re-test the topic, because a topic score with nothing beside it is a single data point. Duplicate the paper rather than rebuilding it - a duplicate carries the marking scheme, the timing groups and the bilingual links across with it. That copy is made on a best-effort basis, so open it and confirm the marks and the clocks before you swap in new questions and publish. Same shape, same marking, fresh questions on the same chapter: now the two numbers mean something next to each other, and a movement between them is evidence that your Monday changed anything.",
    },
    {
      type: "p",
      text: "[Everything a creator can build on MockSetu](/for-creators) - sections with their own clocks, pooled timing, bilingual papers, and the section and question analytics described here - is free and takes no card. The analytics are only ever as good as the structure you gave the paper, which is the whole argument for settling your sections before you settle your questions.",
    },
  ],
  faqs: [
    {
      question: "How do I identify weak areas of students across a whole batch?",
      answer:
        "Structure the paper so the topic survives the averaging, then read the aggregated tables. A full-length mock reports one mean over the whole paper, which moves very little when one chapter collapses. Either run a chapter test, where the paper mean is the topic number, or build the mock with one section per topic so Section Analytics prints a row per topic. Then use Question Analysis, which groups every question under its section with its accuracy and average time, to see whether the questions inside a topic agree with each other.",
    },
    {
      question: "How many questions do I need on a topic before the result means anything?",
      answer:
        "There is no honest threshold to quote. What matters is agreement, not count: a topic result is trustworthy when several different questions on that topic land in the same place and that place is clearly apart from the rest of the paper. Make the questions differ in sub-skill, format and difficulty, because three rewrites of one trick tell you about one question three times over rather than about the chapter once.",
    },
    {
      question: "How do I know whether a topic is weak or the question was badly written?",
      answer:
        "Check the answer key first - a wrong key marks every correct student wrong. Then open the Common Misconceptions card, which shows the five questions with the most wrong answers and the wrong option most students chose on each: one option pulling the crowd is a real misconception, while answers spread evenly across the options suggests guessing. Finally compare the question against the others on its own topic. One question far below its neighbours is a question problem; the whole group at the bottom is a chapter problem.",
    },
    {
      question: "Why does a question show low accuracy when the class seemed to know the topic?",
      answer:
        "Because the denominator includes students who left it blank. When a section is submitted, a row is written for every question in it, answered or not, so a question's percentage is correct answers over everyone who submitted that section. A low figure next to a high skip count usually means the batch ran out of time before reaching the question, not that they got it wrong. The Most Skipped card is what tells a pacing problem apart from a teaching one.",
    },
    {
      question: "Can I export topic-wise results for a batch to Excel?",
      answer:
        "No. There is no CSV or Excel export and no per-student report card, so the section and question tables are read on screen and copied into your own notes. The figures are also aggregated and carry no names - the only students named on the page are the usernames on the top-three leaderboard. Remember too that a published paper is public, so the cohort behind any percentage is everyone who attempted it, not only your batch.",
    },
  ],
};

export default post;
