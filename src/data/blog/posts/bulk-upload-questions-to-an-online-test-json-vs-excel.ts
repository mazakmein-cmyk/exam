import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "bulk-upload-questions-to-an-online-test-json-vs-excel",
  title: "Bulk Upload Questions to an Online Test: JSON vs Excel, Honestly Compared",
  metaTitle: "Bulk Upload Questions to an Online Test: JSON vs Excel | MockSetu",
  metaDescription:
    "Bulk upload questions to an online test: why JSON survives an exam paper and an Excel grid does not, and how to convert a spreadsheet bank in one pass.",
  keywords:
    "bulk upload questions excel online test, bulk upload questions to online test, import questions from excel, question bank upload format, json question import, upload mcq questions in bulk, convert excel question bank to json, bulk question import for teachers",
  excerpt:
    "Excel upload is what paper-setters ask for. JSON is what actually survives an exam paper. Here is the real argument, the honest limitation, and the one-pass way out if your question bank already lives in a spreadsheet.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a paper-setter
    // to the student library.
    "For Creators",
    "PDF Import",
    "question bank",
    "bulk import",
    "JSON import",
    "online test creation",
  ],
  hero: {
    eyebrow: "Import Formats",
    h1: "Bulk Upload Questions to an Online Test: JSON vs Excel, Honestly Compared",
    lede:
      "Excel is what paper-setters ask for. JSON is what actually survives an exam paper. Here is why, where that leaves you if your bank is already a spreadsheet, and the honest one-pass way across.",
  },
  content: [
    {
      type: "p",
      text: "If you came here looking to bulk upload questions to an online test from an Excel sheet, here is the blunt version: MockSetu imports JSON. It does not import Excel, and it does not import Word. That is a real limitation worth saying first, because if your bank already lives in a spreadsheet you have one conversion step ahead of you that a tool promising direct Excel upload would appear to save you. It mostly does not save you, and the reason is structural: a spreadsheet is a grid, an exam paper is a tree, and flattening one into the other either loses branches or invents a column convention that exists nowhere outside your own file.",
    },
    {
      type: "h2",
      text: "A Spreadsheet Is a Grid. An Exam Paper Is a Tree.",
    },
    {
      type: "p",
      text: "Excel is the default because it is the structured tool already open on the desk, and a paper-setter with 400 questions typed into a sheet over three years is not wrong to want it uploaded as-is. The demand is honest. What is dishonest is how it usually gets answered: a template with fixed columns — Question, Option A through D, Correct Option, Marks — fine for a flat general-awareness quiz, and failing the moment your paper does anything a real paper does. Five options instead of four, and the template needs a column nobody documented. A comprehension set, and you either paste the passage into all five question cells or invent a passage-ID column.",
    },
    {
      type: "p",
      text: "That is not a solved problem — it is the same problem moved into a column convention only one importer understands. Think about what a full-length paper contains, and ask of each item: what does this look like as a cell?",
    },
    {
      type: "ul",
      items: [
        "A reading passage shared by five questions. A nested format gives it a field of its own on each of the five. A grid has no field for it, so it is pasted verbatim into five question cells or replaced by an ID pointing at a second sheet.",
        "A section that owns a time limit. The timer belongs to the section, not to any question in it, so there is no row it naturally lives on. Templates repeat a Time column down forty rows, where one typo on row 19 silently disagrees with the other thirty-nine.",
        "An option that is an image. A cell holds text, and a file path in a cell means nothing unless the importer can resolve it against files you have not uploaded.",
        "A multi-correct question with partial credit. Correct Option becomes Correct Options, the separator is a comma until an option contains a comma, and the penalty rules have nowhere to sit.",
        "An equation. A spreadsheet renders what you typed, so superscripts flatten into plain characters. A squared term becomes a 2 sitting innocently next to a variable, and nobody notices until a student does.",
        "Two language versions of the same paper. Every row needs a twin keyed to its partner, and the grid is now a relational database with no foreign keys.",
      ],
    },
    {
      type: "p",
      text: "Each of those is solvable in a spreadsheet, and each is solved by a convention you invent. Conventions do not travel. Nesting hands you several of them for nothing: a paper holds sections, a section holds questions, and a question holds its own passage, its own option list of whatever length, its own answer type and its own correct answer. Nothing is repeated down forty rows, so nothing can disagree with itself on row 19.",
    },
    {
      type: "p",
      text: "It does not solve all six, and the honest thing is to say which. No picture rides inside the file, so an image option is still placed by hand in the editor. Section clocks are set on the exam afterwards, and a second language is a separate upload paired to the first by question order, not a twin column. That is a short fixed list — not an open-ended set of conventions you re-invent per sheet.",
    },
    {
      type: "quote",
      text: "A spreadsheet column is a private convention. JSON is a shape your importer and your AI assistant already agree on, without asking you to explain it.",
    },
    {
      type: "h2",
      text: "What MockSetu Actually Imports, and What It Leaves to You",
    },
    {
      type: "p",
      text: "MockSetu's bulk route is a JSON upload, and the universal path to that JSON does not involve MockSetu doing the extraction at all. The extraction prompt is published openly in the [JSON upload guide](/json-upload-guide). You open whichever AI assistant you already use, paste that prompt in with your question paper, save the JSON it produces, and upload the file. This route is not gated for anyone, and there is no queue.",
    },
    {
      type: "p",
      text: "The shape is what you would sketch on a whiteboard: a paper declares its language, then a list of named sections; each section holds its questions, and each question holds its number, its text, an optional passage, its answer type, its options and its correct answer. Maths travels as LaTeX and renders properly on the student screen. A marks scheme can ride along too, set for the whole paper, one section or a single question, and the preview flags a whole-paper scheme when it finds one.",
    },
    {
      type: "p",
      text: "Section names in the file have to match the section names in the exam you created, and a file that is right in every other respect can still trip on that. It is not a silent failure, though. Before a single question is written, the preview lists every section as matched or not in this exam, and when names do not line up a guided-fix panel offers a one-click prompt you paste back into your assistant for a renamed file — or you rename the exam's sections instead. You confirm after seeing that screen, so a mismatch costs a minute rather than a paper.",
    },
    {
      type: "p",
      text: "Now the limitations, plainly. The importer leaves numeric, TITA and match-the-column questions for manual entry; they come through flagged, at the right question number, for you to complete in the editor. No picture travels inside the JSON itself. Where the source was a PDF there is a way round that: the extraction can note which page a figure sits on and the box it occupies, and if you hand the upload that same PDF it crops each one and shows you thumbnails to check before anything is saved. A spreadsheet has no page to point at, so there the diagrams and image options go in through the editor, which also lets you snip a question, an option or a passage out of a PDF rather than fight a diagram into text. There is an Import from PDF button that runs the whole extraction on our side, but it is off by default and enabled per creator on request, so do not plan a workflow around it.",
    },
    {
      type: "h2",
      text: "If Your Question Bank Already Lives in a Spreadsheet",
    },
    {
      type: "p",
      text: "One pass is the whole cost of it, and that is less work than re-shaping 400 rows into someone else's template. You are not abandoning three years of typing because a platform prefers a different file extension. The route across is one pass with an assistant: export to CSV, hand it over with the published extraction prompt, and tell it which column means what. A spreadsheet converts more reliably than a scanned paper, because the structure you invented is at least consistent across your own file. The prompt mechanics are the same whatever the source — the walkthrough is in [using ChatGPT to convert a question paper into import-ready JSON](/blog/how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json), and what follows is only what changes when the source is a grid.",
    },
    {
      type: "ul",
      items: [
        "Export one sheet to CSV, not the whole workbook. One subject or one paper per pass keeps the output small enough to check by eye.",
        "Declare what each column means, and say what the answer column holds — a label like A/B/C/D, a digit like 1/2/3/4, or something else. Any of them is a fine source. What matters is that the assistant converts that label into the position it points at rather than copying the character straight through.",
        "Name your sections in the CSV exactly as they are named in the exam you created. Matching them beforehand costs one find-and-replace.",
        "Pull the rows with blank option columns into a separate pass. Those are your numericals and match-the-column items, and they need manual entry regardless.",
        "Ask for counts back: rows in, questions out, answers unresolved. A conversion that silently drops eleven questions looks exactly like one that worked.",
        "Import into a draft and preview it yourself. Previewing your own exam records nothing, so you can walk the paper end to end as a dry run.",
      ],
    },
    {
      type: "h2",
      text: "The Answer Key Is Where Both Formats Actually Break",
    },
    {
      type: "p",
      text: "Format arguments are fun; answer keys are what ruin a Sunday. Whatever your source, the most damaging import error is an answer off by one position or keyed to a different set of the same paper. A wrong option order is visible to the first careful student. A wrong key is invisible until the scores come out, and by then the whole batch has a number they believe.",
    },
    {
      type: "p",
      text: "Here is the mechanical detail behind it. The import format stores a correct answer as a position in the option list, counted from zero: the first option is 0, and a key that prints (3) becomes 2, never 3. A printed label is a label, not an index. A column of A, B, C, D carries no position until something translates it, and a column of 1, 2, 3, 4 looks like it already has — the more dangerous of the two, because copying those digits through unchanged shifts every answer one option to the right.",
    },
    {
      type: "p",
      text: "Do not assume the file will shout about it. An index past the end of the option list is rejected outright, but unless the right answer happened to be the last option, an index one too far along still lands inside the list and is accepted without a murmur. That is exactly the slip you are hunting, so it is the one check worth doing by hand: open ten questions in the editor and confirm the highlighted option is the one the printed key names. Do it before you publish, because a late catch is not a clean one. A published exam has to be unpublished before it can be edited at all, and marks are stamped at submission and never recomputed — so fixing the key corrects the paper from that moment on and leaves every score already recorded exactly as it was.",
    },
    {
      type: "h2",
      text: "What the Import Does Not Do, and You Still Must",
    },
    {
      type: "p",
      text: "A clean import gives you questions in sections, and marks too if your file carried a scheme. It does not give you an exam. The rest is set on the exam itself, and it is the part worth slowing down for: marks for a correct, wrong and unattempted answer, checked per question rather than assumed across the paper; for multi-correct questions, partial credit or all-or-nothing, the penalty charged once or per wrong option, and how part marks round; a time limit per section, with two or more sections able to share a pooled clock if the real exam pools them; section switching locked or open; and auto-submit when time expires.",
    },
    {
      type: "p",
      text: "Get the marking rules wrong and your mock reports a score the real exam would never produce. SSC MTS shows why these belong per section: Session I runs 45 minutes with no negative marking and is qualifying only, while Session II runs 45 minutes, counts for merit, and carries minus one. One global rule models neither half. MockSetu also flags instruction drift when the instructions attached to the paper no longer describe the paper you built — exactly what an import introduces when a section is renamed. The mechanics are in [how a question paper becomes a computer-based test](/blog/pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test).",
    },
    {
      type: "h2",
      text: "After You Publish: Set Expectations Correctly",
    },
    {
      type: "p",
      text: "Two things are worth knowing before you import 400 questions on the strength of a plan. First, a published mock is public. It goes into the [public test library students browse](/marketplace), in the languages you chose, and anyone can attempt it; a student can start one as a guest, with no account. There is no private delivery to a single batch, no paywall and no way to sell access. If your model depends on a paper being visible to your students and nobody else, better to know now than after the upload.",
    },
    {
      type: "p",
      text: "Second, what you get back is aggregated: section-wise accuracy, average time per question, where the class struggled, and a top-three leaderboard by username. No per-student report cards, and no CSV or Excel export of results on the way out either, which is fair to hold against us if an export is central to how you work. For the next batch you duplicate the exam rather than re-importing, so the conversion really is once per paper — the copy carries the questions, sections, clocks and the marking scheme. The [overview for creators](/for-creators) lays out the rest. It is free and there is no card.",
    },
    {
      type: "h2",
      text: "So: JSON or Excel?",
    },
    {
      type: "p",
      text: "A genuinely good Excel importer for exam papers would be good because it reads a tree out of a grid using conventions it documents and you follow — a conversion step wearing a spreadsheet costume. The honest version skips the costume. Convert once, keep the spreadsheet as the thing you edit, and let the JSON be the thing you ship. For papers that began as a PDF rather than a sheet, the same single pass applies, as walked through in [converting a PDF question paper into an online test](/blog/convert-pdf-question-paper-to-online-test).",
    },
  ],
  faqs: [
    {
      question: "Can I bulk upload questions to an online test from an Excel file on MockSetu?",
      answer:
        "No. MockSetu imports JSON, not Excel or Word, and that is a real limitation if your bank already lives in a spreadsheet. The practical route is one conversion pass: export the sheet to CSV, hand it to whichever AI assistant you already use along with the extraction prompt published in the JSON upload guide, and upload the JSON it produces. One step per paper, and the file is reusable.",
    },
    {
      question: "Why is JSON better than Excel for uploading exam questions?",
      answer:
        "Because a spreadsheet is a grid and an exam paper is a tree. A grid has no natural place for a passage shared by five questions, a question with five options instead of four, or a multi-correct answer with partial credit — and every Excel template solves those with a column convention it invents, so your sheet still gets re-shaped by hand. A nested format holds all three where they belong. It does not hold everything: no picture travels inside the file, section timers are set on the exam afterwards, and a second language is a separate paired upload. That is a short fixed list you finish in the editor.",
    },
    {
      question: "What happens to numerical and match-the-column questions in a JSON import?",
      answer:
        "The importer leaves numeric, TITA and match-the-column questions for manual entry. They come through flagged at the correct question number, and you open each one in the editor and complete it before publishing. Plan for that: pull those rows out of your spreadsheet into a separate pass so they do not interfere with the straightforward multiple-choice conversion.",
    },
    {
      question: "Can MockSetu extract questions from a PDF for me instead?",
      answer:
        "There is an Import from PDF button that runs the extraction server-side, but it is switched off for every account by default and enabled per creator on request, so do not build a workflow around it. The route that works for everyone is the published extraction prompt run in whatever AI assistant you already have. It produces the same JSON and does not depend on access being granted.",
    },
    {
      question: "How do I avoid an off-by-one error in the answer key when importing in bulk?",
      answer:
        "Know what the format stores. A correct answer is a position in the option list counted from zero, so the first option is 0 and a key printed as (3) becomes 2, never 3. State your source convention during conversion — whether the answer column holds A/B/C/D or 1/2/3/4 — and ask the assistant to convert each label into the position it points at rather than copy the character through. Then spot-check ten questions before you publish, because an index one too far along is still a legal value and imports without complaint. Do it early: marks are stamped at submission and never recomputed, so a key corrected later only helps the students who sit the paper afterwards.",
    },
  ],
};

export default post;
