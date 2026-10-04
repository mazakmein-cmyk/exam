import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-write-good-multiple-choice-questions",
  title: "How to Write Good Multiple-Choice Questions",
  metaTitle: "How to Write MCQ Questions: A Craft Guide | MockSetu",
  metaDescription:
    "A practical guide to writing MCQ questions: a stem that carries the question, one defensible answer, distractors built from real student mistakes, and even options.",
  keywords:
    "how to write mcq questions, how to write good multiple choice questions, mcq writing tips, writing distractors for mcq, multiple choice question design, item writing for teachers, how to frame mcq options, common mcq writing mistakes",
  excerpt:
    "A good multiple-choice question can be answered from the stem alone, has exactly one defensible key, and offers three wrong options that real students actually pick. Here is how to write one, and how to fix one that is already broken.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a teacher
    // writing questions to the student library instead.
    "For Creators",
    "Question Writing",
    "assessment design",
    "item writing",
    "test quality",
    "teaching craft",
  ],
  hero: {
    eyebrow: "Question Writing Craft",
    h1: "How to Write Good Multiple-Choice Questions",
    lede: "A good MCQ can be answered before the options are read, has exactly one key you could defend to a parent, and three wrong options that real students actually choose. Everything else is decoration.",
  },
  content: [
    {
      type: "p",
      text: "A good multiple-choice question does three things. The stem states the whole question, so a student who knows the topic could write the answer on a blank sheet before reading an option. There is exactly one answer you could defend in writing to a parent who disagrees. And the wrong options are not filler - each is where a real student lands by making a nameable mistake. Clear those three bars and little else matters; fail one and no formatting saves the question.",
    },
    {
      type: "p",
      text: "The rest is detail. If the shape of the paper is not settled - how many questions, which sections, what clock, what marking - settle it first; the [paper setter's format reference](/blog/mock-test-format-for-competitive-exams-reference) is the checklist to fill before you write a single item. Writing questions without it is how papers end up with eleven on one chapter and none on another.",
    },
    {
      type: "h2",
      text: "The Stem Must Carry the Whole Question",
    },
    {
      type: "p",
      text: "Cover the options with your hand and read only the stem. Can a competent student answer it? If not, the stem is incomplete and the options are doing work they should not be doing. It is the cheapest check in the craft.",
    },
    {
      type: "p",
      text: "A common failure is the open-ended stem: which of the following is true about enzymes? That is not a question, it is a category heading. The student cannot think until all four options are read, so the item tests option-scanning. Make it closed: what happens to the rate of an enzyme-catalysed reaction when the temperature is raised past the optimum? Now the student answers from knowledge.",
    },
    {
      type: "p",
      text: "A second failure hides the task inside the options. If the options are four equations and the stem says only Consider the circuit shown, the student is reverse-engineering what you want. Say it: find the current through the 4-ohm resistor. Anything repeated in every option belongs in the stem.",
    },
    {
      type: "quote",
      text: "If a student has to read all four options to work out what you are asking, you have written a puzzle about your question, not a question about your subject.",
    },
    {
      type: "h2",
      text: "One Defensible Answer, Not One Best-Sounding Answer",
    },
    {
      type: "p",
      text: "Write the key first, then the justification in one sentence, then the options. If you cannot say in one sentence why the key is right and each other option wrong, the question is not ready. That sentence protects you when a sharp student challenges the key two days later, as one always does.",
    },
    {
      type: "p",
      text: "Watch the word best. Which of the following is the best explanation invites an argument unless the other three are demonstrably wrong rather than merely weaker. If one of two defensible options is only slightly better, you have written a discussion prompt. Add a constraint that kills the near-miss, or make it multi-correct.",
    },
    {
      type: "p",
      text: "Absolutes leak both ways. Always, never, all and only usually mark an option false; usually, generally and often mark one true, and experienced test-takers know it. If three options say always and the key says generally, a student who knows nothing still gets it right, and you have measured test-wiseness instead of chemistry.",
    },
    {
      type: "h2",
      text: "Distractors Come From Real Mistakes, Not From Filler",
    },
    {
      type: "p",
      text: "A distractor earns its place only if some group of students will choose it for a nameable reason. Do not invent them at the desk - take them from wrong answers students have already given you. Old marked scripts, the board work where half the class went wrong, the doubt three students asked in a row: that is your distractor bank. The deliberately silly option never belongs there; it turns a four-option question into a three-option one and hands a guesser one chance in three instead of one in four. The sources that do work:",
    },
    {
      type: "ul",
      items: [
        "The sign error, the dropped factor, the slipped decimal. If the answer is 0.25 A, then -0.25 A, 0.5 A and 2.5 A are all live.",
        "The adjacent concept: speed where you asked for velocity, median where you asked for mode. Half-knowledge reaches for the neighbour.",
        "The partial procedure: the value you get by stopping one step early, before dividing by two or taking the root.",
        "The textbook phrase that sounds right: a definition from a neighbouring chapter, worded like the correct one.",
      ],
    },
    {
      type: "h2",
      text: "Why All of the Above and None of the Above Weaken a Question",
    },
    {
      type: "p",
      text: "All of the above is beatable without full knowledge. A student certain of two of the three listed statements can select it with confidence, so the item stops telling partial knowledge from complete. It also tends to be the key, because writers reach for it when they run out of distractors, and students learn that pattern fast.",
    },
    {
      type: "p",
      text: "None of the above has the opposite problem. When it is the key, the student has shown only that they could reject three options, not that they could produce the answer. When it is not, it is dead weight. The one narrow case is a computational item where you want to block working backwards - and even there it must sometimes be correct, or it becomes a tell.",
    },
    {
      type: "h2",
      text: "Keep the Options Even: Length, Grammar and Order",
    },
    {
      type: "p",
      text: "How many options to write is a separate decision, settled in the guide to [creating an MCQ test online](/blog/how-to-create-an-mcq-test-online); this section is about the ones you have chosen. The oldest tell in the trade: the longest option is the answer. Writers add qualifiers to the option they want to be correct and hedge nothing in the ones they wrote quickly. Count the words. If the key is longest, cut it back - move the qualifier into the stem, where it binds every option at once. Never pad the others: filler is the same fault in reverse.",
    },
    {
      type: "p",
      text: "Grammar leaks the same way. If the stem ends with an article and only one option fits it, you have handed the answer to anyone reading carefully. Avoid stems that break off mid-sentence for an option to complete; whole questions with whole options also translate better if you run the paper in English and Hindi. Order numerical options ascending so the key stops drifting to B or C - and note there is no option shuffling, so the order you write is the order every student sees.",
    },
    {
      type: "h2",
      text: "Negatives, Double Negatives and Questions Nobody Misread",
    },
    {
      type: "p",
      text: "A negative stem - which of the following is NOT a property of - costs every student re-reading time and costs the careless ones the mark outright, whether or not they knew the content. Sometimes it probes a concept better than anything else; when it does, capitalise the negative word and keep such items to one or two in a paper.",
    },
    {
      type: "p",
      text: "A double negative is never justified. Which of the following is not untrue is a reading comprehension test in a physics costume, and so is a negative stem over options that contain negatives themselves. A positive rewrite is always available: invert the key and swap it with a distractor.",
    },
    {
      type: "h2",
      text: "Test Understanding, Not Reading Speed",
    },
    {
      type: "p",
      text: "A hard question asks a student to apply something in an unfamiliar situation. A long one asks them to pull three numbers out of a paragraph of narrative before the thinking starts. Both lower the average score; only one tells you anything. Strip a stem to its numbers: if it becomes easy, the difficulty was in the prose. The target either way is a new setting, a low reading load, a clear ask, clean options - which is also the brief behind [competency-based questions on the CBSE pattern](/blog/competency-based-questions-for-the-cbse-pattern).",
    },
    {
      type: "p",
      text: "It also helps to read your paper from the other side of the desk. Students are taught to triage, eliminate, skip and return, and an item that rewards those tactics over knowledge will be beaten by them. [How students chase accuracy under time pressure](/blog/how-to-improve-accuracy-in-mcq-exams) is a fast audit: anything a trained guesser can crack without the content needs a rewrite.",
    },
    {
      type: "h2",
      text: "A Weak Question, Rewritten",
    },
    {
      type: "p",
      text: "Here is the kind of question that turns up in internal test papers. Stem: which of the following is not untrue about the stopping potential in a photoelectric experiment? Option A, it increases with the intensity of incident light. Option B, it depends only on the frequency of the incident light and the work function of the metal, and not at all on how bright the source is. Option C, it is always zero. Option D, none of the above.",
    },
    {
      type: "p",
      text: "Count the faults. The stem is a double negative and carries no question, so nothing can be answered before the options are read. Option B is three times longer than any other and the only one hedged and precise, so a student who never studied the photoelectric effect will still pick it. Option C is filler and Option D does nothing, which leaves a two-option question measuring test-wiseness and English reading.",
    },
    {
      type: "p",
      text: "Now the rewrite. Stem: in a photoelectric experiment the intensity of the incident light is doubled while its frequency is held constant; what happens to the stopping potential? Options: A, it doubles. B, it halves. C, it stays the same. D, it rises, but not to double.",
    },
    {
      type: "p",
      text: "The stem is positive, complete and answerable with the options covered. The key is C, and the justification is one sentence: stopping potential is fixed by the maximum kinetic energy of the photoelectrons, which depends on photon energy and work function, neither of which changes with intensity. Every distractor is a real misconception - A conflates brightness with photon energy, B is the reflex inverse guess, D is the student who senses intensity must matter and hedges. Same content, different measurement.",
    },
    {
      type: "h2",
      text: "The Pre-Publish Pass: Nine Checks Per Question",
    },
    {
      type: "p",
      text: "Run this over every question before the paper goes out. It is slow the first time and quick once it is habit, and it catches the faults students would otherwise catch for you afterwards, loudly.",
    },
    {
      type: "ul",
      items: [
        "Cover the options. If the stem cannot be answered from knowledge alone, move content out of the options into the stem.",
        "Write the one-sentence justification for the key. If you cannot, the key is not safe.",
        "Name the mistake behind each distractor out loud. Any you cannot name gets replaced.",
        "Count the words. Trim the key until it is not the longest - never pad the others.",
        "Delete every All of the above and almost every None of the above.",
        "Scan for always, never, all, only, usually and generally, and check they are not clustered on one side of the key.",
        "Remove negatives from the stem, or capitalise the one negative word the question needs.",
        "Put numerical options in ascending order, and check the key is not parked in B or C more often than chance.",
        "Read the stem aloud. Anything you stumble over, a student under a timer stumbles over worse.",
      ],
    },
    {
      type: "h2",
      text: "Find Out Which Questions Actually Worked",
    },
    {
      type: "p",
      text: "Writing is half of it. The other half is the feedback loop, and it is the easy half to skip when the evidence sits in a pile of marked scripts. Two signals tell you nearly everything: a distractor almost nobody picked was never really one, and a question the fast students got wrong more often than the slow ones is usually ambiguous rather than hard.",
    },
    {
      type: "p",
      text: "If you run your papers on MockSetu, the creator analytics give you three things per question: the class accuracy, the average time spent, and the one wrong option the largest group chose. Those three are aggregates - there is no per-student report card, though the same page does carry a top-three leaderboard by username. The winning wrong option names the distractor doing the work, but not how the rest of the wrong answers split. For the option-level picture, run the paper live: the answer bars show how the room divided across every option, and the report adds median answer time per question and a fast-or-slow against right-or-wrong split, the quickest way to tell a misread question from an unknown one. A live room is not the no-account route a published mock is - students join with a code after signing in once. One warning before you lean on any of it: a verdict is stamped when the answer is handed in, so fixing a wrong key afterwards does not re-score the attempts already recorded. Catch the key in the pre-publish pass, not in the report. It is free, no card; the rest is on the [MockSetu page for creators](/for-creators).",
    },
    {
      type: "p",
      text: "One honest caveat: writing good questions is slow, and no tool fixes that. Bulk import moves a finished set onto a platform fast - MockSetu's route is a JSON file you generate yourself with the published extraction prompt in the [JSON upload guide](/json-upload-guide) - but it moves questions, it does not improve them. Nothing here writes questions from a syllabus, and nothing grades a subjective answer. Once the questions are checked, [turning them into a working MCQ test online](/blog/how-to-create-an-mcq-test-online) is the easy part, and [the full timed mock build](/blog/how-to-create-an-online-mock-test) follows. Time spent on the stem and the distractors decides whether the paper tells you anything.",
    },
  ],
  faqs: [
    {
      question: "How do I write MCQ questions that are not just recall?",
      answer:
        "Put the student in a situation they have not seen and ask them to apply something they have. A recall item asks what the formula is; an application item gives a short scenario and asks what happens to one quantity when another changes. Keep the reading load low while you do it, or you will have measured reading speed instead of understanding.",
    },
    {
      question: "Why should I avoid All of the above in multiple-choice questions?",
      answer:
        "It is beatable on partial knowledge: a student sure of two of the three listed statements can pick it safely, so the item stops telling partial knowledge apart from full. Writers also reach for it when they have run out of distractors, which tends to make it the key and teaches students to watch for it. Reaching for it is a sign you are one distractor short.",
    },
    {
      question: "How do I come up with good distractors?",
      answer:
        "Do not invent them at the desk. Take them from errors students have already made: sign and decimal slips, the adjacent concept (speed when you asked for velocity), the value you get by stopping one step early, and definitions from a neighbouring chapter worded convincingly. Old marked scripts and repeated doubts are the richest source. A distractor you cannot name a specific mistake for is filler.",
    },
    {
      question: "How can I tell whether a question I wrote was any good?",
      answer:
        "Two signals matter after the test. A distractor almost nobody chose never functioned as one and should be rewritten before you reuse the question. And when the students who answered fast did worse than the ones who took longer, the item is usually ambiguous rather than difficult, so the stem needs fixing. On MockSetu the standard creator analytics give per-question accuracy, average time and the single most-chosen wrong option; the full option-level split and the fast-or-slow against right-or-wrong view come from running the paper as a live exam.",
    },
    {
      question: "Should I use negative stems like which of the following is NOT true?",
      answer:
        "Sparingly, and never doubled. A negative stem costs every student re-reading time and costs the careless ones the mark whether or not they knew the content, so keep it to the question or two where the negative framing genuinely probes the concept better - and capitalise the negative word so it cannot be skimmed past. A double negative has no legitimate use: invert the key, swap it with a distractor, and ask the question positively.",
    },
  ],
};

export default post;
