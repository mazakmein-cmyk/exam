import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json",
  title: "How to Use ChatGPT to Convert a Question Paper Into Import-Ready JSON",
  metaTitle: "ChatGPT Question Paper to JSON: The Full Workflow | MockSetu",
  metaDescription:
    "Turn a question paper PDF into import-ready JSON with ChatGPT: copy the extraction prompt, attach the PDF, save between the delimiters, and fix what comes back wrong.",
  keywords:
    "chatgpt question paper to json, convert question paper to json, pdf to json question bank, import questions json mock test, chatgpt pdf extraction exam, question paper json format, ai question extraction",
  excerpt:
    "If you already pay for ChatGPT, you already own the hardest part of digitising a question paper. Here is the exact workflow, and the three things that come back wrong.",
  publishedAt: "2026-09-24",
  updatedAt: "2026-09-24",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a paper-setter
    // to the student library.
    "For Creators",
    "PDF Import",
    "JSON",
    "question bank",
    "exam setup",
    "AI tools",
  ],
  hero: {
    eyebrow: "Import Workflow",
    h1: "How to Use ChatGPT to Convert a Question Paper Into Import-Ready JSON",
    lede: "The universal import route: your own AI subscription does the extraction, MockSetu does the exam. Seven steps that work, three failures you need to spot, and the limits the format cannot get past.",
  },
  content: [
    {
      type: "p",
      text: "Yes, ChatGPT can turn a question paper PDF into a JSON file you can bulk-import, and if you already pay for it you already own the expensive half of this job. The short version: copy MockSetu's extraction prompt from the [JSON upload guide](/json-upload-guide), paste it into a fresh chat, attach your PDF, save everything the AI returns between the two delimiter lines as a .json file, and upload that file to an exam you have already created. In full it is seven steps, set out below. Budget about five minutes per language.",
    },
    {
      type: "p",
      text: "Every marketing page will tell you that much. What decides whether your batch sits a correct paper on Sunday is the rest of it.",
    },
    {
      type: "h2",
      text: "Why the JSON Route Instead of a Magic Button",
    },
    {
      type: "p",
      text: "MockSetu does have an Import from PDF button that runs the whole extraction server-side. It is off by default and turned on per creator on request, so you cannot count on it being there when you open the editor tonight. The JSON route has no such gate. It works on every account, today, and the file is yours: you can diff it, hand it to a colleague, and re-upload a corrected copy. One caveat on that last point — a re-upload in Replace mode wipes every existing question in that language, and is blocked once a student has submitted an attempt. Append always works. If your question bank already lives in a spreadsheet, [JSON versus Excel for bulk upload](/blog/bulk-upload-questions-to-an-online-test-json-vs-excel) explains why the importer takes JSON and nothing else, and how to convert the sheet in one pass.",
    },
    {
      type: "p",
      text: "It is also model-agnostic. The prompt is written for a frontier assistant with a reasoning mode — ChatGPT, Claude or Gemini on their current top tier all work. Small or older models do not: they transcribe mathematics badly and lose answer keys, and repairing that takes longer than typing the paper. Use the best model you already pay for.",
    },
    {
      type: "quote",
      text: "The prompt is the product. The model is interchangeable; the instructions that stop it inventing an answer key are not.",
    },
    {
      type: "h2",
      text: "What Import-Ready Actually Means",
    },
    {
      type: "p",
      text: "Import-ready is not the same as valid. Any assistant will hand you well-formed JSON that the importer still refuses, because the file has to agree with an exam that already exists on the other side. Three things have to line up.",
    },
    {
      type: "ul",
      items: [
        "The exam exists in MockSetu, with its sections already created and named. Write the section names down exactly as you typed them, capital letters and all.",
        "The JSON declares the same section names. If your exam calls a section Reasoning and the JSON calls it General Intelligence and Reasoning, the importer has nothing to attach those questions to.",
        "The JSON declares the language slot you are uploading into — English or Hindi. A bilingual paper is two uploads, not one file with both. Upload the primary language first: on the secondary upload MockSetu ignores the AI's answer key and marks entirely, because primary is the source of truth for both. Do not waste a repair cycle on a null key in your secondary-language file.",
      ],
    },
    {
      type: "p",
      text: "A section-name mismatch is what fools people on a first upload: it looks like the AI did nothing useful when in fact it did everything right. It also has a built-in escape hatch — the upload preview opens a guided-fix panel with a one-click prompt you paste into your AI along with the JSON, and you get back a renamed version to re-upload. Renaming the sections in MockSetu works too. Either way it costs you a round trip, and settling the names beforehand costs nothing.",
    },
    {
      type: "h2",
      text: "The Workflow, Step by Step",
    },
    {
      type: "ul",
      items: [
        "Create the exam first: name, category, sections with their per-section minutes, and marks for correct, wrong and unattempted answers.",
        "Open the [JSON upload guide](/json-upload-guide) and copy the extraction prompt. Do not paraphrase it from memory — it carries the rules that stop the AI from solving questions itself.",
        "Start a fresh chat — a thread already full of other context produces sloppier transcription.",
        "Paste the prompt, then fill in the two placeholders at the bottom — the language code, and your section names in the order they appear in the exam.",
        "Attach the PDF and send. Wait for the whole reply; a truncated answer is a broken file.",
        "Select everything between the two delimiter lines, paste it into Notepad or VS Code, and save as .json with UTF-8 encoding. ANSI turns every degree sign and em dash into mojibake.",
        "Upload to the exam. If the file carries figure coordinates, the dialog asks for the source PDF so it can cut those images out for you. Then read the summary and fix what it flags before you publish.",
      ],
    },
    {
      type: "p",
      text: "Seven lines, and only one of them is the extraction itself. Everything else is housekeeping, which is precisely why the route works with whatever assistant you already pay for. For the wider picture of what happens between the PDF and a student's screen, [the full PDF-to-CBT path](/blog/pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test) covers the stages either side of this one.",
    },
    {
      type: "h2",
      text: "Failure One: Answers Come Back Null",
    },
    {
      type: "p",
      text: "Check this one first; it costs ten seconds to rule out. Indian exam papers print the key at the very end — a page headed ANSWER KEY, a bare grid of numbers with no heading, or Ans.(b) lines tucked under each solution. The model reads front to back, spends its attention on the questions, reaches the key with nothing left, and emits correct_answer as null across the paper.",
    },
    {
      type: "p",
      text: "Search the saved file for null. If you see it on most questions, do not fix by hand — re-prompt. The [JSON upload guide](/json-upload-guide) carries a repair prompt whose whole job is to make the AI read the last pages first and transcribe the printed key into a separate field before it re-emits a single question. One message, against an evening of patching.",
    },
    {
      type: "p",
      text: "One subtlety trips people even when the key does come through: a printed label is not an index. A key that prints (3) means the third option, which is index 2 in a zero-based format. If your spot-checks are all wrong by one position in the same direction, that is the cause, not a misread paper. And if you discover a key error only after students have attempted, fixing it in the editor does not undo the damage: every attempt is scored at the moment it is submitted and the marks recorded against it stay as they were. There is no re-score button. Catch it in the spot-check.",
    },
    {
      type: "h2",
      text: "Failure Two: The Set Code Sends It to the Wrong Key Column",
    },
    {
      type: "p",
      text: "Plenty of Indian papers ship four booklet codes — Set A to D, Series A to D, or codes like E1 to H1 — with the same questions shuffled differently in each and a key page carrying four columns side by side. If the body of your PDF is Set B and the AI reads column A, your key is wrong nearly everywhere: on a four-option paper a mismatched column still lands on the right answer about a quarter of the time by chance, and that coincidence is all that stands between you and a key wrong on every question. Meanwhile nothing looks broken. The JSON parses. The counts match. The sections line up. It is the most dangerous failure in this pipeline precisely because it is silent.",
    },
    {
      type: "p",
      text: "The check is cheap. Pick five questions spread across the paper that you can answer yourself, and compare. Five of five matching means you are fine. Two or fewer matching — about what chance alone would hand you — means the wrong column, the signature of a shuffled set rather than a weak model. Three or four is neither, and the honest response is to check ten more before you publish. Tell the AI the booklet code on the cover, instruct it to use only that column, and re-run.",
    },
    {
      type: "h2",
      text: "Failure Three: Backslashes and Quotes Break the Parse",
    },
    {
      type: "p",
      text: "JSON treats a backslash as an escape character, and LaTeX is nothing but backslashes. A fraction written \\frac{a}{b} in LaTeX has to appear as \\\\frac{a}{b} inside a JSON string, with every backslash doubled, and the extraction prompt insists on it at length. Most of the time a lapse no longer costs you anything: the importer doubles an un-doubled LaTeX backslash on the way in, and collapses the opposite error when a model has doubled what it had already doubled. The gap is the four letters JSON has claimed for itself — n, r, t and u. A single backslash in front of \\theta, \\times or \\neq is a legal escape that cannot be told apart from a tab or a newline, so it is left alone, the file parses cleanly, and the question renders a tab and the letters heta where the symbol should be. Nothing is thrown, which is why this one is worth looking for rather than waiting for. If your paper is maths-heavy, the companion piece on [getting equations into an online test](/blog/how-to-add-math-equations-to-online-test-questions) is worth reading before you start rather than after.",
    },
    {
      type: "p",
      text: "The other classic parse-killer is a stray straight double quote inside a passage, where reading-comprehension texts quote book titles and the quote closes the JSON string halfway through a sentence. That one rarely reaches you either. MockSetu's parser quietly repairs the usual AI mistakes on the way in — unescaped quotes, trailing commas, markdown code fences, smart quotes, missing commas, Python-style True and False and None, prose wrapped around the JSON, and the commoner forms of mojibake — and the upload preview lists what it fixed. So a parse error that does reach you means auto-repair has already tried and failed, and the usual cause is a reply truncated mid-output. Open it in VS Code to confirm, then re-extract rather than editing a 4,000-line file by hand at eleven at night.",
    },
    {
      type: "h2",
      text: "What the Format Cannot Hold",
    },
    {
      type: "p",
      text: "Be clear about this before you promise anyone a one-click import: numeric and TITA questions, match-the-column grids, and true/false, fill-in-the-blank, sequence and descriptive items all fall outside what this format can encode. The prompt handles that honestly instead of silently dropping them — the AI emits a placeholder at the correct question number with obvious sentinel options, so your numbering never shifts, and the upload summary flags each one. You open each placeholder in the editor and complete it by hand.",
    },
    {
      type: "p",
      text: "Figures are a different story, and worth getting straight because it changes your time estimate. The JSON carries no picture data, but it can carry coordinates: for a question that depends on a diagram, the AI records the page and the bounding box. At upload the dialog spots those, asks for the source PDF, cuts each figure out and shows you thumbnails to approve before anything is created — or you skip it and import text only. What does not come across at all is an option that is itself a picture, or a passage that is purely an image the AI could not transcribe, such as a pie chart. Those come back flagged, and you add the image in the editor.",
    },
    {
      type: "p",
      text: "All of which is less painful than it sounds, because the editor is not limited the way the import format is. Add a question by hand and you get single-correct, multi-correct, numeric and text answer types; for a match-the-column grid you can snip the table straight out of the PDF as an image rather than rebuilding it row by row. Passages, image options and LaTeX work manually too.",
    },
    {
      type: "p",
      text: "Just budget for it. Take a JEE Main Paper 1 shape — seventy-five questions, twenty-five in each of three subjects, five of those twenty-five numerical. That is fifteen placeholders, each one a question you open and complete by hand before you can publish. Add whatever the flagged list holds on top, because a diagram-heavy science paper sends image-only figures and picture options your way too. Count both before you promise a batch a Sunday test.",
    },
    {
      type: "h2",
      text: "The Pre-Upload Checklist",
    },
    {
      type: "ul",
      items: [
        "Search the file for null. On more than the placeholder rows, re-prompt.",
        "Five spot-checked answers all match. Two or fewer out of five means the wrong key column.",
        "Section names are character-for-character the names in your exam.",
        "The question count per section matches the paper, not one short from a skipped page.",
        "Degree signs, accents and em dashes render properly, not as mojibake.",
        "If the paper has diagrams, the source PDF is to hand to attach at upload.",
      ],
    },
    {
      type: "h2",
      text: "After the Upload",
    },
    {
      type: "p",
      text: "The import gets you questions, not a finished paper. Marks per question, per-section timing, section switching and the instructions page are all still yours to set. Preview the exam yourself first — a creator preview records nothing — and read a few questions as a student will see them, because a transcription error invisible in a JSON file is obvious the moment it renders.",
    },
    {
      type: "p",
      text: "Then publish, and the paper appears in the [public library students browse](/marketplace), where a published mock can be attempted as a guest without an account. Two honest caveats: a published paper is public, so there is no way to release it to one batch only, and there is no shuffling of questions or options. Plan around both rather than meeting them on exam day. For the rest of the creator side — live exams, analytics, duplicating a paper for the next batch — [the creator overview](/for-creators) is the shortest route.",
    },
    {
      type: "p",
      text: "One last word on that five-minute figure. It describes the route once you know it, not your first run at it: the first time, the extra time goes on learning to recognise the failures above rather than on typing. That is a cost you pay once. After it, a folder of [question paper PDFs](/blog/convert-pdf-question-paper-to-online-test) stops being an archive and starts being a test series.",
    },
  ],
  faqs: [
    {
      question: "Can ChatGPT convert a question paper PDF into JSON?",
      answer:
        "Yes. Copy MockSetu's extraction prompt from the JSON upload guide, paste it into a fresh ChatGPT chat, fill in the language code and your section names, attach the PDF, and send. ChatGPT returns the JSON between two delimiter lines; you save that as a .json file with UTF-8 encoding and upload it to an exam you have already created. Claude and Gemini work the same way — the prompt matters more than which assistant runs it.",
    },
    {
      question: "Why are all the answers null in the JSON ChatGPT gave me?",
      answer:
        "Because the answer key is printed on the last pages of the paper and the model ran out of attention before it got there. Do not fix this by hand. Use the repair prompt on the JSON upload guide, which instructs the AI to read the final pages first and transcribe the printed key before re-emitting any question. Also check that it has not confused a printed label with an index: a key that prints (3) means the third option, which is index 2 in a zero-based format.",
    },
    {
      question: "Why does my JSON file fail to upload?",
      answer:
        "Two different problems get called this. If the file will not parse at all, start by knowing that MockSetu's parser already auto-repairs the usual suspects on the way in — unescaped quotes, trailing commas, markdown code fences, smart quotes, stray prose around the JSON. It also auto-doubles un-doubled LaTeX backslashes. An error that still reaches you normally means the AI's reply was truncated mid-output, or the content is corrupted past recovery. Re-extract rather than patch. If the file parses but nothing lands in your exam, it is a section-name mismatch instead: the upload preview offers a guided-fix panel with a one-click prompt that renames the sections for you.",
    },
    {
      question: "Does the JSON import handle numeric and match-the-column questions?",
      answer:
        "No. Numeric, TITA and match-the-column questions cannot be carried by the import format, and nor can true/false, fill-in-the-blank, sequence or descriptive items. The prompt handles them honestly rather than dropping them: the AI emits a placeholder at the correct question number so your numbering stays intact, and the upload summary flags each one. You then open each placeholder in the editor and fill it in by hand. The editor itself supports numeric and text answer types, and you can snip a match-the-column grid out of the PDF as an image instead of rebuilding it. Diagrams are a separate case: the JSON carries page coordinates rather than pictures, so if you attach the source PDF at upload MockSetu cuts each figure out for you. Options that are themselves pictures, and passages that are purely an image, stay manual.",
    },
    {
      question: "Is there a built-in Import from PDF button, and should I wait for it?",
      answer:
        "There is one, and it runs the extraction server-side, but it is switched off for every account by default and enabled per creator on request. The JSON route is the one that works on every account today, and it leaves you holding a file you can repair and re-upload. Learn that route first; treat the button as a convenience if it is ever turned on for you.",
    },
  ],
};

export default post;
