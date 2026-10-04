import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "online-exam-instructions-template-for-students",
  title: "Online Exam Instructions Template for Students (Copy, Adapt, Publish)",
  metaTitle: "Exam Instructions Sample for Students: Template | MockSetu",
  metaDescription:
    "An exam instructions sample you can copy: duration, questions, marking and the penalty, section locks, palette, auto-submit, and what to do if the net drops.",
  keywords:
    "exam instructions sample, online exam instructions template for students, general instructions for online test, exam instructions format, instructions page for mock test, test instructions for students, online test rules for students, unit test instructions sample",
  excerpt:
    "A complete instructions block you can paste into your paper and adapt line by line, a shorter one for a school unit test with no negative marking, and the fix for the failure that ruins both - instructions that no longer describe the paper.",
  publishedAt: "2026-10-02",
  updatedAt: "2026-10-02",
  readingMinutes: 11,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx - without it this article funnels a paper setter
    // to the student library instead of the creator page.
    "For Creators",
    "Templates",
    "exam instructions",
    "online exam",
    "paper setting",
    "test administration",
  ],
  hero: {
    eyebrow: "Creator Templates",
    h1: "Online Exam Instructions Template for Students (Copy, Adapt, Publish)",
    lede: "A full instructions block you can paste in and adapt to your own numbers, a shorter one for a unit test with no penalty, and the one failure that ruins both.",
  },
  content: [
    {
      type: "p",
      text: "Here is an exam instructions sample you can copy straight into your paper, adapt to its real numbers, and publish. It covers the seven things students ask before they click start: duration, question count, what a wrong answer costs, whether they can move between sections, how the palette and mark for review work, what happens at zero, and what to do if the connection drops. Replace the bracketed values, delete the lines that do not apply. Everything after it deals with the failure that ruins an otherwise good instructions page: instructions that no longer describe the paper.",
    },
    {
      type: "h2",
      text: "The Instructions Block You Can Copy",
    },
    {
      type: "p",
      text: "Two rules before you paste it. Order matters, because attention is highest at the top: duration and marking go first, housekeeping underneath. And keep it as short lines rather than prose. A dense pre-exam paragraph gets skipped, and then the same questions arrive in your class group ten minutes into the paper anyway.",
    },
    {
      type: "ul",
      items: [
        "This paper has [100] questions for [200] marks. You have [120] minutes in total.",
        "There are [3] sections: [Section A, 40 questions], [Section B, 35 questions], [Section C, 25 questions].",
        "Section switching is [open: all three sections share the one [120]-minute clock and you may move between them in any order / locked: the sections are sat in order, each on its own clock of [50], [40] and [30] minutes, and a section you submit cannot be reopened].",
        "[[Section B] and [Section C] share one pooled clock of [70] minutes instead of a clock each: move freely between the two, but once the part is submitted it cannot be reopened and unused time does not carry over. Delete unless your paper pools sections, which needs switching locked.]",
        "All questions are compulsory. There is no internal choice.",
        "Marking: [+2] for a correct answer, [-0.5] for a wrong answer, and [0 - a blank costs you nothing] for a question you leave unattempted.",
        "Multi-correct questions: [part marks are awarded for a partly correct selection / a selection must be fully correct to score]. [The penalty is charged once per question, not per wrong option.]",
        "Use the question palette to see every question in the section at a glance and to jump straight to any of them.",
        "Mark for review flags a question you mean to come back to. Use it instead of leaving a blank and trusting yourself to remember.",
        "The paper submits itself when the timer reaches zero. Do not leave your last five answers for the last minute.",
        "If your connection drops, reopen the same link on the same device straight away - a signed-in student who comes back within about five minutes carries on with the same attempt. Come back later than that and the paper you were sitting is filed as it stood. The clock runs while you are away either way, so go straight back rather than hunting for another device.",
        "This paper is available in [English and Hindi]. Pick your language on the instructions page before you start - the sitting runs in the one you choose, and the questions are the same in both.",
        "The paper opens full screen by itself where your browser allows it, so the question area gets the whole screen. On a computer, if you leave full screen, the control in the header puts it back.",
        "Read this instructions page before you start. It carries a table of the sections, built from the paper itself, with the question count for each and the marks and minutes where those apply.",
        "Keep [a rough sheet and a pen] ready before you begin. This mock is not proctored, and your score is only as useful as the conditions you sat it in.",
      ],
    },
    {
      type: "p",
      text: "Every square bracket is a value you own, and the numbers above are a worked example rather than any real exam's pattern. Where a line offers two branches split by a slash, keep the one your paper uses and delete the other. One section: delete the section, switching and pooled-clock lines rather than writing not applicable. One language: delete the language line. And if you are building to a published exam's pattern, take the question count, marks and timing from that exam's current official bulletin rather than from memory; [mock test format for competitive exams](/blog/mock-test-format-for-competitive-exams-reference) covers turning a pattern into sections.",
    },
    {
      type: "h2",
      text: "Why Each Line Is In There",
    },
    {
      type: "p",
      text: "The marking line is the one students will quote back at you. Write all three numbers - correct, wrong, unattempted - even when two look obvious, because negative marking applies is not a number, and a student who does not know whether a blank costs anything will either over-attempt or freeze. In MockSetu those values live on the paper and can be overridden per section or per question, so the line is only a plain-English copy of what the paper already scores. Multi-correct questions need a line of their own: part marks or all-or-nothing, and whether the penalty is charged once or per wrong option. A class that learns those rules from its score report spends the discussion arguing about the rules. If you are still deciding, [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) works through it.",
    },
    {
      type: "p",
      text: "The timing lines decide the character of the paper more than the questions do, and one setting governs the rest. Leave section switching open and the whole paper runs on one shared clock, with free movement until it ends. Lock it and the sections are sat in order, each on its own clock, and a submitted section cannot be reopened; only then can you pool adjacent sections onto one shared clock, so the paper is sat in timed parts. Auto-submit at zero applies either way. A student who can wander back into section one near the end is sitting a different paper from one for whom section one closed at the half-hour, so say which yours is, in one line, before the clock starts. The mechanics are in [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit).",
    },
    {
      type: "p",
      text: "The housekeeping lines are the ones templates leave out and students need. The palette and mark for review are standard on the MockSetu exam screen, but standard is not familiar, and a student meeting them for the first time spends the opening minutes orienting instead of answering - time that lands on the report as unattempted questions rather than a knowledge gap. The connection line earns its place too: a student who panics at a dropped network and goes hunting for a sibling's handset spends those minutes on a clock that never stopped, chasing a problem that reopening the same link would have fixed.",
    },
    {
      type: "quote",
      text: "Instructions are not a legal notice. They are the last thing a student reads before the clock starts, and they are read exactly once.",
    },
    {
      type: "h2",
      text: "The Mistake That Ruins a Good Instructions Page",
    },
    {
      type: "p",
      text: "The worst thing an instructions page can do is not be vague. It is to be precise and wrong - ninety questions in sixty minutes when the paper has seventy-five in ninety. Nobody writes that on purpose. It happens because instructions get written while the paper is half built, and then the paper changes: a section is added, a time is edited, the penalty is softened, five weak questions are cut the night before. Students pace themselves against the wrong number, and the attempt is spoiled by arithmetic rather than difficulty.",
    },
    {
      type: "p",
      text: "MockSetu attacks this from two sides. Generate from exam writes the Exam Instruction field out of the paper itself, so the first draft is not a blank box, and both the editor and the publish dialog flag that text as out of date once it stops matching the paper. Treat that notice as a stop sign rather than a notification, because nothing stops you publishing straight past it - it is advisory, not a gate. The generator is a draft, not a sign-off: a paper you edit at eleven at night will drift again by morning. The checklist at the end of this article is the pass that catches it; the wider sequence it sits inside is in [how to conduct an online exam for students](/blog/how-to-conduct-an-online-exam-for-students).",
    },
    {
      type: "h2",
      text: "A Shorter Block for a School Unit Test With No Negative Marking",
    },
    {
      type: "p",
      text: "A thirty-minute unit test does not need the competitive-exam block, and pasting it wholesale makes a class 9 science test read like a selection exam. Strip it to six lines. The difference that matters is not length, though: you have to say there is no penalty, and say it in a way that changes behaviour. No negative marking is a rule. Nothing is deducted for a wrong answer, so attempt every question, is an instruction. In a unit test a blank is worse than a guess: a guess tells you which distractor the class fell for.",
    },
    {
      type: "ul",
      items: [
        "[Class 9 Science - Unit Test 3: Matter in Our Surroundings]. [25] questions, [25] marks, [30] minutes.",
        "One mark for each correct answer. Nothing is deducted for a wrong answer or a blank, so attempt every question.",
        "One section, one timer of [30] minutes. The test submits itself when the timer reaches zero.",
        "Use the question palette to move between questions, and mark for review on anything you want to revisit.",
        "If the page closes or your connection drops, open the same link on the same device at once; if you are signed in you can rejoin the same attempt within about five minutes. The clock keeps running while you are away.",
        "This test is practice. The score is for your own feedback and for Monday's discussion class, where we will go through every question the class got wrong.",
      ],
    },
    {
      type: "h2",
      text: "Lines You Should Not Write, Because They Are Not True",
    },
    {
      type: "p",
      text: "Borrowed instruction templates come with threats the platform underneath cannot enforce. Students work this out inside one sitting, and once they do, the rest of your instructions lose their authority too - including the lines that were true. MockSetu has no webcam or AI proctoring, no lockdown browser and no tab-switch detection, so none of the following belongs on a MockSetu instructions page.",
    },
    {
      type: "ul",
      items: [
        "Switching tabs will be flagged. It will not be. There is no tab-switch detection.",
        "You are being monitored by webcam, or your screen is being recorded. There is no proctoring of any kind.",
        "Every student gets a different question order. There is no shuffling or randomisation of questions or options.",
        "One attempt only, strictly enforced. There is no cap on the number of attempts.",
        "Only students of this batch can open this paper. A published paper is public: anyone who has the link, or finds it in the library, can attempt it.",
        "Your certificate will be emailed to you. There are no certificates, and no email, SMS or WhatsApp notifications about a test - only account email such as sign-up and password reset.",
        "Results will be exported to the parent portal. There is no CSV or Excel export and no per-student report card.",
      ],
    },
    {
      type: "p",
      text: "Deleting those lines is not a downgrade. An instructions page that claims only what the paper can do is the one a student still believes at question seventy. If a paper must not reach people outside your batch, no wording and no setting will manage it - published papers are public, which is worth knowing before you build a test series around secrecy. What you can control is the shape of the attempt: a live session everyone joins at once, or a paper paced so a lookup costs more minutes than it saves. Openness pays, though: a published mock can be begun as a guest with no account, from your link or from the [public library of student mock tests](/marketplace). A live exam is the exception - students sign in once before joining with the code - so say that in the message.",
    },
    {
      type: "h2",
      text: "The Adapt Checklist",
    },
    {
      type: "p",
      text: "Run this the first time you use the block; after that only the numbers change. If the paper itself is not built yet, [how to create an online mock test](/blog/how-to-create-an-online-mock-test) walks the whole build and [what MockSetu gives a paper setter](/for-creators) covers the settings these lines describe.",
    },
    {
      type: "ul",
      items: [
        "Paste the block into General Instruction, and move the lines carrying the paper's own numbers - counts, marking, timing - into Exam Instruction. That second field is the one the out-of-date check reads; facts parked in the first are never audited against the paper.",
        "Replace every bracket with a real number or a real choice, and delete every line that does not apply.",
        "Read the marking line against the marks the paper actually scores, including the unattempted value, and the switching, section-time and pooled-clock lines against the settings you chose.",
        "Clear the out-of-date notice on the instructions if it is showing, rather than publishing past it.",
        "Open the instructions page as a student sees it, read it start to finish, and check its paper table against the real sections.",
        "Preview the exam yourself - a creator preview records nothing - then open the student link on a phone as well, because the exam screen is not the same on a narrow one: the palette moves into a slide-out panel, and the full-screen control only shows while the paper is already full screen.",
        "Save the adapted block somewhere you can find it. For the next batch, duplicate the exam rather than rebuilding it: the copy carries the instructions text across word for word, and the marking scheme with it. It arrives unpublished, though, and the moment you swap a question or move a time the pasted numbers are describing the old paper. Re-read the block against the new one before you publish.",
      ],
    },
  ],
  faqs: [
    {
      question: "What should an online exam instructions page include?",
      answer:
        "Seven things, in this order: total questions and marks, the total duration plus each section's own time if the paper is locked section by section, the marking scheme with all three numbers (correct, wrong, unattempted), whether section switching is locked or open, how the question palette and mark for review work, that the paper auto-submits when the timer ends, and what a student should do if the connection drops. Anything beyond those seven tends to be read as noise and skipped.",
    },
    {
      question: "Do I need different instructions for a school unit test?",
      answer:
        "Yes, and they should be much shorter - about six lines. Drop the section and switching lines if there is only one section, and replace the penalty line with an explicit statement that nothing is deducted for a wrong answer, so students attempt every question. In a unit test a blank is worse for you than a guess, because a guess shows you which distractor the class fell for and a blank tells you nothing.",
    },
    {
      question: "What happens if my instructions do not match the paper?",
      answer:
        "Students pace themselves against your numbers rather than the paper's, so an instructions page that says ninety questions in sixty minutes when the paper has seventy-five in ninety wrecks the attempt before the first question. MockSetu flags the Exam Instruction text as out of date once it stops describing the paper, in the editor and again in the publish dialog, and Generate from exam will write that field out of the paper for you. Both have limits: the notice is advisory rather than a block, and generated text is only current as of the moment you accepted it. Re-read the instructions after every edit to the paper.",
    },
    {
      question: "Can I tell students they will be flagged for switching tabs?",
      answer:
        "No. MockSetu has no tab-switch detection, no webcam or AI proctoring and no lockdown browser, so that line would be a bluff and students find bluffs out in one sitting - after which they stop believing the true lines as well. The things that actually work are paper design choices: pace the paper so a prepared student finishes with a few minutes to spare, and use question types that resist a quick search.",
    },
    {
      question: "What should students do if their connection drops mid-exam?",
      answer:
        "Reopen the same link on the same device immediately rather than going looking for another phone. A signed-in student who returns within about five minutes carries on with the same attempt; return later than that and the paper is filed as it stood. Either way the clock has been running. Put this in the instructions as one plain line, because what a dropped connection really costs is the minutes spent panicking, not the drop itself.",
    },
  ],
};

export default post;
