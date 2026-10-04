import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-conduct-an-online-exam-for-students",
  title: "How to Conduct an Online Exam for Students: Before, During and After",
  metaTitle: "How to Conduct an Online Exam for Students | MockSetu",
  metaDescription:
    "How to conduct an online exam for students: what to set up before, what you can and cannot see while it runs, and how to handle the key and results after.",
  keywords:
    "how to conduct online exam, conduct an online exam for students, online exam process for teachers, how to run an online test, online exam day procedure, administer online test students, online mock test administration",
  excerpt:
    "Conducting an online exam is three jobs, not one: finish the paper, survive the window, and do something useful with the results. Here is the operational detail of each, including what you genuinely cannot see while students are writing.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a teacher
    // to the student library instead of the creator page.
    "For Creators",
    "Exam Creation",
    "online exam",
    "test administration",
    "Exam Day",
  ],
  hero: {
    eyebrow: "Creator Operations",
    h1: "How to Conduct an Online Exam for Students: Before, During and After",
    lede: "An online exam is three separate jobs stitched together - the build, the window, and the review. The build is where test day is decided.",
  },
  content: [
    {
      type: "p",
      text: "Conducting an online exam for students breaks into three acts. Before: the paper is finished, its instructions describe what it actually does, and you have opened the student link yourself on a phone. During: you mostly watch nothing, because a scheduled online mock is not a supervised hall and pretending otherwise is how teachers get surprised. After: you deal with any wrong answer key, which is more awkward than it sounds, and run the discussion class off what the class got wrong rather than who scored what. The detail follows in the order you will hit it.",
    },
    {
      type: "p",
      text: "One framing point first. A printed test is an event you supervise; an online test is a product you ship. The supervision you lose has to be bought back in the design of the paper.",
    },
    {
      type: "h2",
      text: "Before: Finish the Paper, Not Just the Questions",
    },
    {
      type: "p",
      text: "Getting the questions typed in is the part that feels like the work. The scoring and the clock are the rest of it, and they are what students notice first. Marks are set per question for a correct answer, a wrong answer and an unattempted one, so a qualifying paper with no negative marking and a merit paper with minus one are two settings on one question set rather than two papers. Multi-correct questions carry their own decision: partial credit or all-or-nothing, the penalty charged once or per wrong option, part marks rounded down, to nearest, up, or left exact.",
    },
    {
      type: "p",
      text: "The clock has four switches: per-section minutes, an optional pooled clock shared across two or more sections, section switching locked or open, and auto-submit on timeout. Those four are the whole character of the test. A paper where a student can wander back into section one at the ninetieth minute is a different exam from one where section one closes at forty-five. The build detail behind each setting is in [how to create an online mock test](/blog/how-to-create-an-online-mock-test). What follows is the part nobody writes down: the checklist before you publish.",
    },
    {
      type: "ul",
      items: [
        "Marks set for correct, wrong and unattempted on every question - not left at the default.",
        "Multi-correct rule chosen: part marks or all-or-nothing, penalty once or per wrong option, rounding fixed.",
        "Section times entered, and a decision made on any pooled clock.",
        "Section switching locked or open, on purpose rather than by accident.",
        "Paper marked Mock or Previous Year, if your account has that field - it is switched on per creator, and without the grant it does not appear at all.",
        "Language set to English, Hindi or both - a bilingual paper needs both versions of every question.",
        "Answer key spot-checked against the source for ten questions, including every numeric one.",
      ],
    },
    {
      type: "p",
      text: "For a long paper, the fastest honest route is the JSON import: run MockSetu's published extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI tool you already use, then upload the output. Numeric, TITA and match-the-column questions still come in by hand, but it clears the bulk MCQ typing, and diagrams or odd layouts can be snipped out of the PDF as an image for a question, an option or a passage. A server-side Import from PDF button also exists, but it is off by default and switched on per creator on request, so do not plan around it unless yours is enabled.",
    },
    {
      type: "h2",
      text: "Make the Instructions Describe the Paper You Actually Built",
    },
    {
      type: "p",
      text: "One whole class of complaint after an online test has nothing to do with a bad question. It is about an instructions page that promises one thing and a paper that does another - forty questions in thirty minutes, says the page, when the paper now carries sixty in forty-five, because it changed after the instructions were written. MockSetu warns you when the two no longer match - instruction drift - and that warning is worth stopping for. Read the page as a student would, right before publishing, and check its paper table against the real sections.",
    },
    {
      type: "p",
      text: "Be specific about what students cannot discover from the palette: whether section switching is locked, whether a pooled clock covers two sections, what a wrong answer costs, what happens to an unattempted question. If the paper is bilingual, say the language toggle exists, because a student who does not know will sit through an English paper they would have been faster in Hindi. For wording that covers all of this, there is a ready [online exam instructions template](/blog/online-exam-instructions-template-for-students).",
    },
    {
      type: "h2",
      text: "Test the Link on a Phone Before Anyone Else Does",
    },
    {
      type: "p",
      text: "Open your own exam in preview and walk the first five questions. Nothing is recorded from a creator preview, so it costs five minutes and nothing else. Then do the part that is easiest to skip: open the published student link on an actual phone, not a laptop browser resized narrow. Treat the phone as the real device rather than the fallback. Long options wrap differently, an image option fine at full width can need a pinch, and a passage that reads well on a monitor is several scrolls on a handset.",
    },
    {
      type: "p",
      text: "Check too that the paper is findable where you said it would be: a published paper appears in the [public mock test library](/marketplace) in the languages you published it in, and a published mock can be started as a guest, no account needed.",
    },
    {
      type: "h2",
      text: "Tell Students the Window, the Device and the Sign-In Rule",
    },
    {
      type: "p",
      text: "Test-day questions in your inbox are the ones the announcement did not answer. Send one message, not five, and put all of this in it.",
    },
    {
      type: "ul",
      items: [
        "The exact window: date, start time, last sensible start time, and that the clock starts when the student starts, not at a fixed gun.",
        "Total duration and section times, so a student on a borrowed phone can plan.",
        "Whether to sign in first - say yes, because only a signed-in attempt is saved to come back to after a drop.",
        "That the paper auto-submits when time expires, with no grace period to beg for.",
        "What a wrong answer costs, in one line, even though the instructions repeat it.",
        "A single link, sent once. Not one in a group chat, another in an email, a third on a notice board.",
      ],
    },
    {
      type: "p",
      text: "The mechanics behind that message - where the share link comes from, and what to check first when somebody reports a broken one - are in [how to share an online test with students](/blog/how-to-share-an-online-test-with-students).",
    },
    {
      type: "h2",
      text: "During: What You Can and Cannot See",
    },
    {
      type: "p",
      text: "Be clear with yourself before the window opens. On a scheduled online mock you are not watching a hall. There is no webcam proctoring, no AI invigilation, no lockdown or secure browser, no tab-switch detection. A student who opens a second tab is invisible to you, and any platform claiming otherwise on a phone browser is overselling. What you get instead is aggregated, anonymised analytics once attempts come in: section-wise accuracy, time spent per question, where the class came apart. Never a named student's screen, and by design never an individual's identity.",
    },
    {
      type: "quote",
      text: "You cannot invigilate an online mock. You can only design a paper that makes looking things up slower than thinking.",
    },
    {
      type: "p",
      text: "That is not a counsel of despair, it is a design instruction. Time pressure is the real invigilator: a paper calibrated so a prepared student finishes with four minutes to spare leaves no room for a lookup. Numeric answers resist copy-paste searching in a way a four-option MCQ does not. And a mock that counts for nothing but a discussion class removes most of the motive. There is no question shuffling, so plan around pace and question type instead, as [reducing cheating in online tests without proctoring](/blog/how-to-reduce-cheating-in-online-tests-without-proctoring) sets out in full.",
    },
    {
      type: "p",
      text: "One more limit belongs in the same breath, because teachers discover it late. A published paper is public: anyone with the link can attempt it, there is no paid or private delivery to a single batch, and there is no cap on attempts. Plan it as practice, say so to the batch, and unpublish when the window closes if you want everyone discussing the same results.",
    },
    {
      type: "h2",
      text: "When a Student's Connection Drops",
    },
    {
      type: "p",
      text: "Assume at least one student will drop out mid-paper. For a signed-in student the sitting lives in the database with a deadline of its own, so reopening the link returns the same attempt with the answers already saved - and with the clock still running, because it never pauses for anybody. On the same device there is a limit: away for longer than about five minutes and the sitting is sealed instead, filed with the answers it had and graded as an ordinary attempt, so reopening the link starts a new one. A guest has no attempt record at all, which means there is nothing to come back to. That is the whole argument for telling students to sign in first: guest access is the friendliest way in and the least forgiving way to fall out.",
    },
    {
      type: "p",
      text: "Say the policy in the announcement, not during the test. Sign in first, and if you drop, reopen the link immediately instead of messaging the teacher - three minutes typing a message is three minutes of a five-minute window.",
    },
    {
      type: "h2",
      text: "If You Need to Watch It Happen, Run It Live Instead",
    },
    {
      type: "p",
      text: "When being in the room is the point - a revision session, a doubt class, a last-week sprint - a live exam is the better shape. Students sign in once, then join from their phones with a single code. You can schedule a start with a countdown that auto-starts, put a themed projector view on the screen, show or hide the options on it, and reveal the answer when the timer ends, while live answer bars show the split as it lands. Standings go to everyone, to you alone, or off; names can be hidden; a private I'm lost button flags confusion only you see.",
    },
    {
      type: "p",
      text: "Afterwards the live report gives class accuracy, participation, drop-off, median score, median answer time per question, a fast-or-slow against right-or-wrong split, the I'm lost taps and a shareable link. For a very large batch, run a scheduled mock instead.",
    },
    {
      type: "h2",
      text: "After: Fixing the Key, and What a Correction Cannot Undo",
    },
    {
      type: "p",
      text: "Assume a key dispute is coming, and have the procedure ready. It is boring and should stay boring: collect the challenges, check them against the source, correct the key only where you are actually wrong. Then two mechanics shape what you can do about it. A published exam is read-only - the editor will not let you change anything, the key included, until you unpublish it. And a correction does not reach backwards: a score is computed when the attempt is submitted and stays as it was written, so the sittings already recorded keep the marks the old key gave them. Fix the key for whoever sits the paper after you, then tell the batch plainly which answers moved and what their mark should read instead. There is no way to make that announcement unnecessary after the fact, which is why the key check belongs before you publish.",
    },
    {
      type: "p",
      text: "Two limits to plan around. There is no CSV or Excel export and no per-student report card, so a spreadsheet for your institute's records is still a manual job. And deleting an exam deletes its attempts with it - for a year-on-year comparison, unpublish or duplicate the paper rather than deleting the original.",
    },
    {
      type: "h2",
      text: "The Discussion Class Is the Whole Point",
    },
    {
      type: "p",
      text: "The test was never the deliverable. The hour after it is. Because creator analytics are aggregated and anonymised, you cannot build the class around who got what, and you should not want to - the signal is which questions the class lost and where the time went. A question most of the class got wrong is a teaching gap. A question most got right but spent three minutes on is a pacing gap, and it will cost more marks in the real exam than the one they got wrong.",
    },
    {
      type: "ul",
      items: [
        "Find the five questions the class lost most of. Those are your first thirty minutes.",
        "Then look for anything slow but correct - high accuracy next to a long average time is where the next five marks live.",
        "Separate concept failures from reading failures; they need different fixes.",
        "Say which key corrections you made and why, before anyone has to ask.",
        "Name the section that ran out of time, and give the batch a minute budget for it.",
        "Duplicate the paper for the next batch rather than rebuilding it, changing only what the data told you to change.",
      ],
    },
    {
      type: "p",
      text: "A note on that last bullet, because it is the cheapest hour in the whole cycle. Duplicating an exam copies the paper - sections, their times, the grouping behind a pooled clock, the languages, every question - and the marking travels with it: the exam-level default, the per-section overrides and the per-question ones. The copy lands as an unpublished draft, which is the useful part, because it gives you somewhere to change what the data told you to change and to read the instructions page again before a single student sees it. Walk the copy's marks once anyway, the same way you walked the original's, and run the same ten-question key check. The paper you duplicate is the paper you already trusted; what you are checking is that nothing in your edits quietly moved.",
    },
    {
      type: "p",
      text: "And if a question the whole class lost was a badly built question rather than a teaching gap, the distractor faults behind that pattern are in [how to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions). The loop - build, publish, run, correct the key, discuss, duplicate - is what a test series actually is. MockSetu is free with no card, and the [page for creators](/for-creators) is where you start. Carry the three absences with you while you plan: no proctoring of any kind, no private or paid delivery, no spreadsheet export. A teacher who finds that out on test day has been failed twice.",
    },
  ],
  faqs: [
    {
      question: "How do I conduct an online exam for students step by step?",
      answer:
        "Build the paper with its sections, section times and per-question marks; write instructions that match what you actually built; preview the exam yourself and open the student link on a real phone; announce one window, one link and whether students should sign in first; let the paper auto-submit when time expires; then correct the answer key if needed - unpublishing first, because a published exam is read-only - and run the discussion class off the class-wide accuracy and time-per-question data.",
    },
    {
      question: "Can I see what students are doing during an online exam?",
      answer:
        "No. There is no webcam proctoring, no AI invigilation, no lockdown browser and no tab-switch detection, so you cannot watch a student's screen or know whether they opened another tab. What you get is aggregated, anonymised analytics after attempts come in - section-wise accuracy, time per question and where the class struggled - never an individual student's identity. If you want to watch a test happen in real time, run it as a live exam instead: students sign in once, then join from their phones with a single code, and you see the answer split as it lands.",
    },
    {
      question: "What happens if a student's internet drops in the middle of an online test?",
      answer:
        "A signed-in student's sitting is held in the database with a deadline of its own, so reopening the link returns the same attempt with its saved answers - the clock having run on in the meantime, because it never pauses. On the same device there is a limit: away for more than about five minutes and the sitting is sealed instead, graded on the answers it had and counted as an ordinary attempt. A guest has no attempt record at all, so a guest who drops has nothing to return to. That is the reason to ask students to sign in before they start, and to reopen the link immediately rather than messaging you first.",
    },
    {
      question: "How do I handle a wrong answer key after students have already submitted?",
      answer:
        "Collect the challenges, verify them against the source paper, and correct the key once after the window closes. Two things to know before you do. A published exam is read-only, so you unpublish it to edit the key at all. And the correction is not retroactive: a score is written when the attempt is submitted, so the sittings already recorded keep the marks the old key gave them. Fix the key for whoever sits the paper next, and tell the batch which answers moved and what their mark should read instead. Checking the key before you publish is far cheaper than any of this.",
    },
    {
      question: "Do students need an account or an app to attempt an online exam?",
      answer:
        "No app - it is a web app that opens in a phone or laptop browser. A published mock can be started as a guest with no account at all, which is the easiest way to get a new batch in. The trade-off is that a guest has no saved attempt to return to if they drop mid-exam, while a signed-in student can reopen the link and carry on, so ask students to sign in when continuity matters.",
    },
    {
      question: "Can I stop students outside my batch from taking the paper?",
      answer:
        "Not once it is published. A published paper is public: anyone with the link can attempt it, there is no private or paid delivery to a single batch, and there is no cap on attempts. Treat a published paper as practice rather than as an assessment of record, say so to your students, and unpublish it when the window closes if you want everyone discussing the same set of results.",
    },
  ],
};

export default post;
