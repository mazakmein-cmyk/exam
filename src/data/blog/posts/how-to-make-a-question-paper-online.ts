import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-make-a-question-paper-online",
  title: "How to Make a Question Paper Online (and Deliver It as a Real Exam)",
  metaTitle: "How to Make a Question Paper Online: Full Guide | MockSetu",
  metaDescription:
    "Making a question paper online is two jobs: the blueprint and the delivery. Here is how to plan sections and marks, source questions, and run it as a timed test.",
  keywords:
    "how to make question paper online, question paper generator, create question paper online free, make exam paper online, online question paper maker, question paper format, computer based test for students, paper setting software",
  excerpt:
    "A question paper generator stops at a PDF you print. Building the paper and delivering it are two different jobs - and only the second one gives you data back.",
  publishedAt: "2026-09-11",
  updatedAt: "2026-09-11",
  readingMinutes: 11,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx - without it this article funnels a paper setter
    // to the student library instead of the creator funnel.
    "For Creators",
    "Exam Creation",
    "question paper",
    "paper setting",
    "exam delivery",
    "test blueprint",
  ],
  hero: {
    eyebrow: "Paper Setting Playbook",
    h1: "How to Make a Question Paper Online (and Deliver It as a Real Exam)",
    lede: "A question paper generator hands you a PDF to print. That is a document, not an exam. Here is how to build the paper and then deliver it in a way that actually tells you something.",
  },
  content: [
    {
      type: "p",
      text: "Making a question paper online takes two decisions, not one. First you fix the blueprint - how many questions, how many sections, how long each runs, and what a wrong answer costs. Then you decide how the paper reaches the student: printed with an OMR sheet, a PDF forwarded on WhatsApp, or a timed test in a browser with a clock running. A tool that calls itself a question paper generator solves only the first half and hands you a PDF to print - a document, not an exam, and a document gives you nothing back.",
    },
    {
      type: "p",
      text: "So this guide follows the paper in that order: the blueprint, then sourcing the questions, then the delivery decision and what each route hands back. The click-by-click build inside a platform is a separate job, written up as [how to create an online mock test](/blog/how-to-create-an-online-mock-test). What follows is mostly the thinking that has to happen before you open any builder.",
    },
    {
      type: "h2",
      text: "A Question Paper Is a Blueprint Before It Is Questions",
    },
    {
      type: "p",
      text: "The biggest mistake in paper setting is opening a blank editor and typing question one. You end up with three questions on the same chapter, a section nobody can finish in the time allowed, and a marking scheme invented at the end to make the total come out round. Write the blueprint first and the questions become a filling exercise.",
    },
    {
      type: "p",
      text: "If you are mirroring a real exam, copy its structure exactly rather than approximating it. JEE Main Paper 1 is 75 questions, 25 per subject, Section A carrying 20 MCQs and Section B carrying 5 numericals - all compulsory, +4 and -1 in both sections, 300 marks in 180 minutes. NEET UG is 180 compulsory questions for 720 marks in 180 minutes. SSC MTS runs 90 questions for 270 marks across two 45-minute sessions, and the asymmetry matters: Session I is qualifying only with no negative marking, while Session II counts for merit and takes one mark off a wrong answer. A student who practises against the wrong penalty learns the wrong risk habit, and that is expensive to unlearn. For a paper of your own design, the same decisions still need settling first.",
    },
    {
      type: "ul",
      items: [
        "Total questions, marks and minutes - divide one by the other and check the result is survivable. NEET UG works out at a flat minute per question; JEE Main at nearer two and a half.",
        "Sections, and whether each gets its own clock or shares one. Students feel this decision most, because it dictates whether they can borrow time from an easy section.",
        "Marks for a correct, wrong and unattempted answer, written down before you have seen a single question.",
        "Difficulty spread and chapter weightage, as a table you tally against while writing. Pick a target split - a middle-heavy one, say 30 percent easy, 50 moderate, 20 hard - as something to argue with rather than a rule, and keep the hard questions spread out. The tally is the only reliable defence against four questions on the chapter you enjoy teaching.",
        "Language. Decide at blueprint stage whether the paper is bilingual - retrofitting a second language after 90 questions are written is a far worse afternoon.",
      ],
    },
    {
      type: "p",
      text: "If the paper you are planning is a full-length mock rather than a chapter test, the weightage and difficulty decisions get considerably more involved, and [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic) works through the ones that matter most.",
    },
    {
      type: "h2",
      text: "Writing or Sourcing the Questions",
    },
    {
      type: "p",
      text: "There are three realistic sources and most good papers mix them. Fresh questions are slow to write but land exactly on the difficulty you planned. Previous years' papers are fast and already calibrated, but recognisable to any student who has done the rounds. Adapting - changing a past question's numbers, framing or the thing being asked - has the best ratio of effort to quality. Roughly a third of each makes a sensible mock.",
    },
    {
      type: "p",
      text: "Whatever the source, getting the question into the paper is where most of the evening disappears. On MockSetu you type with rich text, write maths as LaTeX that renders through KaTeX, and attach images - including images as the options themselves, which is what diagram and matching questions need. Passages, single-correct, multi-correct, numeric and text answers are all covered. When a question is too fiddly to retype - a chemistry structure, a circuit, a geometry figure - snip it, or one option, or the passage, straight out of the PDF as an image.",
    },
    {
      type: "p",
      text: "For bulk, the route is JSON import. MockSetu publishes its own extraction prompt at the [JSON upload guide](/json-upload-guide); run that prompt in whatever AI assistant you already use, save the JSON it produces, and upload the file. It costs nothing and depends on no feature being switched on for your account. Two honest caveats: the importer leaves numeric, TITA and match-the-column questions for manual entry, and JSON is the only import format - no Excel, no Word, and no generating questions from a syllabus. Extraction works on a paper you already have, which is the point of [converting a PDF question paper into an online test](/blog/convert-pdf-question-paper-to-online-test).",
    },
    {
      type: "quote",
      text: "A question paper is finished when you can predict the score distribution before anyone sits it. If you cannot, you have written questions, not a paper.",
    },
    {
      type: "h2",
      text: "The Delivery Decision: OMR, a PDF on WhatsApp, or a Real Test",
    },
    {
      type: "p",
      text: "Here is the fork the question-paper-generator tools never mention. The three common routes are not equivalent - they differ enormously in what they cost and in what they hand back.",
    },
    {
      type: "ul",
      items: [
        "Printed paper with OMR sheets. Highest fidelity to an offline exam, and the only route that needs no devices. Costs: printing, invigilation, and either a scanner or an evening of checking. Feedback arrives days later, by which point the student has moved on.",
        "A PDF forwarded on WhatsApp. Costs nothing and reaches the whole group at once. You also learn nothing: no timing, no section order, no record of who attempted what, and an answer key circulating in the same group soon after. Fine as homework, useless as a mock.",
        "A computer-based test in a browser. The student gets a clock, a question palette, mark for review, an instructions page with the paper table, fullscreen and auto-submit at time. A signed-in student's attempt is scored as soon as they submit; what comes back to you is aggregated data on where the class fell over. Costs: a device each and a connection that holds.",
      ],
    },
    {
      type: "p",
      text: "The honest comparison is not that online is better. It is that online is the only one of the three that returns data without extra labour, and it trades that for a device requirement. If your batch cannot get a phone each for ninety minutes, print the paper. If they can, the online route pays for itself the first time you see how long the class really spent on the question you thought was easy.",
    },
    {
      type: "h2",
      text: "What Each Route Gives You Back",
    },
    {
      type: "p",
      text: "This is the argument for delivering online, and it deserves precision rather than a wave at the word analytics. MockSetu reports section-wise accuracy, average time per question, and where the class struggled - aggregated by design, so you see which section fell apart and which question ate the most time, not which named student got it wrong. The one place a student is named at all is a top-three leaderboard, and that shows a handle rather than a full name. There is no per-student report card for a parent and no CSV or Excel export.",
    },
    {
      type: "p",
      text: "Two smaller things change the economics more than they sound like they should, and the first one cuts against you. Grades are stamped at submission and never recomputed. When you discover the key was wrong on a question - and you will - fixing it corrects the paper from that moment on, but every attempt already recorded keeps the marks it was given, and nobody's rank moves. So proofread the key before you publish rather than after: this is the one mistake the platform will not quietly clean up behind you. The second runs in your favour. Next cycle you duplicate the paper instead of rebuilding it, and either Duplicate button - the one on your exam list and the one inside the exam editor - carries the same things across: sections, questions, instructions, language settings, timing groups and the marking scheme. The marks are copied on a best-effort basis and the copy will not announce it if that step failed, so open the marking scheme on the copy once before you publish it.",
    },
    {
      type: "h2",
      text: "Marks, Timing and the Rules You Set Before Publishing",
    },
    {
      type: "p",
      text: "The marking scheme is where an online paper either matches the real exam or quietly diverges from it. Set the marks for correct, wrong and unattempted per question rather than globally, because papers like SSC MTS genuinely change the penalty between sessions. Multi-correct questions need their own decision: part marks or all-or-nothing, the penalty charged once or per wrong option, and whether part marks round down, to nearest, up, or stay exact and unrounded. Fussy settings, until two students with identical understanding score differently because a default was wrong.",
    },
    {
      type: "p",
      text: "Timing is the other half, and the two decisions interact. With section switching locked, each section carries its own clock, and two or more adjacent sections can share a pooled clock as a timing group when the real exam pools them. Leave switching open instead and the whole paper runs on one clock, which makes a grouping meaningless. Pick the shape the exam you are mirroring actually uses. The paper auto-submits when time expires, which is the behaviour students need to rehearse. One last guard, with a condition attached: generate the instructions from the paper rather than typing them, and MockSetu then audits its own sentences against what the paper later became - the timing line, and the section-and-count line still claiming 100 questions on a 90-question paper. It only judges text it wrote. Prose you typed yourself is never called stale, so that part you re-read by hand.",
    },
    {
      type: "h2",
      text: "What Delivering Online Will Not Do For You",
    },
    {
      type: "p",
      text: "Every platform in this category oversells, so here is the opposite. There is no webcam or AI proctoring, no lockdown browser and no tab-switch detection - an unsupervised online paper is a practice instrument, not an invigilated examination, and if the marks matter administratively you still need a room and a person in it. There is no question shuffling and no cap on attempts, so two students side by side see the same paper in the same order. No certificates, no LMS or Google Classroom integration, and no essay grading - a 250-word answer is yours to mark by hand. Nothing notifies students about a test either: the only mail the platform sends is account mail for signup and password reset, so the reminder in the group is yours to post.",
    },
    {
      type: "p",
      text: "The one that surprises people most: published papers are public. Publish to the [public mock test library](/marketplace) and anyone can find and attempt the paper. There is no private delivery to one batch, no paywall and no way to sell access. For most coaching work that is fine or even useful, but if the paper must stay inside one classroom, publishing it is the wrong move.",
    },
    {
      type: "h2",
      text: "A First Run That Does Not Blow Up",
    },
    {
      type: "p",
      text: "Do not make your first online paper a 180-minute full-length mock for your whole batch. Make it a 30-question, 30-minute chapter test, and work through this sequence.",
    },
    {
      type: "ul",
      items: [
        "Write the blueprint on one sheet: questions, sections, minutes per section, marks for correct, wrong and unattempted, and a topic tally.",
        "Build five questions by hand first - one with maths, one with an image - so you learn where the slow parts are, then import the rest as JSON and finish the numeric and match-the-column ones manually.",
        "Set the marking scheme per question and the per-section clocks, then decide whether section switching is locked.",
        "Preview the paper end to end yourself. A creator preview records nothing, so sit it with the clock running, see which question you misread, and fix the instructions page so the paper table matches the paper.",
        "Publish in the languages you actually wrote - English, Hindi or both - and share the link. A published mock can be started as a guest with no account, but a guest attempt is never recorded: no saved result for them, and no row in your report either. Ask the batch to sign in before they start, for your sake as much as theirs.",
        "Read the aggregate report before you teach the chapter again. If the key turns out to be wrong, fix it for the next sitting - the attempts already recorded keep the marks they were given.",
      ],
    },
    {
      type: "p",
      text: "One operational detail worth knowing before exam day: a signed-in student whose connection drops mid-paper can return within about five minutes on the same device. That resume does not exist for guests, so on patchy mobile data, ask the batch to sign in first.",
    },
    {
      type: "h2",
      text: "Making the Paper in MockSetu",
    },
    {
      type: "p",
      text: "MockSetu is free, with no card, and built for exactly this two-stage job. Once the blueprint exists the build is short: create the exam, write or generate the instructions, add the sections with their minutes, add the questions, set the marks and the clocks, and publish. Tagging a paper Mock or Previous Year is not part of that list for most accounts - it is a field an admin switches on per creator, like the PDF import button, and without the grant it does not appear on the form at all. The other delivery mode is a live session, which you build separately rather than start from a paper you already made: one join code, students on their phones after a one-time sign-in, answer bars on a projector. Both are laid out on the [page for exam creators](/for-creators).",
    },
    {
      type: "p",
      text: "None of that is the hard part. The hard part is the blueprint, and no software will do it for you. Spend the first hour on one sheet of paper deciding what the test is supposed to measure; every hour after that goes faster, because you are filling a plan rather than inventing one question at a time.",
    },
  ],
  faqs: [
    {
      question: "How do I make a question paper online for free?",
      answer:
        "Decide the blueprint first - questions, sections, minutes per section, and the marks for a correct, wrong and unattempted answer. Then create the exam on a free platform such as MockSetu, add questions by typing them or by uploading a JSON file produced with the published extraction prompt, set the marking scheme and the per-section clocks, and publish. There is no cost and no card, and a published mock can be attempted without an account.",
    },
    {
      question: "What is the difference between a question paper generator and an online test platform?",
      answer:
        "A question paper generator produces a document - usually a PDF you print or forward. An online test platform delivers the paper as a timed exam: a clock, a question palette, mark for review, auto-submit when time expires, and a scored review of the attempt as soon as a signed-in student submits. The generator saves you typing. The platform gives you data back about how the class performed, which is the part that changes what you teach next week.",
    },
    {
      question: "Can I convert an existing PDF question paper into an online test?",
      answer:
        "Yes, through JSON import. Run MockSetu's published extraction prompt in whatever AI assistant you already use, save the JSON it returns, and upload that file. Numeric, TITA and match-the-column questions are left for manual entry, so plan a short clean-up pass. You can also snip a question, option or passage straight out of the PDF as an image when retyping is not worth the trouble.",
    },
    {
      question: "Should I give the test on paper with OMR sheets or online?",
      answer:
        "Paper with OMR is the right choice when devices are genuinely unavailable, or when the result is administratively binding and needs invigilation - an online paper has no webcam proctoring, no lockdown browser and no tab-switch detection. Online is the right choice when you want feedback the same hour: scored attempts, section-wise accuracy and time per question, with no manual checking. Many institutes run both.",
    },
    {
      question: "Can I keep an online question paper private to one batch?",
      answer:
        "Not once it is published. A published paper goes into the public library and anyone can attempt it; there is no paywall and no private delivery to a single batch. So the choice is to publish and treat the reach as a benefit, or leave it unpublished, in which case only you can preview it. Live mode is a different shape rather than a way around this: a live session is built separately, it is not listed in the public library, and students reach it with a join code after a one-time sign-in. That is unlisted rather than access-controlled - anyone holding the code can join - so treat it as a quieter door, not a locked one.",
    },
    {
      question: "How long does it take to build a full-length paper online the first time?",
      answer:
        "Longer than you expect if you are typing a 90-question paper by hand, and far shorter once the questions exist as a clean JSON file, because the import is one upload plus a clean-up pass on the numeric and match-the-column questions. The blueprint is the part that does not shrink, so budget a focused session for sections, timing, marks and weightage. From the second paper onwards you can duplicate an existing exam, either from your exam list or from inside the exam editor; both carry the sections, questions, instructions, language settings, timing groups and the marking scheme across. Give the marks on the copy a glance before you publish it anyway.",
    },
  ],
};

export default post;
