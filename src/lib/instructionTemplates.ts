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
 * PLACEHOLDER COPY — written to be true of this app (a countdown that
 * auto-submits, a question palette, mark-for-review, answers editable until
 * submit) so it is safe to ship as-is. Replace with your own wording.
 */
export const GENERAL_INSTRUCTION_TEMPLATES: InstructionTemplate[] = [
  {
    id: "standard",
    label: "Standard exam instructions",
    description: "Timer, palette, marking for review, and what not to do",
    text: {
      en: [
        "1. Read all instructions carefully before you begin the exam.",
        "2. The countdown timer at the top of the screen shows your remaining time. The exam is submitted automatically when the timer reaches zero.",
        "3. The question palette shows the status of every question — answered, not answered, marked for review, or not visited.",
        "4. Click an option to answer a question. You may change your answer any number of times before you submit.",
        "5. Use \"Mark for Review\" to flag a question you want to come back to. A marked question with an option selected is still counted as answered.",
        "6. Do not refresh the page, use the browser's Back button, or close the tab while the exam is in progress — your progress may be lost.",
        "7. Once you submit the exam, your answers are final and cannot be changed.",
      ].join("\n"),
      // The same seven promises, not a machine translation of the sentences —
      // each line states what the same screen does, in exam-hall Hindi.
      hi: [
        "1. परीक्षा शुरू करने से पहले सभी निर्देश ध्यान से पढ़ें।",
        "2. स्क्रीन के ऊपर दिख रहा काउंटडाउन टाइमर आपका शेष समय दिखाता है। टाइमर शून्य होते ही परीक्षा अपने आप सबमिट हो जाएगी।",
        "3. प्रश्न पैलेट में हर प्रश्न की स्थिति दिखती है — उत्तर दिया गया, उत्तर नहीं दिया गया, समीक्षा के लिए चिह्नित, या अभी देखा नहीं गया।",
        "4. उत्तर देने के लिए किसी विकल्प पर क्लिक करें। सबमिट करने से पहले आप अपना उत्तर जितनी बार चाहें बदल सकते हैं।",
        "5. जिस प्रश्न पर बाद में लौटना हो उसे \"Mark for Review\" से चिह्नित करें। चिह्नित प्रश्न में विकल्प चुना हो तो वह उत्तर दिया गया ही गिना जाएगा।",
        "6. परीक्षा चलते समय पेज रीफ़्रेश न करें, ब्राउज़र का Back बटन इस्तेमाल न करें, और टैब बंद न करें — आपकी प्रगति खो सकती है।",
        "7. एक बार परीक्षा सबमिट करने के बाद आपके उत्तर अंतिम होंगे और बदले नहीं जा सकेंगे।",
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
