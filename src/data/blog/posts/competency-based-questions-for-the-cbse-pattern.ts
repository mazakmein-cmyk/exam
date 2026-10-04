import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "competency-based-questions-for-the-cbse-pattern",
  title: "Competency-Based Questions for the CBSE Pattern: How to Write Them",
  metaTitle: "Competency-Based Questions for CBSE: How to Write Them | MockSetu",
  metaDescription:
    "Competency-based questions put a concept in an unfamiliar situation. How to write case-based sets, assertion-reason and multi-step application MCQs for CBSE.",
  keywords:
    "competency based questions cbse, competency based questions, case based questions cbse, assertion reason questions, application based questions class 10, how to write competency based questions, cbse question paper design, competency based assessment",
  excerpt:
    "A recall question asks what Ohm's law says. A competency-based question hands the student a household circuit and a fuse rating. Here is how to write the second kind, with worked examples in science and maths.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add a student cluster tag alongside it.
    "For Creators",
    "School Teachers",
    "CBSE",
    "Question Writing",
    "assessment design",
    "paper setting",
  ],
  hero: {
    eyebrow: "Question Writing",
    h1: "Competency-Based Questions for the CBSE Pattern: How to Write Them",
    lede: "A recall question asks what the concept says. A competency-based question drops the concept into a situation the student has never seen and asks them to use it. The difference is almost entirely in how you build the stem.",
  },
  content: [
    {
      type: "p",
      text: "A competency-based question takes a concept the student has already learned, puts it in a situation they have not seen, and asks them to apply it. A recall question asks what Ohm's law states. A competency-based one gives a 220 V household line, a 15 A fuse and four appliances switched on together, and asks whether the fuse will blow. Same syllabus line, a different thing measured - and most of the work happens before you type the first option.",
    },
    {
      type: "h2",
      text: "What Actually Makes a Question Competency-Based",
    },
    {
      type: "p",
      text: "Three things have to be true at once. The context is unfamiliar: a situation, a data snippet, a diagram the student has not met in the textbook. The student chooses the tool - nothing in the stem names the formula, the law or the chapter. And the stem carries information the student must read and use, not scenery that can be deleted without changing the answer. Miss one and you have a recall question in fancy dress.",
    },
    {
      type: "p",
      text: "The failure to guard against is confusing difficulty with competency. A four-step stoichiometry calculation under a heading reading Mole Concept is hard recall: the student was told which drawer to open. A one-line question is competency-based if the student has to work out that it is a mole problem at all. Length is not the signal; who picks the concept is.",
    },
    {
      type: "p",
      text: "So there is a quick test for every draft. Delete the context sentence. If the question still stands with the same answer, the context was decoration. If it collapses, the item is real.",
    },
    {
      type: "h2",
      text: "The Three Formats That Carry Competency Well",
    },
    {
      type: "p",
      text: "You do not need an exotic question type. Three familiar formats do nearly all the work. How heavily the board leans on each one is a question for the current sample paper for your class and subject, not for an article.",
    },
    {
      type: "ul",
      items: [
        "Case or source-based sets: a short passage or data snippet, then four or five questions that each need a different part of it. The workhorse.",
        "Assertion-reason: two statements, where the student judges each and then whether the second explains the first. It tests a causal link, not two sentences memorised together.",
        "Multi-step application MCQs: one stem needing two or three linked steps, with wrong options at the predictable places a student stops early.",
      ],
    },
    {
      type: "p",
      text: "Everything else - match the column, fill in the blank, one-word answers - can be written well, but it fights you. Settle the distribution before you write anything: how many items of each type, written down. Otherwise you discover at question 28 that you have two application items and everything else is recall. More on planning the shape before the content in [making a question paper online](/blog/how-to-make-a-question-paper-online).",
    },
    {
      type: "h2",
      text: "Writing a Case-Based Set That Is Not a Reading Test",
    },
    {
      type: "p",
      text: "The trap with case-based sets is that they drift into comprehension. You write 150 words about a farmer and a water tank, and every sub-question is answered by locating a number and doing one operation. The careful reader scores; the student who understands the chapter gains nothing.",
    },
    {
      type: "p",
      text: "Fix it by making the sub-questions climb. The first can be straight retrieval - pull a value, read the trend - so a weaker student has a foothold. The second needs one transformation of that value. The third needs a concept the passage never names. The fourth asks for a judgement: is this safe, what happens if one input doubles. Write the fourth first and work backwards.",
    },
    {
      type: "p",
      text: "Keep the source short. A source of 80 to 120 words is usually enough, and five or six numbers beat a paragraph describing them. Long sources punish slow readers for something you are not measuring, and they eat the clock.",
    },
    {
      type: "ul",
      items: [
        "Every number in the source is used by a sub-question, and no sub-question needs a number that is not there.",
        "The sub-questions answer in any order - none depends on getting the previous one right.",
        "The context is plausible for the student's world: a ration shop, a bus timetable, a cricket scorecard, an electricity bill.",
      ],
    },
    {
      type: "h2",
      text: "Assertion-Reason Without the Trickery",
    },
    {
      type: "p",
      text: "Assertion-reason is the cheapest competency format to write and the easiest to write badly. The four standard options mean something only if you have thought about the explanation relationship. Two true statements lifted from one paragraph, keyed as both true and R explains A, test only whether both sentences appeared in the chapter.",
    },
    {
      type: "p",
      text: "The good items live in the second option: both statements true, but the reason given is not the reason. Assertion - a cut onion makes your eyes water. Reason - onions contain sulphur compounds. Both true. But those compounds only matter because cutting ruptures cells and lets an enzyme act on them, so the reason as stated is incomplete rather than explanatory. The student who memorised two facts picks the first option; the one who understands the mechanism picks the second.",
    },
    {
      type: "p",
      text: "Two discipline rules. Never make the assertion false by a technicality the chapter never raised - that is a vocabulary trap. And keep both statements to one clause; a compound assertion is two questions marked as one, and you will not know which half the student missed.",
    },
    {
      type: "h2",
      text: "Multi-Step Application MCQs and Their Distractors",
    },
    {
      type: "p",
      text: "A multi-step application MCQ is only as good as its wrong options. The general craft - writing each distractor as a specific, nameable mistake, plus stem length and the ordering of numeric options - is in [writing multiple-choice questions that actually discriminate](/blog/how-to-write-good-multiple-choice-questions). What is particular to a multi-step competency item is where those mistakes live: at the joints of the chain. Every step is a place to stop early, and each stopping point is an option whose value you can compute - work the problem the wrong way on purpose, once per joint, and the distractors write themselves. The payoff comes after the test: when the analytics name the wrong option the largest group chose, you are looking at one identifiable step the class did not take, which is a single explanation on Monday rather than a re-teach.",
    },
    {
      type: "quote",
      text: "A good distractor is not a wrong answer. It is one specific mistake, written down, so you can count how many students made it.",
    },
    {
      type: "h2",
      text: "A Worked Example in Science",
    },
    {
      type: "p",
      text: "Take Class 10 electricity. The recall version names everything: state the relationship between power, voltage and current, then find the current a 1000 W appliance draws on a 220 V supply. The student plugs in and divides.",
    },
    {
      type: "p",
      text: "The competency version: a household supply is 220 V, protected by a 15 A fuse. A family switches on a 2000 W geyser, a 1500 W iron, a 60 W bulb and a 75 W fan together on a winter morning. Ask three things. Will the fuse blow? To run the geyser and the iron together, what is the minimum standard fuse rating they would need? And if they fit a 30 A fuse to stop the nuisance tripping, what risk have they introduced?",
    },
    {
      type: "p",
      text: "Nothing in that stem names the power equation. The student has to see that total power matters, convert to current, compare against a rating, then reason about why a fuse exists at all. That third part separates understanding from arithmetic, and it is the easiest one to leave out. It costs a sentence and carries most of the competency.",
    },
    {
      type: "h2",
      text: "A Worked Example in Maths",
    },
    {
      type: "p",
      text: "Class 10 arithmetic progressions. The recall version: the first term of an AP is 20 and the common difference is 3; find the sum of the first 12 terms. Told it is an AP, told both parameters, told what to compute.",
    },
    {
      type: "p",
      text: "The competency version: a school is building a stepped auditorium. The front row seats 20 students and each row behind it seats 3 more than the row in front. The school expects 240 students. What is the smallest number of rows that seats everyone, and how many seats stay empty in the last row? The student has to recognise the AP, see that it is the sum and not the nth term, solve for n, then deal with n not coming out whole. Seven rows seat 203 and leave 37 standing; eight rows seat 244, so the answer is eight rows with four seats empty. The rounding and the spare capacity are the competency - the quadratic is the easy half. They are also where the distractors come from: the nth term instead of the sum, the row count rounded down, the empty seats measured against the wrong row.",
    },
    {
      type: "h2",
      text: "How Much of the Paper Should Be Competency-Based",
    },
    {
      type: "p",
      text: "This has a real answer, and it is not in a blog post - including this one. The share is the board's to set, it is not the same for every class and subject, and an article has no way of knowing which version of it governs the paper you are writing. A percentage that was right when it was typed is not evidence that it is right now.",
    },
    {
      type: "p",
      text: "So go to the source. Open the current sample question paper and marking scheme the board publishes for your class and subject, count the item types yourself, and build your internal tests to that split. One sitting a year, and it is the only count that cannot go stale on you. If your class sits the boards this cycle, share the count alongside a [Class 10 board preparation plan](/blog/cbse-class-10-board-exam-preparation).",
    },
    {
      type: "h2",
      text: "Putting the Paper Together Online",
    },
    {
      type: "p",
      text: "A case-based set wants its source visible while the student answers, and a multi-step MCQ wants to be read without a photocopier smudge. On MockSetu a question carries its own reading passage - beside the stem on a laptop, stacked above it on a phone - with LaTeX mathematics rendered through KaTeX, images and image options, and single-correct, multi-correct, numeric or text answers per question. One thing to know first: the passage belongs to the question, not to a group of them, so each sub-question in a set carries its own copy of the source - paste it into each, or snip it out of your PDF as an image.",
    },
    {
      type: "ul",
      items: [
        "Create the exam with a name, category and your own instructions, then a section per question type, each with its own time.",
        "Set marks for correct, wrong and unattempted per question. On a multi-correct item, pick part marks or all-or-nothing and whether the penalty is charged once or per wrong option.",
        "If the paper exists as a document, run MockSetu's extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI tool you use and upload the JSON. Numeric, TITA and match-the-column items stay manual.",
        "Preview end to end before publishing - a creator preview records nothing, so you can sit your own paper and check every source reads on a phone.",
      ],
    },
    {
      type: "p",
      text: "Then know the limits. There is no question shuffling or option randomisation, so if two students sit side by side, stagger the slot or supervise it. There is no webcam proctoring, no lockdown browser and no tab-switch detection. And a published paper is public - anyone can attempt it, with no paywall and no attempt limit. Fine for a weekly unit test, not for a paper you mean to reseal next year. Still choosing a tool? Compare the options in [free online test makers for school teachers](/blog/free-online-test-maker-for-school-teachers).",
    },
    {
      type: "h2",
      text: "Reading the Results Without Guessing",
    },
    {
      type: "p",
      text: "MockSetu's creator analytics are aggregated. Every question carries an accuracy figure and an average time - both counted over every sitting that reached the question, not only the students who answered it. The rest comes as short lists rather than a column against each item: the five most skipped questions, and the five that drew the most wrong answers, each naming the single wrong option the largest group chose - the distractor doing the work, though not how the rest of the wrong answers split. For the full option-by-option picture, run the paper as a live exam, where the answer bars show how the room divided. Students join a live room with a code after signing in once.",
    },
    {
      type: "p",
      text: "For a competency paper that grain is the right one: a sub-question that took four minutes and lost most of the class tells you the concept did not transfer. Apart from a top-three leaderboard of usernames, the page names nobody, and there are no per-student report cards and no CSV or Excel export, so a named mark sheet stays in your own register. One thing to settle before you publish: every sitting is graded against the answer key as it stood at submission and the verdict is stored, so correcting a mis-keyed assertion-reason item afterwards does not re-score the attempts already recorded. More on running these as routine assessments in [online unit tests in a school classroom](/blog/how-school-teachers-can-create-online-unit-tests).",
    },
    {
      type: "h2",
      text: "Start With Six Questions, Not Sixty",
    },
    {
      type: "p",
      text: "Do not convert a whole question bank. Write six competency items for one chapter you teach well - a case-based set of three, two assertion-reason, one multi-step MCQ - and run them as a 20-minute test. Then ask whether the way the class split told you anything you did not already know. If it did, scale a chapter at a time. If it did not, the context was decoration, so rewrite rather than add. Judging what is worth asking takes a term; the format is the easy part. The [guide for teachers creating exams on MockSetu](/for-creators) walks through the setup end to end, free and with no card.",
    },
  ],
  faqs: [
    {
      question: "What is a competency-based question in CBSE?",
      answer:
        "It is a question that places a concept the student has learned into an unfamiliar situation and asks them to apply it, rather than reproduce it. Three conditions have to hold: the context is new, the stem does not name the formula or law the student should use, and the information in the stem is actually needed to answer. The quick test is to delete the context sentence - if the question still works, it was a recall item wearing a story.",
    },
    {
      question: "What is the difference between a competency-based question and a hard question?",
      answer:
        "Difficulty and competency are independent. A long multi-step calculation printed under a chapter heading is hard recall, because the student was told which concept to use. A single-line question can be fully competency-based if the student has to work out for themselves which concept applies. What matters is who decides the method, not how much arithmetic follows.",
    },
    {
      question: "How many competency-based questions should a CBSE paper have?",
      answer:
        "The board sets the share, and it is not the same for every class and subject, so a figure quoted in an article cannot tell you what governs your paper. Open the current sample question paper and marking scheme the board publishes for your class and subject, count the item types yourself, and build your internal tests to that split. Repeat the count once a year, before you write the first paper of the session.",
    },
    {
      question: "How do I write good assertion-reason questions?",
      answer:
        "Build the item around the explanation relationship, not around two true sentences from the same paragraph. The most useful version has both statements true while the reason given is not actually the reason - a student who memorised two facts and a student who understands the mechanism then choose different options. Keep each statement to one clause, and never make an assertion false through a technicality the chapter never covered.",
    },
    {
      question: "Can I deliver competency-based questions as an online test?",
      answer:
        "Yes. A case-based set needs the source visible while the student answers, which an online test handles better than a photocopy. On MockSetu a question can carry its own reading passage - shown beside the stem on a laptop and above it on a phone - with LaTeX mathematics, images and image options, and you can snip a source straight out of a PDF as an image rather than retyping it. The passage sits on the question rather than on a group of them, so each sub-question in a set carries its own copy of the source. Set marks for correct, wrong and unattempted answers per question, give each section its own clock, and preview the whole paper yourself before publishing - a creator preview records nothing.",
    },
  ],
};

export default post;
