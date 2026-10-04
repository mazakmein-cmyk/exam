import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-analyse-mock-test-results-as-a-teacher",
  title: "How to Analyse Mock Test Results as a Teacher: A 30-Minute Routine",
  metaTitle: "Analyse Mock Test Results: A Teacher's 30-Minute Routine",
  metaDescription:
    "A repeatable half-hour routine for reading a batch's mock test results: shape first, then the questions lost, then the slow ones, then the actions that follow.",
  keywords:
    "analyze test results as a teacher, how to analyse mock test results, mock test analysis for teachers, question level analytics, batch performance analysis, exam analytics for coaching, test result analysis routine, class mock test review",
  excerpt:
    "Read the shape of the sitting before the score, the lost questions before the slow ones, and stop at two or three teaching actions. Here is the half-hour order that keeps you from teaching the wrong thing.",
  publishedAt: "2026-10-18",
  updatedAt: "2026-10-18",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Teacher Analytics",
    "mock test analysis",
    "question analytics",
    "batch performance",
  ],
  hero: {
    eyebrow: "Teacher Analytics",
    h1: "How to Analyse Mock Test Results as a Teacher: A 30-Minute Routine",
    lede: "Shape of the sitting first, then the questions the batch lost, then the ones it got right slowly, then two or three things you will actually do on Monday. The order matters more than the half hour.",
  },
  content: [
    {
      type: "p",
      text: "Analyse a mock in the order that narrows: the shape of the whole sitting first, then the questions the batch lost, then the ones it got right slowly, then the two or three teaching actions you commit to. Half an hour covers it once that order is fixed, and the order is the part that matters. An average score read before a completion rate sends a teacher off to reteach a topic when the real problem was the clock.",
    },
    {
      type: "p",
      text: "Settle one thing before opening the page. A creator's analytics are about the batch, not about a named student. The tiles, the charts and the question table are all cohort aggregates, and the only students named anywhere on the page are the top three on the leaderboard - by username, not by full name. A conversation with one student starts from their own review screen, where they see their answer against the correct one.",
    },
    {
      type: "h2",
      text: "Minute 0 to 5: Read the Shape, Not the Score",
    },
    {
      type: "p",
      text: "Open the exam's analytics from its card on the creator dashboard. Six tiles run across the top, and each one counts something narrower than its label suggests. Read them in the order below rather than left to right: the first two decide what the other four are worth.",
    },
    {
      type: "ul",
      items: [
        "Total Attempts - sittings in which the student actually answered something. Somebody who opened the start screen and backed out is in no number on this page.",
        "Completion - the share of those sittings that submitted every section that existed when the sitting began. Adding a section later cannot un-complete a paper somebody finished last month.",
        "Unique Students - distinct accounts behind those sittings.",
        "Repeaters - students who answered something in more than one sitting. Opening the paper twice without answering is not a repeat. There is no attempt limit.",
        "Avg Score % - correct answers divided by all questions, skipped ones included. A skip costs exactly what a wrong answer does here.",
        "Avg Time / Attempted Q - time on task divided by the questions students actually opened, not by the paper's full count.",
      ],
    },
    {
      type: "p",
      text: "Completion and Avg Score % have to be read together or they lie to each other. A batch that finished the paper and scored low has a syllabus problem. A batch that scored low while Completion sits well under full has a pacing problem - and the score counts a narrower population than the tiles beside it: only sections that were handed in, with every question nobody reached inside them scored as a zero. Teaching harder content to the second batch makes it worse.",
    },
    {
      type: "h2",
      text: "Minute 5 to 10: The Distribution the Average Hides",
    },
    {
      type: "p",
      text: "Below the tiles, past the top-three leaderboard, sit two charts. Score Distribution buckets every sitting into five bands of twenty points - 0-20, 21-40, 41-60, 61-80, 81-100 - and it is the most useful picture on the page, because an average cannot tell one shape from another. One hump in the middle is a batch roughly together, and a class-wide reteach fits. Two humps are two classes sharing a room, and a single lecture aimed between them reaches neither.",
    },
    {
      type: "p",
      text: "Daily Total Attempts Over Time answers a different question: when they sat it. A paper spread across two weeks and a paper taken by everybody on the last evening are not comparable diagnostics - the second says the batch was revising under a deadline rather than testing itself. If you need them all on one clock, run the next one as a live exam with a scheduled start.",
    },
    {
      type: "h2",
      text: "Minute 10 to 20: The Questions the Class Lost",
    },
    {
      type: "p",
      text: "This is the stretch worth protecting - ten of the thirty minutes. The Question Analysis table groups every question under its section in four columns: the question number, an eye icon that opens the question itself, an accuracy bar, and average time. The bar turns green at 70 percent and above, amber from 40, red below - a quick scan, not a verdict. On a long paper the table paints only the first rows of each section until you take the View all, so press it before you scan.",
    },
    {
      type: "p",
      text: "Know what that percentage divides by before acting on it. A question's accuracy is the students who got it right divided by everyone who had it in front of them in a section that was handed in - a section somebody abandoned without submitting is in none of these numbers. Right, wrong and left blank are the three outcomes making up that denominator, so a blank drags the bar down as hard as a wrong answer does. Two very different papers produce the same red bar.",
    },
    {
      type: "p",
      text: "The three cards above the table separate them for you, each listing up to five questions. Most Skipped ranks by how many left it blank. Most Reviewed ranks by how many flagged it with the mark-for-review button. Common Misconceptions ranks by wrong answers and names the wrong option the largest group chose - open that question with the eye icon and the option is highlighted in red and badged as the most common wrong answer.",
    },
    {
      type: "ul",
      items: [
        "Red bar, high on Most Skipped: they never reached it, or they looked and ran. Check where it sits in the section before blaming the topic.",
        "Red bar, high on Most Reviewed: they engaged and could not close it. Best teaching material on the page - the class knows it is missing something.",
        "Red bar, one wrong option dominating: a misconception, and a nameable one. Teach the distractor, not the answer.",
        "Red bar, wrong answers spread evenly: guessing, or an unclear question. Read your own wording before you read the class.",
        "Green bar where you expected difficulty: check the key, then the options - a correct answer longer than all the others gives itself away.",
      ],
    },
    {
      type: "quote",
      text: "A red bar is not a verdict on the class. It is a question about the question - and until you know how many of those students never answered it at all, you cannot tell which.",
    },
    {
      type: "h2",
      text: "Minute 20 to 25: The Ones They Got Right Slowly",
    },
    {
      type: "p",
      text: "Accuracy on its own flatters a slow batch. The last column of the question table is average time, and the Section Analytics table above it gives the yardstick: section name, a snippet view, average accuracy, average time per question, and time spent against the section's limit - or against the pooled minutes, marked as shared, when the section belongs to a timing group.",
    },
    {
      type: "p",
      text: "Scan for questions whose accuracy is fine and whose time sits far above their section's average. Suppose one comes back near-universally correct at three times that average: under a real clock those marks are not banked, they are borrowed from the questions that came after. That is a technique problem, invisible to every score-based summary. The column catches the reverse too - answered in seconds and still wrong is a misread question, or a trap that worked.",
    },
    {
      type: "p",
      text: "One caveat on that average: it spreads across everyone who had a response on the question, blanks included. So a question that is both slow and heavily skipped is one the batch stared at - a different story from one they worked through, and a different fix.",
    },
    {
      type: "h2",
      text: "Minute 25 to 30: Write Down What You Will Actually Do",
    },
    {
      type: "p",
      text: "Analysis that ends in a feeling changes nothing. Close the page with a written list, capped at two or three items, because a longer list gets done in order of whatever is easiest. The candidates:",
    },
    {
      type: "ul",
      items: [
        "One topic to reteach, chosen from the Most Reviewed card rather than from the lowest accuracy - those are the questions the batch was close on.",
        "One misconception to name out loud in class, using the dominant wrong option as the opening line.",
        "One repair to the paper itself: a wrong key, an ambiguous option, a question that belonged in a different section.",
        "One structural change for the next paper, if the evidence is a pacing problem and not a content one - fewer questions, a different section order, or a clock that matches the bulletin you are mirroring.",
      ],
    },
    {
      type: "p",
      text: "If the repair is a wrong answer key, fix it immediately and know its limit. A published paper is locked for editing, so the sequence is unpublish, correct the key, publish again. Even then, marks are worked out when a paper is submitted and stored on that attempt, so correcting a key changes what the next student scores, not what the ones who already sat it scored. Nothing re-scores a completed attempt for you. On a published paper a bad key is only ever half-fixable.",
    },
    {
      type: "p",
      text: "Then hand it back. [How to give feedback after a mock test](/blog/how-to-give-feedback-after-a-mock-test) covers the session itself; [how to identify weak topics across a batch](/blog/how-to-identify-weak-topics-across-a-batch) covers rolling this reading across several papers; and [question-level analytics](/blog/question-level-analytics-what-your-class-got-wrong-and-why) goes deeper on a single question's row. For the student side of the same discipline, point them at [how to take mock tests](/blog/how-to-take-mock-tests).",
    },
    {
      type: "h2",
      text: "What This Page Will Not Tell You",
    },
    {
      type: "p",
      text: "Name the gaps, or they quietly become assumptions. There is no per-student report card and no CSV or Excel export, so the analysis stays on the page. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - so nothing distinguishes a question the class knew from one it looked up. Published papers are public and anyone with the link may attempt them, so Unique Students can include people you never taught. No notifications go out to students about a test, and there are no certificates. Questions are not shuffled, attempts are not capped, and nothing here grades a written or subjective answer.",
    },
    {
      type: "p",
      text: "There is also no stored worked solution a student reads on their own. The review screen shows their answer against the correct one, and the explanation is yours to deliver. That is why the two or three actions above are the output of this routine, not the report.",
    },
    {
      type: "h2",
      text: "Build the Next Paper So It Reads Itself",
    },
    {
      type: "p",
      text: "Most of the analysis is decided before anyone sits the paper. Sections are the only grouping the analytics know, so sections that map to topics turn the Section Analytics table into a topic table for free, while one undifferentiated section gives you a single row and nothing to compare. Keep the question order stable across a series and the question numbers start meaning something from paper to paper.",
    },
    {
      type: "p",
      text: "Duplicating a paper to build the next one in the series carries its marking scheme, its timing groups and its language links. That is best-effort rather than guaranteed, so open the copy and check a question's marks before publishing. A live sitting is read with a different instrument - [how to read a live exam report](/blog/how-to-read-a-live-exam-report) covers it, including why its answer time is a median rather than an average. If the marking itself is what your analysis says is wrong, [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) is the panel-level how-to.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build here](/for-creators) - sections with their own clocks, per-question marking, bilingual papers, a listing in the public library - comes with this analytics page attached to every exam, which is what makes a half-hour routine possible.",
    },
  ],
  faqs: [
    {
      question: "How should a teacher analyse mock test results?",
      answer:
        "In narrowing order, and in about half an hour. Read the shape of the sitting first - completion and the score distribution, not the average. Then read the questions the batch lost, separating the ones it skipped from the ones it got wrong, because both pull a question's accuracy bar down equally. Then read the questions it got right slowly, which no score-based summary shows. Finish by writing down two or three teaching actions. Analysis that does not end in a written action changes nothing.",
    },
    {
      question: "Can I see individual student results as a creator?",
      answer:
        "No. Creator analytics are cohort aggregates - tiles, charts and a question-by-question table covering everyone who attempted the paper. The only students named are the top three on the leaderboard, and what shows there is a username rather than a full name. There is no per-student report card, and no CSV or Excel export of results. A student sees their own attempt on their review screen, with their answer against the correct one, so an individual conversation starts there.",
    },
    {
      question: "What does a low accuracy on one question actually mean?",
      answer:
        "Less than it looks like on its own. A question's accuracy is the students who got it right divided by everyone who had it in front of them in a section that was handed in, and right, wrong and left blank are the three outcomes making up that denominator - so a skip costs the bar as much as a wrong answer. Cross-check the question against the Most Skipped card before acting. If it is mostly blanks, it is a pacing or placement problem; if it is mostly wrong answers landing on one option, it is a misconception you can name.",
    },
    {
      question: "How often should this routine be run?",
      answer:
        "Once per paper, as soon as the batch has sat it, while the questions are still fresh for them. A published paper has no closing time of its own, so the deadline is the one you set - and running the reading late is worse than running it quickly, because feedback separated from the attempt by a week is just a lecture. A longer paper does not cost much more reading time, since the tiles, the distribution and the three insight cards do not grow with the question count.",
    },
    {
      question: "Does my own preview of the paper show up in the analytics?",
      answer:
        "No. A creator can only preview their own exam rather than sit it, and a preview records nothing at all. The analytics also exclude the creator's own attempts when building the cohort, so the numbers on the page are students only.",
    },
  ],
};

export default post;
