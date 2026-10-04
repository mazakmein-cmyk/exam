import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-share-an-online-test-with-students",
  title: "How to Share an Online Test With Students: Links, QR Codes and WhatsApp",
  metaTitle: "Share Online Test Link With Students: QR & WhatsApp | MockSetu",
  metaDescription:
    "Publish the paper, copy its link, and send it by WhatsApp or QR code. What students see when they tap it, and why a published test link is public, not a lock.",
  keywords:
    "share online test link with students, how to share an online test, send test link on whatsapp, qr code for online test, share mock test with students, online test link for students, distribute test to batch, join code live exam",
  excerpt:
    "A published paper has a link, and that link is the entire distribution mechanism. Here is how to publish it, turn it into a QR code, post it to a WhatsApp group without it getting buried, and what a student actually sees when they tap it.",
  publishedAt: "2026-09-18",
  updatedAt: "2026-09-18",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a teacher
    // distributing a paper into the student library instead.
    "For Creators",
    "Exam Creation",
    "test distribution",
    "whatsapp for teachers",
    "live exams",
    "online mock tests",
  ],
  hero: {
    eyebrow: "Creator Playbook",
    h1: "How to Share an Online Test With Students: Links, QR Codes and WhatsApp",
    lede: "Publish the paper, copy its public address, and send that one link. Everything else — QR codes on the classroom wall, a WhatsApp post that does not get buried, a live exam's join code — is a variation on the same step.",
  },
  content: [
    {
      type: "p",
      text: "Sharing an online test is three steps. Publish the paper. Open the card's menu in your dashboard and hit Share. Paste what lands on your clipboard — that URL is the whole distribution mechanism. A WhatsApp group, a QR generator for the classroom wall, a printed handout: the same address on every surface, never a second link. On MockSetu, a student who taps a published mock can start attempting it on a phone without creating an account at all. There is no invite system to configure, no roster to upload, and no separate student code for a normal mock test.",
    },
    {
      type: "p",
      text: "The honest part, and the one to say out loud: that link is a convenience, not a lock. A published paper sits in the public library and anyone who finds it can attempt it. If you need a controlled sitting, a shared link is the wrong instrument, and the rest of this article says what to use instead.",
    },
    {
      type: "h2",
      text: "Publish First: An Unpublished Paper Has Nothing to Share",
    },
    {
      type: "p",
      text: "Start here, because this is the step people skip. The paper is finished — sections timed, marks set, key checked — and it is still private to your account, so there is no public page and no address to copy. Publishing is what creates the link. You publish to the public library in the languages you actually built the paper in: English, Hindi, or both if you entered both. The paper gets its public address at that moment, and not before. If the paper itself is not built yet, [how to create an online mock test](/blog/how-to-create-an-online-mock-test) covers that half of the job.",
    },
    {
      type: "p",
      text: "Before you publish, run the paper once in preview. A creator previewing their own exam records nothing — no attempt, no responses, nothing in your own analytics — so a dry run costs you nothing but your own time. Walk the instructions page, check the paper table against your sections and per-section minutes, and confirm the marks for correct, wrong and unattempted. MockSetu also warns you when the instructions stop matching the paper after an edit; clear that drift warning before the link goes out, not after thirty students have read instructions describing a different test.",
    },
    {
      type: "p",
      text: "Publishing is reversible: unpublish when the window closes, and duplicate the exam for the next batch instead of rebuilding it. The copy carries your sections, questions, timing groups and marking scheme, so the next cycle starts from a working paper rather than a blank one. Deleting is not reversible in the way people expect — deleting an exam deletes its attempts with it. Unpublish when you mean \"take it down\"; delete only when you mean \"this never happened\".",
    },
    {
      type: "h2",
      text: "Where the Link Comes From, and What to Check Before You Send It",
    },
    {
      type: "p",
      text: "Share hands you the exam's own instructions page, and it refuses until the paper is published — which is the platform telling you there is nothing to send yet. The same action sits on the paper's card in the [public library](/marketplace), so either surface gives you the identical address. Take it from the clipboard rather than retyping it, and then run the checks below before you send it anywhere.",
    },
    {
      type: "ul",
      items: [
        "Open the link in a logged-out private browser window and confirm the instructions page loads with a start button on it — then stop. A logged-out window is not the preview path and not a dry run either: a guest sitting writes nothing to the database, parks its answers in that browser, and ends by asking the student to sign in before it will show a score. Preview, signed in as the creator, is the path that walks the whole paper end to end and records nothing.",
        "Open it on a phone, not only on your laptop. A five-inch screen on mobile data is where the link actually gets tapped, so that is the screen the instructions page has to survive.",
        "Settle section switching — locked or open — and any pooled timing group before you share. Changing those halfway through a batch makes the class-level numbers meaningless.",
        "If the paper is bilingual, pick each language on the instructions page in turn and check that the options are translated too, not just the question stems.",
        "Decide the window in advance: the date, the start time, and the last time you will accept an attempt. The platform does not enforce a window for you, so the window lives in your message.",
      ],
    },
    {
      type: "h2",
      text: "QR Codes: For a Wall, a Whiteboard or a Printed Sheet",
    },
    {
      type: "p",
      text: "MockSetu generates a QR code in exactly one place, and it is not this one: a live exam's presenter panel puts the room's code and a scannable square on the big screen. A published mock has no QR button, so that is a two-minute job in any free QR generator — paste the exam link, download the image, done. The reason to bother is offline reach. A QR code on the classroom wall, on the last slide of a projector deck, or printed at the top of a worksheet converts students who are physically in front of you and will never scroll back through a chat group to find the link.",
    },
    {
      type: "ul",
      items: [
        "Print the code at a minimum of three centimetres square on an A4 handout, and larger on a wall poster — a tiny code fails on older phone cameras in bad classroom light.",
        "Put the exam name and the attempt window in plain text directly under the code. A bare QR on a wall tells nobody what it is for.",
        "Print the link in text as well. Camera scanning fails often enough that a typed fallback is worth the line.",
        "Generate a fresh code if you duplicate the exam for a new batch. A duplicate is a different paper with a different address, and an old poster will keep sending this year's students to last year's test.",
        "Keep one printed master in a folder. Next cycle, you reprint instead of rebuilding.",
      ],
    },
    {
      type: "h2",
      text: "WhatsApp and Telegram: Getting the Link Seen Instead of Buried",
    },
    {
      type: "p",
      text: "Be clear about what the platform does not do here: MockSetu sends your students no emails, no SMS and no WhatsApp messages about a test. There are no automated reminders and no notification system pointed at your batch. Distribution is entirely yours, which means the message you write is doing the work a notification engine would do elsewhere — and in an active group, a link posted with no context scrolls out of sight behind the next forward.",
    },
    {
      type: "p",
      text: "What works is boring and repeatable. One message, not five. Exam name, number of questions, total marks, duration, marking scheme in one line, the attempt window, and the link last so it sits at the bottom where a thumb lands. Pin that message in the group. Repost the same message once, roughly thirty minutes before the window closes; your analytics page carries the attempt count for that paper, so you can say how many have sat it so far. For the wording of the instructions themselves, the [online exam instructions template](/blog/online-exam-instructions-template-for-students) gives you text you can paste in and edit.",
    },
    {
      type: "p",
      text: "If your group is used to receiving a PDF question paper instead of a link, expect a week of friction while the habit changes. It is worth pushing through, and what actually changes is laid out in [how a PDF question paper becomes a computer-based test](/blog/pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test) — the short version is that a PDF gives you no timing, no auto-scoring and no class-level data, and a link gives you all three for the same effort from you.",
    },
    {
      type: "quote",
      text: "The link is not the announcement. A link with no date, no duration and no marking scheme is a link nobody taps.",
    },
    {
      type: "h2",
      text: "What a Student Actually Sees When They Tap the Link",
    },
    {
      type: "p",
      text: "On a published mock, a student can start as a guest — no account, no sign-up form, no OTP — on a phone or a laptop. They land on the instructions page with the paper table, choose their language there if you published the paper bilingually, start the exam, and get the exam screen: the question palette, mark for review, fullscreen, the section clock and auto-submit when the time expires. The language is picked once on the way in, not toggled mid-paper, so the choice has to be obvious before they press start. Nothing to install. That guest path is why a link is enough on its own: there is no roster to build before a student can start.",
    },
    {
      type: "p",
      text: "One thing worth telling them in the message: a signed-in student who drops mid-exam — call drops, battery, a flaky tower — can come back within about five minutes on the same device and continue. A student on a shaky connection should [sign in before starting](/student-auth) rather than attempting as a guest. If your batch has never sat an online paper before, forward them [how to take mock tests](/blog/how-to-take-mock-tests) a day earlier; it costs you one message and removes most of the panic on test day.",
    },
    {
      type: "h2",
      text: "A Published Paper Is Public. Say So Out Loud",
    },
    {
      type: "p",
      text: "This is the limitation that decides how you can use a shared link at all, so here it is plainly. Publishing puts the paper in the public library. Anyone who finds it can attempt it — not only the students you sent the link to. There are no payments, no paywalls and no subscriptions, which also means there is no private delivery to one batch only and no way to sell access. There is no limit on attempts, no question shuffling or randomisation, and no proctoring of any kind: no webcam, no AI monitoring, no lockdown browser, no tab-switch detection.",
    },
    {
      type: "p",
      text: "Design around that rather than pretending otherwise. Treat a shared-link mock as a diagnostic, not as a selection instrument. If a score has to decide something — a scholarship, a batch promotion, a seat — sit the batch in your own room, on your own schedule, with you watching. A live exam does not close that gap: a join code can be forwarded exactly the way a link can, and there is no proctoring behind either one. What you can do is design the paper so that copying is not worth much, which is the subject of [reducing cheating without proctoring](/blog/how-to-reduce-cheating-in-online-tests-without-proctoring). And note what the analytics on a shared-link mock will and will not give you: section-wise accuracy, time per question and where the class as a whole struggled, plus a top-three board carrying those students' handles — never a real name, never an email address, and never a paper you can open student by student.",
    },
    {
      type: "h2",
      text: "Live Exams Are Shared Differently: A Join Code as Well as a Link",
    },
    {
      type: "p",
      text: "A live exam is the other distribution mode, and it travels two ways at once. Your dashboard copies a link straight to the room, and the same short code can be read out, written on the board or left on the projector for students to type in — which is the half a chat link cannot do. Either way they sign in once before joining, unlike a published mock: say that in advance, because a room full of students creating accounts is how a live exam loses its first ten minutes. A scheduled start with a countdown and auto-start moves that scramble to before the clock matters.",
    },
    {
      type: "p",
      text: "The projector view is the point of the format: themes for the big screen, answer options shown or hidden, the correct answer revealed when time is up, live answer bars as the class responds, and standings you can show to everyone, keep to yourself, or switch off. Names can be hidden. There is a private \"I'm lost\" button only you see, with creator-only insights beside it. Afterwards the live report gives class accuracy, participation, drop-off, median score, median answer time per question, a fast-or-slow against right-or-wrong split, the \"I'm lost\" taps, a students tab and a shareable link. One caveat on scale: a very large session is better run as a scheduled mock with a shared link than as a single live room.",
    },
    {
      type: "h2",
      text: "After You Share: The First Hour and the Day After",
    },
    {
      type: "p",
      text: "The first hour tells you whether the distribution worked. The day after tells you whether the paper did.",
    },
    {
      type: "ul",
      items: [
        "Twenty minutes in, check whether attempts are landing at all. If the count is still zero and the group is active, the link is wrong or the paper is not published — open the link logged out and look at it, without starting it.",
        "Answer the first two or three student questions in the group, publicly. The same confusion is sitting silently in forty other heads.",
        "If a key turns out to be wrong, unpublish the paper to fix it — a published exam is locked for editing — then publish again on the same address, so the link and the QR code still work. The attempts already recorded keep the marks they were given; nothing re-scores them. Tell the batch rather than quietly republishing.",
        "The next morning, read the aggregated analytics before you teach: section-wise accuracy and time per question tell you which two questions to re-explain, which is the entire return on running the test.",
      ],
    },
    {
      type: "h2",
      text: "The Short Version",
    },
    {
      type: "p",
      text: "Publish, copy the link, send it with the date, duration and marking scheme attached, and put a QR code wherever your students physically are. Expect the paper to be public, because it is. Use a live exam's join code when you need everyone in one room at one time, and tell them to sign in first. If you are setting all this up for the first time, the [creator side of MockSetu](/for-creators) walks through building and publishing the paper itself, and the [step-by-step guide to running an online exam for a batch](/blog/how-to-conduct-an-online-exam-for-students) covers the operational half. It is free and there is no card, and MockSetu grants a Verified Creator badge on request.",
    },
  ],
  faqs: [
    {
      question: "How do I share an online test link with students?",
      answer:
        "Publish the exam first — Share refuses on an unpublished paper, because there is no public page yet and therefore no link. Once it is published, open the exam card's menu in your dashboard and hit Share: the address lands on your clipboard, and you paste it into a WhatsApp or Telegram group, a QR generator, or a printed handout. On MockSetu a student can tap a published mock and start it as a guest on a phone, with no account needed, so there is no roster to upload and no invite to configure.",
    },
    {
      question: "Can I make an online test private so only my batch can attempt it?",
      answer:
        "No. A published paper goes into the public library and anyone who finds it can attempt it. The link is a convenience, not a lock, and there is no paid or private delivery to a single batch. A live exam's join code is not a workaround either: a code can be forwarded exactly the way a link can, and there is no proctoring behind either one. If a score has to decide something, sit the batch in your own room under your own supervision, and treat link-shared mocks as diagnostics.",
    },
    {
      question: "How do I turn my test link into a QR code?",
      answer:
        "There is no QR button on a published mock — MockSetu only draws one for a live exam's presenter panel — so use any free QR generator: paste the published exam's link, download the image, and print it. Keep it at least three centimetres square on paper, put the exam name and attempt window in plain text beneath it, and print the link in text too as a fallback for cameras that fail to scan. Generate a fresh code whenever you duplicate the exam for a new batch, because the duplicate has a different address.",
    },
    {
      question: "Will students get a notification or a reminder about the test?",
      answer:
        "Not about the test. MockSetu sends no emails, SMS or WhatsApp messages to your students about a paper you have published, and there are no automated reminders. Account email such as signup verification and a password reset is a separate thing and does still go out. So distribution is entirely yours, which is why the message you post matters: put the exam name, question count, total marks, duration, marking scheme and the attempt window in one pinned message with the link at the bottom, and repost it once about thirty minutes before the window closes.",
    },
    {
      question: "How is sharing a live exam different from sharing a mock test link?",
      answer:
        "A live exam can be joined either by its link or by typing its short code, which is what lets you read it out in a room or leave it on the projector. The real difference is the sign-in: students must be signed in before they can join a live room, where a published mock lets them start as a guest — so tell them that in advance. You can schedule the start with a countdown and auto-start, run a projector view with the answer options shown or hidden, reveal the correct answer when time is up, and show or hide standings and student names. Afterwards you get a live report with class accuracy, participation, drop-off, median answer time per question and a shareable link.",
    },
    {
      question: "What does a student see when they open the test link?",
      answer:
        "They land on the instructions page with the paper table, pick a language there if the paper was published in both English and Hindi, and then get the exam screen: question palette, mark for review, fullscreen, the section clock and auto-submit when time expires. The language is chosen on the way in rather than toggled mid-paper. Nothing needs to be installed. A signed-in student who drops mid-exam can return within about five minutes on the same device, which is a good reason to ask students on weak connections to sign in rather than attempt as a guest.",
    },
  ],
};

export default post;
