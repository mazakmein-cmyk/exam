import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test",
  title: "PDF to CBT: How a Question Paper Becomes a Computer-Based Test",
  metaTitle: "PDF to CBT: How a Question Paper Becomes a Test | MockSetu",
  metaDescription:
    "A PDF is a picture of a paper. A CBT is structured data plus rules. Here is exactly what has to be recovered from the page, and what the test adds on top.",
  keywords:
    "pdf to cbt, convert pdf question paper to cbt, pdf to computer based test, digitise question paper, cbt conversion, extract questions from pdf",
  excerpt:
    "Converting a PDF into a computer-based test is not a file conversion. It is a recovery job: six things have to come off the page before the clock, the palette and the scoring can exist at all.",
  publishedAt: "2026-09-23",
  updatedAt: "2026-09-23",
  readingMinutes: 11,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never tag this with "JEE Main" or "SSC MTS" -
    // those strings send a creator to a student landing page.
    "For Creators",
    "PDF Import",
    "CBT",
    "question paper",
    "exam setup",
    "JSON import",
  ],
  hero: {
    eyebrow: "The PDF Cluster",
    h1: "PDF to CBT: How a Question Paper Becomes a Computer-Based Test",
    lede: "A PDF knows where the ink sits on the page. A computer-based test knows what a question is, what it is worth, and when time runs out. This is the gap you are closing.",
  },
  content: [
    {
      type: "p",
      text: "A PDF is a picture of a question paper. A computer-based test is a structured database plus a set of rules. Going from PDF to CBT is not a file conversion, it is a recovery job: something has to read the page and work out where each question starts, which lines are its options, which letter is the correct one, where one section ends and the next begins, what each question is worth, and which parts are pictures or equations rather than text. Recover those six things cleanly and you have a real CBT. Recover them approximately and you have a quiz that quietly scores half the class wrong and nobody finds out until a student argues about a mark.",
    },
    {
      type: "h2",
      text: "Why PDF to CBT Is a Recovery Job, Not a Conversion",
    },
    {
      type: "p",
      text: "Look inside any previous-year paper and you will find what the file actually stores: glyphs, font names, and x-y coordinates. The number 23 sits at a position; the letter A sits a little below and to the left. The file has no idea that 23 is a question number, that A is an option label, or that the two belong together. A scanned paper is worse - only an image of text, every character to be guessed from pixels before anything else can begin.",
    },
    {
      type: "p",
      text: "A CBT stores the opposite. Each question is a row: a stem, an ordered list of options, a flag on the correct one, a question type, a marks value, a section. Nothing is positional, so the platform can render that row on a phone, in Hindi, in fullscreen, and score it identically every time. Everything useful a CBT does - the clock, the palette, auto-submit, the analytics - is downstream of that structure. Until it exists, you have a picture.",
    },
    {
      type: "h2",
      text: "The Six Things That Must Come Off the Page",
    },
    {
      type: "p",
      text: "Whatever route you take, the output is judged on the same six recoveries. Treat this as the acceptance test for the conversion, not a wish list.",
    },
    {
      type: "ul",
      items: [
        "Question boundaries. Easy when a question number sits at the left margin, hard when a question spills across a column break or a page break mid-sentence.",
        "Option boundaries and labels. One-word options often share a single line or sit in two columns; three-line options look exactly like paragraphs of the stem.",
        "The answer key. Almost always printed on the last pages, sometimes as a grid, sometimes split by set code, sometimes in a separate file altogether.",
        "Section boundaries. A heading on page 9 governs every question after it - Physics, or Section B, or a part that is qualifying only - and nothing marks them individually.",
        "Marks. For correct, for wrong, and for unattempted - which is not always zero, and not always the same across sections of one paper.",
        "Images and equations. Diagrams, circuits, structures, graphs, and anything with a fraction, a root or a subscript. These are the first casualties of any text-only extraction.",
      ],
    },
    {
      type: "h2",
      text: "Question and Option Boundaries: Where a Conversion Breaks Silently",
    },
    {
      type: "p",
      text: "Boundary errors are the expensive ones because they are silent. If the last line of question 14's stem gets attached to question 15, nothing throws an error - question 15 simply reads strangely, and every student who sits the paper assumes the fault is theirs. Reading passages make this worse: one passage governs four or five questions, and an extractor that does not understand that relationship either duplicates the passage five times or drops it from four of them.",
    },
    {
      type: "p",
      text: "Option labels are the other common break. Papers mix (A) (B) (C) (D) with 1. 2. 3. 4. and with (a) (b) (c) (d), sometimes across sections of one booklet, and a key printed as \"1-C\" then has to be matched against options extracted as 1 to 4. A conversion that gets the four option texts right but shifts the labels by one produces a paper where every answer is wrong by exactly one position - which looks, from the analytics, like a class that has not studied.",
    },
    {
      type: "h2",
      text: "The Answer Key Is a Second Document Pretending to Be the Last Page",
    },
    {
      type: "p",
      text: "Treat the key as a separate recovery with its own verification. Often it is printed as a dense grid of question-number and letter pairs, which is exactly the layout that text extraction scrambles, because reading order in a grid is ambiguous. For papers with multiple booklet sets there is one key per set code, and picking the wrong column maps a perfectly extracted paper onto a perfectly wrong key.",
    },
    {
      type: "p",
      text: "The cheap check is a count: the key must have exactly as many entries as the paper has questions, and the letters must fall inside the range of options that actually exist for each question. The second check is a spot audit - pick three questions from across the paper, solve them yourself, and confirm the key agrees. Do both before you publish, because the fix afterwards is not retroactive: a published paper is locked for editing, and the attempts already recorded keep the marks they were given even after you unpublish, correct the key and publish again.",
    },
    {
      type: "h2",
      text: "Sections, Timing and Marks Are Rules, Not Text",
    },
    {
      type: "p",
      text: "This is the part people underestimate. The marking scheme in a PDF is a sentence in the instructions page. In a CBT it has to become arithmetic the machine performs on every submission. JEE Main Paper 1 is 75 questions, 25 per subject, Section A with 20 MCQs and Section B with 5 numericals, all compulsory, +4 for correct and -1 for wrong in both sections, 300 marks in 180 minutes. That one sentence unpacks into at least four separate settings. Miss the -1 and every score in the batch inflates, and a reader comparing their practice score to the real [JEE Main paper pattern](/mock-test/jee-main) will trust the number you gave them.",
    },
    {
      type: "p",
      text: "Some papers go further and make timing itself a rule. SSC MTS runs 90 questions for 270 marks across two sessions of 45 minutes each, where Session I is qualifying only with no negative marking and Session II counts for merit and carries -1. Reproducing that honestly means two sections with different marking and their own clocks, not one 90-minute paper with a note in the instructions. MockSetu gives each section its own time in minutes, lets sections share one pooled clock where the real exam pools them, locks or leaves open the ability to switch between sections, and auto-submits when time expires. Marks are set per question for correct, wrong and unattempted, and multi-correct questions can be scored with part marks or all-or-nothing, with the penalty charged once or per wrong option.",
    },
    {
      type: "h2",
      text: "Images and Equations: What a Plain Text Extractor Drops",
    },
    {
      type: "p",
      text: "A circuit diagram has no text equivalent. Neither does a benzene ring, a projectile sketch, or a data-interpretation bar chart. Any pipeline that outputs plain text throws these away without complaint, and the question that remains - \"find the current through R2\" with no circuit - is unanswerable but looks complete. The same applies when the options themselves are pictures, which is routine in reasoning and in organic chemistry.",
    },
    {
      type: "p",
      text: "Equations are the subtler version of the same problem. A fraction with a square root in the numerator is two-dimensional on the page and has to become one-dimensional markup to be stored and re-rendered. MockSetu handles maths through LaTeX rendered with KaTeX, and supports images in the question, images as the options themselves, and reading passages attached to a group of questions. Figures also survive the JSON route, which is the opposite of what a plain text dump does to them: the extraction prompt records each figure's page and bounding box rather than the picture itself, and the upload step asks for the source PDF and crops those regions out automatically for you to approve. Where a crop comes out wrong, or an equation or a diagram is genuinely nasty, you can snip the question, the option or the passage straight out of the PDF as an image instead of retyping it: a picture of the correct equation beats a retyped one that is subtly wrong.",
    },
    {
      type: "h2",
      text: "What the CBT Adds That the PDF Never Had",
    },
    {
      type: "p",
      text: "Once the structure exists, the test becomes something a PDF cannot be. This is what you are buying with the effort.",
    },
    {
      type: "ul",
      items: [
        "A clock. Per section, pooled across sections where the real exam pools them, counting down in front of the student.",
        "A question palette, so a student can see at a glance what is answered, what is skipped, and what they flagged.",
        "Mark for review, which is what separates a planned attempt from a linear one.",
        "Auto-submit when time expires, without which a practice attempt never really teaches pacing.",
        "Automatic scoring against the key you recovered, with the marking rules applied identically to every attempt.",
        "Class-level analytics for you: section-wise accuracy, average time per attempted question, and where the batch as a whole struggled - with no CSV or Excel export and no per-student report card.",
        "A paper a student can sit in Hindi or English, if you built it in both: the language is chosen on the instructions page before the clock starts.",
      ],
    },
    {
      type: "p",
      text: "The clock and the palette are not features, they are the exam. A student who has only ever solved the paper untimed on a desk has practised the syllabus and not the exam, which is most of the argument in [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic).",
    },
    {
      type: "h2",
      text: "Which Route From PDF to CBT Is Open to You",
    },
    {
      type: "p",
      text: "Default to JSON import, because it is the route open to every account. You run MockSetu's own extraction prompt - published at the [JSON upload guide](/json-upload-guide) - in whatever AI you already use, save the JSON it produces, and upload the file. Nothing about that route is gated, and the walkthrough is in [how to use ChatGPT to convert a question paper into import-ready JSON](/blog/how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json). There is also a server-side Import from PDF button, where MockSetu runs the extraction itself, but it is off for every account unless switched on for that creator on request, so plan your workflow around JSON. Typing the paper in by hand stays the right call for a short chapter test, and the route-by-route comparison is in [converting a PDF question paper into an online test](/blog/convert-pdf-question-paper-to-online-test).",
    },
    {
      type: "p",
      text: "Why JSON and not the spreadsheet everyone already has? Because a question is a nested object - options are a list, one is flagged, a passage belongs to several questions - and a flat grid cannot hold that without inventing conventions, which is why MockSetu takes JSON and does not import Excel or Word at all. The tradeoffs are laid out in [bulk upload questions to an online test: JSON vs Excel](/blog/bulk-upload-questions-to-an-online-test-json-vs-excel).",
    },
    {
      type: "h2",
      text: "A Pre-Flight Checklist Before You Publish",
    },
    {
      type: "p",
      text: "Run this against the converted paper before anyone sits it. Every item is a failure mode that still looks complete on screen.",
    },
    {
      type: "ul",
      items: [
        "Question count matches the source paper exactly. 75 means 75, not 74 with one silently merged.",
        "Every question has the right number of options, and no option is empty or duplicated.",
        "Key entries equal question count, and a spot audit of three questions you solved yourself agrees with the key.",
        "Section membership is right at every boundary - check the first and last question of each section, not the middle.",
        "Marks for correct, wrong and unattempted are set per section where the real paper differs by section.",
        "Every diagram, graph and structure is present and legible at phone width, not just on your monitor.",
        "Every equation renders - open the preview and read them, do not trust the source markup.",
        "Section times and any pooled clock match the real paper, and section switching is locked or open the way the real exam has it.",
        "The instructions page describes the paper you actually built. MockSetu warns you when the two drift apart, but read it yourself anyway.",
      ],
    },
    {
      type: "h2",
      text: "What the Conversion Will Not Do for You",
    },
    {
      type: "p",
      text: "A converted CBT on MockSetu is not a proctored exam: there is no webcam monitoring, no lockdown browser, and no tab-switch detection, so treat it as practice rather than as an assessment of record. A published paper is public - anyone can attempt it from the library - and there is no paid or private delivery to one batch only. There is no question shuffling and no cap on attempts. The JSON importer also leaves numeric, TITA and match-the-column questions for manual entry, so budget time for those rather than discovering them at the end. And the AI only extracts what is in the PDF you supply - it does not invent questions from a syllabus.",
    },
    {
      type: "p",
      text: "So choose the papers you convert deliberately: the ones students will attempt repeatedly, where timing and scoring are the point, rather than every handout in the cupboard.",
    },
    {
      type: "h2",
      text: "From a Scan on Your Desktop to a Paper Students Can Sit",
    },
    {
      type: "p",
      text: "Start with one paper, not twenty, and pick a previous-year paper you know well enough to spot a wrong key or a missing diagram without checking. Set its paper type to Previous Year rather than Mock so students know what they are attempting - that picker is granted per creator on request, like the PDF button, so ask for it if you do not see the field, and meanwhile put the exam body, paper and year in the description. More on that in [how to create a previous-year paper mock test](/blog/how-to-create-a-previous-year-paper-mock-test). Convert it by the JSON route, run the checklist, preview the exam yourself with nothing recorded, then publish it and watch the analytics as the first attempts come in. Average time per attempted question will tell you more about your extraction quality than another proofread will, because a question the whole class answers in a couple of seconds has probably lost its diagram. If you have not set up an exam before, [what MockSetu gives a creator building papers](/for-creators) is the place to start. It is free, there is no card, and a published mock can be attempted by a student as a guest without an account.",
    },
  ],
  faqs: [
    {
      question: "Can I just upload a PDF and get a computer-based test?",
      answer:
        "Not by default, no. MockSetu does have an Import from PDF button that runs the extraction server-side, but it is off for every account unless it has been switched on for that creator on request, so assume you do not have it. The route available to everyone is JSON import: you run MockSetu's published extraction prompt in whatever AI tool you already use, save the JSON, and upload it. Either way the output needs the same review - question count, option labels, answer key, section boundaries, marks, and diagrams.",
    },
    {
      question: "What exactly has to be recovered from a PDF for a real CBT?",
      answer:
        "Six things: question boundaries, option boundaries along with their labels, the answer key, section boundaries, the marking scheme including what an unattempted question is worth, and every image and equation. Miss any one and the test still looks complete while scoring or displaying incorrectly, which is why boundary and key errors are the expensive ones - they are silent.",
    },
    {
      question: "Why is the answer key the hardest part to extract?",
      answer:
        "Because it is effectively a separate document, printed on the last pages and often as a dense grid, and grids have ambiguous reading order for any text extractor. Papers with multiple booklet sets have one key per set code, so picking the wrong column maps a correctly extracted paper onto a completely wrong key. Verify by counting - key entries must equal question count - and by solving three questions yourself and checking the key agrees.",
    },
    {
      question: "What happens to diagrams and equations during conversion?",
      answer:
        "Plain text extraction drops diagrams entirely and flattens equations, usually without any error. MockSetu supports images in the question, images as the options, and maths written in LaTeX and rendered with KaTeX. You can also snip a question, an option or a passage straight out of the PDF as an image instead of retyping it, which is the pragmatic choice for a nasty equation or a circuit diagram.",
    },
    {
      question: "Can I fix the answer key after students have already attempted?",
      answer:
        "For everyone who sits the paper afterwards, yes - but not for the attempts already recorded. A published exam is locked for editing, so you unpublish it, correct the key and publish again, and grades are stamped at submission: nothing re-scores and no rank moves. Deleting the exam is worse, because deleting it deletes its sections, questions and attempts with it. Which is why the key audit belongs before the publish button, not after it.",
    },
    {
      question: "Is a converted CBT secure enough to use as a graded exam?",
      answer:
        "No, and it is better to say so plainly. There is no webcam or AI proctoring, no lockdown browser, and no tab-switch detection, and a published paper is public so anyone can attempt it. Use a converted paper for timed practice, pacing and diagnostics, and keep anything that decides a grade on a channel built for that.",
    },
  ],
};

export default post;
