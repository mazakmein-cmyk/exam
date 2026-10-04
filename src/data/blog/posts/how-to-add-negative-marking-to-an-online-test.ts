import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-add-negative-marking-to-an-online-test",
  title: "How to Add Negative Marking to an Online Test (per Question, per Section)",
  metaTitle: "Negative Marking in an Online Test: How to Set It | MockSetu",
  metaDescription:
    "Set negative marking per question or per section: marks for right, wrong and blank, multi-correct part marks, penalty once or per option, and rounding.",
  keywords:
    "negative marking online test, how to add negative marking, negative marking per section, partial marking multi correct, marking scheme online exam, set marks per question, part marks rounding, online test marking scheme india",
  excerpt:
    "Negative marking is three numbers per question, not a switch. Here is how to set them, how to give one paper two different rules, and when a penalty is just cruelty.",
  publishedAt: "2026-09-26",
  updatedAt: "2026-09-26",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Marking & Timing",
    "negative marking",
    "question paper setting",
    "exam scoring",
    "SSC",
  ],
  hero: {
    eyebrow: "Marking & Timing",
    h1: "How to Add Negative Marking to an Online Test (per Question, per Section)",
    lede: "Three numbers per question - right, wrong, blank - and one paper can carry two completely different rules. Here is how to set them before anyone sits the paper, because nothing re-scores an attempt afterwards.",
  },
  content: [
    {
      type: "p",
      text: "Negative marking is not a switch you flip on a test. It is three numbers you set on a question: what a right answer is worth, what a wrong answer costs, and what leaving it blank costs. Because they live on the question rather than on the paper, one test can hold two different rules at once - a qualifying section where a guess is free, and a merit section at minus one, inside the same ninety questions. That is the part the word \"switch\" hides.",
    },
    {
      type: "p",
      text: "This is the how-to for the person building the paper. For the other side of it - whether a student should guess when the penalty is minus one - read the [negative marking strategy guide](/blog/negative-marking-strategy). For the schemes the big Indian exams actually use, written for a paper setter rather than a candidate, see [negative marking schemes of Indian exams](/blog/negative-marking-schemes-of-indian-exams-for-paper-setters).",
    },
    {
      type: "h2",
      text: "The Three Numbers Behind Every Marking Scheme",
    },
    {
      type: "p",
      text: "The marks panel opens on exactly three values. Right answer: what the question is worth. Wrong answer: what a wrong pick costs, left at zero when you want no negative marking at all. Left blank: what skipping costs, almost always zero. You type the penalties as positive numbers and the editor shows them back with a minus sign, so plus four and minus one can never be confused at a glance. Neither penalty can exceed what the question is worth.",
    },
    {
      type: "p",
      text: "A row of four presets sets all three numbers in one tap - plus one with no penalty, plus one with minus 0.25, plus two with minus 0.5, and plus four with minus one, which the panel labels JEE / NEET style. Anything else you type yourself. Decide the scheme from the bulletin of the exam you are mirroring before you open the panel, rather than picking the preset that looks about right.",
    },
    {
      type: "p",
      text: "The blank penalty deserves a warning of its own. Charging for an unattempted question turns every unread question into a forced guess, the opposite of what a diagnostic wants. Leave it at zero unless the bulletin you are reproducing specifies one.",
    },
    {
      type: "h2",
      text: "Where the Rule Lives: Exam, Section, or Question",
    },
    {
      type: "p",
      text: "Marks resolve down a chain: a question uses its own rule if it has one, otherwise its section's, otherwise the exam default. Any question that is not simply following the exam default says so on its row - \"from section\", \"own rule\", or a \"custom\" chip when its own numbers actually read differently from what it would have inherited. An unlabelled row is the exam default, which is the silent baseline. One consequence is expensive and easy to miss: giving a question its own rule pins it, and it keeps that rule after you change the exam default later - what you want when you meant it, quietly wrong when you did not. So build order matters more than the settings do.",
    },
    {
      type: "ul",
      items: [
        "Set the exam default first, using whatever scheme the largest number of questions should follow.",
        "Override at section level only where a whole section genuinely differs - a qualifying section, a numerical section with its own penalty.",
        "Override at question level only for the handful that differ from their own section. Every pinned question is one more thing to remember in six months.",
        "If you change the exam default late in the build, re-check anything you pinned earlier. It will not follow.",
      ],
    },
    {
      type: "h2",
      text: "A Worked Example: One Paper, Two Negative Marking Rules",
    },
    {
      type: "p",
      text: "SSC MTS is the cleanest case for why per-question marks matter. The paper runs 90 questions for 270 marks - three marks a question - across two sessions of 45 minutes each. Session I is qualifying only and carries no negative marking; Session II counts for merit and deducts one mark for a wrong answer. A tool that sets one scheme for the whole test cannot reproduce that paper. It reproduces something that looks like it and scores wrongly, and the student practises the wrong instinct without ever finding out.",
    },
    {
      type: "p",
      text: "Built properly it is two sections and two rules.",
    },
    {
      type: "ul",
      items: [
        "Create the exam, then create two sections - Session I and Session II - with 45 minutes each.",
        "Set the exam default to plus three, minus one, blank zero - the Session II rule, and the one you want a new question to inherit by accident.",
        "Override Session I to plus three, minus zero, blank zero.",
        "Leave Session II with no override. It follows the exam default, which is already correct - one fewer rule to maintain.",
        "Set section switching deliberately, and check the current bulletin for whether a candidate may return to an earlier session - that is what your setting has to match.",
        "Write it into the instructions in those words: no penalty in Session I, minus one in Session II.",
      ],
    },
    {
      type: "p",
      text: "The same shape covers a lot of real papers. [JEE Main](/mock-test/jee-main) happens not to need it - Section A and Section B both run plus four and minus one on compulsory questions since the 2025 cycle, so one exam default does the whole paper - but a school test with an objective half and a numerical half usually does.",
    },
    {
      type: "quote",
      text: "Negative marking is not a difficulty setting. It is a price on guessing - and if the exam you are mirroring does not charge that price, you have no business charging it either.",
    },
    {
      type: "h2",
      text: "Multi-Correct Questions: Part Marks or All or Nothing",
    },
    {
      type: "p",
      text: "A question with more than one right answer needs a fourth decision, because correct stops being a yes or a no. All or nothing pays full marks when every correct option is ticked and nothing wrong is, pays zero when some correct options are missed and nothing wrong is ticked, and charges the penalty the moment a wrong option appears. Part marks pays a share of the question for each correct option found - on the same condition that nothing wrong was ticked.",
    },
    {
      type: "p",
      text: "That last clause is the one paper setters get wrong when they explain it to a class. Part marks are not a sliding scale netting right picks against wrong ones; they reward an incomplete but clean answer. Tick three of four correct options and you take three quarters of the marks. Tick those same three plus one wrong option and you take the penalty, not three quarters minus something. Put that sentence in the instructions word for word.",
    },
    {
      type: "h2",
      text: "Penalty Once, or Once per Wrong Option",
    },
    {
      type: "p",
      text: "With part marks on, you also choose how the wrong-answer penalty is charged. Once means a single deduction however many wrong options were ticked. Per wrong option multiplies the deduction by the number of wrong picks, capped so a question can never cost more than it is worth. On a four-mark question with a two-mark penalty, one wrong pick costs two under either setting; three wrong picks would come to six under per-option charging, and the cap holds the deduction at four.",
    },
    {
      type: "p",
      text: "Choose once unless you have a specific reason not to. Per-option charging punishes the student torn between two plausible options harder than the one who stabbed blindly at a single answer, inverting what the paper setter intended. If you use it, say so explicitly, because no student assumes it.",
    },
    {
      type: "h2",
      text: "Rounding Part Marks: Down, Nearest, Up, Exact",
    },
    {
      type: "p",
      text: "Part marks produce fractions, and fractions need a rule. Take a four-mark question with three correct options: each one found is worth 4 divided by 3, or 1.3333 and onwards. Three of the four modes round to two decimal places - down gives 1.33, nearest 1.33, up 1.34 - while exact does not round the question at all and keeps 1.3333. The paper total is settled to two decimals whichever mode you pick, so exact does not escape rounding; it only moves it to the end, onto the sum, instead of question by question. The modes separate at the second decimal, which is why nobody notices the setting until a total looks a mark off.",
    },
    {
      type: "p",
      text: "The advice here is boring and correct: choose down, for the whole paper. Down and exact are the only two modes that can never round a question's marks up, and down is the one that also keeps the totals tidy - what you want when a parent asks why a score does not add up. Exact is defensible on an internal diagnostic where the total is never printed next to a cutoff; up is hard to justify to anybody.",
    },
    {
      type: "h2",
      text: "Say the Scheme Out Loud Before the Clock Starts",
    },
    {
      type: "p",
      text: "A marking scheme the student discovers from the score report is a marking scheme you set unfairly. The instructions page carries a table of the paper, but a table does not replace one plain sentence per section in the general instructions, in the language the student reads. MockSetu does warn when the stored instructions stop describing the paper - but know what it checks: the timing claims, and the section and question counts. It does not check marks. Change a penalty after the instructions are written and nothing fires at all - not the drift warning, and not even the softer nudge about saving an exam without touching its instructions, because that nudge is set by the exam-details save and the marks panel saves on its own. Re-read that marking sentence by hand every time you touch the panel.",
    },
    {
      type: "p",
      text: "If you later find the answer key itself was wrong on a question, fix the key rather than the scheme - and fix it fast. Marks are worked out at the moment a paper is submitted and stored on that attempt, so correcting a key changes what the next student scores and not what the ones who already sat it scored. Nothing re-scores a completed attempt for you. On a published paper a wrong key is only ever half-fixable, which is the whole argument for checking it before you share the link.",
    },
    {
      type: "h2",
      text: "When Negative Marking Helps, and When It Is Just Cruelty",
    },
    {
      type: "p",
      text: "Negative marking does exactly one useful thing: it puts a price on a blind guess, so the score reflects what a student knows rather than how fast they can tick. That is worth having when the paper is a rehearsal for a negatively marked exam. A JEE Main mock without minus one is not a mock - it inflates the score and teaches a candidate that a wild attempt costs nothing, when on the real paper it costs a mark every time.",
    },
    {
      type: "p",
      text: "It helps almost nowhere else. On a chapter test, a unit test, or a diagnostic run to find out what to teach on Monday, a penalty suppresses exactly the attempts that would have shown you where the confusion sits. The quiet student who would have half-remembered Ohm's law leaves it blank instead, and you learn nothing about them. Some genuine exams carry no penalty at all - check the bulletin of the one you are mirroring, and if it charges nothing, mirror that with a zero in the wrong-answer box, not a token minus 0.25 because a penalty feels more serious.",
    },
    {
      type: "h2",
      text: "What a Marking Scheme Cannot Do for You",
    },
    {
      type: "p",
      text: "A penalty is not an integrity control, and it is worth saying so plainly. There is no webcam or AI proctoring here, no lockdown browser, no tab-switch detection, no question shuffling and no cap on attempts, so negative marking will not stop a determined student looking an answer up mid-question. Published papers are public: anyone with the link can attempt them, and there is no private or paid delivery to one batch. Per-question analytics come back as counts across everyone who attempted the question - how many got it right, how many got it wrong, and which wrong option was picked most often, never who picked it - so nothing there hands you a list of who guessed; the only names on that page are the usernames on the top-three leaderboard. Set a penalty because it makes the score honest for an honest student, not because you expect it to police anyone.",
    },
    {
      type: "h2",
      text: "The Pre-Publish Checklist",
    },
    {
      type: "p",
      text: "This list is cheaper than explaining a wrong total to forty students.",
    },
    {
      type: "ul",
      items: [
        "Open one question in each section, confirm which rule it is following, and confirm every pinned override is one you meant.",
        "Each multi-correct question has a mode chosen - part marks or all or nothing - and the penalty-charging and rounding settings are consistent across the whole paper.",
        "The scheme is written into the general instructions in words, section by section, in every language you are publishing in.",
        "Preview the exam yourself and sit a few questions. A creator preview records nothing.",
        "Read the projected total in the marks panel header - it adds the per-question marks up for you - and confirm it matches the total you are advertising.",
      ],
    },
    {
      type: "h2",
      text: "Building the Paper Around the Scheme",
    },
    {
      type: "p",
      text: "Marks are the last thing you set and the first thing a student notices. The order that works is: create the exam and its sections with their own clocks, get the questions in, then set marks from the exam default downwards. [How to create an online mock test](/blog/how-to-create-an-online-mock-test) walks that end to end, and [how to create an MCQ test online](/blog/how-to-create-an-mcq-test-online) covers the question editor itself. If the paper already exists as a PDF, the bulk route is JSON: run MockSetu's extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI you already use and upload the output, remembering that the importer leaves numeric, TITA and match-the-column questions for you to add by hand. A general-purpose form builder has no equivalent of this panel.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, pooled timing groups, bilingual papers, a listing in the public library - sits behind one account, and the marks panel described here is on every exam you make.",
    },
  ],
  faqs: [
    {
      question: "How do I add negative marking to an online test?",
      answer:
        "Set three numbers on the question: marks for a right answer, marks taken away for a wrong one, and marks taken away for leaving it blank. On MockSetu you set a default for the whole exam, then override it on any section or any individual question that differs. For no negative marking, leave the wrong-answer value at zero. Leave the blank value at zero too, unless the bulletin of the exam you are reproducing specifies a penalty for an unattempted question.",
    },
    {
      question: "Can one online test have negative marking in one section and not another?",
      answer:
        "Yes, because the marking rule lives on the question rather than on the paper. SSC MTS is the standard example: 90 questions for 270 marks across two 45-minute sessions, where Session I is qualifying with no penalty and Session II counts for merit with minus one. Build it as two sections, set the exam default to plus three and minus one, then override the Session I section to a zero penalty and leave Session II to inherit.",
    },
    {
      question: "How does partial marking work on a multi-correct question?",
      answer:
        "In part-marks mode a student earns a share of the question for each correct option they tick, but only if they tick nothing wrong. Tick three of four correct options and you get three quarters of the marks; tick those three plus one wrong option and you get the penalty instead, not a netted figure. The alternative mode is all or nothing, where full marks require every correct option and nothing wrong, and a partly right answer with nothing wrong scores zero.",
    },
    {
      question: "What rounding should I use for part marks?",
      answer:
        "Down, for the whole paper. Part marks produce fractions - a four-mark question with three correct options pays 1.3333 per option found - and the modes differ at the second decimal: down gives 1.33, nearest 1.33, up 1.34, and exact does not round the question at all, keeping the full value, though the paper total is settled to two decimals whichever mode you pick. Down and exact are the only two that can never round a question up, and down is the one that also keeps the totals tidy. Use a single mode across the entire exam.",
    },
    {
      question: "Should a school unit test or chapter test have negative marking?",
      answer:
        "Usually not. A penalty is useful when the paper is a rehearsal for a negatively marked exam, because it prices blind guessing the way the real exam will. On a chapter test or a diagnostic it only suppresses the attempts that would have told you where the class is confused. And if the exam you are mirroring charges no penalty - check its current bulletin - your mock should charge none either, because matching the real scheme matters more than making the paper feel strict.",
    },
  ],
};

export default post;
