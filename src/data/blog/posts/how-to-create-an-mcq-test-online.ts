import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-mcq-test-online",
  title: "How to Create an MCQ Test Online: Format, Marking and Delivery",
  metaTitle: "Create an MCQ Test Online: Format and Marking | MockSetu",
  metaDescription:
    "Create an MCQ test online: single-correct vs multi-correct, how many options to write, what correct and wrong are worth, and when a numeric answer is fairer.",
  keywords:
    "create mcq test online, make an mcq test, multiple choice test maker, single correct vs multiple correct, how many options in an mcq, mcq answer types, numeric answer question, online mcq test for students",
  excerpt:
    "Four decisions make an MCQ test honest: the answer type, the number of options, what correct and wrong are worth, and how the paper reaches students. Here is how to settle each one.",
  publishedAt: "2026-09-16",
  updatedAt: "2026-09-16",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a paper
    // setter to the student library instead.
    "For Creators",
    "Exam Creation",
    "MCQ format",
    "marking scheme",
    "question types",
    "online test",
  ],
  hero: {
    eyebrow: "Question Design",
    h1: "How to Create an MCQ Test Online: Format, Marking and Delivery",
    lede: "The MCQ is the unit your whole paper is built from. Settle its answer type, its options and its marks correctly and the score means something; get them wrong and no amount of analytics will rescue it.",
  },
  content: [
    {
      type: "p",
      text: "To create an MCQ test online, four decisions come before you type a single question: what answer type each question uses, how many options it carries, what a correct, a wrong and an unattempted answer are each worth, and how the finished paper reaches students. On MockSetu the build follows that order - create the exam, add sections with their own time in minutes, add each question as single-correct, multi-correct, numeric or text, set its marks, then publish it - or build it as a live exam and run it in class. This article is about that unit, the MCQ itself. For the whole build end to end, read the guide to [a full timed online mock test](/blog/how-to-create-an-online-mock-test) instead.",
    },
    {
      type: "h2",
      text: "Pick the Answer Type Before You Write the Stem",
    },
    {
      type: "p",
      text: "It is tempting to write the question first and then look for an answer type that fits. That is backwards, and it is how papers end up with four-option questions whose options are the giveaway. Decide what you are measuring first. To find out whether a student can arrive at a value, a four-option MCQ hands them a shortcut: they test each option against the question and never do the work. To find out whether they can tell two neighbouring concepts apart, an MCQ with a well-built distractor is the sharpest instrument you have.",
    },
    {
      type: "p",
      text: "MockSetu gives you four answer types: single-correct, multi-correct, numeric and text. They are not interchangeable. Each changes what a guess is worth, what a half-prepared student can extract, and what the score tells you afterwards. The choice costs a moment per question, and it is the one the rest of the paper has to live with.",
    },
    {
      type: "h2",
      text: "Single-Correct vs Multi-Correct: When Each Is Honest",
    },
    {
      type: "p",
      text: "Single-correct is the default, and it should be. Exactly one option is right, the rest are wrong, and the student's job is to find the one. Almost every high-stakes Indian paper your students are training for is built this way - JEE Main Paper 1 runs 20 single-correct MCQs per subject in Section A, NEET UG runs 180 compulsory questions, SSC MTS runs 90 across its two sessions. If your test is practice for one of those, single-correct is not a limitation; it is fidelity.",
    },
    {
      type: "p",
      text: "Multi-correct is honest in exactly one situation: when the knowledge genuinely contains more than one true statement, and knowing which ones are true is the skill being tested. Four statements about a reaction mechanism where two hold and two do not; four properties of a data structure where three apply. Forcing a single answer there would be the dishonest choice, because it would mean weakening the true statements until only one survived. What multi-correct must never be is a difficulty dial. Converting a question because the batch is scoring too high does not make it harder in any useful way - it makes it noisier, and the spread widens while the signal gets worse. If the paper needs to be harder, write better distractors, a craft covered properly in the guide to [writing good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions).",
    },
    {
      type: "quote",
      text: "An MCQ is a measuring instrument. The options are its scale and the marks are its units - get either one wrong and the score stops meaning anything, however pretty the analytics look.",
    },
    {
      type: "h2",
      text: "How Many Options an MCQ Should Have",
    },
    {
      type: "p",
      text: "Four is the convention across most Indian competitive papers, so if your test is practice for a specific exam, match that exam and stop thinking about it. Where you do have a choice, the rule is simple: every option must be a mistake a real student could actually make. An option nobody picks is not a distractor, it is decoration - it eats seconds off the clock and quietly turns a four-option question into a three-option one with a higher guess rate than you intended.",
    },
    {
      type: "p",
      text: "This is why padding to a fixed count is worse than it looks. If a concept supports only two defensible wrong answers, three options with a guess rate of one in three is a cleaner instrument than four where the fourth is obvious filler. A student who discards the filler on sight is guessing one in three either way - the padding bought nothing and spent clock the student needed elsewhere. Repeat that down a full-length paper and the overhead compounds, which is one reason [accuracy under time pressure](/blog/how-to-improve-accuracy-in-mcq-exams) behaves so differently from accuracy in untimed practice.",
    },
    {
      type: "h2",
      text: "Marking: Three Numbers, and What Multi-Correct Adds",
    },
    {
      type: "p",
      text: "Every question carries three marks values: marks for a correct answer, marks for a wrong one, and marks for leaving it unattempted. Most papers set the third to zero and never think about it again, which is right for almost every use - but it is a separate field, and setting it explicitly beats inheriting a default you never checked.",
    },
    {
      type: "p",
      text: "Pick the scheme from the exam you are simulating, not from instinct. JEE Main Paper 1 is +4 for a correct answer and -1 for a wrong one, in both Section A and Section B, across 75 compulsory questions and 300 marks in 180 minutes. SSC MTS splits the behaviour: Session I carries no negative marking at all and is qualifying only, while Session II counts for merit and charges -1. A paper that applies one blanket penalty across both sessions is not an SSC MTS mock, it is a different exam wearing the name. For any other exam, read the penalty off the current official bulletin rather than off memory - these rules change between cycles.",
    },
    {
      type: "p",
      text: "A multi-correct question then needs a decision a single-correct one never does: what happens when a student gets some of it right. That is three settings, not one. All-or-nothing or part marks. A wrong-answer penalty charged once for the question, or once per wrong option - the per-option version is capped, so a question can never cost more than it is worth. And a rounding rule for the fractions part marks produce: down, nearest, up, or exact, which does not round the awarded value at all - though nothing on a scorecard prints more than two decimal places. Set all three deliberately and say the result in the instructions - the Generate from exam button writes the marking scheme straight out of the stored config, so you are not transcribing the numbers by hand. Regenerate it if you change the marks afterwards, because nothing else will: the publish check re-reads those instructions against the paper's sections, counts and timing, but never against the marks. The full reasoning on sizing a penalty is in the piece on [adding negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test).",
    },
    {
      type: "h2",
      text: "When an MCQ Would Give the Answer Away: Use a Numeric Answer",
    },
    {
      type: "p",
      text: "Some questions should never be MCQs. Anything where the options can be back-substituted into the question is the obvious case - a quadratic, a stoichiometry calculation, a ratio problem. A prepared student solves it; an unprepared one plugs each option in and collects the same mark. The question measured patience, not understanding.",
    },
    {
      type: "p",
      text: "The fix is a numeric answer with no options to work backwards from. The real exams already do this: JEE Main Paper 1 puts 5 numerical-value questions per subject in Section B, all compulsory, carrying the same +4 and -1 as Section A. If you are building [JEE Main practice papers](/mock-test/jee-main), those five are the part of the paper that cannot be gamed. Build them as numeric questions, not as MCQs with four plausible values.",
    },
    {
      type: "p",
      text: "One honest caveat: the JSON bulk import leaves numeric, TITA and match-the-column questions for manual entry - they come in by hand. On a 75-question JEE-shaped paper that is 15 you will type yourself, so plan for them rather than discovering them at the end.",
    },
    {
      type: "h2",
      text: "Getting the Questions In Without Retyping Everything",
    },
    {
      type: "p",
      text: "You can add every question by hand - rich text, maths in LaTeX rendered through KaTeX, images, image options, and reading passages for comprehension sets. For anything that resists retyping, such as a chemistry structure or a geometry figure, snip the question, an individual option or the whole passage straight out of the PDF as an image rather than rebuilding it.",
    },
    {
      type: "p",
      text: "For bulk, the route that works for everyone is JSON. MockSetu publishes its own extraction prompt at the [JSON upload guide](/json-upload-guide): run that prompt in whatever AI assistant you already use, save the JSON it returns, and upload the file. There is no Excel import and no Word import - JSON is the format. A server-side Import from PDF button also exists, but it is off by default and switched on per creator on request, so do not plan a workflow around it unless yours is already enabled.",
    },
    {
      type: "p",
      text: "Before the link goes out, read the paper back against the build - the same decisions again, in the order you made them.",
    },
    {
      type: "ul",
      items: [
        "Answer type chosen for what the question measures, not for what was convenient to type.",
        "Multi-correct used only where more than one statement is genuinely true, never as a difficulty dial.",
        "Every option a mistake a real student could make; no filler padding the count.",
        "Correct, wrong and unattempted marks all set explicitly, matching the exam being simulated.",
        "On every multi-correct question: all-or-nothing or part marks, penalty once or per option, rounding rule.",
        "Back-substitutable calculations built as numeric questions, not four-option MCQs.",
        "Instructions stating the marking scheme in the words the paper actually uses.",
        "One full preview run through the paper before anyone else sees it.",
      ],
    },
    {
      type: "h2",
      text: "Delivery: A Published Paper, a Live Room, or Both",
    },
    {
      type: "p",
      text: "Once the questions are in, there are two ways a test reaches students. Publishing puts the paper in the public library in the languages you chose - English, Hindi or both - and you share the link. A published mock opens for a guest with no account, on a phone or a laptop, so nothing stands between the link and the first question - but the result is only recorded once the student signs in. You can unpublish it, and you can duplicate the exam for next year's batch. Getting that link in front of a batch is its own small craft, covered in the guide to [sharing an online test with students](/blog/how-to-share-an-online-test-with-students).",
    },
    {
      type: "p",
      text: "A live exam is the other mode, and it is a separate build: its own exam, its own sections and questions, with the same import JSON working for both. Students join from their phones with one code, after signing in once, and it runs as a shared room with a projector view, live answer bars, and - when you switch it on - the answer revealed as each question's time runs out. The report afterwards gives class accuracy, participation, drop-off, median score, median answer time per question, and a fast-slow by right-wrong split - which is where a badly-marked multi-correct question shows itself immediately.",
    },
    {
      type: "p",
      text: "Be clear about the limits before you plan around them. A published paper is public: anyone can attempt it, there is no private delivery to one batch and no way to sell access. There is no proctoring, no lockdown browser and no tab-switch detection, so an unsupervised online MCQ test measures practice, not integrity. There is no question shuffling and no cap on attempts. Creator analytics on a published paper are aggregated - section-wise accuracy, average time per attempted question, where the class struggled, plus a top-three board showing handles rather than real names. No per-student report card, no CSV export. If you need named results, this is not the tool. The [guide for paper setters on MockSetu](/for-creators) lays out the rest, and it is free with no card.",
    },
    {
      type: "h2",
      text: "What to Fix First If the Scores Look Wrong",
    },
    {
      type: "p",
      text: "When a paper comes back with a distribution that does not match what you know about the batch, check the marking before you start rewriting questions - it is faster to rule out. Start with three culprits: a multi-correct question charging the penalty per wrong option when you meant once, a wrong-answer penalty copied from a different exam's scheme, and a question built as a four-option MCQ when its options could be back-substituted. The first two are settings. The third is the question itself, and it needs rewriting, not re-configuring.",
    },
    {
      type: "p",
      text: "What none of those fixes can do is reach backwards. Marks are computed when a paper is handed in and written onto the attempt there and then, so correcting an answer key, changing a penalty or rewriting the question afterwards leaves every sitting already recorded exactly as it was scored. So treat the key, the penalty mode, the part-marks rule and the rounding as decisions you make once, before the link goes out - and if a scheme was wrong from the start, duplicate the exam and set the marks again on the copy, because a duplicate carries the questions, sections and instructions but not the marking scheme.",
    },
    {
      type: "p",
      text: "The one thing that is never reversible is deletion: deleting an exam deletes its attempts and responses with it. Duplicate the paper for the next batch instead of clearing the old one.",
    },
  ],
  faqs: [
    {
      question: "How do I create an MCQ test online for free?",
      answer:
        "On MockSetu you create an exam with a name, category and sections, each section with its own time in minutes, then add questions as single-correct, multi-correct, numeric or text. Type them with rich text, LaTeX maths and images, snip them out of a PDF as images, or bulk import JSON built with the extraction prompt published on the site. Set marks for correct, wrong and unattempted, then publish the paper and share the link. It is free and needs no card.",
    },
    {
      question: "Should I use single-correct or multiple-correct questions?",
      answer:
        "Use single-correct unless the knowledge being tested genuinely contains more than one true statement - two of four statements about a mechanism actually holding, say, where identifying which ones is the skill. There is also a fidelity test: if your students are training for a paper built entirely from single-correct questions, a multi-correct section is practice for an exam they are not going to sit. And never reach for multi-correct as a difficulty dial. If the paper needs to be harder, write a sharper distractor instead.",
    },
    {
      question: "Can I run the same MCQ paper as a live class test?",
      answer:
        "Yes, but you build it as a live exam rather than flipping a published paper into one - the same import JSON works for both. Students join with a code after signing in once. You can schedule the start with a countdown, project the paper with options shown or hidden, and reveal the answer when a question's time runs out. Standings can be open to everyone, kept to you, or off, and names can be hidden. Students also get a private button to tell you they are lost, and those taps appear in the report.",
    },
    {
      question: "How many options should each MCQ have?",
      answer:
        "Match the exam you are simulating; four is the convention in most Indian competitive papers, and fidelity beats cleverness when the test is a rehearsal. Where the count is genuinely yours to choose, write only as many wrong options as the concept honestly supports. A filler option changes nothing about a lucky guess, because the student discards it on sight - all it buys is reading time on a clock you have already fixed.",
    },
    {
      question: "When should a question be numeric instead of multiple choice?",
      answer:
        "Whenever the options can be substituted back into the question to find the answer without solving it - quadratics, stoichiometry, ratio problems. A four-option MCQ there rewards back-substitution, not understanding. JEE Main Paper 1 handles this with 5 compulsory numerical-value questions per subject in Section B at the same +4 and -1 as Section A. Note that MockSetu's JSON import leaves numeric and match-the-column questions for manual entry, so allow time to add them by hand.",
    },
    {
      question: "Can I stop students from cheating on an online MCQ test?",
      answer:
        "Not with MockSetu, so plan accordingly. There is no webcam or AI proctoring, no lockdown browser and no tab-switch detection, and a published paper is public, so anyone with the link can attempt it. An unsupervised online MCQ test measures practice quality, not integrity. If you need a supervised result, run the paper in a room you are sitting in, or treat the score as diagnostic rather than as a rank.",
    },
  ],
};

export default post;
