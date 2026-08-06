/**
 * Shared shaping of stored question content for display.
 *
 * Question text reaches the display layer as HTML with two extras that have to
 * be undone before rendering: light markdown that survived import (`**bold**`,
 * `*italic*`, `~~strike~~`, `[text](url)`), and — for reading-comprehension
 * items — a passage wrapped in `<div class="passage-section">` ahead of
 * `<div class="question-section">`.
 *
 * The simulator's one-question-at-a-time view and the all-questions overview
 * both render through here, so the two can never drift apart.
 */
import { renderMathInHtml } from "./renderMath";
import { renderClozeBlanks } from "./richText";

/**
 * Inline markdown that import leaves behind, plus link hardening. Applied to
 * HTML, so it must stay conservative: only the four inline forms are touched.
 */
export function applyInlineMarkdown(html: string): string {
  return html
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>',
    )
    .replace(/<a href/g, '<a class="text-primary underline hover:text-primary/80" href')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/~~(.*?)~~/g, "<del>$1</del>");
}

/**
 * Stored question text → HTML ready for `dangerouslySetInnerHTML`: cloze
 * blanks, then inline markdown, then math.
 */
export function renderQuestionHtml(text: string | null | undefined): string {
  return renderMathInHtml(applyInlineMarkdown(renderClozeBlanks(text ?? "")));
}

export type PassageSplit = {
  /** True when the text carries a `passage-section` wrapper. */
  hasPassage: boolean;
  /** Passage HTML with the passage image stripped out (rendered separately). */
  passageHtml: string;
  passageImageUrl: string | null;
  /** The question half — the whole text when there is no passage. */
  questionHtml: string;
};

/**
 * Split a passage-based question into its passage and question halves. Text
 * without a passage wrapper comes back whole under `questionHtml`.
 */
export function splitPassageContent(text: string | null | undefined): PassageSplit {
  const questionText = text || "";

  // Handle both attribute orders: src before class, and class before src.
  const passageImageMatch =
    questionText.match(/<img[^>]*src="([^"]*)"[^>]*class="[^"]*passage-image[^"]*"[^>]*>/) ||
    questionText.match(/<img[^>]*class="[^"]*passage-image[^"]*"[^>]*src="([^"]*)"[^>]*>/);
  const passageImageUrl = passageImageMatch ? passageImageMatch[1] : null;

  if (!questionText.includes('class="passage-section"')) {
    return { hasPassage: false, passageHtml: "", passageImageUrl, questionHtml: questionText };
  }

  const passageSectionMatch = questionText.match(
    /<div class="passage-section"[^>]*>([\s\S]*?)<\/div><div class="question-section"/,
  );
  const passageHtml = (passageSectionMatch ? passageSectionMatch[1] : "")
    .replace(/<img[^>]*class="[^"]*passage-image[^"]*"[^>]*>/g, "")
    .replace(/<img[^>]*src="[^"]*"[^>]*class="[^"]*passage-image[^"]*"[^>]*>/g, "")
    .trim();

  const questionSectionMatch = questionText.match(/<div class="question-section"[^>]*>([\s\S]*?)<\/div>$/);

  return {
    hasPassage: true,
    passageHtml,
    passageImageUrl,
    questionHtml: questionSectionMatch ? questionSectionMatch[1].trim() : "",
  };
}

export type QuestionTypeInfo = { label: string; description: string };

/**
 * Human label + tooltip copy for a question's answer type. `hasOptions` wins
 * over a vague stored type: a question with options is always shown as choice
 * based, because manually added options must never be hidden.
 */
export function getQuestionTypeInfo(answerType: string, hasOptions: boolean): QuestionTypeInfo {
  if (answerType === "multi" || answerType === "multiple") {
    return {
      label: "Multiple Correct",
      description:
        "More than one option may be correct. Select every option you believe applies — scoring depends on how the exam handles partial credit.",
    };
  }
  if (answerType === "numeric") {
    return {
      label: "Integer / Numeric",
      description:
        "Enter a numerical value as your answer. No options are shown — type the number directly into the input.",
    };
  }
  if (answerType === "essay") {
    return {
      label: "Essay",
      description: "Long-form written answer. Write a detailed response in the text area provided.",
    };
  }
  if ((answerType === "text" || answerType === "short_answer") && !hasOptions) {
    return {
      label: "Short Answer",
      description: "Enter a brief text answer. Your response is matched against the expected answer.",
    };
  }
  return {
    label: "Single Correct",
    description: "Exactly one option is correct. Select the single best option from the choices below.",
  };
}
