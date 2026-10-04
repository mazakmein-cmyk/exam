import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-read-a-live-exam-report",
  title: "How to Read a Live Exam Report: Accuracy, Pacing and Drop-Off",
  metaTitle: "Live Exam Report: Accuracy, Pacing, Drop-Off | MockSetu",
  metaDescription:
    "How to read a live class quiz report: what class accuracy really counts, median score against drop-off, fast-wrong versus slow-right, and who gets the link.",
  keywords:
    "class quiz report analysis, live exam report, live quiz analytics for teachers, class accuracy report, question level analysis live quiz, median answer time, student drop off report, classroom response analysis india",
  excerpt:
    "A live session report is four headline numbers and one argument: fast-and-wrong and slow-and-right are different problems with opposite cures. Here is how to read the whole thing in the order that changes tomorrow's lesson.",
  publishedAt: "2026-10-18",
  updatedAt: "2026-10-18",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Live Exam",
    "class analytics",
    "classroom teaching",
    "question analysis",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Read a Live Exam Report: Accuracy, Pacing and Drop-Off",
    lede: "The report is generated the moment you end the session - you land on it, you never request it. The skill is not finding the numbers. It is knowing which of them change what you teach tomorrow, and which are only scenery.",
  },
  content: [
    {
      type: "p",
      text: "A live exam report opens with four numbers: how accurate the room was, how many took part, how many questions actually ran, and how many times somebody tapped \"I'm lost\". Below those, on your screen only, sit the three a teacher acts on - median score, participation, and how many dropped off. Past the tiles the report turns per question: the median answer time, and fast against slow crossed with right against wrong. That last split is the whole report in miniature, because fast-and-wrong and slow-and-right need opposite responses.",
    },
    {
      type: "p",
      text: "This is about the reading, not the layout. For running the session itself, see [how to conduct a live quiz in class with students' phones](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones). For the same job after a scheduled mock, see [how to analyse mock test results as a teacher](/blog/how-to-analyse-mock-test-results-as-a-teacher), and for taking one question apart option by option, [question-level analytics](/blog/question-level-analytics-what-your-class-got-wrong-and-why).",
    },
    {
      type: "h2",
      text: "What the Four Headline Tiles Actually Measure",
    },
    {
      type: "p",
      text: "Class accuracy is correct answers divided by answers given, added up across every question that ran. Skips are not in that denominator. So a room where half the class quietly stopped answering can still report a healthy class accuracy, because the people still typing were the ones who knew. Read it next to the attendance and drop-off numbers, or it will mislead you by omission.",
    },
    {
      type: "p",
      text: "The \"Questions\" tile counts questions that actually ran, not the questions you wrote. A session that ends on question seven of forty is measured on seven, and every per-student denominator follows the same rule. The \"Said they were lost\" tile totals taps across the session rather than students: one student lost on four questions puts four on that tile.",
    },
    {
      type: "h2",
      text: "Median Score, Participation and Drop-Off",
    },
    {
      type: "p",
      text: "Three more tiles appear for the creator and never travel on a shared link. Median score is the middle student's correct count out of the questions that ran - a median, so one student who answered everything perfectly does not drag it up. Participation is the average share of asked questions each student answered, capped at a full share each. Dropped off counts students who stopped answering before the end, or joined and never started; \"stopped\" means they missed the last two questions in a row after answering something earlier.",
    },
    {
      type: "p",
      text: "Be careful what you conclude from that. There is no proctoring here of any kind - no webcam, no lockdown browser, no tab-switch detection - so \"dropped off\" means one thing only: no more answers arrived from that device. A dead phone, a dropped hotspot and a bored student look identical. Treat the list as names to ask about, not as a verdict.",
    },
    {
      type: "h2",
      text: "Fast and Wrong Is Not Slow and Right",
    },
    {
      type: "p",
      text: "Every question with answers carries four counts: fast and right, slow and right, fast and wrong, slow and wrong. Fast and slow are relative to this room on this question, not to any absolute standard. Once at least eight people have answered, the dividing line is that question's own median answer time; below eight it falls back to 35 per cent of the time the question was open.",
    },
    {
      type: "p",
      text: "The two diagonal cells are where the teaching is. A pile in fast-and-wrong means the class was confident and mistaken - a belief they share, arrived at quickly, not a gap. A pile in slow-and-right means the understanding is there but the procedure is not automatic; under exam pressure that becomes a wrong or unattempted answer. Same accuracy figure, completely different Monday.",
    },
    {
      type: "ul",
      items: [
        "Fast and wrong, in a block: name the wrong belief out loud and contrast it with the right one. Re-explaining the correct method does not land - they were not confused, they were sure.",
        "Slow and right, in a block: drill it. More of the same question type, timed, until the steps stop being decisions.",
        "Fast and right, nearly everyone: move on, and make the next question in that topic harder.",
        "Slow and wrong, in a block: go back further than you had planned.",
        "No answers at all: the accuracy curve shows a gap rather than a zero, on purpose. Nobody answering is not the same as everybody being wrong.",
      ],
    },
    {
      type: "p",
      text: "The report also calls out answers that came in wrong inside a fifth of the time the question was open, labelled \"confident, not lost\". That is the sharpest form of fast-and-wrong. The option breakdown on the same card, which marks the correct option, tells you which distractor took them.",
    },
    {
      type: "quote",
      text: "A class that is fast and wrong does not need the lesson again. It needs the belief it already holds taken apart.",
    },
    {
      type: "h2",
      text: "Median Answer Time, and the Shape Behind It",
    },
    {
      type: "p",
      text: "The per-question time is a median, computed across every response to that question. It is a median for a reason worth saying out loud: one student who tabs away and comes back two minutes later would move an average and leaves a median where it is. The figure tells you the point by which half the room had answered - nothing more, and nothing less reliable.",
    },
    {
      type: "p",
      text: "Underneath it sits a twelve-bucket histogram of when the answers arrived, spread across the time the question was open, and its shape matters more than the median. A spike against the right-hand edge says the room was waiting for the timer. A flat spread says people worked at their own speeds. An early cluster with a long empty tail says the question was easier than the time you gave it. Only one answer time on the whole report is an average - the per-student column in the roster, which averages that one student's own answers.",
    },
    {
      type: "h2",
      text: "The Five Hardest, and Why Each Was Hard",
    },
    {
      type: "p",
      text: "The first section under the tiles is the five hardest questions, worst accuracy first, most of them labelled with why they were hard rather than only that they were. One wrong option beat the right one: a shared belief, not guessing. Two options neck and neck: two neighbouring ideas being confused, so contrast them. Answers spread roughly evenly: the idea is missing rather than muddled, which sends you further back in the syllabus than you wanted to go. Three labels, three different lessons, and the percentage alone cannot tell them apart. Below ten answers on a question no label is printed at all - a shape read off six responses is an anecdote with a percentage sign on it.",
    },
    {
      type: "h2",
      text: "The \"I'm Lost\" Taps",
    },
    {
      type: "p",
      text: "While a question is open, a student can tap \"I'm lost\". It returns nothing beyond a tick, shows no count, and tells nobody else in the room - which is what makes it usable by the student who would never raise a hand in front of the class. The server absorbs duplicates on a primary key, one signal per student per question, so the number cannot be inflated.",
    },
    {
      type: "p",
      text: "It surfaces all over the report: the headline tile, a \"Where people said they were lost\" list of the top three questions by taps, a tap count beside each question on the Questions tab, and a per-student column in the roster. A student who said it twice or more is flagged in \"Worth checking in on\", alongside anyone below 50 per cent accuracy across at least three answers and anyone who dropped off - at most five names, ordered by severity. The pattern to hunt for is a question with good accuracy and several taps: the class arrived at the answer, and several of them do not know why.",
    },
    {
      type: "h2",
      text: "Pacing: What You Granted, What You Cut",
    },
    {
      type: "p",
      text: "The Pacing tab is one row per question - time planned, adjustment made, how long the question was actually open, the talk gap after it, and how many unlocks you took back. The talk gap is the stretch between a question closing and the next one opening: your explaining time, measured. The last question's gap runs to the moment you ended the session.",
    },
    {
      type: "p",
      text: "Extra time granted and questions closed early are reported beside each other rather than netted into one figure. Underneath, they are the same column with opposite signs, and a plain sum would let a question you cut short cancel out an extension you distinctly remember giving. Both halves describe how you read the room. If a session felt rushed, this is the tab to plan the next one with, and the talk-gap column is the reason: it is the only measurement the session kept of your own explaining time.",
    },
    {
      type: "h2",
      text: "Who Should Get the Link",
    },
    {
      type: "p",
      text: "A switch at the bottom turns on a public link, and it carries the overview only - never the Questions, Students or Pacing tabs. The detail behind Questions and Students is not merely hidden in the page: those queries run under policies that return nothing to anyone but you. The shared copy also has the answer key stripped out, so a forwarded link is not next period's answer sheet. Names follow your session privacy setting, so with student names hidden, the shared report shows the same nicknames the room saw. Switching sharing off keeps the token, so turning it back on does not break a link you already sent. The report page is not indexed by search engines.",
    },
    {
      type: "ul",
      items: [
        "The class group or the parent group: yes, with privacy on. The overview is the part that teaches.",
        "A colleague teaching the same chapter next week: yes. The reteach list is a handover note you did not have to write.",
        "Know what travels. The shared overview carries the \"Who took part\" table - rank, name or nickname, correct and answered. What stays on your screen is the Students tab: accuracy, answer times, \"I'm lost\" counts and the question-by-question grid.",
        "Anyone who wants a file: nothing to send. There are no per-student report cards and no CSV or Excel export. The report is a view of the stored session, not a download.",
      ],
    },
    {
      type: "p",
      text: "Nothing is sent on your behalf either. There are no email, SMS or WhatsApp notifications about tests - you send the link yourself.",
    },
    {
      type: "h2",
      text: "A Reading Order That Survives a Friday Afternoon",
    },
    {
      type: "p",
      text: "Read it in one order, because each step narrows what the next one has to look at.",
    },
    {
      type: "ul",
      items: [
        "Read the tiles as one row, never one at a time. Accuracy without participation and drop-off beside it is not a number, it is a mood.",
        "Open the five hardest questions and read the shape label where there is one, not the percentage.",
        "For each of those, look at the fast-slow quadrant. Fast and wrong goes on tomorrow's board; slow and right goes into a timed drill.",
        "Check \"Where people said they were lost\" against the accuracy figures. High accuracy plus several taps is the quiet problem.",
        "Open the Students tab and read \"Worth checking in on\" before the roster. It is already ordered by severity.",
        "Open Pacing last, and only if the session felt rushed or slack.",
      ],
    },
    {
      type: "p",
      text: "A report is worth exactly the lesson it changes. If you are not running live sessions yet, [everything a creator can build on MockSetu](/for-creators) - timed sections, pooled clocks, bilingual papers, a live room and the report that follows it - sits behind one free account that takes no card. And for the other side of all this, how a student should sit a mock and read their own result, send them [how to take mock tests](/blog/how-to-take-mock-tests).",
    },
  ],
  faqs: [
    {
      question: "What does class accuracy mean in a live quiz report?",
      answer:
        "It is correct answers divided by answers given, summed across every question that ran. Questions a student skipped are not in the denominator, so class accuracy describes the people who answered rather than the people in the room. That is why it has to be read next to the attendance, participation and drop-off tiles - a session where half the class stopped answering can still show a high class accuracy, because the ones still answering were the ones who knew.",
    },
    {
      question: "Is the answer time in a live exam report an average or a median?",
      answer:
        "The per-question time is a median, taken across every response to that question. A median is used because one student who tabs away and returns two minutes later would move an average and leaves a median untouched. The only answer time on the report that is an average is the per-student column in the roster, which averages that one student's own answers. The fast-slow split on each question is also measured against that question's median, once at least eight people have answered it.",
    },
    {
      question: "What is the difference between fast-and-wrong and slow-and-right?",
      answer:
        "Fast and wrong means the class answered confidently and answered incorrectly - a misconception they share, not a gap in knowledge. The fix is to name the wrong belief and contrast it with the right one; re-teaching the correct method does not land, because they were not confused. Slow and right means the understanding is there but the procedure is not automatic yet, which turns into a wrong or unattempted answer under exam pressure. The fix for that is timed drilling on the same question type.",
    },
    {
      question: "Can I share a live exam report with my students?",
      answer:
        "Yes. A switch on the report turns on a public link that carries the overview only - the Questions, Students and Pacing tabs are creator-only, and the per-student queries behind them return nothing to anyone who is not the creator. So accuracy per student, answer times, \"I'm lost\" counts and the question-by-question grid do not travel. The overview's \"Who took part\" table does travel, with each student's rank, correct and answered, and names on it follow your session privacy setting - with student names hidden, the shared report shows nicknames. The shared copy also has the answer key removed. Turning sharing off keeps the token, so switching it back on does not break a link you already sent. Nothing is sent automatically; there are no email, SMS or WhatsApp notifications about tests.",
    },
    {
      question: "What counts as a student dropping off in a live session?",
      answer:
        "A student who answered something earlier and then missed the last two questions in a row, plus anyone who joined and never answered at all. It is recorded strictly as an absence of answers. There is no proctoring of any kind on MockSetu - no webcam, no lockdown browser, no tab-switch detection - so a flat battery, a dropped connection and a student who gave up all look the same in the report. Use the list as names to follow up with, not as evidence of anything.",
    },
  ],
};

export default post;
