import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-make-a-test-blueprint-before-writing-questions",
  title: "How to Make a Test Blueprint Before Writing a Single Question",
  metaTitle: "Test Blueprint: Make One Before Writing | MockSetu",
  metaDescription:
    "A test blueprint is a grid of topics against cognitive demand with a target count in every cell. How to build one, derive weightings honestly, and write to it.",
  keywords:
    "test blueprint, exam blueprint, question paper blueprint, test blueprint format, how to make a test blueprint, blueprint for question paper, topic wise weightage blueprint, assessment blueprint for teachers",
  excerpt:
    "Write questions first and count afterwards, and the paper ends up weighted by whatever was easiest to write. A blueprint is the grid you fill before question one: topics down the side, cognitive demand across the top, a target count in every cell.",
  publishedAt: "2026-10-29",
  updatedAt: "2026-10-29",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "JEE Main" or "SSC MTS" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Question Writing",
    "test blueprint",
    "assessment design",
    "paper setting",
  ],
  hero: {
    eyebrow: "Question Writing",
    h1: "How to Make a Test Blueprint Before Writing a Single Question",
    lede: "Fill the grid, add up the cells, confirm the total is the paper you promised - and only then open the editor. Everything after that is execution.",
  },
  content: [
    {
      type: "p",
      text: "A test blueprint is a grid you fill in before writing anything. Topics down one side, the kind of thinking each question demands across the top, a target number of questions in every cell. Fill the cells, add the rows, check the total against the paper you promised, and only then open the editor. What you write afterwards is execution, not design.",
    },
    {
      type: "p",
      text: "The alternative is what a paper becomes on its own: questions written until there are enough, then counted. That paper is not weighted by the syllabus. It is weighted by whatever was easiest to write.",
    },
    {
      type: "h2",
      text: "Why Counting Afterwards Always Skews the Paper",
    },
    {
      type: "p",
      text: "Some questions are cheap to write and some are expensive. A definition recall is quick. A multi-step numerical with three plausible distractors, each matching a mistake students actually make, takes far longer. Write freely and stop at the target count, and the cheap kind crowds out the expensive kind - not because the setter is lazy, but because fatigue arrives before the paper is full.",
    },
    {
      type: "p",
      text: "The same pull distorts the topic mix. The chapter taught last week is fresh, so it supplies more questions than it deserves. The chapter with clean diagrams beats the one needing a messy figure. None of this is visible while writing, and all of it is obvious once somebody counts - by which point fixing it means rewriting under deadline, which produces more of exactly the weak items already there.",
    },
    {
      type: "h2",
      text: "The Two Axes, and Why You Need Both",
    },
    {
      type: "p",
      text: "A one-axis plan - a topic list with counts - is better than nothing and still lets a paper go wrong, because it says nothing about depth. The right chapters, all of them recall, flatters whoever memorised and tells you nothing about who can think. The second axis stops that.",
    },
    {
      type: "ul",
      items: [
        "Rows are topics, at the grain you teach. Chapters for a chapter test, chapter clusters for a full-length paper. If a row is so broad you cannot picture the questions in it, split it.",
        "Columns are cognitive demand. Three is the right number: recall, single-step application, multi-step reasoning. More columns and you spend the evening arguing whether an item is analysis or evaluation.",
        "Each cell holds a target count, and zero is a legitimate entry. A blueprint is a shape, not an obligation to fill every box.",
        "Row totals are your topic weightage, column totals your difficulty profile. Both must be deliberate, and both must sum to the paper total.",
      ],
    },
    {
      type: "h2",
      text: "A Worked Blueprint, in Numbers",
    },
    {
      type: "p",
      text: "Take a hypothetical 25-question chapter test on Current Electricity for a Class 12 batch - five topic rows, three demand columns. Each row below reads: topic, then recall, single-step, multi-step, then the row total.",
    },
    {
      type: "ul",
      items: [
        "Ohm's law and resistivity - 2 recall, 3 single-step, 1 multi-step. Row total 6.",
        "Series and parallel networks - 1 recall, 3 single-step, 2 multi-step. Row total 6.",
        "Kirchhoff's rules and the Wheatstone bridge - 1 recall, 2 single-step, 2 multi-step. Row total 5.",
        "Cells, EMF and internal resistance - 1 recall, 2 single-step, 1 multi-step. Row total 4.",
        "Meters and the potentiometer - 1 recall, 2 single-step, 1 multi-step. Row total 4.",
      ],
    },
    {
      type: "p",
      text: "The rows add to 25, which is the paper. The columns add to 6 recall, 12 single-step and 7 multi-step, also 25, and that second sum is the one worth staring at. Six recall questions out of twenty-five is a decision about what this test is for. Without the grid, that number lands wherever the writing happened to leave it.",
    },
    {
      type: "p",
      text: "Notice what the grid does not contain: a single question. It is a page of arithmetic, and it survives being handed to a colleague who writes the Kirchhoff row while you write the rest. For sizing and timing a chapter test, see [how to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online); for filling a cell well, [how to write good multiple-choice questions](/blog/how-to-write-good-multiple-choice-questions).",
    },
    {
      type: "quote",
      text: "A blueprint is not paperwork you do before the real work. It is the only point in the process where you are deciding what the paper measures, rather than discovering it.",
    },
    {
      type: "h2",
      text: "Deriving Weightings From Past Papers Without Inventing Them",
    },
    {
      type: "p",
      text: "Row totals have to come from somewhere, and the honest source is a count you made yourself from papers in front of you - not a weightage chart found online, whose sample you cannot see and whose arithmetic you cannot check.",
    },
    {
      type: "ul",
      items: [
        "Decide the sample first and write it down: which exam, which years, which sections. Then count - and do not add a paper later because the answer came out wrong.",
        "Count questions, not marks, unless the paper pays different marks for different items; then count both, in separate columns.",
        "Record the raw fraction beside every row, not a percentage. Seven out of a hundred counted questions tells a reader what you did; seven percent hides it.",
        "Re-derive, do not inherit. A pattern change makes last year's counts a description of an exam that no longer exists.",
      ],
    },
    {
      type: "p",
      text: "A worked version: JEE Main Paper 1 runs 75 questions, 25 in each of Physics, Chemistry and Maths, Section A carrying 20 MCQs and Section B 5 numericals in every subject, all compulsory, plus four and minus one throughout, 300 marks in 180 minutes. Four recent Physics sections therefore give you 100 counted questions. If seven come from Current Electricity, your own 25-question Physics section earns 1.75 questions from that chapter - one or two, and you must pick which and say why. The bulletin hands you the subject and section axis; the topic axis is yours to build. The student-facing read of the same exercise is [JEE Main chapter wise weightage](/blog/jee-main-chapter-wise-weightage); the whole-paper version is [how to design a full-length mock test paper](/blog/how-to-design-a-full-length-mock-test-paper).",
    },
    {
      type: "h2",
      text: "Turning the Grid Into Sections",
    },
    {
      type: "p",
      text: "MockSetu's structure is exam, then sections, then questions. The blueprint maps onto it by section: create every section the paper needs first, named and timed, before a single question exists. Each section row carries a question-count chip, and the header beside the exam name reads back the number of sections and the total question count for the language you are on - your blueprint's grand total, rechecked as you build.",
    },
    {
      type: "p",
      text: "The skeleton also pays off at import time. A JSON upload matches each section in the file to a section of your exam by exact name - unmatched names are reported rather than guessed at, and sections the file never mentions are listed back to you. Name the sections from the blueprint, use the same names in the JSON, and the upload lands where you meant it to. The [JSON upload guide](/json-upload-guide) has the format.",
    },
    {
      type: "p",
      text: "One guard rail before building a skeleton of empty sections: publishing is blocked while any section has no questions, and also by blank questions, questions with fewer than two filled options, and any question missing an answer key. A half-built blueprint cannot reach a student by accident - but a row you decided against must be deleted, not left empty.",
    },
    {
      type: "h2",
      text: "What the Platform Will Not Track For You",
    },
    {
      type: "p",
      text: "Be clear about this before planning around it. A question record holds its text, options, answer, images and its number within a section. There is no topic field and no difficulty field, so nothing in the product knows question 15 was the Kirchhoff multi-step cell. There is no CSV or Excel export of results either, and no per-student report card. The blueprint lives in your own spreadsheet, and its most valuable column is the question number each cell became.",
    },
    {
      type: "p",
      text: "What the analytics page reports is per section and per question. Section rows carry an average accuracy across sittings. Each question carries how many attempted it, how many answered it correctly, how many left it blank, the most commonly chosen wrong option, and an accuracy that is correct answers divided by the people who attempted that question - not by everyone who sat the paper. Joined to your sheet by question number, that becomes a cell-by-cell reading of your grid.",
    },
    {
      type: "h2",
      text: "Why a Blueprint Makes Next Year Reproducible",
    },
    {
      type: "p",
      text: "A paper written without a blueprint cannot be rebuilt, only re-used - and re-using is weaker than it sounds, because a published paper is public. Anyone with the link can attempt it, there is no private or paid delivery to one batch, and last year's paper has been open to this year's batch all along.",
    },
    {
      type: "p",
      text: "With a blueprint you rebuild instead. Duplicate last year's exam as the shell - the copy carries the marking scheme, the timing groups and the bilingual question links - then replace the questions cell by cell against the same grid. Duplication is deliberately fail-soft, so open the copy and check its sections, marks and language pairing first. The result is a paper that is genuinely new and genuinely comparable, which is the only honest way to tell a batch they improved.",
    },
    {
      type: "h2",
      text: "The Checklist Before Question One",
    },
    {
      type: "ul",
      items: [
        "Every row total and every column total is written down, and both add up to the paper total you have advertised.",
        "The row weightings trace to a count you made, with the sample recorded beside them.",
        "The column profile is a decision, not a leftover - you can say in a sentence why the recall count is what it is.",
        "Sections exist in the editor, named and timed, matching the blueprint's grouping and spelled exactly as the import file spells them.",
        "The sheet has an empty column headed \"question number\", to fill as each cell gets written.",
        "The paper total matches the instructions page, whose table lists each section's question count, with a total row once there is more than one section. Its marks column appears only when a marking scheme is set; its timing column only when section switching is locked.",
      ],
    },
    {
      type: "p",
      text: "None of this needs the product open. A blueprint is a page of arithmetic and a decision about what the test measures, and it is the cheapest quality control in paper setting. [Everything a creator can build here](/for-creators) - sections with their own clocks, per-question marking, bilingual papers, a public library listing - sits behind one free account, and all of it goes faster when the grid is filled first.",
    },
  ],
  faqs: [
    {
      question: "What is a test blueprint?",
      answer:
        "A test blueprint is a grid you fill in before writing any questions: topics down one axis, cognitive demand across the other, and a target number of questions in each cell. The row totals are your topic weightage, the column totals are your difficulty profile, and both have to add up to the paper total you intend to set. You write questions to fill the cells rather than writing freely and counting what you got.",
    },
    {
      question: "Why make a blueprint instead of just writing questions and counting at the end?",
      answer:
        "Because cheap questions crowd out expensive ones. A recall item is quick to write and a multi-step numerical with three honest distractors takes far longer, so a paper written to a target count fills up with the easy kind before fatigue arrives. The same pull skews topics towards whatever was taught last week or happens to have clean diagrams. None of it is visible while writing, and fixing it afterwards means rewriting questions under deadline.",
    },
    {
      question: "How do I decide the topic weightage for a blueprint?",
      answer:
        "Count past papers yourself rather than copying a weightage chart. Fix the sample before you start - which exam, which years, which sections - count the questions, and record the raw fraction next to each row rather than a percentage, so anyone reading the sheet can see what the number is made of. Re-derive the counts whenever the exam's pattern changes, because old counts describe a paper that no longer exists.",
    },
    {
      question: "Can MockSetu store the blueprint against the questions?",
      answer:
        "No. A question record holds its text, options, answer, images and its number within a section - there is no topic field and no difficulty field, and there is no CSV or Excel export of results. Keep the blueprint in your own spreadsheet with a column for the question number each cell became. The analytics page reports per section and per question, so that one column is what turns question-level results back into a reading of your grid.",
    },
    {
      question: "Does a blueprint help when I set the same paper again next year?",
      answer:
        "That is most of its value. A paper written without one can only be re-used, and re-using is weak here because published papers are public - anyone with the link can attempt them, so last year's paper has been available to this year's batch all along. With a blueprint you duplicate the old exam as a shell, which carries the marking scheme, timing groups and bilingual links, then rewrite the questions cell by cell. Check the copy afterwards: duplication is deliberately fail-soft.",
    },
  ],
};

export default post;
