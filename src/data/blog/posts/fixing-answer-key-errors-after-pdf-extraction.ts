import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "fixing-answer-key-errors-after-pdf-extraction",
  title: "Fixing Answer Key Errors After PDF Extraction",
  metaTitle: "Answer Key Wrong After PDF Import? How to Fix It | MockSetu",
  metaDescription:
    "The key came out wrong after extraction? It is a missed key page, the wrong set column, a zero-based off-by-one, or a placeholder. How to find and fix each.",
  keywords:
    "answer key wrong after import, pdf extraction answer key error, correct_answer zero based index, json import answer key, fix imported answer key, off by one answer key, question paper import india",
  excerpt:
    "A key that comes out wrong after extraction has one of four signatures. Two of them arrive as nulls the editor flags and the publish gate holds. The other two look perfectly valid.",
  publishedAt: "2026-10-28",
  updatedAt: "2026-10-28",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. Never add "SSC MTS" or
    // "JEE Main" here - those tags win the match and send a paper setter to a
    // student pillar.
    "For Creators",
    "PDF Import",
    "answer key",
    "json import",
    "question paper setting",
  ],
  hero: {
    eyebrow: "PDF Import",
    h1: "Fixing Answer Key Errors After PDF Extraction",
    lede: "The editor shouts when an answer is missing and says nothing when an answer is wrong. Here is how to tell the two apart, from the JSON, before you share the link.",
  },
  content: [
    {
      type: "p",
      text: "An answer key that comes out wrong after a PDF extraction is almost never random. It is one of four failures, and each leaves its own signature: the key page was never read, so the answers are null; the wrong set column was used, so almost every answer is wrong; a printed label was carried across as an index, so every answer sits one option low; or the question is a numeric or match-the-column item the import format cannot hold, and its null is deliberate. Work out which signature you have before you fix anything. Three of the four are repaired by re-running the key alone, and the fourth is not a fault.",
    },
    {
      type: "p",
      text: "This is the troubleshooting pass after an import. [Converting a question paper into import-ready JSON](/blog/how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json) covers the extraction run itself, and the [JSON upload guide](/json-upload-guide) carries the prompt and the repair prompts described below. The in-app \"Import from PDF\" button, where MockSetu runs the extraction server-side, is off by default and granted per creator on request; the universal route is the published prompt plus a JSON upload. Both run the same prompt and fail the same four ways.",
    },
    {
      type: "h2",
      text: "Missing Answers Are Loud, Wrong Answers Are Silent",
    },
    {
      type: "p",
      text: "MockSetu checks whether an answer exists. It never checks whether the answer is right, because it has no way to know. A question with nothing marked gets a red border and an alert badge on its row in the editor, and at publish time the language holding it is listed with its question numbers and a \"Go fix\" link straight to the row - that language's toggle is disabled until the key is filled. The gate runs on every language you publish, not only the primary, so a Hindi twin with an empty key is caught too.",
    },
    {
      type: "p",
      text: "An off-by-one produces none of that. It writes an index that is an integer, inside the option range, and non-empty. Every check in the product passes it. The first reader to notice is a student comparing the score report against the official key.",
    },
    {
      type: "quote",
      text: "A missing answer is loud - a red badge in the editor and a publish gate that will not open. A wrong answer is silent all the way to the student's score report.",
    },
    {
      type: "h2",
      text: "Failure One: the Key Page Was Never Read",
    },
    {
      type: "p",
      text: "Signature: everything null, or whole sections null, with no complaint about any one question. Cause: exam papers print the key at the end - after the questions, after the rough-work pages, inside a solutions booklet - and a model reading front to back reaches it only after it has written every question down.",
    },
    {
      type: "p",
      text: "The current prompt attacks this directly: read the whole PDF last pages first, then transcribe the key verbatim into the extraction summary's answer_key block before writing a single question, so the model reads its own transcript instead of recalling a page it saw once. If your JSON came from an older prompt, re-run it with the current one. Then read answer_key. Found says whether a key exists anywhere in the PDF, and transcript should hold one token per question. Empty transcript with found false means the PDF has no key, no inline answers, no solutions and no marked options. Empty with found true means the key was located and could not be joined - the next failure.",
    },
    {
      type: "h2",
      text: "Failure Two: the Wrong Column, or the Wrong Row",
    },
    {
      type: "p",
      text: "Keys for papers issued in multiple booklets carry one column per set - Set A to D, Series, Booklet Code, Shift 1 and Shift 2. The columns differ because the question order differs per booklet. Taking the leftmost by habit marks a wrong answer on nearly every question, and the result looks perfect: nothing null, nothing flagged, every question confidently answered. Nothing in the product flags it.",
    },
    {
      type: "p",
      text: "Check answer_key.set_used against the set printed on your paper's cover or running header. The prompt forbids defaulting to column one: when the paper's set is not printed or is not among the key's columns, the correct outcome is every answer null plus one paper-level review entry saying so. A wall of nulls beats a wall of plausible wrong answers, so do not read it as the extraction failing you.",
    },
    {
      type: "p",
      text: "The same fault hits rows. If the key numbers questions continuously while your exam is built as sections that each restart at 1, the second section's printed Q1 is not the key's entry 1 - it sits after every question of the first section. Build [SSC MTS](/ssc-mts) as two sections for its two 45-minute sessions, 90 questions and 270 marks, and that offset is waiting for you.",
    },
    {
      type: "h2",
      text: "Failure Three: a Printed (3) Is Index 2",
    },
    {
      type: "p",
      text: "The importer's correct_answer is a zero-based index into the options array. First option \"0\", second \"1\", third \"2\", fourth \"3\", fifth \"4\". A printed digit on a key is a label, never an index - a key entry of (3) becomes \"2\", and (1) becomes \"0\". Letters map the same way by position: (a) is \"0\" whatever the paper's own options are labelled. Never search the options for the label's text.",
    },
    {
      type: "p",
      text: "The first signature is obvious once you look: every answer sits one option further down than the printed key says. The second is the one creators miss - questions going missing. If the key prints (4) on a four-option question and the conversion wrote \"4\", that index is out of range and the parser rejects the whole question rather than importing it wrong. It never reaches the editor at all. So a section that imported short is worth re-reading as a conversion error before you blame the PDF. The same rejection catches a letter, \"Option 3\" or \"Bonus\" in that field; a blank is treated as not marked, which keeps the question and loses the answer.",
    },
    {
      type: "h2",
      text: "Failure Four: the Nulls That Are Supposed to Be There",
    },
    {
      type: "p",
      text: "The importer does not carry numeric, TITA and match-the-column questions. They arrive as placeholders - two sentinel options naming the manual entry needed and the PDF question to look at - and the import preview warns about each one. Their correct_answer stays null even when the PDF prints the answer, and that is deliberate: any index there would tick one of the two placeholder strings. The printed value rides in the review reason instead, so you can finish the question without reopening the file.",
    },
    {
      type: "p",
      text: "Do not re-run the extraction to fix these. Nothing will change. Open each one in the editor, replace the sentinel options with the real ones, and mark the real answer.",
    },
    {
      type: "h2",
      text: "Reading the Rate, Then Auditing by Hand",
    },
    {
      type: "p",
      text: "The extraction summary reports its own coverage: answered counts the ordinary questions given a real index, left_null counts those it could not answer, and each of those carries a reason starting \"answer key\" quoting what the PDF printed. The import preview shows that list as \"AI-flagged for review\" and says those questions will still be created. What the rate means is worth being precise about.",
    },
    {
      type: "ul",
      items: [
        "Almost everything null: the key was missed or could not be joined. Read answer_key.note and the single paper-level review entry first - it names the reason.",
        "A scattered handful null, each with its own reason: healthy. Those are genuine ambiguities - a question marked Bonus or dropped, a key accepting two options, an illegible glyph in a scan - and they are meant to be finished by hand.",
        "Nothing null at all on a scanned or messy paper: a warning, not a win. A model that found an answer for every single question may have solved some instead of transcribing them, which the prompt forbids.",
        "Everything answered and the answers wrong: no count shows you this. Only the audit below will.",
      ],
    },
    {
      type: "p",
      text: "Do the audit with the key page of the PDF open beside the editor.",
    },
    {
      type: "ul",
      items: [
        "Take the first question, a middle one and the last one of every section. A wrong column is wrong everywhere; a numbering offset shows itself at the ends.",
        "For each, read the printed label on the key, count the options down from the top of the question, and confirm the editor marks that same option.",
        "Include one question whose printed answer is the last option. A conversion error there goes out of range, so the symptom is a deleted question, not a wrong one.",
        "Count each section against the PDF. A short section is a conversion error, not a reading error.",
        "Solve three questions yourself and compare. This is the only check that catches a key that is internally consistent and belongs to a different booklet.",
      ],
    },
    {
      type: "h2",
      text: "Fixing It Without Starting Over",
    },
    {
      type: "p",
      text: "Three repair routes, cheapest first. The upload guide ships a missing-answers fix prompt: paste it into the same chat that produced the JSON, paste the JSON under it, and the model re-reads the key and re-emits the file with questions, options, sections, passages and marks untouched. For a handful of questions, skip that and fix them in the editor - expand the question and edit the correct answer inline. On a bilingual paper that save writes the same index to every language twin, because the answer is a position and positions are shared.",
    },
    {
      type: "p",
      text: "The third route is a fresh import in Replace mode, and it has a deadline. Once a student has submitted an attempt in that language, Replace is refused and only Append is offered. That is the argument for auditing before you share the link: scores are worked out when a paper is submitted and stored on that attempt, so a correction changes what the next student scores, never what the earlier ones scored. If you are already past that point, [correcting an answer key after students have attempted](/blog/how-to-correct-an-answer-key-after-students-have-attempted) covers what is still recoverable.",
    },
    {
      type: "h2",
      text: "Why Previous-Year Papers Punish This Hardest",
    },
    {
      type: "p",
      text: "A key error on a paper you wrote yourself stays between you and your batch. A key error on a [previous-year paper built as a mock test](/blog/how-to-create-a-previous-year-paper-mock-test) is public knowledge: the official key exists, serious candidates have already seen it, and the first mismatch costs you the credibility that made them attempt the paper at all.",
    },
    {
      type: "p",
      text: "Be clear-eyed about the blast radius. Published papers on MockSetu are public - anyone with the link can attempt them, there is no private or paid delivery to one batch, and there is no proctoring of any kind. There is no CSV or Excel export of results and no per-student report card, so you cannot quietly re-issue corrected scores to a list. The audit before publishing is the control you have.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, bilingual papers, a marking scheme per question, a listing in the public library - sits behind one account. Spend the extra pass on the key. It is the one part of the paper a student can check against an official document.",
    },
  ],
  faqs: [
    {
      question: "Why did my answer key come out wrong after a PDF import?",
      answer:
        "Almost always one of four causes. The key page sits at the end of the paper and was never read, so answers are null. The paper is one of several booklet sets and the wrong column of the key was used, so answers are wrong nearly everywhere. The printed label was written straight into correct_answer, which is zero-based, so every answer sits one option low. Or the question is numeric, TITA or match-the-column, which the import format cannot hold, and its null is deliberate. Read answer_key in the extraction summary to tell which one you have.",
    },
    {
      question: "Does a printed answer of (3) mean correct_answer should be 3?",
      answer:
        "No. The importer's correct_answer is a zero-based index, so the first option is \"0\" and a printed (3) - the third option - is \"2\". Letters follow the same positions: (a) is \"0\", (b) is \"1\", (c) is \"2\", (d) is \"3\". Getting this backwards shifts every answer by one option, and if the key names the last option the index falls out of range and the parser rejects that question entirely rather than importing it wrong.",
    },
    {
      question: "Some questions imported with no answer at all. Is that a bug?",
      answer:
        "Not necessarily. Numeric, TITA and match-the-column questions are imported as placeholders with sentinel options and are meant to carry a null answer, because any index would tick a placeholder string; you finish those in the editor. Beyond that, a question the extraction could not answer honestly - a key marked Bonus, a key naming two options, an illegible scan - is left null with a reason quoting what the PDF printed. A null you can read a reason for is the system working. A paper that is entirely null means the key was never found or never joined.",
    },
    {
      question: "How do I check an imported answer key before publishing?",
      answer:
        "Open the key page of the PDF beside the editor and check the first, a middle and the last question of every section, counting options down from the top of each question. Include one question whose answer is the last option, since a conversion error there deletes the question instead of mis-marking it. Count each section against the PDF, because a short section is itself a symptom. Then solve three questions yourself - that is the only check that catches a key which is internally consistent but belongs to a different booklet set.",
    },
    {
      question: "Can I re-import to fix the answers after students have attempted?",
      answer:
        "Only partly. Once a submission exists in that language, Replace mode is refused and only Append is offered, so a full re-import is off the table. You can still correct individual answers in the editor, and on a bilingual paper the fix writes to every language twin at once. But scores are computed when a paper is submitted and stored on that attempt, so a correction changes what later students score and not what earlier ones scored.",
    },
  ],
};

export default post;
