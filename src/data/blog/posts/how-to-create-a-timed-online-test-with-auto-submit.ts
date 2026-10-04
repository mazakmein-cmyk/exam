import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-timed-online-test-with-auto-submit",
  title: "How to Create a Timed Online Test With Auto-Submit",
  metaTitle: "Online Test With Timer and Auto-Submit: Setup Guide | MockSetu",
  metaDescription:
    "Set up an online test with a timer: whole-paper clock, per-section clocks, a pooled clock across sections, and auto-submit that saves answers at zero.",
  keywords:
    "online test with timer, timed online test, auto submit online exam, section wise timer online test, countdown timer for exam, how to add timer to online test, sectional timing mock test, online exam auto submit when time ends",
  excerpt:
    "A timer is three decisions, not one: which clock the student sees, what happens at zero, and whether sections stay open. Here is how to set each one, and what a countdown cannot do for you.",
  publishedAt: "2026-09-15",
  updatedAt: "2026-09-15",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a teacher
    // setting up a paper to the student library instead.
    "For Creators",
    "Exam Creation",
    "exam timer",
    "auto submit",
    "sectional timing",
    "mock test setup",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a Timed Online Test With Auto-Submit",
    lede: "A countdown is the easy part. What decides whether your mock produces a usable score is the shape of the clock, what it does at zero, and whether a finished section stays shut.",
  },
  content: [
    {
      type: "p",
      text: "An online test with a timer comes down to three decisions, not one: which clock the student can see, what happens the second it reaches zero, and whether they can move between sections while it runs. In MockSetu you choose whether section switching is locked or open, set the clock in minutes to match that choice, optionally put two or more sections on a shared pooled clock, and the paper submits itself when the time expires. The settings themselves are quick. Choosing correctly decides whether your mock produces a usable score or a page of blanks.",
    },
    {
      type: "p",
      text: "Timing is also easy to get wrong without noticing, because a clock that misbehaves does not announce itself — it just produces scores that look plausible. A countdown that stalls when the student minimises the window is not a timed exam; it is an honour system with a stopwatch drawn on it. Before you type a number into any field, be clear about which of the three clock shapes your paper needs.",
    },
    {
      type: "h2",
      text: "Whole-Paper Clock, Sectional Clock, or One Pooled Clock",
    },
    {
      type: "p",
      text: "There are only three useful shapes. Everything else is a variation on these.",
    },
    {
      type: "ul",
      items: [
        "One clock for the whole paper. The student sees a single countdown and spends it however they like. Use this when the official pattern names one duration for the paper and fences no time off inside it.",
        "One clock per section. Each section carries its own minutes and its own countdown, and when that time is gone, that section is finished. Pick this when pacing discipline is part of what you are testing.",
        "One pooled clock shared across two or more sections. They stay separate for marking and analysis but draw down the same countdown together. Use it when one official time block has to hold more than one of your sections.",
      ],
    },
    {
      type: "p",
      text: "Pick the shape the real exam uses, not the one that is quickest to configure — and take it from the current official bulletin, not from memory or last year's paper, because patterns change between cycles and timing is one of the things that changes. A student who practises on the wrong clock learns the wrong habit, and that is harder to unlearn than a syllabus gap.",
    },
    {
      type: "h2",
      text: "When One Clock for the Whole Paper Is Right",
    },
    {
      type: "p",
      text: "A single clock hands the student the allocation problem, and where the exam does not fence time off by part, that allocation is part of what is being tested: deciding which subject gets the extra twenty minutes is a strategic choice, and the score is meant to reflect it. Confirm in the current bulletin whether your exam partitions that time at all, and if it does not, do not invent a lock for neatness — one you added yourself produces pacing data that describes your constraint, not the student.",
    },
    {
      type: "p",
      text: "The hard part of a whole-paper clock is the number itself. Divide the official duration by the official question count, multiply by however many questions you actually wrote, then round down rather than up. NEET UG makes that arithmetic unusually easy — 180 compulsory questions, 720 marks, 180 minutes, so one minute a question — and most patterns are messier, which is exactly why the division has to be done rather than guessed: a forty-question topic test is not two hours just because the full-length paper is three, and a slightly tight clock produces honest pacing data where a generous one produces none. The [mock test format reference](/blog/mock-test-format-for-competitive-exams-reference) collects the paper shapes worth copying.",
    },
    {
      type: "h2",
      text: "When Each Section Needs Its Own Clock",
    },
    {
      type: "p",
      text: "A sectional clock exists to stop one skill borrowing time from another. Where the exam gives each section its own slice of the paper's time, part of what it tests is the willingness to abandon a question and move on — and a student who has only practised on a whole-paper clock loses the final section outright, not from a knowledge gap but because nobody ever made them leave a question unfinished. Before setting any minutes, read the current bulletin for the number of sections, the time against each, and whether a closed section can be reopened. For a [CAT-pattern paper](/mock-test/cat), that bulletin is the only split worth copying.",
    },
    {
      type: "p",
      text: "Setting per-section minutes is also the moment you decide the sectional lock. Locked switching means each section runs its own clock and a closed one stays closed; open switching puts the whole paper on a single countdown and lets the student move freely inside it. Locked is harsher and closer to a sectional-timing exam; open is fairer for a weekly class test where the point is coverage, not pacing — a real decision with costs on both sides, and part of [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic). MockSetu takes it per paper, so you can run the same question set both ways and compare.",
    },
    {
      type: "h2",
      text: "One Pooled Clock Across Two Sections",
    },
    {
      type: "p",
      text: "The third shape is for the case where you want more sections than the official pattern has timed blocks. SSC MTS runs 90 questions and 270 marks across two sessions of 45 minutes each — Session I qualifying only with no negative marking, Session II counting towards merit with a penalty of one mark per wrong answer. Two sessions model perfectly well as two ordinary section clocks. But a section is also the unit that marking rules and analysis attach to, so the moment you want one of those 45-minute sessions reported as more than a single line — a breakdown you can act on rather than one number — you need several sections drawing down the same 45 minutes, and neither a whole-paper clock nor one clock per section gives you that.",
    },
    {
      type: "p",
      text: "In MockSetu that is a timing group: two or more sections share one pooled countdown instead of each holding its own. The pool is a number you set on the group itself, and it is the clock the student actually gets — the member sections' own minute boxes give way to it. The student sees one clock for the block and moves inside it; your results still break it down section by section. Guessing a split and imposing it as two separate clocks changes the exam you are simulating, and your students only discover the difference on the real day.",
    },
    {
      type: "quote",
      text: "The clock is the only instruction in your paper a student cannot negotiate with. Everything else they can skim.",
    },
    {
      type: "h2",
      text: "What Auto-Submit Has to Do at Zero",
    },
    {
      type: "p",
      text: "Without auto-submit a timed test is an open assignment with a countdown for decoration, and the student who sits twelve minutes past the bell is scored against the one who did not. In MockSetu the paper submits itself when the time expires. What you should verify, in this or any tool, is what that submission contains.",
    },
    {
      type: "ul",
      items: [
        "Every answer already selected is saved and scored. A student should never lose thirty answered questions for being mid-question when the clock ran out.",
        "Questions left blank are scored as unattempted using the marks-for-unattempted value you set, not silently counted as wrong.",
        "The submission happens on its own, with no click required and no dependency on the student being awake or looking at the screen.",
        "Nothing accepts a new answer after zero. A tool that keeps the last question editable for a few seconds after submission is not timing anything.",
        "The auto-submitted attempt counts in your results exactly like a hand-submitted one, so class accuracy is not skewed by how the paper ended.",
      ],
    },
    {
      type: "p",
      text: "The unattempted-versus-wrong distinction is where auto-submit collides with your marking scheme, and it is worth settling before the paper goes out rather than after a parent asks. MockSetu takes marks for a correct, a wrong and an unattempted answer as three separate values per question, so an auto-submitted blank is scored by your rule, not by a default. If your paper carries a penalty, [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) covers the rest.",
    },
    {
      type: "h2",
      text: "The Paper Left Open in a Background Tab",
    },
    {
      type: "p",
      text: "Students do not sit motionless in one window for three hours. They switch tabs, take a call, let the phone lock, or have the browser quietly reclaim memory behind them. Any timer you rely on has to count against real elapsed time, not against how often the browser felt like running a script. Test it before you trust a tool with a batch: preview your own paper, switch away for two minutes, come back, and check the clock has lost exactly two minutes — not zero, and not ten.",
    },
    {
      type: "p",
      text: "The harder case is the tab that dies completely. MockSetu gives a signed-in student roughly five minutes to return to an interrupted exam on the same device — short on purpose: enough for a crashed tab, not for a laptop shut until after dinner. That turns into one line in your instructions: tell students to sign in before they start if the attempt matters.",
    },
    {
      type: "h2",
      text: "Why a Visible Countdown Changes the Answers",
    },
    {
      type: "p",
      text: "A countdown the student can see is not decoration; it is the input to every triage decision they make. With a visible clock and a question palette, a student learns to abandon question 14 at the ninety-second mark, flag it and come back — the highest-value habit a mock test can build. Hide the clock and they learn nothing transferable. The MockSetu exam screen carries the palette, mark-for-review, fullscreen and the running clock together, which makes the habit practisable.",
    },
    {
      type: "p",
      text: "There is a second-order benefit for you. Once students pace against a real clock, time-per-question data starts to mean something: a question where the class spent three times the paper's average is either badly worded or genuinely hard, and accuracy alone will not tell you which. Creator analytics are reported across the batch rather than student by student; the one place an individual surfaces is a top-three leaderboard, and that shows a username rather than a full name.",
    },
    {
      type: "h2",
      text: "Setting the Timer in MockSetu, Step by Step",
    },
    {
      type: "p",
      text: "This assumes the paper already exists; [how to create an online mock test](/blog/how-to-create-an-online-mock-test) covers building the question set itself. Once it does, the timing setup is seven steps.",
    },
    {
      type: "ul",
      items: [
        "Decide the shape first, on paper, and write down which real exam you are copying and where you read its timing.",
        "Set the sectional lock, because it is what picks the clock shape. Open switching puts the whole paper on a single countdown and suits a coverage check; locked switching gives each section its own clock, which is what a sectional-timing exam needs.",
        "Set the minutes. Under open switching that is the paper's total time, which MockSetu seeds from the section clocks the moment you turn switching on; under locked switching it is the minutes on each section.",
        "If two or more sections belong to one timed block, put them in a timing group so they share a pooled countdown. Groups are a locked-switching feature — with the whole paper on one clock they do not apply, and the editor says so.",
        "Set marks for correct, wrong and unattempted per question, so whatever auto-submit sweeps up at zero is scored by your rule.",
        "Preview the paper and watch the auto-submit fire. Shorten whichever clock the preview will actually run — the section's own minutes for a locked ungrouped section, the group's pool for a timing group, the paper total for open switching — then put the real number back; nothing in a creator preview is recorded either way.",
        "Check the instructions page against the paper before publishing. MockSetu warns you when the two stop matching, and a sheet promising three hours on a two-hour paper is the first complaint you will get.",
      ],
    },
    {
      type: "h2",
      text: "What a Timer Will Not Do for You",
    },
    {
      type: "p",
      text: "A clock enforces time. It does not enforce honesty, and the gap between those two is where expectations of an online test usually go wrong. Be clear about what a timed test is and is not before you promise a batch that it is secure.",
    },
    {
      type: "ul",
      items: [
        "There is no webcam or AI proctoring, no lockdown browser and no tab-switch detection. A student with a second device is not detectable by the timer or by anything else.",
        "Publishing a paper makes it public: it goes into the library where anyone can find and attempt it, the share link is a convenience rather than a boundary, and there is no private delivery to one batch and no paid or gated access.",
        "There is no cap on how many times a paper can be attempted, and no question shuffling to make a second attempt harder.",
        "There is no CSV or Excel export and no per-student report card, so do not plan a workflow that depends on a spreadsheet after the clock stops.",
        "Timing is the honest signal here, not security. For anything that must genuinely be invigilated, the controls that matter are physical.",
      ],
    },
    {
      type: "h2",
      text: "Two Last Checks Before the Link Goes Out",
    },
    {
      type: "p",
      text: "Two things are worth confirming before anyone sits the paper. First, check the duration printed on the instructions page against the one you have been quoting students, and be careful which number you add up, because the section minute boxes are not always the clock. A timing group runs on the group's pool, and open switching runs on the paper's own total; either way the member minutes are numbers no candidate sees. MockSetu flags an instruction sentence that has stopped describing the paper's real clocks, in the editor and again at publish, which catches most of the drift — the figure you typed into a WhatsApp message is the one it cannot check for you. The [online exam instructions template](/blog/online-exam-instructions-template-for-students) covers what else belongs there. Second, open the paper on a phone: the clock, the palette and the submit flow all have to survive a five-inch screen.",
    },
    {
      type: "p",
      text: "Get the clock right and every score you look at afterwards was produced under the same constraint, which is what makes them worth comparing. Get it wrong and you cannot tell a slow student from one who ran out of a section you accidentally timed at twelve minutes. If you are setting this up for the first time, [the MockSetu page for exam creators](/for-creators) is the shortest route from a question paper you already have to a timed test a batch can sit on their phones, free and without a card.",
    },
  ],
  faqs: [
    {
      question: "How do I add a timer to an online test?",
      answer:
        "Start with the sectional lock, because that is what picks the clock. Leave section switching open and the whole paper runs on one countdown, which MockSetu seeds from the section clocks the moment you turn switching on. Turn switching off and each section runs its own minutes instead. With switching off you can also put two or more sections into a timing group so they share one pooled countdown, which is the shape to use when one official time block has to hold more than one of your sections. Either way the student sees the countdown on the exam screen and the paper auto-submits when it reaches zero.",
    },
    {
      question: "What happens if a student does not submit before the time ends?",
      answer:
        "Nothing is lost if the tool auto-submits properly. In MockSetu the paper submits itself when the time expires, taking exactly the same route a hand-submitted paper takes: every answer already selected is saved and scored, and unanswered questions are scored using the marks-for-unattempted value you set. The student does not need to click anything, and the attempt feeds your aggregated class analytics the same way a hand-submitted one does, so your accuracy figures are not skewed by how the paper ended.",
    },
    {
      question: "Can two sections share the same timer?",
      answer:
        "Yes. Two or more sections can be placed in a timing group that shares a single pooled countdown instead of each running its own clock. It needs section switching turned off, because with the whole paper on one clock there is nothing for a group to pool. The sections stay separate for marking and for section-wise analysis, so you still see where the class struggled section by section. This is the right shape whenever the official pattern gives one time to a block and you still want that block reported as more than one section.",
    },
    {
      question: "Does the exam timer keep running if the student switches tabs?",
      answer:
        "It must, and you should verify it yourself rather than assume it: preview your own paper, switch away for two minutes, come back, and check that exactly two minutes are gone. If a signed-in student's tab dies entirely, MockSetu allows a return to the interrupted exam within about five minutes on the same device — short on purpose, and only for signed-in students.",
    },
    {
      question: "Should I lock section switching in a timed test?",
      answer:
        "Lock it when the exam you are simulating locks sections, because the skill being tested is abandoning a question on time rather than borrowing minutes from a later section. Leave it open for a weekly class test where the aim is coverage and a student stuck on one section should still show what they know elsewhere. It is one setting per paper, so running the same question set both ways across two weeks is a reasonable way to decide.",
    },
    {
      question: "Does a timed online test stop students from cheating?",
      answer:
        "No, and it is worth being plain about that. A timer limits time, not access to a second device or a friend in the next room. MockSetu has no webcam proctoring, no lockdown browser and no tab-switch detection, and publishing a paper puts it in a public library where anyone can find and attempt it. For practice and diagnosis a timed paper is exactly the right tool; for a high-stakes invigilated test, the controls that matter are physical ones in the room.",
    },
  ],
};

export default post;
