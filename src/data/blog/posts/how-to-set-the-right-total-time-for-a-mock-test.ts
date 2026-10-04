import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-set-the-right-total-time-for-a-mock-test",
  title: "How to Set the Right Total Time for a Mock Test",
  metaTitle: "Time per Question: Setting a Mock Test's Duration | MockSetu",
  metaDescription:
    "How long should a mock test be? Copy the bulletin's duration when you are reproducing an exam, and when you are not, here is a method that defends itself.",
  keywords:
    "time per question in exams, mock test duration, how long should a mock test be, total time for online test, exam duration per question, sectional timing mock test, set exam time limit, how to decide test duration",
  excerpt:
    "If you are reproducing a real exam, the duration is not a decision - copy it. The hard case is the paper you invented, where the clock is yours to choose and nothing stops you choosing badly.",
  publishedAt: "2026-10-27",
  updatedAt: "2026-10-27",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never "JEE Main" or "SSC MTS" here - those tags
    // win the match and send a paper setter to a student pillar.
    "For Creators",
    "Marking & Timing",
    "exam timer",
    "mock test setup",
    "sectional timing",
  ],
  hero: {
    eyebrow: "Marking & Timing",
    h1: "How to Set the Right Total Time for a Mock Test",
    lede: "If the paper reproduces a real exam, copy the duration from the current bulletin and stop reading. The method below is for the other case - the chapter test, the sectional, the paper you invented, where the clock is genuinely yours to choose.",
  },
  content: [
    {
      type: "p",
      text: "If your paper reproduces a real exam, the total time is not a decision you get to make. Take the duration from the current official bulletin, set it exactly, and move on. The clock is the highest-fidelity thing you can match: a candidate who learns to move through a paper in the time the real exam allows has learned something that transfers, and one who sits the same paper at a comfortable length has learned a pace that does not exist on exam day. Judgement starts only where there is no bulletin to copy.",
    },
    {
      type: "p",
      text: "This article is about choosing the number. The mechanics of the clock itself - which clock the student sees and what happens when it hits zero - are covered in [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit). Whether a finished section stays shut is a separate decision with its own consequences, in [should you allow section switching in your mock test](/blog/should-you-allow-section-switching-in-your-mock-test).",
    },
    {
      type: "h2",
      text: "Where Time per Question Actually Comes From",
    },
    {
      type: "p",
      text: "There is no universal figure, and the three patterns worth stating out loud show why. [JEE Main](/mock-test/jee-main) Paper 1 runs 75 questions in 180 minutes for 300 marks - 25 questions per subject, Section A's 20 MCQs and Section B's 5 numericals all compulsory, all at plus four and minus one. That is 2.4 minutes a question. NEET UG runs 180 compulsory questions in 180 minutes for 720 marks: exactly one minute a question. SSC MTS runs 90 questions for 270 marks across two sessions of 45 minutes, which is 90 minutes in total and again one minute a question.",
    },
    {
      type: "p",
      text: "Three exams, two very different paces, and the gap is not an accident. A numerical answer typed into a box is not the same unit of work as a one-line recall. Any source that hands you a single per-question figure for Indian competitive exams has invented it. For every exam other than those three, read the duration off the current bulletin rather than off memory - patterns do move between cycles, and a number that sounds settled can be a cycle out of date.",
    },
    {
      type: "p",
      text: "And note what the average is for. It describes the paper; it is not an instruction to the candidate. Nobody clears JEE Main by spending 2.4 minutes on each of 75 questions. The figure is useful to the person sizing a slot, and useless as advice to a student.",
    },
    {
      type: "h2",
      text: "What the Total Is Actually Made Of",
    },
    {
      type: "p",
      text: "Before you pick a number, know which number the student will actually get, because the total means different things depending on how the paper is clocked. With section switching off - the default - every section carries its own clock and is sat in order; there is no whole-paper clock at all. The paper's length is the sum of the sections, and a minute unused in section one cannot be spent in section two. Turn switching on and the paper gets one clock for everything, set in a single Total exam time box; leave that box empty and the student gets the section sum anyway.",
    },
    {
      type: "p",
      text: "A third shape sits between the two. A timing group pools one clock across two or more adjacent sections - the student moves freely inside the pool, the rest of the paper stays sectional, and the pool counts once in the paper's total, not once per member section.",
    },
    {
      type: "p",
      text: "One detail is easy to miss: a new section arrives at 60 minutes. That is a placeholder, not a recommendation. A three-section paper nobody has retimed advertises itself on the instructions page as three hours long - and that page is the last thing a student reads before starting.",
    },
    {
      type: "h2",
      text: "When You Are Choosing: Sit the Paper Yourself",
    },
    {
      type: "p",
      text: "For a paper with no bulletin behind it, the only honest input is the paper. Sit it. A creator opening their own exam gets a preview that records nothing - no attempt row, no score, nothing in your analytics - so you can run the clock on yourself as often as you like. Use a watch, not the countdown, which starts from whatever placeholder is currently set.",
    },
    {
      type: "ul",
      items: [
        "Finish every question yourself, writing down the time. This is the floor: the paper cannot be shorter than its own setter can solve it.",
        "Note which questions made you pause. One that took far longer than its neighbours is either the paper's hardest item or a badly worded one, and you want to know which before you set a clock around it.",
        "Check the per-question pace each slot implies. If a 20-minute section holds 30 questions, the clock is not the problem - the section is.",
        "Decide the pace from the exam your students are actually preparing for, not from how long it took you.",
        "Set the clock, then open the instructions page and read the total the way a student would.",
      ],
    },
    {
      type: "h2",
      text: "Turning Your Time Into a Student's",
    },
    {
      type: "p",
      text: "Here is where the obvious method goes wrong. You know the answers, you wrote the questions, and the version of you that just finished the paper is not a candidate. The tempting fix is a multiplier - take your time, multiply by some number, done. Resist it. Nobody can tell you what that number is for your batch, and a multiplier presented as a measurement is a guess wearing a coat.",
    },
    {
      type: "p",
      text: "Derive the pace instead. Your students are preparing for something; that something publishes a duration and a question count, and dividing one by the other gives you a per-question pace you did not invent. Apply it to your paper, and use your own timed run only as a sanity check that the result is not absurd. Suppose you have built a 30-question chapter test for a batch preparing for NEET UG. NEET's own pace is one minute a question, so 30 minutes is the defensible starting figure. If you then sit it yourself and come out at 14 minutes, 30 is comfortably on the right side. Come out at 28 and the paper is too long for the slot - the fix is fewer questions, not more minutes.",
    },
    {
      type: "p",
      text: "For a diagnostic, where you want to see what a class knows rather than how fast it moves, loosen the clock deliberately and say so in the instructions. A paper that feels untimed but is secretly tight produces a dataset about speed when you wanted one about knowledge.",
    },
    {
      type: "h2",
      text: "Round It to Something a Student Can Hold",
    },
    {
      type: "p",
      text: "A 47-minute test is a worse test than a 45-minute one, for no reason connected to difficulty. Round numbers are the ones a candidate can plan against: 45 minutes splits into three clean quarter-hours, so a student glancing at the clock knows at once whether they are a third or two thirds through. Forty-seven splits into nothing, and nobody does that arithmetic under pressure. The editor agrees - both minute boxes step in fives, and the whole-paper stepper will not go below 5 minutes.",
    },
    {
      type: "quote",
      text: "Every minute you add because you are unsure is a minute of the student's pace you have quietly decided not to test.",
    },
    {
      type: "p",
      text: "Round down rather than up when you are between two numbers. Under-timing a paper produces a complaint and a correction before the next batch; over-timing it produces inflated scores and a shock on exam day that nobody traces back to you.",
    },
    {
      type: "h2",
      text: "Check the Number Against What the Batch Did",
    },
    {
      type: "p",
      text: "A duration is a hypothesis, and once the first batch has sat the paper you have evidence. The analytics page reports an average time per attempted question, a per-section figure showing average time used against that section's limit, and an average time on each question. None of those three is attached to a name - the per-question figures average over everyone who attempted that question, so what you are reading is the paper, not the people.",
    },
    {
      type: "ul",
      items: [
        "If the average time used in a section sits far under its limit, the clock is not doing any work. Either tighten it or accept that the section is untimed in practice.",
        "If attempts cluster at the limit with questions left untouched at the end, the paper is too long - check whether it is the whole section or two slow questions dragging it.",
        "Read the per-question times before blaming the total. One question eating a disproportionate share usually means ambiguous wording, not difficulty.",
        "Change one thing between cohorts. Retiming and rewriting at once leaves you unable to say which worked.",
      ],
    },
    {
      type: "h2",
      text: "Changing the Time After People Have Sat It",
    },
    {
      type: "p",
      text: "Nothing in the publish check looks at the clock. Eleven checks can stop a language going out, and every one of them is structural - missing or broken questions, missing answer keys, mismatches between language versions. A twelfth blocker fires when marks are set on only part of the paper. Not one of them reads a minutes box, so a section left at zero minutes goes live without a word. The only timing safeguard is the instruction-drift notice, which spots a stored instruction still promising a duration the paper no longer has. It warns; it does not block. Re-read your instructions in every published language after you touch a clock.",
    },
    {
      type: "p",
      text: "Be clear about what a change reaches. Attempts already submitted keep the scores they were given, and a sitting in progress keeps the deadline it started with, because the clock is stamped at the moment the student presses start. There is no way to grant one student extra time, no pause button on a mock sitting, and no proctoring of any kind to tell you whether a long attempt was concentration or a tab left open. If a student closes the tab the clock keeps running, and they can pick the sitting back up within five minutes of leaving. The countdown warns at five minutes remaining and auto-submits at zero with whatever has been saved.",
    },
    {
      type: "p",
      text: "Time costs nothing to change before publication and the most to change after. Take it from the bulletin where one exists, derive it where one does not, and let the first batch correct you. If you are assembling the paper from scratch, [how to design a full-length mock test paper](/blog/how-to-design-a-full-length-mock-test-paper) covers the structure the clock has to fit. [Everything a creator can build on MockSetu](/for-creators) - per-section clocks, pooled timing groups, bilingual papers, a listing in the public library - is free and needs no card. Published papers are public, so anyone with the link can sit the one you time well.",
    },
  ],
  faqs: [
    {
      question: "How much time should I give per question in a mock test?",
      answer:
        "It depends entirely on the exam you are mirroring, and there is no universal figure. JEE Main Paper 1 allows 180 minutes for 75 questions, which works out to 2.4 minutes a question. NEET UG allows 180 minutes for 180 questions, exactly one minute each. SSC MTS runs 90 questions across two 45-minute sessions, also one minute each. For any other exam, read the duration and question count off the current official bulletin and divide - do not reuse a figure from a different exam.",
    },
    {
      question: "How long should a chapter test or sectional be?",
      answer:
        "Derive the pace from the exam your students are preparing for rather than guessing a multiplier. Take that exam's published duration divided by its question count, multiply by the number of questions you are setting, and round to the nearest five minutes. Then sit the paper yourself to check the result is not absurd - a creator preview records nothing, so you can time yourself without affecting your analytics.",
    },
    {
      question: "Is the total time one clock or one clock per section?",
      answer:
        "Both are possible. With section switching off, which is the default, every section has its own clock and is sat in order, so the paper's total is simply the sum of the sections and unused minutes do not carry over. With switching on, the whole paper runs on one clock that you set in the Total exam time box; left empty, it falls back to the section sum. You can also pool one clock across two or more adjacent sections as a timing group, and that pool counts once towards the paper's total.",
    },
    {
      question: "What happens if I change a mock test's duration after publishing it?",
      answer:
        "Future attempts get the new clock. Attempts already submitted keep their scores, and a sitting in progress keeps the deadline stamped when the student pressed start. Nothing in the publish check validates timing, so the change goes live silently - the only safeguard is the instruction-drift notice, which warns when your written instructions still promise the old duration but does not block publishing. Re-read the instructions in every published language after any change to a clock.",
    },
    {
      question: "Can I give one student extra time on a mock test?",
      answer:
        "No. The clock is a property of the paper, not of the student, and there is no per-candidate time accommodation, no pause and no way to extend a sitting that has started. If one group genuinely needs a different duration, the practical route is to duplicate the exam and set the longer clock on the copy - a duplicate carries the marking scheme, the timing groups and the language links, though it is best-effort, so open the copy and check it before you publish.",
    },
  ],
};

export default post;
