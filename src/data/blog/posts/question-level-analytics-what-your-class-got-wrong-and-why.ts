import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "question-level-analytics-what-your-class-got-wrong-and-why",
  title: "Question-Level Analytics: What Your Class Got Wrong, and Why",
  metaTitle: "Question Wise Analysis of a Test: Reading the Data",
  metaDescription:
    "A question your class failed has four causes: never taught, taught badly, badly written, or never reached. Tell them apart from accuracy and time.",
  keywords:
    "question wise analysis of test, question level analytics, mock test question analysis, which question students got wrong, test item analysis india, accuracy and time per question, most skipped question, common wrong answer analysis",
  excerpt:
    "Accuracy against time, read question by question in paper order, separates a topic you never taught from a question you wrote badly from one nobody reached.",
  publishedAt: "2026-10-19",
  updatedAt: "2026-10-19",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Teacher Analytics",
    "question analysis",
    "mock test results",
    "exam insights",
  ],
  hero: {
    eyebrow: "Teacher Analytics",
    h1: "Question-Level Analytics: What Your Class Got Wrong, and Why",
    lede: "Two numbers per question - accuracy and average time - and three short lists. Read them together and a failed question tells you whether the problem is the topic, the teaching, the wording, or the clock.",
  },
  content: [
    {
      type: "p",
      text: "Question-wise analysis of a test is two numbers per question plus three short lists. For every question MockSetu shows the accuracy - what share of the recorded attempts got it right - and the average time spent on it, laid out section by section in paper order. Above the table sit the most skipped questions, the most marked-for-review, and the wrong option the largest number of students chose. Read accuracy against time and a failed question stops being a mystery.",
    },
    {
      type: "p",
      text: "Because a question the class got wrong has four possible causes, and they need four different responses. They were never taught it. They were taught it badly. The question itself is broken. Or they never reached it. This article is about telling those apart from the data you already have. For the whole-paper view - score distribution, completion, where a cohort sits overall - read [how to analyse mock test results as a teacher](/blog/how-to-analyse-mock-test-results-as-a-teacher). For the pattern across chapters rather than individual questions, see [how to identify weak topics across a batch](/blog/how-to-identify-weak-topics-across-a-batch).",
    },
    {
      type: "h2",
      text: "The Four Reasons a Question Fails",
    },
    {
      type: "p",
      text: "Each cause leaves a different fingerprint across accuracy, time, skip count and position in the paper. Learn the four shapes and most questions sort themselves.",
    },
    {
      type: "ul",
      items: [
        "Never taught. Accuracy is low and the time spent is roughly what the question deserves. They read it, tried it, and had nothing to bring. Check it against what you had actually covered by the test date before you conclude anything about the class.",
        "Taught badly. Accuracy is low, the time is long, and one wrong option is taking most of the damage. They had a method and the method was wrong. This is the most fixable of the four and the easiest to mistake for plain difficulty.",
        "Badly written. Accuracy is low and the wrong option most of them chose is one you cannot honestly call wrong. An ambiguous stem, two defensible options, a key typed one row off. Nothing you teach on Monday repairs this.",
        "Never reached. Accuracy is low, the average time is near zero, the skip count is high, and the question sits at the end of a section. It was not failed. It was never read.",
      ],
    },
    {
      type: "h2",
      text: "What the Question Analysis Table Actually Holds",
    },
    {
      type: "p",
      text: "Open an exam's Analytics from its card on your dashboard and scroll to Question Analysis. The table carries four columns: the question number, an eye icon that opens the question itself, accuracy as a bar with a percentage, and average time in seconds to one decimal place. Rows are grouped under collapsible section headings and sorted by question number inside each one, so reading the table top to bottom is reading the paper in order. The accuracy bar is colour-banded - green from 70 percent, amber from 40, red below that - which makes a run of red rows visible before you have read a single figure. On a long paper opened from a phone or a low-spec machine, only part of the table is painted up front and the rest sits behind View all and View more buttons - press those before you scan, or a section's last questions are never on screen.",
    },
    {
      type: "p",
      text: "One thing to understand before you read any row: accuracy and average time share a divisor. It is the number of attempts recorded against that question, and a skipped question counts in it. So a question much of the class never opened reports low accuracy and a near-zero average - not because it was hard, but because the zeroes are in the average. Know that and it stops being a trap, because it is exactly what makes the fourth cause visible.",
    },
    {
      type: "h2",
      text: "Accuracy Against Time Is the Main Lever",
    },
    {
      type: "p",
      text: "Neither number means much alone: low accuracy could be brutal or could be unread, and a long average time could be depth or could be bad wording. Crossed against each other they narrow fast.",
    },
    {
      type: "ul",
      items: [
        "Low accuracy, long time. They engaged and they lost. This is either a teaching problem or a question problem - go to the most-chosen wrong option to decide which.",
        "Low accuracy, short time. Either a question most of them wrote off and guessed, or one most of them never opened. The skip count and the question's position separate those two.",
        "High accuracy, long time. Nobody got it wrong and everybody bled clock. Harmless on an untimed diagnostic, expensive in a mock - this is the question that eats the paper and starves the ones after it.",
        "High accuracy, short time. It worked. Note what makes it work, and leave it alone.",
      ],
    },
    {
      type: "quote",
      text: "A question with low accuracy and almost no time on it was not answered badly. It was never read - and the fix for that is in the clock, not the chapter.",
    },
    {
      type: "h2",
      text: "Where the Paper Ran Out",
    },
    {
      type: "p",
      text: "This is the cause most often blamed on the class, and the table in paper order is the cheapest way to disprove that. Scan each section from its first question to its last and look for a cliff - the point where accuracy falls and average time collapses at the same time and does not recover. Everything after that cliff is a timing finding, not a learning finding. Say a question near the end of a section comes back at 12 percent accuracy and three seconds average, while the questions in the middle of the same section average far longer: nobody read it. Re-teaching its topic would be a wasted week.",
    },
    {
      type: "p",
      text: "The Most Skipped card higher up the page shortcuts the same scan to the worst offenders - up to five, each with its section label. Two things change the reading. If the paper lets students move freely between sections, late position means less, because the order they met the questions in is their own. And where sections carry their own clocks, the cliff sits inside a section rather than at the end of the paper, so check each section separately.",
    },
    {
      type: "h2",
      text: "A Hard Question or a Broken One",
    },
    {
      type: "p",
      text: "The separator here is the wrong option they picked. Click the eye icon on any row and the Question Details dialog opens the question with its options: the correct one is marked with a green tick, and the single wrong option chosen by the most students carries a red Most Common Wrong Answer badge. The Common Misconceptions card lists up to five questions with the highest wrong-answer counts and names that option for each, so you can get the shortlist without opening anything.",
    },
    {
      type: "p",
      text: "Now judge it honestly. If the winning wrong option is a predictable near-miss of the key - the sign dropped, the unit left unconverted, the step before the last one - the question is doing its job and you have found a teaching target. If the winning wrong option is defensible on the wording as written, the question is broken, and no amount of revision in class will help. The giveaway is when your own strongest students are among the ones who missed it. [How to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions) covers the distractor discipline that stops this happening twice.",
    },
    {
      type: "p",
      text: "Be clear about what this page does not give you. It ships the single most-chosen wrong option, not the full tally - you cannot see how the remaining wrong answers split. It names nobody: the figures are counts across everyone who attempted, and the only names anywhere on the page are the top three on the leaderboard. There is no per-student report card and no CSV or Excel export, so a question you want to discuss has to be discussed from the screen.",
    },
    {
      type: "h2",
      text: "What to Do With Each Verdict",
    },
    {
      type: "ul",
      items: [
        "Never taught: teach it, then re-test it inside the next paper. Re-explaining the same question to the same batch tests their memory of your explanation, not the topic.",
        "Taught badly: take the winning wrong option into class and work it as a method, out loud, start to finish. Naming the mistake beats re-deriving the right answer, because the mistake is what they will reach for again under a clock.",
        "Badly written: fix the question and say so. Hand students the habits side of it too - [how to improve accuracy in MCQ exams](/blog/how-to-improve-accuracy-in-mcq-exams) is the companion read for the people who sat the paper.",
        "Never reached: this is a paper-design finding. Either the section's clock is short for the length you set, or the questions before it are heavier than you intended. Change one of the two and re-run, rather than trimming the syllabus.",
      ],
    },
    {
      type: "h2",
      text: "Fix the Question Without Losing the Evidence",
    },
    {
      type: "p",
      text: "Two mechanics matter here and both surprise people. Correctness is judged and stored at the moment a paper is submitted, so correcting an answer key changes what the next student scores and not what the ones who already sat it scored. The analytics for that question keep reporting the old verdict for every completed attempt. And deleting a question is permanent, removes it from every language of a bilingual paper at once, and takes its row off this page with it - so never delete the question you were planning to learn from.",
    },
    {
      type: "p",
      text: "The safer move on a paper that has already been attempted is to duplicate the exam and repair the copy. A duplicate carries the marking scheme, the timing groups and the language links with it, which is most of what you would otherwise rebuild by hand. It is best-effort rather than guaranteed, so open the copy and check a question in each section before you publish it. The original keeps its history and the corrected version goes out clean.",
    },
    {
      type: "h2",
      text: "Before You Trust a Single Row",
    },
    {
      type: "p",
      text: "Five things change what a row means, and none of them are visible on the row itself.",
    },
    {
      type: "ul",
      items: [
        "The per-question figures are built from submitted sittings only. A paper that was mostly abandoned has question rows describing the students who finished, which is a different cohort from the one you handed it to.",
        "Attempts made by the exam's own owner are excluded from every figure on the page, so a run you sat yourself to sanity-check the paper never lands in the class numbers.",
        "Skips sit in the divisor for both accuracy and time. Always read the skip count before you read the accuracy.",
        "A question added after some students had already sat the paper carries fewer recorded attempts than its neighbours. Judge it against its own count, not against the section's.",
        "On a bilingual paper, the two language copies of a question are pooled into one row, so the figure you read is the whole class rather than one language group.",
      ],
    },
    {
      type: "p",
      text: "And let the cohort be big enough to mean something before you redesign a chapter around it. A handful of sittings produces percentages that look authoritative and move wildly on the next batch to sit the paper.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, per-question marking, bilingual papers, and this analytics page on every exam you make - sits behind one account. Build the paper so the data is readable: real sections, honest clocks, and distractors worth counting.",
    },
  ],
  faqs: [
    {
      question: "How do I do a question-wise analysis of a test?",
      answer:
        "Read accuracy against average time for each question, in paper order. Low accuracy with a long average time means they engaged and lost - a teaching or wording problem. Low accuracy with a near-zero average time usually means they never reached the question. High accuracy with a long time flags the question that is eating your clock. On MockSetu, open an exam's Analytics from your dashboard and scroll to the Question Analysis table, which is grouped by section and sorted by question number.",
    },
    {
      question: "How do I know whether a question was too hard or badly written?",
      answer:
        "Look at which wrong option most students chose. The Question Details dialog marks it with a red badge, and the Common Misconceptions card lists up to five questions with the highest wrong-answer counts and names the option for each. If that option is a predictable near-miss of the key - a dropped sign, an unconverted unit - the question is working and you have a teaching target. If it is defensible on the wording as written, the question is broken, and your strongest students missing it is the confirmation.",
    },
    {
      question: "Why does a question show low accuracy and almost no time spent?",
      answer:
        "Because accuracy and average time share one divisor, the attempts recorded against that question, and skipped questions count in it. A question most of the class never opened contributes zeroes to both. If it also sits near the end of a section and appears in the Most Skipped list, the paper ran out of time before the students did. That is a finding about the clock and the length of the paper, not about the topic.",
    },
    {
      question: "Can I see which student got a particular question wrong?",
      answer:
        "No. Per-question analytics are aggregate counts across everyone who attempted the question - how many were right, how many wrong, how many skipped, and the single wrong option chosen most often. No names are attached, the full split across the remaining wrong options is not shown, and there is no per-student report card and no CSV or Excel export. The only names on the page are the top three on the leaderboard.",
    },
    {
      question: "If I fix a wrong answer key, do the old results update?",
      answer:
        "No. Correctness is decided and stored when a paper is submitted, so a corrected key applies to the next student and not to the ones who already sat it, and the analytics for that question keep reporting the old verdict for completed attempts. Do not delete the question either - deletion is permanent and removes it from every language of a bilingual paper. Duplicate the exam and repair the copy instead, then check the copy before publishing it.",
    },
  ],
};

export default post;
