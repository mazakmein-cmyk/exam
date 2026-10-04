import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-publishing-previous-year-papers-brings-students",
  title: "How Publishing Previous Year Papers Brings Students to Your Institute",
  metaTitle: "Previous Year Papers as Coaching Marketing | MockSetu",
  metaDescription:
    "Aspirants search for past papers by name, year and session. Publish faithful ones, tag them Previous Year, and the public library turns that search into students.",
  keywords:
    "previous year papers coaching marketing, publish previous year papers online, PYQ marketing for coaching, past papers lead generation, free previous year paper test series, coaching institute student acquisition, previous year paper online test",
  excerpt:
    "A past paper is the one piece of content nobody has to be persuaded to want. Here is why publishing faithful ones pulls students in, and why a sloppy one does more damage than publishing nothing.",
  publishedAt: "2026-10-14",
  updatedAt: "2026-10-14",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Coaching Growth",
    "previous year papers",
    "student acquisition",
    "SSC",
  ],
  hero: {
    eyebrow: "Coaching Growth",
    h1: "How Publishing Previous Year Papers Brings Students to Your Institute",
    lede: "Past papers work because the demand is already there. An aspirant hunting a specific paper by exam, year and session is not being sold anything - they are looking for a document. Answer that search faithfully and you have their attention.",
  },
  content: [
    {
      type: "p",
      text: "Publishing previous year papers brings students because you are not creating demand, you are meeting it. An aspirant types an exam name, a year and a session into a search box because they want that exact paper, and nobody had to convince them it was worth doing. A faithful online reproduction answers that search completely. A loose one - the same name over a different clock, a key you worked out yourself - answers it wrongly, and the candidate finds out fast, because they are holding the original.",
    },
    {
      type: "p",
      text: "This article is the distribution side. For the build itself - the paper type field, the shift code, the clock, the marking, the key - read [how to create a previous year paper mock test](/blog/how-to-create-a-previous-year-paper-mock-test) alongside it.",
    },
    {
      type: "h2",
      text: "The Demand Is Already There. You Only Have to Be Findable.",
    },
    {
      type: "p",
      text: "A mock you wrote is something you have to explain. \"Mock Test 5\" means nothing to a stranger; its value rests entirely on whether they already trust you. A past paper is the opposite. It has a name, that name is what the candidate is searching for, and your reputation is not the thing being evaluated - the fidelity of the reproduction is. That inversion is the whole marketing argument: a past paper can be judged on its merits by somebody who has never heard of you, and a mock you wrote cannot.",
    },
    {
      type: "p",
      text: "So make the name do the work. The paper's title should read the way a candidate would type it: exam, year, session or set code, in that order. In MockSetu's [public library](/marketplace) the search box matches a paper's title and its category, and - only for papers actually tagged as previous year - the \"Previous Year Paper\" label itself. Alongside the search there are dropdown filters for category and for paper type, and once \"Previous Year Paper\" is ticked a year filter appears beside them, provided the published papers carry years at all. Those filters are held in the page URL, so a pre-filtered view of the library is a single link you can paste into a group, a post or your own site.",
    },
    {
      type: "p",
      text: "One caveat before you plan a whole series around this. The field that marks a paper as Previous Year rather than Mock is a per-creator grant, off by default and switched on per account on request. A creator who does not have it never sees the field at all, and their paper is stored as a mock - no amber badge on the library card, nothing for the year filter to find, and it never turns up for a student filtering the library for previous year papers. Ask for the grant before you build, not after you have a finished series to re-tag.",
    },
    {
      type: "h2",
      text: "Faithful Means Four Things, and Candidates Check All Four",
    },
    {
      type: "p",
      text: "Fidelity is not a vague virtue here. It decomposes into four decisions, and a candidate with the original PDF open beside your test can verify every one of them.",
    },
    {
      type: "ul",
      items: [
        "The real identity: the exam, the year, and the shift, session or set code, in the paper's own name rather than buried in the description.",
        "The original clock, section by section - not one flat duration over the whole paper when the real one ran in separately timed parts.",
        "The original marking scheme, including the section where it changes. SSC MTS is the clean example: 90 questions for 270 marks across two sessions of 45 minutes, where Session I is qualifying only and carries no negative marking while Session II counts towards merit and deducts one mark for a wrong answer. One scheme across that whole paper is not a reproduction.",
        "The printed official key, transcribed. Not solved by you, not solved by an AI, not inferred from a coaching solution PDF. Where the official key was later revised, use the revised one and say so in the instructions.",
      ],
    },
    {
      type: "p",
      text: "For any other exam, the pattern is whatever the current official bulletin says - send yourself to that bulletin rather than to memory, because paper patterns change between cycles and a confidently wrong reproduction is the exact failure this article is about.",
    },
    {
      type: "h2",
      text: "A Sloppy Past Paper Costs More Than No Paper",
    },
    {
      type: "p",
      text: "Publishing nothing is neutral. Publishing a bad reproduction is negative, and it is negative in a way that is hard to walk back. A wrong key does not just cost a mark - it teaches a wrong fact to someone who will carry it into the hall, and they will believe it precisely because it came labelled as an official paper. A wrong clock teaches the wrong pacing, which is the one thing a past paper is supposed to train.",
    },
    {
      type: "p",
      text: "There is also a mechanical reason to get it right the first time. Marks are worked out at the moment a paper is submitted and written to that attempt. Correcting a key afterwards changes what the next student scores and not what the ones who already sat it scored, and nothing re-scores a completed attempt for you. On a published paper a wrong key is only ever half-fixable.",
    },
    {
      type: "quote",
      text: "A past paper is the one piece of content where your reader already owns the answer key. Publish it as if they are checking - because they are.",
    },
    {
      type: "h2",
      text: "The Order That Avoids Rework",
    },
    {
      type: "p",
      text: "Build and publish in this order and nothing has to be redone.",
    },
    {
      type: "ul",
      items: [
        "Request the paper type grant first, so the field is there when the first paper is created.",
        "Name the paper the way a candidate searches for it, and put the source and the key's revision status in the description.",
        "Create the sections on the original clock before adding a single question - section structure is the thing that is painful to change later.",
        "Set the exam-level marking scheme to whatever most of the paper uses, then override only the section that genuinely differs.",
        "Get the questions in. If the paper exists as a PDF, the bulk route is JSON: run the published extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI you already use, then upload the output. The importer leaves numeric, TITA and match-the-column questions for you to type in by hand, so budget for that.",
        "Transcribe the key against the official document, question by question, before you publish rather than after.",
        "Publish, then copy the share link. The Share button refuses an unpublished exam and tells you to publish it first, so there is no window where you can circulate a draft by accident.",
      ],
    },
    {
      type: "h2",
      text: "What \"Public\" Actually Means Here",
    },
    {
      type: "p",
      text: "Being honest about this up front saves a difficult conversation later. A published paper on MockSetu is public. Anyone with the link can attempt it, and so can anyone scrolling the library. There are no payments, no paywalls, no private delivery to one enrolled batch and no cap on attempts. If your plan depends on a paper only your fee-paying students can sit, this is the wrong tool and you should find that out now.",
    },
    {
      type: "p",
      text: "There is also no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling. A published past paper is a practice artefact and a shopfront, not an assessment whose scores you could defend to anyone. Treat the leaderboard as encouragement, not as a ranking you would stand behind.",
    },
    {
      type: "p",
      text: "Two smaller rules worth knowing. A creator account cannot sit an exam; a creator can preview their own paper, and a preview records nothing at all - no attempt, no score, no entry in the analytics - so your own test runs never pollute the numbers. And a published exam cannot be deleted until you unpublish it - which is worth knowing before you reach for delete at all, because deleting an exam takes its recorded attempts with it.",
    },
    {
      type: "h2",
      text: "What You Learn From the People Who Turn Up",
    },
    {
      type: "p",
      text: "The analytics page for a paper gives a creator six summary figures: total attempts, unique students, completion rate, repeaters, average score percentage, and average time per attempted question. Repeaters - the count of students with more than one attempt on the paper - is the one to watch when you are judging whether past papers are pulling people in, because a second attempt is a choice the student made after they had already seen your work.",
    },
    {
      type: "p",
      text: "Be clear about where that stops. There is no CSV or Excel export of results and no per-student report card, and no email, SMS or WhatsApp notification goes out about a test - the only mail the product sends is transactional account mail for signup and password reset. So the follow-up is yours to run off-platform. The paper brings the student to the door; converting them is still a phone call, a class invitation or a message you send yourself.",
    },
    {
      type: "h2",
      text: "Turn One Paper Into a Reason to Come Back",
    },
    {
      type: "p",
      text: "A single past paper is a visit. A dated run of them is a habit, and the habit is what an institute is actually buying. Publish on a schedule a candidate can anticipate, and announce the next one at the end of the instructions on the current one, since you have no notification channel to do it for you.",
    },
    {
      type: "p",
      text: "Duplicating is how the run stays cheap. A duplicate carries the marking scheme, the timing groups and the language links across with it, so last year's paper is the shell for this year's and you are left editing questions rather than rebuilding structure. It is best-effort and fail-soft by design, so open the copy and check the marking and the clocks before you start typing.",
    },
    {
      type: "p",
      text: "Past papers also sit naturally inside a wider offer. [A free test series as a lead magnet](/blog/free-test-series-as-a-lead-magnet-for-coaching-institutes) covers the economics of giving work away, and [how to start an online test series for your coaching institute](/blog/how-to-start-an-online-test-series-for-your-coaching-institute) covers the schedule and the sequencing. If SSC MTS is your cluster, send candidates to the [SSC MTS preparation guide](/ssc-mts) and let the papers carry the rest of the argument.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, per-section marking, bilingual papers and a listing in the public library - sits behind one account, and a faithful past paper is the cheapest honest advertisement an institute has.",
    },
  ],
  faqs: [
    {
      question: "Why do previous year papers attract students better than mock tests?",
      answer:
        "Because the demand already exists. A candidate searching for a specific past paper by exam, year and session knows exactly what they want and needs no persuading, while a mock test you wrote has to be explained and rests on trust you may not have yet. With a past paper the thing being judged is the fidelity of the reproduction rather than your reputation, which is a far easier bar for a new institute to clear.",
    },
    {
      question: "What makes a published previous year paper faithful?",
      answer:
        "Four things, all of which a candidate holding the original PDF can check: the real exam, year and shift or session code in the paper's own name; the original clock reproduced section by section; the original marking scheme including any section where it changes; and the printed official key transcribed rather than solved by you. Where the official key was revised later, use the revised version and say so in the instructions.",
    },
    {
      question: "Can I mark a paper as a Previous Year Paper on MockSetu?",
      answer:
        "Only if your account has been granted the paper type field. It is off by default and switched on per creator on request. Without it the field never appears and the paper is stored as a mock, which means no Previous Year Paper badge on its library card and no appearance at all when a student filters the library for previous year papers or by year. Request the grant before you build a series rather than after.",
    },
    {
      question: "Can I keep a published previous year paper private to my own batch?",
      answer:
        "No. Published papers on MockSetu are public - anyone with the link or anyone browsing the library can attempt them, and there are no payments, paywalls, private delivery or attempt limits. There is also no proctoring of any kind. Publish a past paper as a shopfront and a practice artefact, and keep anything that needs restricted access somewhere else.",
    },
    {
      question: "What can I actually see about the students a past paper brings in?",
      answer:
        "The analytics page for an exam shows six figures: total attempts, unique students, completion rate, repeaters, average score percentage, and average time per attempted question, plus a top-students leaderboard by username. There is no CSV or Excel export and no per-student report card, and the product sends no email, SMS or WhatsApp notification about tests, so any follow-up with those students is something you organise yourself.",
    },
  ],
};

export default post;
