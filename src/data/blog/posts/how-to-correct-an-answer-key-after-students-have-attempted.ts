import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-correct-an-answer-key-after-students-have-attempted",
  title: "How to Correct an Answer Key After Students Have Attempted the Test",
  metaTitle: "Correct an Answer Key After Students Attempted | MockSetu",
  metaDescription:
    "Found a wrong answer key after the batch sat the paper? What correcting it does and does not change, how to run a challenge window, and what to tell students.",
  keywords:
    "wrong answer key after exam what to do, correct answer key after students attempted, answer key correction online test, answer key challenge window, re-score online test attempts, exclude disputed question, online exam answer key dispute, fix answer key mock test",
  excerpt:
    "Correcting a key fixes the paper from that moment on and changes nothing about the attempts already recorded. Here is the full sequence, including the part that is a correction note rather than a settings change.",
  publishedAt: "2026-10-20",
  updatedAt: "2026-10-20",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Teacher Analytics",
    "answer key",
    "exam administration",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Teacher Analytics",
    h1: "How to Correct an Answer Key After Students Have Attempted the Test",
    lede: "The fix reaches everyone who sits the paper next and nobody who already sat it. That split is the whole problem - and most of the work is what you say, not what you change.",
  },
  content: [
    {
      type: "p",
      text: "Fix the key, and know exactly how far the fix reaches. Correcting an answer key changes what every student who sits the paper afterwards scores. It changes nothing about an attempt already recorded. A practice paper is graded the moment it is handed in - the verdict on each answer and the marks for the attempt are written in the same transaction - and nothing re-grades them later. There is no re-score button: no stored verdict changes, no mark changes, and nobody's rank moves because of the fix. So you are holding two jobs rather than one: a repair that only reaches the future, and a correction note that has to do all the work for the past.",
    },
    {
      type: "p",
      text: "Doing the first and skipping the second is how a small keying slip turns into a batch that quietly stops trusting the test series. What follows covers both: confirm the error, correct it, decide whether the question should stand at all, tell the batch, and close the dispute. If the key came out of a PDF extraction rather than your own typing, look for a pattern before you fix anything: a misread set code, or a key column read off by one, produces wrong answers in groups rather than one at a time. [Fixing answer key errors after PDF extraction](/blog/fixing-answer-key-errors-after-pdf-extraction) covers how to tell which pattern you are looking at.",
    },
    {
      type: "h2",
      text: "Confirm the Key Is Wrong, Not the Reading",
    },
    {
      type: "p",
      text: "A message saying question 47 is wrong is a hypothesis, not a finding. Open the question in the editor beside the printed source and settle it before you touch anything, because an unnecessary correction costs you credibility the original error never did. Three different faults produce an identical complaint: the key is genuinely wrong; the key is right but the option order shifted during entry, so the correct text now sits under a different letter; or the question itself is ambiguous and two options can both be defended. Run these four checks before you change a thing.",
    },
    {
      type: "ul",
      items: [
        "Read the key against the source paper or the official bulletin, not against your memory of teaching the topic.",
        "Check the option order. If the questions were imported, a correct answer is a position in the option list counted from zero - a key printed as (3) means the third option, which is index 2 - and an off-by-one shows up as a run of questions all wrong in the same direction.",
        "On a bilingual paper, work in the primary language. The key lives there and the translated copy mirrors it; the answer field is not editable on a secondary language section at all.",
        "If two options are both defensible, you have an ambiguous question rather than a wrong key. Dropping it is the honest answer, and the next section covers what dropping actually does.",
      ],
    },
    {
      type: "h2",
      text: "What Correcting the Key Changes, and What It Does Not",
    },
    {
      type: "p",
      text: "A corrected key updates the paper from that moment on. Every sitting after the fix is graded against the new answer. Every sitting before it keeps the verdict and the marks it was given, because both were computed and stored when the paper was submitted, and those stored values cannot be rewritten from a browser. That design is deliberate - it is what stops a student editing their own answer sheet after handing it in - and the price paid for it is that a bad key cannot be undone for the people it hit.",
    },
    {
      type: "p",
      text: "There is a second effect worth knowing before a student reports it to you as a bug. The review screen pulls the answer key fresh, while on a single-answer question the verdict printed beside it is the one stamped at submission. So once you have corrected the key, a student who happened to pick the now-correct option can open their review and see their own answer listed as the right answer and still marked incorrect. A multi-correct question behaves the other way round: that screen recomputes it, so the tick can flip there while the recorded score stands. Either way nothing is broken and nothing has been re-scored - the two halves of that screen are simply from different moments. Explain it in the correction note rather than waiting to be asked.",
    },
    {
      type: "h2",
      text: "Unpublish, Correct, Republish",
    },
    {
      type: "p",
      text: "A published exam is locked in the editor. The page carries a banner saying the exam is live and that editing is disabled to protect test integrity, the fields are greyed out, and the save button is disabled with a tooltip telling you to unpublish first. That lock works in your favour here, because unpublishing also pulls the paper out of the public library - so nobody new starts the wrong version while you are halfway through fixing it.",
    },
    {
      type: "ul",
      items: [
        "Unpublish the exam. It leaves the public [mock test library](/marketplace) and the editor unlocks.",
        "Correct the answer in the exam editor, on the primary language section. Saving there pushes the new key to the translated copies. The separate section editor does not do that, so a key fixed only there leaves the other language grading against the old answer.",
        "Re-read that question's marking scheme while you are in there. Marks live in a separate panel and nothing ties a key change to it.",
        "Publish again. The exam keeps the same address, so a link or QR code already with your students still works.",
        "Open the paper in preview and read the corrected question end to end. A creator preview records nothing, so it costs you only the minutes.",
        "Send the correction note the same day. Nothing on the platform notifies students about a test - no email, no SMS, no WhatsApp - so this happens only if you do it.",
      ],
    },
    {
      type: "h2",
      text: "Dropping the Question Instead of Correcting It",
    },
    {
      type: "p",
      text: "Sometimes the right answer is that the question should never have been asked. The section editor carries an Exclude from exam checkbox on every question, editable on the primary language section only. An excluded question is not served to anybody who sits the paper afterwards, and on a bilingual paper the exclusion is mirrored to the language twin so both cohorts keep seeing the same paper.",
    },
    {
      type: "p",
      text: "Know its limit before you reach for it. Excluding a question removes it from the per-question table on your dashboard and from the question count the dashboard divides by - but the answers already recorded against it still count towards those attempts' correct totals. The accuracy figures for sittings that happened before the exclusion will therefore read high. Treat them as historical from that point, and write down in your own records which paper they belong to.",
    },
    {
      type: "quote",
      text: "A corrected key repairs the paper. Only a correction note repairs the batch - and that is the half nobody schedules.",
    },
    {
      type: "h2",
      text: "Telling the Batch Before They Tell Each Other",
    },
    {
      type: "p",
      text: "Assume somebody has already screenshotted the wrong key into a group chat. Get ahead of it with a note that does four things: names the question, states the corrected answer, gives the reasoning or the source behind it, and says plainly that scores already recorded were not changed. That fourth sentence is the one that buys you trust, because it is the one a student can verify for themselves by opening their own review. A note that quietly fixes the key and says nothing about scores reads, correctly, as a cover-up.",
    },
    {
      type: "p",
      text: "Then deal with the student who lost more than a mark. Somebody revised against your wrong key and now believes the wrong thing, and that damage is a learned error rather than a score. It is the real reason the note has to carry the reasoning and not only the letter. If the question sat early in the paper and a student visibly changed their approach to everything after it, the honest remedy is a re-sit rather than a goodwill adjustment: there is no cap on attempts, a new sitting is graded against the corrected key, and the earlier attempt simply stays on record beside it.",
    },
    {
      type: "h2",
      text: "Running a Challenge Window and Closing It",
    },
    {
      type: "p",
      text: "Inviting challenges is cheaper than defending a key one message at a time. There is no challenge form inside the product, so the window is something you run on your own channel - and that is fine, because what makes it work is the deadline and the format rather than any software. Announce it alongside the results, keep it short, and insist on a reason rather than a show of hands.",
    },
    {
      type: "ul",
      items: [
        "State the window when you release the paper: which channel it runs on, and the exact closing time.",
        "Require the question number, the answer the student believes is right, and one line of justification with a source. No source, no challenge.",
        "Collect everything until the deadline and answer nothing individually before it. Replying one at a time leaves the batch holding several versions of your position.",
        "Publish one ruling for the whole batch - challenges upheld, challenges rejected, and a line of reasoning for each, including the rejected ones.",
        "Say what happens to marks, which is nothing for attempts already recorded, and whether the question has been corrected or excluded for future sittings. Then close the thread.",
      ],
    },
    {
      type: "h2",
      text: "What the Dashboard Will and Will Not Tell You",
    },
    {
      type: "p",
      text: "The exam dashboard can show you a bad key before any student reports one. Per question it gives how many got it right, how many got it wrong, how many left it blank, the average time spent on it, and the single wrong option the largest group chose. A question where the batch converged on one wrong option is the first thing to re-check against the source: they agreed with each other and disagreed with you. Read that table the day the first sittings land, not the week after.",
    },
    {
      type: "p",
      text: "What it will not give you is a list of names. Apart from a top-three leaderboard of usernames, the figures are aggregates - there are no per-student report cards and no CSV or Excel export - so the register of who lost which mark has to live in your own file. If you intend to compensate anyone, you will be doing it by hand.",
    },
    {
      type: "h2",
      text: "The Habit That Makes This Rare",
    },
    {
      type: "p",
      text: "Every answer-key correction is a check somebody did not run. The cheapest version is a second person: have one colleague sit the paper on a student account and compare their answer sheet against your key. Know how the platform constrains that: a student account cannot open an unpublished paper at all, and a published paper is public and attemptable by anyone - so the dry run belongs in the gap between publishing and sharing the link, and you unpublish again if the sheet disagrees with you. Your own preview will not do instead: it records nothing, so there is no answer sheet to compare. [How to conduct an online exam for students](/blog/how-to-conduct-an-online-exam-for-students) covers the run-up in full, and [how to create a previous year paper mock test](/blog/how-to-create-a-previous-year-paper-mock-test) covers the case where the key is somebody else's and transcription is the entire risk. [Everything a creator can build here](/for-creators) is free and takes no card - and the one thing it will never do is re-score a paper somebody has already handed in.",
    },
  ],
  faqs: [
    {
      question: "If I correct the answer key, do students who already attempted get re-scored?",
      answer:
        "No. A practice paper is graded at the moment it is submitted, and the verdict on each answer and the marks for the attempt are written then. Correcting the key afterwards changes what every student who sits the paper next scores, and leaves every attempt already recorded exactly as it was. Nothing already recorded is re-scored, no mark moves, and there is no re-score button. The only remedy that reaches a student whose score was affected is to let them sit the corrected paper again as a new attempt.",
    },
    {
      question: "Can I edit the answer key while the exam is published?",
      answer:
        "The exam editor is locked while a paper is published - the page says editing is disabled to protect test integrity, the fields grey out, and the save button stays disabled until you unpublish. Unpublish, correct the key on the primary language section, then publish again. The exam keeps the same address, so links and QR codes already shared with your students still work. Unpublishing also removes the paper from the public library while you work, which is what you want anyway.",
    },
    {
      question: "What happens if I exclude a disputed question after students have attempted?",
      answer:
        "The question stops being served to anyone who sits the paper afterwards, and on a bilingual paper the exclusion is mirrored to the language twin so both cohorts see the same paper. It does not change any attempt already recorded. It does change your dashboard: the question disappears from the per-question table and from the count the dashboard divides by, while the answers already given to it still count towards those attempts' correct totals, so accuracy for the earlier sittings reads high.",
    },
    {
      question: "How should I run an answer key challenge window?",
      answer:
        "On your own channel, because there is no challenge form inside the product. Announce the window with the results and give it a hard closing time. Ask for three things per challenge: the question number, the answer the student thinks is right, and a one-line justification with a source. Answer nothing individually before the deadline, then publish a single ruling for the whole batch covering what was upheld, what was rejected and why, and state that marks already recorded do not change.",
    },
    {
      question: "Will students be notified automatically that the answer key changed?",
      answer:
        "No. MockSetu sends transactional account email - signup confirmation and password reset - but it sends nothing to students about a test, so there is no email, SMS or WhatsApp alert for a key correction, a republish or a new paper. Telling the batch is entirely on you, and it should go out the same day you make the fix. A student who discovers a changed key on their own review screen before you mention it will assume the worst reading of it.",
    },
  ],
};

export default post;
