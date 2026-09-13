import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "jee-main-repeated-questions-and-patterns",
  title: "JEE Main Repeated Questions: The Templates That Come Back Every Year",
  metaTitle: "JEE Main Repeated Questions: Patterns That Return | MockSetu",
  metaDescription:
    "JEE Main repeated questions are rarely verbatim. What returns is the template — the setup and the reasoning. How to mine past papers for patterns that transfer.",
  keywords:
    "jee main repeated questions, jee main repeated topics, jee main question patterns, jee main pyq analysis, most repeated questions in jee main, repeated questions in jee main previous year papers, jee main question templates, how to analyse jee main past papers",
  excerpt:
    "Candidates search for a list of questions that will reappear. What actually reappears is the configuration, with the numbers and the story changed. Recognising templates is a skill you can train deliberately.",
  publishedAt: "2026-09-11",
  updatedAt: "2026-09-11",
  readingMinutes: 10,
  category: "Exam Strategy",
  tags: ["JEE Main", "Previous Year Papers", "Question Patterns", "PYQ Analysis", "Exam Strategy"],
  hero: {
    eyebrow: "Exam Strategy",
    h1: "JEE Main Repeated Questions: The Templates That Come Back Every Year",
    lede:
      "JEE Main repeated questions are almost never repeated in the way candidates hope. The numbers change and the story changes; the configuration underneath does not.",
  },
  content: [
    {
      type: "p",
      text: "Search for the most repeated questions in JEE Main and what you are hoping to find is a list — forty or fifty questions that will appear again more or less as printed, so that a year of preparation collapses into a fortnight of memorising. That list does not exist, and the candidates who spend a season looking for it lose the season.",
    },
    {
      type: "p",
      text: "Near-identical repeats do occur. A question from an older shift occasionally resurfaces with the same numbers and a handful of candidates get a pleasant shock in the hall. The frequency is far too low to plan around, and hunting it trains exactly the wrong reflex — recall instead of recognition. What genuinely repeats, shift after shift and cycle after cycle, is the template: the configuration, the setup, the shape of the reasoning. Learning to see templates is the largest transferable advantage past papers can give you, and it is a different skill from solving.",
    },
    {
      type: "h2",
      text: "Repeated Questions in JEE Main: What Actually Comes Back",
    },
    {
      type: "p",
      text: "Paper 1 runs 180 minutes for 300 marks across 75 compulsory questions — 25 in each of Physics, Chemistry and Mathematics, split into 20 multiple-choice questions in Section A and 5 numerical-value questions in Section B, with four marks for a correct answer and one deducted for a wrong one throughout. Confirm that against the information bulletin for your cycle; the full breakdown sits in the [exam pattern and marking scheme guide](/blog/jee-main-exam-pattern-and-marking-scheme).",
    },
    {
      type: "p",
      text: "Now notice what the format implies. A fixed syllabus that changes slowly, a fixed question count, multiple shifts that must be comparable in difficulty, and a setting team working to a blueprint. Under those constraints nobody is inventing new physics each January. They are re-dressing a finite stock of testable configurations, changing the numbers, the names, the units, the order of the options, and occasionally the direction from which the question is asked. The stock is large but it is not unbounded, and it is visible in the papers.",
    },
    {
      type: "h2",
      text: "What a Question Template Is Made Of",
    },
    {
      type: "p",
      text: "A template has three parts, and the reason most candidates never extract one is that they only ever write down the third. There is a trigger — the feature of the stem that tells you which template you are in. There is a standard move — the first decisive step that unlocks it. And there is a trap — the one place candidates who recognise the template still lose the mark.",
    },
    {
      type: "p",
      text: "Take a Physics archetype in words. Two blocks, one resting on the other, with friction at the interface between them and possibly at the ground; a force applied to one of them; the question asks for the largest force before slipping begins, or the common acceleration, or the friction acting on the upper block. The trigger is two bodies in contact with a limiting condition. The standard move is to first test whether they can move together, compute the required friction on that assumption, and compare it with the maximum available. The trap is almost always the surface you forgot — the friction at the ground, or the fact that friction on the upper block is the only thing accelerating it, and therefore points forward, not backward.",
    },
    {
      type: "p",
      text: "That description contains no numbers and no answer, and it is worth more than either. A chapter is not a template; a chapter holds several. And a template happily straddles chapters — the same limiting-condition reasoning shows up in circular motion on a rough turntable, which is why a purely chapter-indexed set of notes will never surface it.",
    },
    {
      type: "h2",
      text: "Template Families in Physics, Chemistry and Mathematics",
    },
    {
      type: "p",
      text: "In Physics, three recognisable shapes: the two-body contact problem described above, in all its friction and pulley variants; the circuit that must be reduced before it can be solved, where the whole difficulty is spotting the series-parallel structure or the symmetry that kills a branch, after which one loop equation finishes it; and the parameter-change question in wave optics or photoelectric effect, where a known setup is disturbed — the slit separation is halved, the medium is changed, the wavelength is shifted below threshold — and you are asked what happens to fringe width, stopping potential or saturation current. The last family rewards knowing which quantity depends on what, and punishes recomputing from scratch under a clock.",
    },
    {
      type: "p",
      text: "In Chemistry, the reagent-sequence conversion is the clearest example: a starting compound, an ordered set of reagents, and a product to identify — the whole question is whether you know what each step does and in what order the functional groups survive. Alongside it sit the periodic-trend ordering questions, where four species must be arranged by radius, ionisation enthalpy, acidity or basicity and the trap is the one exception the trend does not cover; and the mole-concept computation built on a limiting reagent, where the arithmetic is trivial and the entire mark rides on identifying which reactant runs out.",
    },
    {
      type: "p",
      text: "In Mathematics, the conic with a parameter — a family of lines or circles with an unknown constant, a tangency or intersection condition, and a value of the parameter to find — is a template you will meet in many disguises. So is the definite integral that is unpleasant head-on and collapses under a symmetry substitution, where the trigger is the limits rather than the integrand. So is the conditional probability question dressed as a story about bags, machines or medical tests, where the standard move is to fix the sample space in one line before touching any formula.",
    },
    {
      type: "p",
      text: "None of this tells you where the marks are concentrated. For the distribution across chapters, use the [chapter-wise weightage guide](/blog/jee-main-chapter-wise-weightage) and its subject-level breakdowns; this one is about what to do once you are already inside a chapter with a paper in front of you.",
    },
    {
      type: "h2",
      text: "How to Build a Template Log While Solving Past Papers",
    },
    {
      type: "p",
      text: "The method is a single running document — a notebook, one file, nothing elaborate — with one entry per template, never one entry per question. When you finish a past-paper question, you do not copy the solution. You ask whether this question belongs to a template you already have. If it does, you add nothing, or at most one clause to the trap field. If it does not, you write a new line.",
    },
    {
      type: "ul",
      items: [
        "Trigger: the two or three words in the stem that identify the template. Written as what you would notice on a first read, not as a chapter name.",
        "Move: the first decisive step, in one sentence. Not the full solution — the step after which the question stops being a question.",
        "Trap: the specific way you or a sensible person loses the mark here. Sign, missed case, unit, an exception to the trend, the condition that fails at the boundary.",
      ],
    },
    {
      type: "p",
      text: "Keep each entry to about three lines and resist the urge to make it complete. A template log that reads like a textbook is a textbook, and you will not reread it. The compression is the point: writing the move in one sentence forces you to decide what the move actually is, which is the work. Entries written in your own slightly awkward phrasing are recalled far better than entries copied from a solution manual.",
    },
    {
      type: "p",
      text: "Review it weekly, and review it wrong. Do not read the log from top to bottom. Read only the trigger field, cover the rest, and say the move and the trap out loud before uncovering them. Entries you get right twice in a row can be marked and skipped for a month. A log of two hundred entries, reviewed this way, is a sitting of half an hour or so, not an evening.",
    },
    {
      type: "h2",
      text: "The Test That Tells You Whether You Hold a Template",
    },
    {
      type: "p",
      text: "Here is the check, and it takes fifteen seconds per question. Read the stem, do not touch your pen, and state in one sentence what the first move is. Not the answer — the move. If you can say it before any algebra happens, you hold the template. If you have to start writing to find out where you are going, you do not, however reliably you eventually get the right answer.",
    },
    {
      type: "p",
      text: "This distinction is invisible in untimed practice, where both kinds of candidate finish and both mark themselves correct. It becomes decisive under a 180-minute clock for 75 questions, where the average question gets under two and a half minutes, because the candidate who holds the template spends that time on the computation and the other spends it on orientation. Run the test on twenty questions from a paper you have not seen and the count of instant answers is a fairer measure of your preparation than your score on that paper.",
    },
    {
      type: "quote",
      text: "Knowing the answer to a past question is worth nothing on exam day. Knowing what the question was asking you to notice is worth everything.",
    },
    {
      type: "h2",
      text: "Why Memorising Answers Produces a Fast, Fragile Candidate",
    },
    {
      type: "p",
      text: "The failure mode underneath all of this is subtle, because it looks like progress. A candidate solves ten years of papers, then solves them again, and their scores climb steeply. What has actually happened is that they have memorised outcomes attached to surfaces — this question about a bag of balls has answer three by eight, that one about the ladder against the wall comes out to forty degrees. The recall is genuine, the speed is genuine, and none of it transfers.",
    },
    {
      type: "p",
      text: "You can detect it in yourself with one question: when you look at a solved past paper, do you feel recognition of the question or recognition of the method? If a paper you have done twice feels easy but a fresh paper of the same difficulty does not, you have been logging answers. The repair is not more papers. It is going back through the ones you have already solved and extracting triggers from them, which is slower per question and worth several times as much per hour.",
    },
    {
      type: "h2",
      text: "Which Papers to Mine, and in What Order",
    },
    {
      type: "p",
      text: "How far back to reach and where to find clean papers are settled in the [previous year question papers guide](/blog/jee-main-previous-year-question-papers); the short version is that recent cycles carry more weight, because the syllabus has been trimmed since the older ones were set. For template work, the ordering matters more than the reach. Do past questions chapter-wise first, immediately after you finish a chapter, because that is when extraction is cheapest — you already know which chapter you are in, so all your attention goes on the trigger and the trap. Only then move to full papers under a clock, where the additional skill being tested is identifying the template cold, without the chapter label.",
    },
    {
      type: "h2",
      text: "Where the Template Log Meets Your Mocks",
    },
    {
      type: "p",
      text: "The log earns its keep in the post-mock review, which is where most candidates are weakest. After a full-length attempt, sort your errors into two piles: questions where you missed the template entirely, and questions where you recognised it and fell into the trap anyway. The first pile means a new log entry. The second means an existing entry needs its trap field sharpened, because you wrote it too vaguely to fire under pressure. The review discipline around this is set out in the [mock test strategy guide](/blog/jee-main-mock-test-strategy).",
    },
    {
      type: "p",
      text: "For that sorting to mean anything, the attempt has to be a real one — full length, three hours, on a screen, with the palette and the timer doing what they do on the day. Recognition speed measured on an untimed paper at your desk is not the quantity you care about. Run [a full-length JEE Main mock test](/mock-test/jee-main), then spend longer on the review than you did on the paper. A template log is also one of the few kinds of notes that survives to January and gets reread, which is the argument made at length in the guide to [revision notes and formula sheets](/blog/jee-main-revision-notes-and-formula-sheets).",
    },
    {
      type: "h2",
      text: "Your First Week: One Paper, Properly Mined",
    },
    {
      type: "p",
      text: "Start with a single past paper and one subject rather than a plan. The aim of the first week is not coverage; it is to find out what an entry in your log should look like, which you can only learn by writing twenty bad ones.",
    },
    {
      type: "ul",
      items: [
        "Take one full past paper and solve only the 25 questions of your strongest subject, untimed, writing every step.",
        "Mark it, then go through all 25 again — including the ones you got right — and for each, write the trigger in your own words before looking at anything else.",
        "Merge aggressively. Questions that share a move are one entry, not two; you should finish with far fewer entries than questions.",
        "For every question you got wrong, write the trap as a sentence beginning with the word I, naming what you specifically did.",
        "Two days later, cover the moves and traps, read only your triggers, and see how many you can reconstruct.",
      ],
    },
    {
      type: "p",
      text: "If that last step goes badly, your triggers are written as chapter names and need rewriting as things you would notice. Do the same paper in a second subject the following week. By the end of the month you will have a document of perhaps sixty entries that no coaching material can give you, because it is indexed by how your particular mind fails — and that, not a list of questions to be repeated, is what past papers were always for.",
    },
  ],
  faqs: [
    {
      question: "Do questions repeat between the morning and evening shifts of JEE Main?",
      answer:
        "Each shift gets its own paper, so you will not see the morning questions again in the evening. The same template often appears across shifts with different numbers, which is why shift-wise memory-based papers circulated after an exam are useful for spotting configurations and useless as a list of questions to memorise. Shift difficulty differences are handled by normalisation, not by reusing questions.",
    },
    {
      question: "How many years of previous year papers should I solve for JEE Main?",
      answer:
        "About the last ten years, weighted towards recent cycles, since the syllabus has been trimmed and the format has settled. Because each session runs across many shifts, that decade already contains far more papers than most candidates finish. Depth beats reach: one paper reviewed properly for its templates is worth more than three solved, marked and closed.",
    },
    {
      question: "Are previous year questions enough for JEE Main, or do I need a test series too?",
      answer:
        "Past papers are the better source for learning templates because their difficulty and phrasing are calibrated by the actual setters. They cannot give you the exam-day skill of meeting a template cold, under a clock, with a palette and a countdown. Use past papers chapter-wise while learning, then full-length timed mocks to test whether recognition survives pressure.",
    },
    {
      question: "How do I analyse a JEE Main paper after solving it?",
      answer:
        "Go through every question, not only the wrong ones. For each, write the trigger that identified it, the first decisive move, and the specific trap. Sort errors into two piles: templates you did not recognise, and templates you recognised but mishandled. The first needs a new log entry; the second means an existing entry is written too vaguely to fire under time pressure.",
    },
  ],
};

export default post;
