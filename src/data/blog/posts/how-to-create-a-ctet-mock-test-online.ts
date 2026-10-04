import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-ctet-mock-test-online",
  title: "How to Create a CTET Mock Test Online: No Negative Marking",
  metaTitle: "CTET Mock Test Online: How to Build One | MockSetu",
  metaDescription:
    "Build a CTET mock test online: one section per part of the notification, a marking scheme that deducts zero for a wrong answer, and a bilingual paper.",
  keywords:
    "ctet mock test create, how to create ctet mock test online, ctet online test series, no negative marking mock test, child development and pedagogy questions, ctet practice test maker, bilingual mock test hindi english, teacher eligibility test paper setting",
  excerpt:
    "A mock for an exam that deducts nothing must deduct nothing. How to set a zero-penalty scheme on purpose, shape the sections from the notification, and write pedagogy items that measure more than tone.",
  publishedAt: "2026-10-25",
  updatedAt: "2026-10-25",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "CTET",
    "teacher eligibility test",
    "question paper setting",
    "no negative marking",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a CTET Mock Test Online: No Negative Marking",
    lede: "Create the exam, build one section per part the notification lists, then set one marking rule for the whole paper. If a wrong answer costs nothing in the real exam, it must cost nothing in your mock - and that zero is a setting you type, not a box you leave alone.",
  },
  content: [
    {
      type: "p",
      text: "To build a CTET mock test online: create the exam, add one section for each part the current notification lists, enter the questions, and set one exam-wide marking rule before you publish. That rule is the decision that matters. Read what the notification says a wrong answer costs. If it costs nothing, your mock must cost nothing - type zero into the wrong-answer field and leave it there. An invented penalty does not make practice harder. It teaches a candidate to skip questions they would have scored on.",
    },
    {
      type: "p",
      text: "The rest is build mechanics: shaping the sections, writing pedagogy items that measure pedagogy rather than tone, running the paper in two languages, and saying the marking rule out loud. For the candidate's side of this exam, send them to the [CTET preparation strategy guide](/blog/ctet-preparation-strategy).",
    },
    {
      type: "h2",
      text: "Zero Is a Setting, Not an Absence",
    },
    {
      type: "p",
      text: "The marks panel opens on three numbers: what a right answer is worth, what a wrong answer takes away, and what a blank takes away. For a no-penalty paper you want the first of the four preset chips - one mark for right, nothing for wrong, nothing for blank. The wrong-answer field carries the instruction in its own help line: keep zero for no negative marking.",
    },
    {
      type: "p",
      text: "Here is the trap. A zero you typed and a scheme you never opened are not the same state. Configure nothing and the publish dialog says no marking scheme is configured for this exam and that students will submit and see their results without any marks; the paper then ranks by correct count. Defensible on an informal practice set, but choose it rather than drift into it.",
    },
    {
      type: "p",
      text: "Exactly one marking state blocks publishing, and it is the half-done one. Put marks on some sections and not others and the dialog refuses - marks are set on only part of this paper - and names the sections with holes. Partial coverage flips the exam's ranking to correct count the moment one attempt touches an unscored question. The other banners in that dialog warn. This one gates.",
    },
    {
      type: "p",
      text: "So the build order is short.",
    },
    {
      type: "ul",
      items: [
        "Open the marks panel on the Exam default tab and set it once: right one, wrong zero, blank zero.",
        "Do not override at section or question level. A question given its own rule stays pinned to it even after you change the exam default.",
        "Decide whether candidates see the marks badge while attempting. That toggle is exam-wide and saves itself the moment you flip it.",
        "If you duplicated an earlier paper, open the copy's marks panel and look. A duplicate does carry the scheme, the timing groups and the language links, but the copy is fail-soft by design, so anything it loses it loses quietly.",
      ],
    },
    {
      type: "quote",
      text: "A penalty is not a difficulty setting. Add one to a mock whose real exam charges nothing and you have not made the paper harder - you have trained a candidate to leave marks on the table.",
    },
    {
      type: "h2",
      text: "Let the Notification Decide the Shape",
    },
    {
      type: "p",
      text: "Do not rebuild a CTET pattern from memory, from last year's blog post, or from a coaching handout. The question count, the split across parts, the duration and the qualifying mark live in the current official notification. That is the part you copy exactly rather than approximate.",
    },
    {
      type: "p",
      text: "One section per part, named the way the notification names it, holding the count it gives. If you are building a half-length practice set on purpose, say so in the exam title, not in the structure. Sectional timing is optional - give each section its own clock, or leave one clock on the paper. Section switching is a separate exam-level setting and its default is locked, so a candidate finishes a section before the next opens. If the real paper lets candidates move between parts, turn switching on deliberately.",
    },
    {
      type: "p",
      text: "The instructions page then draws your paper back at the candidate as a table: serial number, section name, number of questions, maximum marks, sectional timing, and a total row. The marks column appears only once the paper carries marks, and the timing column only when section switching is locked; where candidates may roam, the sections share one clock and the prose says so. Open that page yourself - it is the fastest way to catch a section you forgot to fill.",
    },
    {
      type: "h2",
      text: "Child Development and Pedagogy Items Are a Different Craft",
    },
    {
      type: "p",
      text: "The audience here is teachers, so this part can be written at full strength. A subject-knowledge item has a fact underneath it. A pedagogy item has a judgement underneath it, so the key must be defensible from a stated position: a developmental theory, a principle of assessment, an inclusive-education norm. Not merely the warmest sentence on the list.",
    },
    {
      type: "p",
      text: "There is one failure mode to watch for above the rest. The stem describes a struggling child, three options are plainly callous, one is plainly kind, and a candidate who has never opened a textbook answers it correctly. The item measures tone, and it tells you nothing afterwards.",
    },
    {
      type: "ul",
      items: [
        "Anchor the stem in one classroom moment and one teacher action. A teacher does something; the question asks what it assumes, or what it will produce.",
        "Build distractors from positions real teachers hold - the behaviourist reflex, the explanation that blames the home, the assumption that a slow reader has a comprehension problem. Each should be defensible to somebody in a staffroom.",
        "Write the justification before the options. If you cannot say in one sentence why the key is right and the nearest distractor is wrong, the item is not ready.",
        "Strike absolutes - always, never, every learner. An absolute falls to a single counter-example, which hands the candidate a free elimination with no pedagogy in it.",
      ],
    },
    {
      type: "p",
      text: "[How to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions) covers the stem and distractor mechanics for every item in the paper, and [competency-based questions for the CBSE pattern](/blog/competency-based-questions-for-the-cbse-pattern) covers the case-based and assertion-reason formats this part leans on.",
    },
    {
      type: "p",
      text: "The language parts hide the same craft inside a comprehension cluster, and they carry one mechanical constraint. There is no shared-passage object to attach a cluster to: a passage is stored inside each question's own text and repeated for every question in the set. The candidate sees it above the question either way, but editing the passage means editing every copy. Settle the passage before you build the cluster, and keep clusters short.",
    },
    {
      type: "h2",
      text: "One Paper, Two Languages",
    },
    {
      type: "p",
      text: "If the paper has to exist in English and Hindi at once, build it as one exam with language variants rather than as two papers. One language is primary, the others must mirror it, and the publish dialog enforces the mirror: sections linked to their primary counterpart, matching question counts, no empty text, matching option counts and answer types. A language that fails any of those is listed with its issues and cannot be ticked for publishing: the paper goes out in the languages that pass, and the broken one waits.",
    },
    {
      type: "p",
      text: "The answer key lives on the primary language alone. Import a translated file with a key inside and the key is ignored - which is what you want, since a key that disagreed across languages would score two candidates differently on one paper. Write the general instructions in both languages too. A Hindi-medium candidate reading an English sentence about the marking scheme is exactly the person you did not mean to leave guessing about guessing.",
    },
    {
      type: "h2",
      text: "Say the Marking Rule in Words, and Check It Yourself",
    },
    {
      type: "p",
      text: "Put one sentence in the general instructions: no marks are deducted for a wrong answer, so attempt every question. Then be clear about how little is checked for you. A notice fires when stored instructions stop describing the paper, but it only judges lines the generator itself wrote, and only about section and question counts. A sentence you typed is never read, and nothing anywhere checks marks.",
    },
    {
      type: "p",
      text: "That notice is advisory. It never blocks publishing, so do not read its silence as approval. Scoring settles at submission: each attempt's marks are worked out and logged when the candidate submits, so fixing a wrong key later changes what the next candidate scores and nothing about the attempts already in your results. Check before you share the link.",
    },
    {
      type: "h2",
      text: "What This Will Not Do For You",
    },
    {
      type: "p",
      text: "The honest list, because the alternative is a teacher finding out on test day.",
    },
    {
      type: "ul",
      items: [
        "No proctoring of any kind - no webcam, no AI invigilation, no lockdown browser, no tab-switch detection - and no question shuffling and no cap on attempts.",
        "Published papers are public: anyone with the link can sit them, and there is no private delivery, no payment and no paywall.",
        "No certificates, no per-student report cards, and no CSV or Excel export of results.",
        "No notification to students that a test exists - no email, SMS or WhatsApp about a paper. You send the link yourself. Account email for signup and password reset does still go out.",
        "Creator accounts cannot sit exams. You can preview your own paper, and the preview records nothing: no attempt, no marks, no analytics.",
        "Sharing needs a published paper; the share action refuses on a draft and tells you to publish first.",
      ],
    },
    {
      type: "p",
      text: "If the paper exists as a PDF, the route open to everyone is the extraction prompt in the [JSON upload guide](/json-upload-guide): run it in whatever AI you already use, then upload the JSON. Server-side PDF import exists but is off by default and switched on per creator on request, so do not plan around it. The importer handles single-correct and multiple-correct items only; anything else arrives as a placeholder to finish by hand, and the key is a zero-based index, so the first option is 0.",
    },
    {
      type: "h2",
      text: "Reading the Results Like a Teacher Educator",
    },
    {
      type: "p",
      text: "Once a batch has sat the paper, the analytics are more useful for repairing your items than for ranking candidates. Three panels earn their place: Most Skipped, Most Reviewed, and Common Misconceptions, which names the wrong option the largest number of candidates chose. On a pedagogy item that last one is the finding. If most of a batch picked the explanation that blames the home, you have located a belief to teach against. If most picked the option you wrote as obviously absurd, the item is broken, not the batch.",
    },
    {
      type: "p",
      text: "Per-question figures average over everyone who attempted that question, so an item late in the paper that few candidates reached reads off a small group - a hint, not a verdict.",
    },
    {
      type: "h2",
      text: "Before You Share the Link",
    },
    {
      type: "ul",
      items: [
        "The exam default is saved, the wrong-answer value matches the notification, and nothing overrides it at section or question level.",
        "Every section holds the count you intended, and the table on the instructions page matches the paper you believe you built.",
        "Section switching and sectional timing are set on purpose rather than by default.",
        "Every question has an answer key, and the pedagogy keys have been argued with by a second reader.",
        "The marking sentence is in the general instructions, in every language you are publishing.",
        "You have previewed the paper on the real exam screen, start to finish.",
      ],
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, a zero-penalty scheme, a bilingual paper, a listing in the public library - sits behind one account. For a paper that mirrors an exam which does charge for a wrong answer, [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) is the companion to this one.",
    },
  ],
  faqs: [
    {
      question: "Should a CTET mock test have negative marking?",
      answer:
        "Only if the current official notification says a wrong answer costs something - read it rather than trusting memory, because this detail changes how a candidate attempts the whole paper. Where the real exam deducts nothing, your mock must deduct nothing: an invented penalty trains candidates to skip questions they would have been right to attempt, and the score it produces is not comparable with the real one. On MockSetu that means setting the wrong-answer value to zero in the marks panel deliberately, rather than leaving the scheme unconfigured.",
    },
    {
      question: "How do I set zero negative marking on an online mock test?",
      answer:
        "Open the marks panel, stay on the Exam default tab, and set three numbers: one mark for a right answer, zero for a wrong answer, zero for a blank. The first preset chip does all three in one tap. Do not add section-level or question-level overrides, because a question given its own rule keeps it even after you change the exam default later. Make sure you actually save the default: an exam with no scheme anywhere is a different state, and it ranks by correct count with no marks shown at all.",
    },
    {
      question: "Can I make one CTET mock test in both English and Hindi?",
      answer:
        "Yes. The paper is one exam with language variants rather than two separate papers. One language is primary and the others must mirror it - linked sections, matching question counts, non-empty text, matching option counts and answer types. A language that fails is listed with its issues and cannot be selected for publishing, so it does not go out until you fix it. The answer key is taken from the primary language only; a key supplied on a translated variant is ignored, which keeps both language groups scored identically. Write the general instructions, including the marking sentence, in both languages.",
    },
    {
      question: "How do I write a good child development and pedagogy question?",
      answer:
        "Anchor the stem in one specific classroom moment and one specific teacher action, then ask what that action assumes or what it will produce. Build the distractors from positions real teachers hold - the behaviourist reflex, the explanation that blames the home - so the candidate has to reason from a theory rather than pick the kindest-sounding option. If three options are obviously callous and one is obviously warm, the item measures tone and should be rewritten. Write the one-sentence justification for the key before you write the options.",
    },
    {
      question: "Can I stop candidates from cheating on an online CTET mock test?",
      answer:
        "No, and it is better to know that before you plan around it. There is no proctoring of any kind - no webcam, no AI invigilation, no lockdown browser and no tab-switch detection - and no question shuffling or cap on attempts. Published papers are public, so anyone with the link can sit them and there is no private delivery to one batch. Treat the mock as practice and diagnosis rather than an assessment of record, and run anything that must be invigilated in a room you control.",
    },
  ],
};

export default post;
