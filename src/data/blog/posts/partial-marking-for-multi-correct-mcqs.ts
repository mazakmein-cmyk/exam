import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "partial-marking-for-multi-correct-mcqs",
  title: "Partial Marking for Multi-Correct MCQs: How to Set It Up",
  metaTitle: "Partial Marking for Multi-Correct MCQs: Setup | MockSetu",
  metaDescription:
    "Part marks or all or nothing, the penalty charged once or per wrong option, and four rounding modes - with one worked example scored all the way through.",
  keywords:
    "partial marking setup, partial marking multi correct, multi correct mcq scoring, msq partial credit, part marks rounding, all or nothing marking, multiple correct question marking scheme, online test marking india",
  excerpt:
    "Part marks are the default the moment a paper carries a marking scheme, and they are not a net score. Here is what each setting does, what it teaches a student about partial knowledge, and one example scored right through.",
  publishedAt: "2026-10-26",
  updatedAt: "2026-10-26",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Marking & Timing",
    "partial marking",
    "multi-correct questions",
    "exam scoring",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Marking & Timing",
    h1: "Partial Marking for Multi-Correct MCQs: How to Set It Up",
    lede: "Three settings in one collapsed row decide what a partly right answer is worth - and every marking scheme you have ever saved here already has all three set to something.",
  },
  content: [
    {
      type: "p",
      text: "Partial marking for a multi-correct question is three settings in one collapsed row of the marks panel: whether a partly right answer earns part marks or nothing, whether the penalty is charged once or once per wrong tick, and how the fractions are rounded. Part marks, a single flat penalty and rounding down are the defaults: every marking scheme saved here starts on all three, whether it is the exam default, a section override or a rule on one question. If you have never opened that row, that is what your multi-correct questions are doing. The exception is a paper carrying no marking scheme anywhere, which is unscored - every question awards zero, and the publish dialog warns about that rather than stopping you.",
    },
    {
      type: "p",
      text: "The three numbers underneath every scheme - right, wrong, blank - are covered in [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test). For the student's side of it, whether to tick a third option you are only half sure of, read [the negative marking strategy guide](/blog/negative-marking-strategy).",
    },
    {
      type: "h2",
      text: "Where the Multi-Correct Settings Live",
    },
    {
      type: "p",
      text: "Below the three numbers in the marks panel sits a collapsed row headed \"Questions with more than one right answer\", captioned Multi-correct (MCQ). It counts how many questions in this exam are actually multi-correct, and says plainly when there are none yet. A dot on the row means the knobs inside have been moved off part marks, flat penalty and rounding down.",
    },
    {
      type: "p",
      text: "They follow the same inheritance chain as the marks themselves: a question uses its own rule if it has one, otherwise its section's, otherwise the exam default. That matters more here: scoring mode is the thing you most want uniform across a paper, and just as easy to pin on one question by accident. On a bilingual paper the config is read off the primary language, so set it once there and the other language follows. A question reaches these settings only if its type is Multiple Choice (Multiple), and its key is stored as option positions counted from zero, so option A is 0.",
    },
    {
      type: "h2",
      text: "Part Marks or All or Nothing",
    },
    {
      type: "p",
      text: "All or nothing pays full marks when every correct option is ticked and nothing wrong is, pays zero when some correct options are missed and nothing wrong is ticked, and charges the penalty the moment a wrong option appears. No fractions, nothing to round - which is why the penalty and rounding controls vanish from the panel when you choose it.",
    },
    {
      type: "p",
      text: "Part marks pays a share of the question for each correct option found, on the same strict condition that nothing wrong was ticked. The share is the question's full marks divided by the number of entries in the answer key, multiplied by the number the student found. Note the divisor: the key, not the option count. A four-mark question with six options and three correct answers pays four-thirds per correct option found, not four-sixths.",
    },
    {
      type: "quote",
      text: "Part marks are not a net score. Nothing is ever subtracted from them. One wrong tick deletes the part marks outright and charges the penalty in their place - the mode rewards restraint, not coverage.",
    },
    {
      type: "h2",
      text: "Penalty Once, or Once per Wrong Option",
    },
    {
      type: "p",
      text: "In part-marks mode you also choose how the penalty is charged. Once means a single deduction however many wrong options were ticked. Per wrong option multiplies the deduction by the number of wrong picks, capped so a question can never cost more than it is worth - a two-mark penalty charged per option on a four-mark question stops at four. Choose Once unless the exam you are mirroring says otherwise, and if you do use per-option charging, write it into the instructions, because no student assumes it. In all-or-nothing mode the choice does not arise: the deduction is charged once whatever was ticked.",
    },
    {
      type: "h2",
      text: "The Four Rounding Modes, and the One That Does Not Round",
    },
    {
      type: "p",
      text: "Part marks produce fractions, and four modes decide what happens to them. Down, Nearest and Up each settle a question's marks at two decimal places - Down to the lower hundredth, Up to the higher one, Nearest to whichever is closer. Exact is different, and this is the part most explanations get wrong: Exact does not round the question at all. It keeps the full value, 1.3333 and onwards, exactly as the division produced it.",
    },
    {
      type: "p",
      text: "That is not the same as escaping rounding. The paper total is settled to two decimals whichever mode you pick, so Exact only moves the rounding off each question and onto the final sum - which is why it can give a tidier total than Down. The panel shows a live preview; read it knowing that it always assumes a question with four correct options. If yours has three, the preview is not your question.",
    },
    {
      type: "h2",
      text: "A Worked Example, Scored All the Way Through",
    },
    {
      type: "p",
      text: "Take a paper of four multi-correct questions, each worth 4 marks with a penalty of 2, each with five options of which three are correct. Part marks on, penalty Once, rounding Down. Each correct option found is therefore worth 4 divided by 3, which is 1.3333 and onwards. One student answers like this.",
    },
    {
      type: "ul",
      items: [
        "Q1 - one correct option ticked, nothing else. Raw 1.3333, rounded down to 1.33.",
        "Q2 - two correct options ticked, nothing else. Raw 2.6666, down to 2.66. Nearest and Up would both give 2.67; Exact would keep 2.6666.",
        "Q3 - all three correct options ticked. Raw exactly 4, and no rounding mode changes it.",
        "Q4 - all three correct options ticked plus one wrong one. Part marks are gone: minus 2, the flat penalty. Under per-option charging with both wrong options ticked it would be minus 4, which is also the cap.",
      ],
    },
    {
      type: "p",
      text: "The total: 1.33 plus 2.66 plus 4 minus 2 is 5.99, out of a maximum of 16. Switch to Exact and the same answers come to 6.00, because four-thirds plus eight-thirds plus four is exactly 8 before the penalty. Nearest also lands on 6.00. Up gives 6.01 - a hundredth of a mark the student did not earn, on a paper of four questions. That is the case for Down or Exact, and against Up.",
    },
    {
      type: "h2",
      text: "What Each Setting Teaches About Partial Knowledge",
    },
    {
      type: "p",
      text: "Settle this before you touch the panel, because each choice is a lesson the student learns from the score report rather than from you. All or nothing says partial knowledge is worth nothing. Where the real exam works that way, that is correct and useful: it teaches a candidate not to half-commit. Used carelessly on a classroom test it flattens the student who knew two of three options into the same zero as the one who knew none, and you lose the signal you set the test to collect.",
    },
    {
      type: "p",
      text: "Part marks say partial knowledge has value, but only clean partial knowledge. Look at what Q2 above puts in front of a student. Sitting on two correct picks they hold 2.66. Adding a third option they are unsure of wins 1.34 if it is right and costs 4.66 if it is wrong - the 2.66 they held, plus the 2-mark penalty. The tick only pays at better than roughly three-quarters confidence, and a good candidate feels that cliff without doing the sum. That is the lesson: knowing what you do not know is worth as much as knowing.",
    },
    {
      type: "p",
      text: "The penalty setting teaches its own lesson. Once tells a student a wrong tick costs the same whether it is their only mistake or their fourth, so a candidate who has decided to guess can guess wider for free. Per wrong option prices every tick as a separate bet. Neither is wrong; both are invisible unless you say them out loud.",
    },
    {
      type: "h2",
      text: "The Answer Key Is the Part Nothing Checks",
    },
    {
      type: "p",
      text: "The publish gate blocks a paper when a question has no correct answer marked at all. On a multi-correct question it checks only that the key holds at least one non-empty entry, so an incomplete key publishes in silence. The damage is specific, because the key is also the divisor. Mark one option correct when three are, and the engine believes the question has one correct answer: tick only that option and you take full marks, tick all three correct options and you register one right and two wrong and take the penalty. The strongest candidate scores lowest, and the report looks ordinary.",
    },
    {
      type: "p",
      text: "Marks are worked out at submission and written onto that attempt. Fixing the key afterwards changes what the next student scores, not what the ones who already sat it scored - nothing re-scores a completed attempt. That makes the key the most expensive thing to get wrong here.",
    },
    {
      type: "h2",
      text: "What Part Marks Will Not Do for You",
    },
    {
      type: "p",
      text: "Worth saying plainly, because the alternatives in this space tend not to. There is no option shuffling and no cap on attempts, so a marking mode is not an anti-copying measure. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. Published papers are public: anyone with the link may attempt them, and there is no private or paid delivery to one batch. There is no CSV or Excel export and no per-student report card. What you get is the attempt review, which labels a clean partial answer Partially Correct and counts those per section, and per-question analytics averaged across everyone who attempted.",
    },
    {
      type: "p",
      text: "If the paper arrives as JSON, multi-correct questions survive the import: the key comes in as option positions counted from zero, and the marking settings can ride along at exam, section or question level. An index outside the option range is rejected with a reason rather than guessed at. The [JSON upload guide](/json-upload-guide) carries the prompt. Numeric, TITA and match-the-column questions still have to be typed by hand, and server-side extraction straight from a PDF is off by default, switched on per creator on request.",
    },
    {
      type: "h2",
      text: "Before You Publish",
    },
    {
      type: "ul",
      items: [
        "Open one multi-correct question in each section and confirm which rule it follows - its own, its section's, or the exam default.",
        "Count the ticks in every multi-correct key against the source paper. Nothing else will.",
        "Set one scoring mode and one rounding mode as the exam default and let every question inherit. The overwrite-all action is for clearing stray per-question rules - it pins every question, so section rules stop applying to them.",
        "Write the rule into the instructions in words, in every language you publish in: a share of the marks per correct option, nothing wrong ticked, or the penalty instead.",
        "Preview the paper and answer a multi-correct question yourself. The student gets square boxes, not round radio buttons - check the question text does not also say choose one.",
      ],
    },
    {
      type: "p",
      text: "The marks panel is on every exam, free, with no card. [Everything a creator can build](/for-creators) sits behind one account. If the paper is still being assembled, [how to create an MCQ test online](/blog/how-to-create-an-mcq-test-online) covers the question editor and [how to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions) covers the options - which matters more on a multi-correct question than anywhere, because one sloppy distractor punishes the best candidate first.",
    },
  ],
  faqs: [
    {
      question: "How does partial marking work on a multi-correct question?",
      answer:
        "In part-marks mode the student earns a share of the question for each correct option they tick, provided they tick nothing wrong. The share is the question's full marks divided by the number of entries in the answer key. Tick two of three correct options on a four-mark question and you get two-thirds of four, which is 2.6666 before rounding. Tick those two plus one wrong option and the part marks disappear entirely and the penalty is charged instead - part marks are never netted against wrong picks.",
    },
    {
      question: "Is partial marking on by default?",
      answer:
        "Yes, wherever a marking scheme exists. Every scheme saved here - the exam default, a section override or a rule on a single question - starts with part marks as the scoring mode for multi-correct questions, the wrong-answer penalty charged once, and fractions rounded down. If you have never opened the collapsed multi-correct row in the marks panel, those are the rules your paper is using, and a dot appears on that row once any of the three has been changed, so you can tell at a glance without opening it. A paper with no marking scheme anywhere is the one exception: it is unscored, every question awards zero, and the publish dialog only warns about that rather than blocking you.",
    },
    {
      question: "What is the difference between Exact and Down rounding for part marks?",
      answer:
        "Down settles each question's marks at two decimal places, always towards zero - 1.3333 becomes 1.33. Exact does not round the question at all and keeps the full value. The paper total is settled to two decimals whichever you choose, so Exact does not avoid rounding; it moves it from each question onto the final sum, which can leave a tidier total. Nearest and Up also settle at two decimals, and Up is the only mode that can hand a student a fraction of a mark they did not earn.",
    },
    {
      question: "Should the penalty be charged once or per wrong option?",
      answer:
        "Once, unless the exam you are mirroring specifies otherwise. Per-option charging multiplies the deduction by the number of wrong ticks, capped so the question can never cost more than it is worth, and it punishes the candidate torn between two plausible options harder than the one who stabbed at a single answer. If you do use it, say so explicitly in the instructions. In all-or-nothing mode the setting does not apply at all - the deduction is charged once however many wrong options were picked.",
    },
    {
      question: "Will anything warn me if a multi-correct answer key is incomplete?",
      answer:
        "No. The publish gate blocks a paper only when a question has no correct answer marked at all; a key with one entry passes even when three options are genuinely correct. That matters because the key is also the divisor for part marks, so an incomplete key gives full marks to a student who ticks the single listed option and charges the penalty to the one who ticks all three. Check every multi-correct key against the source paper by hand before publishing.",
    },
  ],
};

export default post;
