import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "question-palette-and-mark-for-review-for-creators",
  title: "Question Palette and Mark for Review: Why Your Test Needs Them",
  metaTitle: "Question Palette and Mark for Review in a Test | MockSetu",
  metaDescription:
    "The question palette holds four states and Mark for Review flags a question without unanswering it. What each colour means, and the marked-but-empty trap.",
  keywords:
    "mark for review feature online test, question palette online exam, exam palette colours, marked for review meaning, online test navigation, cbt interface mock test, question status online exam, exam simulator palette",
  excerpt:
    "The palette is how a candidate manages a long paper, not decoration around it. Four states, one precedence rule worth teaching, and the marked-but-empty question that quietly costs marks.",
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
    "question palette",
    "exam interface",
    "mock test design",
  ],
  hero: {
    eyebrow: "Marking & Timing",
    h1: "Question Palette and Mark for Review: Why Your Test Needs Them",
    lede: "The grid of numbered tiles is how a candidate manages a long paper. Four states, a precedence rule worth teaching, and one failure mode your instructions have to close.",
  },
  content: [
    {
      type: "p",
      text: "The question palette is the grid of numbered tiles beside the paper, and it carries four states: attempted, marked for review, viewed, and untouched. Mark for Review is a flag a candidate puts on a question they intend to come back to - it does not unanswer anything, and an answer sitting under a marked question is still counted in the evaluation. Both are part of the exam rather than decoration around it, because in a 180-minute paper the palette is the map of what is done and what is not.",
    },
    {
      type: "p",
      text: "A candidate who meets that map for the first time on exam day is learning the interface on the clock, and that time comes out of the paper. That is the whole argument for building practice papers on the same interface. This piece is the creator's side of it - what each state means, where it misleads, and what to write in the instructions. For the wider case, read [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic).",
    },
    {
      type: "h2",
      text: "The Four States, and What Each One Actually Means",
    },
    {
      type: "p",
      text: "The legend sits under the palette on every sitting, on desktop and inside the palette sheet on a phone, so the student never has to remember it. The states are these.",
    },
    {
      type: "ul",
      items: [
        "Green - Attempted. An answer is recorded on that question. A typed answer that was backspaced down to nothing does not count; an empty string is a cleared answer, not an attempt.",
        "Purple - Viewed. The question was opened and left without an answer. Clear Response puts an answered question back here.",
        "Red - Marked for Review. The candidate flagged it. It is a toggle: press it again and the flag comes off.",
        "Plain - Untouched. Never visited. Worth knowing: a question only turns purple when the candidate navigates away from it, so the one they are sitting on stays plain while they read it.",
      ],
    },
    {
      type: "p",
      text: "One structural thing surprises creators building multi-section papers. The palette shows the active section only, numbered from 1 inside that section. When a sitting lets the candidate reach several sections, a chip above the grid says which section number they are on, and the section tabs carry an answered count for each section. A three-section paper does not give the candidate a 1-to-75 grid; it gives three grids. Number your questions in the editor with that in mind, and never write an instruction that refers to \"question 54\" of a sectioned paper.",
    },
    {
      type: "h2",
      text: "Red Wins Over Green, and That Is the Trap",
    },
    {
      type: "p",
      text: "The colour is resolved in a fixed order, and marked for review is tested first. So a question that is both answered and flagged shows red, not green. The palette, on its own, cannot tell a candidate whether a red tile has an answer under it or not. That is deliberate - the flag is the thing the candidate asked to be reminded of - but it has a consequence worth designing around.",
    },
    {
      type: "p",
      text: "One place in the sitting resolves it question by question: the All Questions view. It lists every question in the section with its status, appends \"· answered\" to the Marked for Review label where an answer exists, and carries a running tally of all four states across the top. The section tabs give a coarser signal - a flag count per section - but they cannot say which of those flagged questions are empty. Mention the All Questions view in your instructions. A candidate who knows it exists can audit their own paper in the last few minutes; one who does not is reading a column of red tiles with no idea which are empty.",
    },
    {
      type: "quote",
      text: "A red tile is a promise the candidate made to themselves. The paper does not keep it for them, and nothing on the submit screen reminds them they broke it.",
    },
    {
      type: "h2",
      text: "The Marked-But-Empty Question",
    },
    {
      type: "p",
      text: "Teach this one explicitly rather than hoping the batch works it out. The candidate reads a question, half-sees the method, flags it, moves on - and never returns. At the end they read a wall of red tiles as \"things I attempted and want to check\", when some of them are blank. The flag felt like progress. It recorded none.",
    },
    {
      type: "p",
      text: "Be clear about what the product does and does not do here. The submit confirmation does help where it can: when a candidate can move freely between sections, it lists each section with how many questions are still unanswered before they commit. What it does not do is single out a question that is flagged and empty, because to the counter that question is simply unanswered like any other. No warning fires on the red tile itself. The habit has to come from the instructions and from practice, which is what your mock is for.",
    },
    {
      type: "p",
      text: "The discipline that works, and that you can put in your instruction sheet in one line: flag a question only after answering it with your best guess, or after deciding you will genuinely skip it. A flag on top of an answer is a reminder. A flag instead of an answer is a hole.",
    },
    {
      type: "h2",
      text: "What the Palette Remembers If the Tab Dies",
    },
    {
      type: "p",
      text: "Progress is written as the candidate works, not only at submit, and the flag is part of what is written - each response row carries its own marked-for-review value alongside the answer and the time spent on the question. A signed-in candidate who resumes a sitting gets the answers back, gets the red flags back, and lands on the question they last touched rather than on question 1. The page also puts the browser's own \"Leave site?\" confirm in the way of a stray refresh while the clock runs.",
    },
    {
      type: "p",
      text: "Say this on the instructions page. A candidate who has lost work to a form builder before will not assume it, and one line costs you less than their worrying costs them. The clock is a separate promise, and it is covered in [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit).",
    },
    {
      type: "h2",
      text: "Write the Legend Into the Instructions Before the Clock Starts",
    },
    {
      type: "p",
      text: "The General Instruction field has a Use template action that fills it with the standard exam-hall sheet - twelve numbered points covering the timer, the palette legend, navigating, answering and submitting. It is one click, it is editable afterwards, and it offers an Undo if you had text in the field already. It is also written per language: English and Hindi each have their own sheet, so a bilingual paper gets exam-hall Hindi rather than a machine translation. In a language the template has no copy for, the button does not appear at all - filling an English sheet into a non-English field is worse than leaving the field to you.",
    },
    {
      type: "p",
      text: "Two details in that template matter more than the rest. The legend lines are written as colour tokens, and the instructions page renders them as the palette's own tiles beside the text - the student sees the actual colours before the clock starts, not the words \"green\" and \"red\". And point 4 states the thing this whole article is about: a marked question's answer IS counted, red does not mean unanswered. Do not delete that line when you edit the rest.",
    },
    {
      type: "ul",
      items: [
        "Fill the General Instruction field from the template where it exists - English, Hindi - and edit rather than rewrite. In any other language, write the same points by hand.",
        "Keep the palette legend and the mark-for-review sentence intact; cut the lines that do not apply to your paper instead.",
        "Add one line naming the All Questions view and what it is for.",
        "Add your own line on flag discipline: answer first, then flag.",
        "Preview the paper yourself, open the palette, flag a question without answering it, and look at the tile. If it does not teach you something, your instructions have to.",
        "Check the instructions once more after any late change to sections or timing - the drift notice warns you, but it does not block a publish, and it does not check marks at all.",
      ],
    },
    {
      type: "p",
      text: "If you want a full worked sheet rather than a checklist, [this instructions template for students](/blog/online-exam-instructions-template-for-students) lays one out.",
    },
    {
      type: "h2",
      text: "What the Flags Tell You After the Paper",
    },
    {
      type: "p",
      text: "The flags are not only for the candidate. Analytics for a published exam carries a Most Reviewed card listing up to five questions flagged most often, beside a Most Skipped card listing up to five left unanswered most often. Read them together. A question high on both is worth re-reading for wording before you call it hard - the pattern fits a question candidates recognised, could not act on, and came back to nothing on. A question high on Most Reviewed but not on Most Skipped is doing its job: it made people think twice and they still answered.",
    },
    {
      type: "p",
      text: "Know the limits before you build a workflow on it. These are counts across everyone who attempted, never a list of names, and there is no CSV or Excel export and no per-student report card. Per-question analytics average over the students who attempted that question, so one almost nobody reached looks unrepresentative, because it is.",
    },
    {
      type: "h2",
      text: "What the Palette Is Not",
    },
    {
      type: "p",
      text: "It is a navigation aid and nothing more. There is no proctoring of any kind here - no webcam, no lockdown browser, no tab-switch detection - so a palette full of green tiles is not evidence of anything about how they got there. Questions are not shuffled, there is no cap on attempts, and a published paper is public: anyone with the link can sit it, and there is no private or paid delivery to one batch. The palette makes an honest candidate faster. It does not make a dishonest one visible, and no interface does.",
    },
    {
      type: "h2",
      text: "Build It Once, Then Sit It Yourself",
    },
    {
      type: "p",
      text: "Every exam you create gets this palette - you do not configure it, which is the point. What you control is whether your candidates arrive knowing it. Set the sections so the per-section numbering makes sense, fill the instructions from the template, and then open the paper in preview and work through it as a student would: flag one, clear one, leave one untouched, open All Questions and check that the tally reads the way you expect. A creator preview records nothing, so there is no cost to doing it twice.",
    },
    {
      type: "p",
      text: "A paper built this way rehearses the interface as well as the syllabus, which is most of what separates a mock from a worksheet. For the logistics around a batch sitting - the link, the window, the follow-up - see [how to conduct an online exam for students](/blog/how-to-conduct-an-online-exam-for-students); candidates drilling the [JEE Main interface](/mock-test/jee-main) meet a palette of this shape on the day. MockSetu is free and takes no card, and [everything a creator can build](/for-creators) sits behind one account.",
    },
  ],
  faqs: [
    {
      question: "What does Mark for Review do in an online test?",
      answer:
        "It flags a question the candidate wants to come back to. It is a toggle - press it again and the flag comes off - and it is completely separate from the answer. If a marked question has an answer selected, that answer is counted in the evaluation exactly as it would be without the flag. Marking a question never unanswers it, and leaving a flag on at submit costs nothing by itself.",
    },
    {
      question: "What do the question palette colours mean?",
      answer:
        "Four states. Green means attempted - an answer is recorded. Purple means viewed but not answered, which is also where a question lands after Clear Response. Red means marked for review. A plain tile means the question has not been visited yet, and a question only stops being plain once the candidate navigates away from it. The legend sits under the palette during the sitting, and on the instructions page before it starts if the General Instruction carries the template's legend lines.",
    },
    {
      question: "Why does an answered question show red instead of green?",
      answer:
        "Because marked for review is resolved before attempted, so the flag wins the colour. A question that is both answered and flagged shows red. The palette alone cannot tell you whether a red tile has an answer under it - the All Questions view can, since it labels those questions \"Marked for Review · answered\" and keeps a tally of all four states for the section.",
    },
    {
      question: "Does the exam warn a student about questions they marked but never answered?",
      answer:
        "No. The submit confirmation lists how many questions are still unanswered in each section when the candidate can move between sections freely, but nothing singles out a question that is flagged and empty - to that counter it is just unanswered. The fix is instructional: tell candidates to answer with a best guess first and flag afterwards, and point them at the All Questions view to audit their own paper before they submit.",
    },
    {
      question: "Can a creator see which questions students marked for review?",
      answer:
        "Yes, as counts. The analytics page for a published exam has a Most Reviewed card showing up to five questions flagged most often and a Most Skipped card showing up to five left unanswered most often. They are totals across everyone who attempted, never a list of who did what, and there is no CSV export or per-student report card. A question that is high on both lists is worth re-reading for wording before you decide it was simply hard.",
    },
  ],
};

export default post;
