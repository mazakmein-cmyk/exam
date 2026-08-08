/**
 * instructionTemplates.ts — the canned text behind "Use template" on the
 * General Instruction field.
 *
 * ── WHERE TO EDIT ─────────────────────────────────────────────────────────
 * The text lives in GENERAL_INSTRUCTION_TEMPLATES below and nowhere else.
 * Rewriting it here changes every place the button appears (the create-exam
 * dialog and the exam editor) and needs no component changes.
 *
 * Adding a language is adding a key to `text`. Adding a second template is
 * pushing another object into the array — the control switches from a single
 * button to a menu on its own once there is more than one.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Two deliberate decisions about the data shape:
 *
 *  • `text` is keyed by language, and a missing key means the button is hidden
 *    for that language rather than filled from English. A creator on the Hindi
 *    tab pressing "Use template" and getting English prose has to notice, then
 *    delete it — worse than the button not being there. Silence is the honest
 *    default until someone writes the Hindi copy.
 *
 *  • Every template is a complete replacement for the field, not a fragment to
 *    append. That is what lets the control offer a plain Undo instead of asking
 *    "insert where?" — see InstructionTemplateAction.
 */

export type InstructionTemplate = {
  id: string;
  /** Menu label; only shown when more than one template exists. */
  label: string;
  /** One line under the label in the menu. Same caveat. */
  description: string;
  /** Language code → the full field text. A missing code hides the button. */
  text: Record<string, string>;
};

/**
 * THE STANDARD EXAM-HALL INSTRUCTIONS — the full NTA/SSC-style sheet every
 * candidate has met on other platforms: timer, palette legend, mark-for-review
 * semantics, navigating, answering, submitting. Deliberately identical for
 * every exam; anything that varies (sections, timing mode, marking) belongs to
 * the Exam Instruction field, which the generator writes per exam.
 *
 * The structure is borrowed from that convention; every sentence is checked
 * against THIS runner, because the convention's mechanics are not ours:
 *   • Answers save the moment they are clicked or typed — Next only navigates.
 *     (On NTA platforms, palette-jumping discards the unsaved answer. Here it
 *     never does, and saying otherwise would teach candidates a false fear.)
 *   • Deselecting is the Clear Response button, not re-clicking the option.
 *   • Palette colours (ExamSimulator's legend): green attempted, purple viewed,
 *     red marked for review — red wins over green — plain untouched.
 *   • Zero auto-submits; the timer reddens and warns at 5 minutes.
 *
 * THE RULE FOR EVERY LINE — this text ships with every exam, whatever its
 * shape, so a sentence is allowed only if it is one of:
 *   (a) a runner constant — true for every exam because the code makes it so
 *       (the timer, the palette colours, save-on-click, Clear Response); or
 *   (b) explicitly conditional — "if a question allows several answers…",
 *       "either … or …" — so an exam without that question type or in the
 *       other mode makes the sentence idle, never wrong.
 * Anything tied to ONE exam's configuration (its sections, its marks, its
 * languages) is banned from here; that is the generated Exam Instruction's job.
 *
 * THE PALETTE LEGEND uses tile tokens, not colour words: a line beginning
 * `[green]` / `[purple]` / `[red]` / `[plain]` is rendered by InstructionText
 * (the intro page's renderer) as the palette's own colour tile beside the
 * text — the way every big platform draws this legend. The tokens are syntax,
 * identical in every language; anywhere without the renderer (the editor's
 * textarea, an export) they degrade to a readable label, never garbage.
 */
export const GENERAL_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
  {
    id: "standard",
    label: "Standard exam instructions",
    description: "The full exam-hall sheet: timer, palette colours, navigating, answering, submitting",
    text: {
      en: [
        "1. Read all instructions carefully before you begin. The timer, the question palette and the answering controls work exactly as described below, whatever the exam.",
        "",
        "2. The countdown timer at the top of the screen shows your remaining time. When it reaches zero, the exam is submitted by itself — you do not need to do anything. The timer turns red and a warning appears when 5 minutes remain.",
        "",
        "3. The question palette shows the status of every question:",
        "   [green] You have answered the question.",
        "   [purple] You have viewed the question but not answered it.",
        "   [red] You have marked the question for review.",
        "   [plain] You have not visited the question yet.",
        "",
        "4. Mark for Review simply flags a question you want to look at again. If a marked question has an answer selected, that answer IS counted in the evaluation — red does not mean unanswered.",
        "",
        "Navigating to a question:",
        "5. Click a question number in the palette to go straight to that question, or use the Previous and Next buttons. Moving between questions never discards an answer — everything you have selected or typed stays saved.",
        "6. Use the All Questions button to read the whole section on one page.",
        "",
        "Answering a question:",
        "7. For a multiple-choice question, click an option to select it; click a different option to change it. If a question allows several answers, tick every option you choose — tick again to untick.",
        "8. If a question asks for a typed or numerical answer, type it into the answer box below the question.",
        "9. To withdraw an answer entirely, use the Clear Response button — a cleared question stops counting as answered.",
        "",
        "10. Sections and timing depend on the exam: either you sit one section at a time — each with its own timer, and a submitted section cannot be reopened — or all sections share one timer and you may move between them freely. The start screen tells you which applies to this paper.",
        "11. Do not refresh the page, use the browser's Back button, or close the tab while the exam is running — your progress may be lost.",
        "12. Once you submit, your answers are final and cannot be changed.",
      ].join("\n"),
      // The same twelve promises, not a machine translation of the sentences —
      // each line states what the same screen does, in exam-hall Hindi. Button
      // names (Mark for Review, Next, Clear Response…) stay in English because
      // that is what the buttons themselves say.
      hi: [
        "1. शुरू करने से पहले सभी निर्देश ध्यान से पढ़ें। टाइमर, प्रश्न पैलेट और उत्तर देने के नियम हर परीक्षा में ठीक नीचे बताए अनुसार ही काम करते हैं।",
        "",
        "2. स्क्रीन के ऊपर दिख रहा काउंटडाउन टाइमर आपका शेष समय दिखाता है। टाइमर शून्य होते ही परीक्षा अपने आप सबमिट हो जाएगी — आपको कुछ करने की ज़रूरत नहीं। 5 मिनट शेष रहने पर टाइमर लाल हो जाता है और चेतावनी दिखाई देती है।",
        "",
        "3. प्रश्न पैलेट हर प्रश्न की स्थिति दिखाता है:",
        "   [green] आपने प्रश्न का उत्तर दे दिया है।",
        "   [purple] आपने प्रश्न देखा है, पर उत्तर नहीं दिया।",
        "   [red] आपने प्रश्न समीक्षा के लिए चिह्नित किया है।",
        "   [plain] आपने प्रश्न अभी देखा ही नहीं है।",
        "",
        "4. Mark for Review केवल यह बताता है कि आप उस प्रश्न को दोबारा देखना चाहते हैं। यदि चिह्नित प्रश्न में उत्तर चुना गया है, तो वह उत्तर मूल्यांकन में गिना जाएगा — लाल का अर्थ अनुत्तरित नहीं है।",
        "",
        "प्रश्नों के बीच आना-जाना:",
        "5. पैलेट में प्रश्न-संख्या पर क्लिक करके सीधे उस प्रश्न पर जाएँ, या Previous और Next बटनों का उपयोग करें। प्रश्न बदलने से कोई उत्तर नहीं मिटता — जो कुछ आपने चुना या लिखा है, वह सुरक्षित रहता है।",
        "6. पूरा खंड एक ही पेज पर पढ़ने के लिए All Questions बटन का उपयोग करें।",
        "",
        "उत्तर देना:",
        "7. बहुविकल्पीय प्रश्न में किसी विकल्प पर क्लिक करके उसे चुनें; उत्तर बदलने के लिए किसी दूसरे विकल्प पर क्लिक करें। यदि किसी प्रश्न में कई उत्तर चुने जा सकते हों, तो हर चुना हुआ विकल्प टिक करें — हटाने के लिए दोबारा टिक करें।",
        "8. यदि किसी प्रश्न का उत्तर टाइप करना हो — संख्या या लिखित — तो उसे प्रश्न के नीचे दिए उत्तर-बॉक्स में टाइप करें।",
        "9. उत्तर पूरी तरह हटाने के लिए Clear Response बटन का उपयोग करें — हटाए गए उत्तर वाला प्रश्न उत्तर दिया हुआ नहीं गिना जाएगा।",
        "",
        "10. खंड और समय की व्यवस्था परीक्षा पर निर्भर करती है: या तो आप एक समय में एक ही खंड हल करते हैं — हर खंड का अपना टाइमर, और सबमिट किया गया खंड दोबारा नहीं खुलता — या सभी खंडों का एक साझा टाइमर होता है और आप उनके बीच स्वतंत्र रूप से आ-जा सकते हैं। शुरू करने से पहले स्टार्ट स्क्रीन बताती है कि इस प्रश्नपत्र में कौन-सी व्यवस्था लागू है।",
        "11. परीक्षा चलते समय पेज रीफ़्रेश न करें, ब्राउज़र का Back बटन इस्तेमाल न करें, और टैब बंद न करें — आपकी प्रगति खो सकती है।",
        "12. एक बार सबमिट करने के बाद आपके उत्तर अंतिम होंगे और बदले नहीं जा सकेंगे।",
      ].join("\n"),
    },
  },
];

/**
 * Rows enough to show what is in the box, capped so a long instruction does not
 * grow without limit (both containers scroll, so the cap is about proportion,
 * not overflow).
 *
 * Here because it exists for the templates and the generator: the instruction
 * textareas were sized for the two lines a creator types by hand, and filling
 * one with seven lines of generated claims shows two of them with no hint the
 * rest arrived — hiding exactly the marking and timing sentences that most
 * need proofreading before candidates rely on them.
 *
 * Counts VISUAL rows, not newlines: a generated marking sentence runs past 200
 * characters and wraps three or four times, so `split("\n").length` undercounts
 * precisely when it matters. `cols` is the caller's honest estimate of its
 * textarea's width in characters — the editor's sidebar is narrow, the dialog
 * is wide.
 */
export function rowsForText(text: string, min = 2, max = 8, cols = 80): number {
  const visual = text
    .split("\n")
    .reduce((rows, line) => rows + Math.max(1, Math.ceil(line.length / cols)), 0);
  return Math.min(max, Math.max(min, visual));
}

/** The text for one language, or null when this template has no copy for it. */
export function templateText(
  template: InstructionTemplate,
  lang: string
): string | null {
  return template.text[lang]?.trim() ? template.text[lang] : null;
}

/** Templates that actually have copy in `lang` — what the control may offer. */
export function templatesForLanguage(
  templates: InstructionTemplate[],
  lang: string
): InstructionTemplate[] {
  return templates.filter((t) => templateText(t, lang) !== null);
}

/**
 * Whether the field is currently sitting on a template, ignoring trailing
 * whitespace the textarea may have collected. Drives the "already applied"
 * state, so the button stops inviting a click that would do nothing.
 */
export function matchesTemplate(
  templates: InstructionTemplate[],
  lang: string,
  value: string
): boolean {
  const current = value.trim();
  if (!current) return false;
  return templates.some((t) => templateText(t, lang)?.trim() === current);
}
