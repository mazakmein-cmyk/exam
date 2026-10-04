import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-bilingual-hindi-english-online-test",
  title: "How to Create a Bilingual Hindi-English Online Test",
  metaTitle: "Bilingual Hindi-English Online Test: How to Create One | MockSetu",
  metaDescription:
    "SSC, railway and bank papers are set in Hindi and English, so an English-only mock is not a mock. How to build a bilingual test, import both languages, publish cleanly.",
  keywords:
    "bilingual online test hindi english, hindi english mock test maker, create test in hindi online, bilingual question paper online, hindi medium online exam platform, dual language mock test, ssc mock test in hindi, hindi english test series software",
  excerpt:
    "SSC, railway and bank papers are set in Hindi and English, so an English-only mock is not a mock. Here is how to set the languages up front, import one language at a time, and publish a Hindi-English paper that does not break.",
  publishedAt: "2026-09-30",
  updatedAt: "2026-09-30",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here — those
    // are student cluster tags and would send a creator out of this funnel.
    "For Creators",
    "Bilingual",
    "Hindi medium",
    "question paper setup",
    "government exam prep",
    "online exam platform",
  ],
  hero: {
    eyebrow: "Bilingual Paper Setup",
    h1: "How to Create a Bilingual Hindi-English Online Test",
    lede: "SSC, railway and banking papers are set in Hindi and English as a matter of course. If your mock is English-only, your Hindi-medium students are sitting a different exam from the one they will face.",
  },
  content: [
    {
      type: "p",
      text: "To build a bilingual Hindi-English online test, choose both languages at the moment you create the exam, not after the questions are in. The MockSetu setup screen asks for languages — English, Hindi, or both — alongside the name, the category and the sections. Pick both there, and every section you create afterwards exists twice, once per language, with the two versions of each question linked. The student then picks a language on the instructions page, before the paper starts. Choose one language now and add the second later, and you do the same work with none of the linkage.",
    },
    {
      type: "p",
      text: "This matters more in India than the feature list suggests. SSC, railway and banking papers are set in Hindi and English, and for a candidate reading the Hindi column it is often not a convenience — it is the only column they read fluently. A mock that ships English only is not a softer version of the exam. It is a different exam, and its pacing data is wrong for everyone who will sit the real paper in Hindi. Which second language a given exam offers varies, so check its current notification.",
    },
    {
      type: "h2",
      text: "Set the Languages When You Create the Exam, Not Afterwards",
    },
    {
      type: "p",
      text: "Languages belong on that first screen for a structural reason: the language set decides how many copies of each section the paper carries. Everything downstream — the section list, the numbering, the parity checks at publish time — assumes that decision was made at the top.",
    },
    {
      type: "p",
      text: "One language is designated primary, and it works as the spine: section order, question count per section and answer types are defined there, and the second language mirrors them one for one. A question showing four options in English and five in Hindi is not the same question, and your Hindi-medium students would be answering something their neighbour never saw.",
    },
    {
      type: "p",
      text: "If a colleague who reads Hindi more comfortably than English is building the paper, point them at the [Hindi version of the creator page](/hindi/for-creators). Be straight with them about one limit: the builder itself runs in English. The Hindi a student reads is the Hindi you type into English fields.",
    },
    {
      type: "h2",
      text: "What Bilingual Actually Means Inside the Paper",
    },
    {
      type: "p",
      text: "A bilingual paper is not one paper with a translate button. It is two parallel copies, stitched together question by question. Section 1 exists in English and in Hindi, and those two sections are linked; question 14 exists in both, and those two questions are linked. The link is what makes question 14 in Hindi the same question as question 14 in English, rather than a loose Hindi question that happens to be fourteenth in its own list — and it is what the publish check, the marking and the duplicate function all read to pair the two sides up.",
    },
    {
      type: "p",
      text: "What the link does not do is merge the two copies into one record. Each language row stores its own answer key, so two separate imports can perfectly well land two different keys on the same question, and nothing in the publish check compares one against the other. Fixing it does carry, though: correct the key on the primary-language row — in the full question editor or with the quick set-answer control — and MockSetu copies it to the translations, because a key is a set of option indices and means the same thing in either language. Marks behave differently again. The scoring config is authored on the primary language only, and a Hindi sitting resolves back to its English twin to be graded, so you set marks once. The gap to watch is the imported key nobody has opened since.",
    },
    {
      type: "p",
      text: "The linkage is still why you should resist building the Hindi half as a separate exam. Two exams give you two attempt pools, two sets of analytics, and no language choice on the instructions page. One bilingual exam gives you one paper and one picture of how the class performed.",
    },
    {
      type: "quote",
      text: "A bilingual paper is not one paper with a translate button. It is two linked copies, each row holding its own imported answer key — and nothing in the publish check ever compares one against the other.",
    },
    {
      type: "p",
      text: "MockSetu translates nothing for you. Where the Hindi comes from is yours to solve — usually the original bilingual PDF, which already carries both columns. Anyone promising one-click translation of a technical physics or polity paper is selling you a proofreading job you have not budgeted for.",
    },
    {
      type: "h2",
      text: "Import One Language at a Time From a Bilingual PDF",
    },
    {
      type: "p",
      text: "Where the official paper is a single PDF carrying both languages — the English question followed by its Hindi counterpart, or the two columns side by side — treat that one PDF as two imports. Extract English, load it, then extract again for Hindi and load that into the Hindi side of the same exam. Doing both in one pass is where numbering drifts: one skipped Hindi stem puts every question after it off by one.",
    },
    {
      type: "p",
      text: "The import route is JSON. MockSetu publishes its own extraction prompt at the [JSON upload guide](/json-upload-guide); paste it into whatever AI you already use, give it the PDF, save the JSON it returns, and upload the file. There is also a server-side Import from PDF button, but it is off by default and enabled per creator on request, so do not plan a workflow around it unless it has been turned on for you. The longer walkthrough is in [converting a PDF question paper into an online test](/blog/convert-pdf-question-paper-to-online-test).",
    },
    {
      type: "p",
      text: "A sequence that holds up over a 100-question paper:",
    },
    {
      type: "ul",
      items: [
        "Create the exam with both languages ticked, and set the sections and their times before importing anything.",
        "Extract English first and import it. Fix the English side completely — numbering, option counts, answer key — before touching Hindi.",
        "Extract Hindi from the same PDF as a second, separate pass, and import it into the Hindi side of the same exam.",
        "Spot-check five questions spread across the paper, not the first five. Drift accumulates; it rarely shows up on question 2.",
        "On that same sample, compare the Hindi answer key against the English one. Each import writes its own key and nothing checks the two against each other — though once you correct the primary-language row in the editor, the translation follows.",
        "Confirm every section exists in both languages with the same question count. A section missing on one side is a routine import casualty.",
        "Enter numeric, TITA and match-the-column questions by hand in both languages — the JSON importer leaves those for manual entry.",
        "Snip a diagram-heavy stem, a Hindi matrix question or anything the extraction mangles out of the PDF as an image — Devanagari inside a maths expression is where retyping goes wrong. An image does not reflow on a phone, so snip only where retyping is genuinely risky.",
      ],
    },
    {
      type: "h2",
      text: "The Failure That Will Stop Your Publish: Mismatched Option Counts",
    },
    {
      type: "p",
      text: "Here is the error a first bilingual paper tends to hit. A question has four options in English and three in Hindi — the extraction dropped one, or a stray line break merged two. The paper will not publish, and you get an error naming the section and the question numbers.",
    },
    {
      type: "p",
      text: "Read that as the importer protecting you: a three-option Hindi question live beside a four-option English one means a Hindi-medium student is answering a different question from the rest of the batch, and you hear about it after the test rather than before. The parity check looks for the structural ways two language copies drift apart:",
    },
    {
      type: "ul",
      items: [
        "A section that exists in the primary language but is missing in the other.",
        "A different number of questions in a section between the two languages.",
        "A question whose text is empty on one side and has no image either.",
        "A different number of options between the two versions of the same question.",
        "A different answer type — single-correct on one side, multi-correct or numeric on the other.",
        "A question not linked to its counterpart, usually from importing the second language as a fresh set rather than into the existing exam.",
      ],
    },
    {
      type: "p",
      text: "Now notice what is not on that list. Those six are all structural. The gate does insist that every question in every language has an answer key filled in — a blank Hindi key blocks the publish and names the question — but it never compares the two keys against each other. A Hindi row whose correct option is C where the English row says B is not blank, so it publishes without a murmur and mis-scores every Hindi-medium student on that question. That one is yours to catch, which is why it leads the checklist below. Marks are not on the list for a different reason: they are not kept per language at all, but authored on the primary side and read from there whichever language the student sat.",
    },
    {
      type: "p",
      text: "Fix the structural failures in the primary language first, then mirror; chasing them from the Hindi side while English is still shifting is how a short job turns into a long evening. And clear the keys before you share the link, because marks are computed when a student submits and stored on that attempt. Correcting a key afterwards fixes the paper for everyone who sits it next — it does not go back and re-mark the attempts already filed. A wrong Hindi key found after your batch has sat the paper is not something you can quietly repair.",
    },
    {
      type: "h2",
      text: "What the Student Actually Sees",
    },
    {
      type: "p",
      text: "The language choice happens on the instructions page, before the clock starts: the student is shown the languages you published and picks one, and that choice holds for the whole sitting. The instructions page and the paper table — the summary of sections, question counts and marks — then render in that language, which is the part easiest to leave half-done. An English-only instructions screen in front of a Hindi paper tells a student the paper was not really built for them. Inside the exam screen itself they get the question palette, mark for review, fullscreen and the countdown; what they do not get is a way to change language mid-paper.",
    },
    {
      type: "p",
      text: "Say that to your batch explicitly, and say it before the test rather than after. A candidate who assumes a toggle is waiting inside the paper will start in English to look confident, hit a question they cannot parse at speed, and have nowhere to go — the choice on the first screen is the one that counts. A published mock can be attempted as a guest on a phone or a laptop, and you can preview your own exam in both languages with nothing recorded.",
    },
    {
      type: "h2",
      text: "Publishing in One Language or Both",
    },
    {
      type: "p",
      text: "You do not have to publish both languages at once. At publish time you tick the languages to go live in — useful when your English side is ready on Thursday and the Hindi proofread finishes on Saturday. The instruction generator writes the intro text per language, so each language gets its own instructions page. Reread that page yourself before you share a single-language link: the drift warning compares the timing prose and the generated paper-shape line, so a sentence still promising a language chooser is not something it reads.",
    },
    {
      type: "p",
      text: "Be clear about what publishing means: a published paper goes into the public library and anyone can attempt it. No private delivery to one batch, no password, no payment wall, no cap on attempts — and no way around that, because an unpublished paper is visible only to you in preview, and preview records nothing. If a paper must not be public, this is not where it goes. The flip side is reach: your Hindi-medium mock is findable by every candidate searching for one.",
    },
    {
      type: "p",
      text: "Two more things. Creator analytics are mostly aggregate — section-wise accuracy, time per question, where the class struggled — with no student's full name or email anywhere, no per-student report cards and no CSV export; the one place individuals surface is a top-three leaderboard, which shows usernames. And for the next batch, duplicate the exam rather than rebuilding it: the copy carries the sections, the questions, the English-Hindi linkage and the marking scheme, with the language links remapped so the copy's two sides pair with each other instead of reaching back into the original. The marks are copied on a best-effort basis and the copy will not announce it if that step failed, so open the marking scheme on the copy once before you publish it.",
    },
    {
      type: "h2",
      text: "A Pre-Publish Checklist for a Bilingual Paper",
    },
    {
      type: "p",
      text: "Run this before you send the link to anyone. Start with the first item, because a key that disagrees between the two languages is the one failure the publish check waves straight through.",
    },
    {
      type: "ul",
      items: [
        "Spot-check the Hindi answer key against the English one. The publish check does not compare them, and a mismatched key mis-scores only your Hindi-medium students.",
        "Set the marks on the primary-language side. That is the only side they are authored on — a Hindi sitting is graded against its English twin's configuration — so there is nothing to mirror, only one place to get right.",
        "Every section exists in both languages, with identical question counts and the same section times.",
        "Option counts match question by question — this is the check that blocks the publish, so clear it first.",
        "Answer types match: a numeric answer in English is a numeric answer in Hindi.",
        "The negative marking matches the real exam, not a default you forgot to change.",
        "The instructions and the paper table read correctly in Hindi, not just in English.",
        "Preview end to end in Hindi, then again in English, and confirm the two papers hold the same questions in the same order.",
        "Check the paper on a phone — small Devanagari with a long option is where layout problems show.",
        "If the Mock / Previous Year field appears on your account, set it so the paper is filed correctly in the library. Like the PDF import button it is switched on per creator, and a creator without it does not see the field at all.",
      ],
    },
    {
      type: "h2",
      text: "Where a Bilingual Mock Earns Its Keep",
    },
    {
      type: "p",
      text: "The clearest case is a tightly timed paper, because there language and pace interact. SSC MTS: 90 questions and 270 marks, Session I running 45 minutes as a qualifying paper with no negative marking, Session II running 45 minutes, counting for merit and carrying -1. A Hindi-medium candidate who has only practised the English wording burns the first minutes of a 45-minute session re-reading. Your batch can sit a real bilingual paper on the [SSC MTS previous year papers page](/ssc-mts) before you build your own.",
    },
    {
      type: "p",
      text: "Previous year papers are the easiest bilingual papers to build, because the official PDF already carries both languages and both columns came from the examining body rather than from you; the specifics are in [building a previous year paper mock test](/blog/how-to-create-a-previous-year-paper-mock-test). If your institute teaches primarily in Hindi, the wider picture is in [running an online test platform for a Hindi-medium coaching institute](/blog/online-test-platform-for-hindi-medium-coaching-institutes).",
    },
    {
      type: "p",
      text: "None of this costs anything — MockSetu is free with no card. Start at the [creator overview page](/for-creators), build one bilingual paper end to end, and watch where the parity check stops you. The second one goes faster, because by then you know where it will stop you.",
    },
  ],
  faqs: [
    {
      question: "How do I create a bilingual Hindi-English online test?",
      answer:
        "Choose both languages on the exam creation screen, before you add any questions. Each section is then created in both languages, and the two versions of each question stay linked, which is what lets a student pick a language on the instructions page and get a paper matching the English one question for question. Bolt the second language on later and you do the same amount of work without that linkage, and with far more chance of the two sides drifting apart.",
    },
    {
      question: "Why will my bilingual paper not publish?",
      answer:
        "Almost always because the two language versions disagree structurally. The publish check compares the Hindi copy against the primary language and refuses if a section is missing on one side, if the question counts differ, if a question has a different option count or answer type between the two, or if a question is empty on one side. It names the section and the question numbers. Note its limit, though: it compares structure. It does also insist that each language has an answer key filled in, but it never checks whether the Hindi key agrees with the English one, so that stays a manual spot-check. Marks need no check of their own — they are authored on the primary language and read from there whichever language a student sat.",
    },
    {
      question: "Does MockSetu translate my English paper into Hindi automatically?",
      answer:
        "No. There is no translation feature. The AI extraction only pulls questions out of a PDF you supply, so the Hindi has to come from somewhere real — usually the official bilingual PDF, which already contains both columns. The practical route is to run the extraction twice on that PDF, once per language, and import each into its own side of the same exam.",
    },
    {
      question: "Can I publish only the English version while the Hindi one is still being checked?",
      answer:
        "Yes. At publish time you tick which languages go live, so you can publish English on its own, run the test, and add Hindi once the proofread is done. Reread the instructions page before you share the link: if it still promises a language chooser, it is describing a paper you have not published, and no automatic check will say so — the drift warning only compares the timing prose and the generated paper-shape line.",
    },
    {
      question: "Do students need an account to attempt a bilingual mock test?",
      answer:
        "Not for a published mock. A student can open the link and attempt it as a guest on a phone or a laptop, with no sign-up, which takes a real drop-off point out of the way. Signing in adds one thing worth having: a student who loses connection mid-exam can return within about five minutes on the same device. Live exams are the exception — students sign in once before joining with the code.",
    },
    {
      question: "Can I import a bilingual question paper from Word or Excel?",
      answer:
        "No. JSON is the import format. Run MockSetu's published extraction prompt in whatever AI you already use, save the JSON it produces, and upload that file. Numeric, TITA and match-the-column questions are left out of the import by design and need manual entry in both languages. A server-side Import from PDF button exists but is off by default and enabled per creator on request.",
    },
  ],
};

export default post;
