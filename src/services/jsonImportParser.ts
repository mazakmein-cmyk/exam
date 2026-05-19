/**
 * jsonImportParser.ts — Pure forgiving parser for per-language JSON uploads.
 *
 * Inputs: a raw JSON file text + section context.
 * Output: a ParseReport that downstream UI renders for preview and that
 * ExamDetail.tsx's commitJson() uses to write rows.
 *
 * Zero Supabase, zero React. Mirrors scoringEngine.ts's style.
 *
 * Failure model: file-level problems abort the parse with `ok: false`.
 * Individual section / question problems never abort — they collect into
 * the report so the user can still import what's good.
 */
import { jsonrepair } from "jsonrepair";
import type { ScoringConfig } from "./scoringEngine";

export const SCHEMA_VERSION = "1.0";
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const SUPPORTED_ANSWER_TYPES = new Set(["single", "multi"]);
const VALID_MCQ_MODE = new Set(["partial", "all_or_nothing"]);
const VALID_MCQ_WRONG_PENALTY = new Set(["flat", "per_option"]);
const VALID_ROUNDING = new Set(["floor", "round", "ceil", "none"]);

const START_DELIM = "<<<EXAM_JSON_START>>>";
const END_DELIM = "<<<EXAM_JSON_END>>>";

export type NormalisedQuestion = {
  q_no: number;
  text: string;
  answer_type: "single" | "multi";
  options: string[];
  correct_answer: string | string[] | null;
  marks_config?: Partial<ScoringConfig>;
};

export type NormalisedSection = {
  jsonName: string;
  matchedSectionId: string | null;
  accepted: NormalisedQuestion[];
  sectionMarksConfig?: Partial<ScoringConfig>;
  skipped: { index: number; reasons: string[] }[];
  warnings: string[];
  questionCountInJson: number;
};

export type FatalErrorCode =
  | "invalid_json"
  | "schema_version"
  | "language_mismatch"
  | "no_sections";

export type RepairCategory =
  | "unescaped_quotes"
  | "trailing_commas"
  | "comments_stripped"
  | "smart_quotes"
  | "single_quotes"
  | "python_literals"
  | "markdown_fences"
  | "prose_around_object"
  | "array_wrapper"
  | "data_wrapper"
  | "auto_repaired"
  | "mojibake_fixed"
  | "latex_escapes_fixed";

export type ParseReport = {
  ok: boolean;
  fatalReason?: string;
  errorCode?: FatalErrorCode;
  language: string;
  isPrimary: boolean;
  examSectionNames: string[];
  perSection: NormalisedSection[];
  unmatchedSections: string[];
  examOnlySections: string[];
  globalWarnings: string[];
  marksConfig: { exam_default?: Partial<ScoringConfig> } | null;
  marksIgnoredReason?: string;
  extractionSummary: any | null;
  repairApplied: boolean;
  repairCategories: RepairCategory[];
};

export type ParseContext = {
  language: string;
  selectedLanguage: string;
  isPrimary: boolean;
  supportedLanguages: string[];
  examSectionsForLanguage: { id: string; name: string; sort_order?: number }[];
};

// ─── Public API ─────────────────────────────────────────────────────────

export function parseExamJson(rawText: string, ctx: ParseContext): ParseReport {
  const examSectionNames = [...ctx.examSectionsForLanguage]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => s.name);

  const baseReport: ParseReport = {
    ok: false,
    language: ctx.language,
    isPrimary: ctx.isPrimary,
    examSectionNames,
    perSection: [],
    unmatchedSections: [],
    examOnlySections: [],
    globalWarnings: [],
    marksConfig: null,
    extractionSummary: null,
    repairApplied: false,
    repairCategories: [],
  };

  // [1] Pre-clean — always applied, deterministic, cheap.
  const preCleanResult = preClean(rawText);
  const cleaned = preCleanResult.text;
  const preCleanCategories = preCleanResult.categories;

  // [2] Strict JSON.parse first.
  let json: any;
  let repairApplied = false;
  const repairCategoriesSet = new Set<RepairCategory>(preCleanCategories);

  try {
    json = JSON.parse(cleaned);
  } catch (firstErr: any) {
    // [3] Auto-repair fallback.
    let repaired: string;
    try {
      repaired = jsonrepair(cleaned);
    } catch {
      // jsonrepair itself gave up — surface the original error with context.
      return {
        ...baseReport,
        repairCategories: Array.from(repairCategoriesSet),
        errorCode: "invalid_json",
        fatalReason: enhancedJsonError(firstErr, cleaned),
      };
    }

    try {
      json = JSON.parse(repaired);
    } catch (secondErr: any) {
      // Shouldn't usually happen — jsonrepair returned something but it
      // still doesn't parse. Surface a line-context error against the repair.
      return {
        ...baseReport,
        repairCategories: Array.from(repairCategoriesSet),
        errorCode: "invalid_json",
        fatalReason: enhancedJsonError(secondErr, repaired),
      };
    }

    repairApplied = true;
    for (const cat of detectRepairCategories(cleaned)) repairCategoriesSet.add(cat);
    if (repairCategoriesSet.size === preCleanCategories.length) {
      // jsonrepair fixed something but our heuristics didn't catch what.
      repairCategoriesSet.add("auto_repaired");
    }
  }

  // [4] Top-level normaliser — unwrap [{...}] or { data: {...} } shapes.
  if (Array.isArray(json) && json.length === 1 && json[0] && typeof json[0] === "object") {
    json = json[0];
    repairCategoriesSet.add("array_wrapper");
    repairApplied = true;
  }
  if (
    json &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    json.schema_version === undefined &&
    json.data &&
    typeof json.data === "object" &&
    !Array.isArray(json.data) &&
    json.data.schema_version !== undefined
  ) {
    json = json.data;
    repairCategoriesSet.add("data_wrapper");
    repairApplied = true;
  }

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      ...baseReport,
      repairApplied,
      repairCategories: Array.from(repairCategoriesSet),
      errorCode: "invalid_json",
      fatalReason: "Top-level JSON must be an object.",
    };
  }

  // Update baseReport so subsequent returns inherit repair info.
  baseReport.repairApplied = repairApplied;
  baseReport.repairCategories = Array.from(repairCategoriesSet);

  // [2] Envelope checks
  if (json.schema_version !== SCHEMA_VERSION) {
    const v = json.schema_version ?? "(missing)";
    return {
      ...baseReport,
      errorCode: "schema_version",
      fatalReason: `Unsupported schema_version "${v}" — this builder supports "${SCHEMA_VERSION}".`,
    };
  }

  if (typeof json.language !== "string") {
    return {
      ...baseReport,
      errorCode: "language_mismatch",
      fatalReason: 'Missing "language" field.',
    };
  }

  if (!ctx.supportedLanguages.includes(json.language)) {
    return {
      ...baseReport,
      errorCode: "language_mismatch",
      fatalReason: `Language "${json.language}" is not supported by this exam.`,
    };
  }

  if (json.language !== ctx.selectedLanguage) {
    return {
      ...baseReport,
      errorCode: "language_mismatch",
      fatalReason: `JSON is for "${json.language}" but you clicked Upload on "${ctx.selectedLanguage}".`,
    };
  }

  if (!Array.isArray(json.sections) || json.sections.length === 0) {
    return {
      ...baseReport,
      errorCode: "no_sections",
      fatalReason: 'JSON has no "sections" — nothing to import.',
    };
  }

  const globalWarnings: string[] = [];
  baseReport.extractionSummary = json._extraction_summary ?? null;

  // [3] Top-level marks_config (primary only)
  let marksConfig: ParseReport["marksConfig"] = null;
  let marksIgnoredReason: string | undefined;
  if (json.marks_config !== undefined) {
    if (!ctx.isPrimary) {
      marksIgnoredReason = "marks ignored on secondary language";
      globalWarnings.push("Marks config in this JSON is ignored — marks are managed on the primary language.");
    } else if (json.marks_config && typeof json.marks_config === "object") {
      const examDefault = normaliseMarksConfig(json.marks_config.exam_default, globalWarnings, "marks_config.exam_default");
      if (examDefault) marksConfig = { exam_default: examDefault };
    }
  }

  // [4] Per-section loop
  const perSection: NormalisedSection[] = [];
  const unmatchedSections: string[] = [];
  const seenSectionNames = new Set<string>();

  for (let k = 0; k < json.sections.length; k++) {
    const rawSec = json.sections[k];
    if (!rawSec || typeof rawSec !== "object" || Array.isArray(rawSec)) {
      globalWarnings.push(`Section #${k + 1} skipped — not an object.`);
      continue;
    }
    const jsonName = typeof rawSec.name === "string" ? rawSec.name.trim() : "";
    if (!jsonName) {
      globalWarnings.push(`Section #${k + 1} skipped — missing or empty "name".`);
      continue;
    }
    if (seenSectionNames.has(jsonName)) {
      globalWarnings.push(`Section "${jsonName}" appears twice in JSON — second occurrence skipped.`);
      continue;
    }
    seenSectionNames.add(jsonName);

    const match = ctx.examSectionsForLanguage.find((s) => s.name === jsonName);
    const questionCountInJson = Array.isArray(rawSec.questions) ? rawSec.questions.length : 0;

    if (!match) {
      unmatchedSections.push(jsonName);
      perSection.push({
        jsonName,
        matchedSectionId: null,
        accepted: [],
        skipped: [],
        warnings: [],
        questionCountInJson,
      });
      continue;
    }

    const sec: NormalisedSection = {
      jsonName,
      matchedSectionId: match.id,
      accepted: [],
      skipped: [],
      warnings: [],
      questionCountInJson,
    };

    // Section-level marks_config (primary only)
    if (rawSec.marks_config !== undefined) {
      if (!ctx.isPrimary) {
        // already noted at global level
      } else {
        const cfg = normaliseMarksConfig(rawSec.marks_config, sec.warnings, `section "${jsonName}".marks_config`);
        if (cfg) sec.sectionMarksConfig = cfg;
      }
    }

    if (!Array.isArray(rawSec.questions)) {
      sec.warnings.push("No questions array — nothing to import for this section.");
      perSection.push(sec);
      continue;
    }

    // [5] Per-question loop (isolated try/catch). Never blocks the batch.
    for (let i = 0; i < rawSec.questions.length; i++) {
      let result: QResult;
      try {
        result = validateQuestion(rawSec.questions[i], i, ctx.isPrimary);
      } catch (err: any) {
        sec.skipped.push({ index: i, reasons: [`unexpected error: ${err?.message ?? String(err)}`] });
        continue;
      }
      if (!result.ok) {
        // result is { ok: false; reasons: string[] }
        const reasonsArr: string[] = (result as { ok: false; reasons: string[] }).reasons;
        sec.skipped.push({ index: i, reasons: reasonsArr });
        continue;
      }
      sec.accepted.push(result.value);
      if (result.warnings.length > 0) sec.warnings.push(...result.warnings);
    }

    // [6] Cross-question checks — renumber by position; warn on duplicates / dupe text
    const seenQNos = new Set<number>();
    let renumbered = false;
    for (let i = 0; i < sec.accepted.length; i++) {
      const q = sec.accepted[i];
      if (seenQNos.has(q.q_no)) {
        renumbered = true;
        break;
      }
      seenQNos.add(q.q_no);
    }
    if (renumbered) {
      sec.warnings.push("Duplicate q_no in JSON — renumbered by position.");
    }
    // Always renumber by position so downstream commit doesn't have to think
    sec.accepted.forEach((q, idx) => {
      q.q_no = idx + 1;
    });

    // Duplicate text within section
    const textCounts = new Map<string, number[]>();
    sec.accepted.forEach((q, idx) => {
      const key = q.text.trim().toLowerCase();
      if (!key) return;
      const arr = textCounts.get(key) ?? [];
      arr.push(idx + 1);
      textCounts.set(key, arr);
    });
    for (const [, idxs] of textCounts) {
      if (idxs.length > 1) {
        sec.warnings.push(`Q${idxs.join(", Q")} have identical text — consider deduping in editor.`);
      }
    }

    perSection.push(sec);
  }

  // [7] examOnlySections (exam has them, JSON doesn't)
  const examOnlySections: string[] = [];
  const jsonNamesSet = new Set(json.sections.map((s: any) => (typeof s?.name === "string" ? s.name.trim() : "")));
  for (const examName of examSectionNames) {
    if (!jsonNamesSet.has(examName)) examOnlySections.push(examName);
  }

  return {
    ok: true,
    language: ctx.language,
    isPrimary: ctx.isPrimary,
    examSectionNames,
    perSection,
    unmatchedSections,
    examOnlySections,
    globalWarnings,
    marksConfig,
    marksIgnoredReason,
    extractionSummary: json._extraction_summary ?? null,
    repairApplied: baseReport.repairApplied,
    repairCategories: baseReport.repairCategories,
  };
}

// ─── Rename-prompt generator (for the section-name mismatch fix flow) ────

export function buildRenamePrompt(
  examSectionNames: string[],
  jsonSectionNames: string[]
): string {
  const examList = examSectionNames.length
    ? examSectionNames.map((n, i) => `  ${i + 1}. "${n}"`).join("\n")
    : "  (no sections)";
  const jsonList = jsonSectionNames.length
    ? jsonSectionNames.map((n, i) => `  ${i + 1}. "${n}"`).join("\n")
    : "  (no sections)";

  return `Task: Rename section names in this exam JSON.

My exam has these section names (in order):
${examList}

The JSON currently has these section names:
${jsonList}

Please:
  • Pair them by order and update each section's \`name\` field to match my exam's names.
  • Do NOT modify questions, options, correct_answer, marks_config, q_no, or any other content.
  • Preserve the JSON structure exactly.
  • If the JSON has MORE sections than my exam, ask me which extras to drop — don't guess.
  • If the JSON has FEWER sections than my exam, leave the missing ones unmapped and tell me.
  • Output the corrected JSON between the literal delimiters:
      ${START_DELIM}
      ${END_DELIM}
    No prose outside the delimiters.

Paste the JSON below this prompt.`;
}

// ─── Internals ──────────────────────────────────────────────────────────

function stripDelimiters(text: string): string {
  const startIdx = text.indexOf(START_DELIM);
  const endIdx = text.indexOf(END_DELIM);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx + START_DELIM.length, endIdx).trim();
  }
  return text.trim();
}

// ─── Pre-clean: deterministic, cheap, always-applied transforms ─────────

function preClean(raw: string): { text: string; categories: RepairCategory[] } {
  const categories: RepairCategory[] = [];
  let s = raw;

  // 1. Strip BOM.
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
  }

  // 2. Auto-fix CP1252→UTF-8 mojibake (e.g. "LozÃ¨re" → "Lozère",
  //    "â" → "—", "Â°" → "°"). The file was saved as Windows-1252
  //    when it should have been UTF-8 — common when users save the
  //    AI's reply through Notepad's default ANSI encoding.
  //
  //    Strategy: match only candidate mojibake byte-sequences (chars
  //    in the U+0080-U+00FF range that, taken as Latin-1 bytes, form
  //    valid UTF-8 multi-byte sequences) and re-decode each as UTF-8.
  //    Leaves Devanagari, Greek, math symbols and other legitimate
  //    Unicode content untouched.
  s = autoFixMojibake(s, categories);

  // 3. Strip our own EXAM_JSON_START/END delimiters.
  s = stripDelimiters(s);

  // 4. Strip markdown code fences (```json ... ``` or ``` ... ```).
  const fenceRe = /^\s*```(?:[a-zA-Z]+)?\s*\n([\s\S]*?)\n?```\s*$/;
  const fenceMatch = s.match(fenceRe);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
    categories.push("markdown_fences");
  }

  // 5. Trim explanatory prose around the JSON object: take the first `{`
  //    and the matching last `}`. Cheap heuristic — doesn't track braces
  //    inside strings, but for LLM prose the last `}` is virtually always
  //    the document's close brace.
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace > 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
    categories.push("prose_around_object");
  } else if (firstBrace === 0 && lastBrace > 0 && lastBrace < s.length - 1) {
    s = s.slice(0, lastBrace + 1);
    categories.push("prose_around_object");
  }

  // 6. Auto-fix under-escaped LaTeX backslashes inside string values.
  //    The AI commonly emits `"$\sqrt{7}$"` when it should have emitted
  //    `"$\\sqrt{7}$"`. JSON-spec valid backslash escapes are only
  //    \\ \" \/ \b \f \n \r \t \uXXXX — anything else is either a
  //    parse error (\s, \l, \a) or a silently-wrong char (\f = form-
  //    feed, not \frac). We double the backslash for any \X where X
  //    is a letter NOT in {n, r, t, u} — preserving the truly common
  //    valid JSON escapes (newline, tab, etc.) while fixing the
  //    overwhelmingly common LaTeX-corruption case.
  s = autoFixLatexEscapes(s, categories);

  return { text: s.trim(), categories };
}

// ─── Mojibake auto-fix ────────────────────────────────────────────────

function autoFixMojibake(input: string, categories: RepairCategory[]): string {
  // Mojibake markers: when UTF-8 bytes (C2-xx, C3-xx, E2-80-xx) get
  // misread as Windows-1252, they show up as these 2- or 3-char
  // sequences in the Unicode string.
  const MOJIBAKE_RE =
    /(?:Ã[-¿]|Â[-¿]|â[-¿])/g;
  if (!MOJIBAKE_RE.test(input)) return input;
  MOJIBAKE_RE.lastIndex = 0;

  let fixed = false;
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder("utf-8", { fatal: false });
  } catch {
    return input;
  }
  const out = input.replace(MOJIBAKE_RE, (match) => {
    const bytes = Uint8Array.from(match, (c) => c.charCodeAt(0));
    const decoded = decoder.decode(bytes);
    if (decoded && decoded !== match && !decoded.includes("�")) {
      fixed = true;
      return decoded;
    }
    return match;
  });
  if (fixed) categories.push("mojibake_fixed");
  return out;
}

// ─── LaTeX-escape auto-fix ────────────────────────────────────────────

function autoFixLatexEscapes(input: string, categories: RepairCategory[]): string {
  // Only operate inside "..." string contexts so we don't touch the JSON
  // structure itself (which has no bare backslashes anyway).
  let fixed = false;
  const out = input.replace(/"((?:[^"\\]|\\.)*)"/g, (_full, inner: string) => {
    let touched = false;
    const repaired = inner.replace(/(?<!\\)\\([a-zA-Z])/g, (m: string, ch: string) => {
      // Preserve common legitimate JSON escapes: \n \r \t and \uXXXX.
      // Everything else (\s, \a, \c, \d, \e, \f, \g, ... \z and capitals)
      // is almost certainly an un-doubled LaTeX command in our domain.
      if (ch === "n" || ch === "r" || ch === "t" || ch === "u") return m;
      touched = true;
      return "\\\\" + ch;
    });
    if (touched) fixed = true;
    return '"' + repaired + '"';
  });
  if (fixed) categories.push("latex_escapes_fixed");
  return out;
}

// ─── Categorise what kinds of repairs the input needed ───────────────────

function detectRepairCategories(input: string): RepairCategory[] {
  const out: RepairCategory[] = [];

  // Trailing commas: `,` immediately before `]` or `}` (allowing whitespace).
  if (/,\s*[\]\}]/.test(input)) {
    out.push("trailing_commas");
  }

  // Line or block comments.
  if (/(^|\n)\s*\/\//.test(input) || /\/\*[\s\S]*?\*\//.test(input)) {
    out.push("comments_stripped");
  }

  // Smart / curly quotes.
  if (/[‘’“”]/.test(input)) {
    out.push("smart_quotes");
  }

  // Python literals as bare identifiers (not inside strings — rough check).
  if (/(?<![\"\w])(True|False|None)(?![\"\w])/.test(input)) {
    out.push("python_literals");
  }

  // Single-quoted property values: `: 'something'` after a key.
  if (/:\s*'[^']*'/.test(input)) {
    out.push("single_quotes");
  }

  // Unescaped quotes inside a string value: heuristic — find a `"..."`
  // closing quote that is immediately followed by a word character (i.e. the
  // string continues with text after what looks like a closing quote).
  // Tolerant of false positives; categorisation is informational, not
  // authoritative.
  if (/"[^"\n]*"\s*[A-Za-z]/.test(input)) {
    out.push("unescaped_quotes");
  }

  return out;
}

// ─── Enhanced error: line + column + caret + likely cause ───────────────

function enhancedJsonError(err: Error, text: string): string {
  const baseMsg = err.message || "invalid JSON";

  // Try multiple formats — V8/Spidermonkey/JSC all differ.
  const lineColMatch = baseMsg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  const posMatch = baseMsg.match(/position\s+(\d+)/i);

  let line: number | null = null;
  let col: number | null = null;

  if (lineColMatch) {
    line = parseInt(lineColMatch[1], 10);
    col = parseInt(lineColMatch[2], 10);
  } else if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const upTo = text.slice(0, pos);
    line = upTo.split("\n").length;
    const lastNl = upTo.lastIndexOf("\n");
    col = lastNl === -1 ? pos + 1 : pos - lastNl;
  }

  if (line === null || col === null) {
    return `Couldn't parse JSON: ${baseMsg}`;
  }

  const lines = text.split("\n");
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);

  const ctx: string[] = [];
  for (let i = start; i < end; i++) {
    const ln = i + 1;
    const prefix = `  ${String(ln).padStart(4, " ")} | `;
    ctx.push(prefix + lines[i]);
    if (ln === line) {
      const caretIndent = " ".repeat(prefix.length + Math.max(0, col - 1));
      ctx.push(caretIndent + "^");
    }
  }

  // Hazard a guess at the cause based on the error message.
  let hint = "";
  if (/Expected ',' or '[\}\]]'/.test(baseMsg)) {
    hint = "\nLikely cause: an unescaped double-quote inside a string value, or a missing comma between properties.";
  } else if (/Unexpected token/.test(baseMsg)) {
    hint = "\nLikely cause: a stray character — check for unescaped quotes, smart quotes, or extra text.";
  } else if (/Unexpected end of/.test(baseMsg)) {
    hint = "\nLikely cause: the JSON is truncated — the AI's reply may have been cut off mid-sentence.";
  }

  return `${baseMsg}\n\n${ctx.join("\n")}${hint}`;
}

type QResult =
  | { ok: true; value: NormalisedQuestion; warnings: string[] }
  | { ok: false; reasons: string[] };

function validateQuestion(raw: any, index: number, isPrimary: boolean): QResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reasons: ["question is not an object"] };
  }

  // answer_type
  let answer_type: "single" | "multi" | null = null;
  if (raw.answer_type !== undefined) {
    if (typeof raw.answer_type !== "string" || !SUPPORTED_ANSWER_TYPES.has(raw.answer_type)) {
      reasons.push(`unsupported answer_type "${raw.answer_type}" (only "single" or "multi")`);
    } else {
      answer_type = raw.answer_type as "single" | "multi";
    }
  } else if (isPrimary) {
    reasons.push('missing "answer_type"');
  }

  // text
  const text = typeof raw.text === "string" ? raw.text : "";
  const strippedText = text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (isPrimary && strippedText === "") {
    reasons.push("missing question text");
  }

  // options
  let optionsOut: string[] = [];
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options)) {
      reasons.push("options must be an array of strings");
    } else {
      const trimmed: string[] = [];
      let nullSlot = false;
      for (const o of raw.options) {
        if (o === null || o === undefined) {
          nullSlot = true;
          continue;
        }
        const s = String(o).trim();
        if (s !== "") trimmed.push(s);
      }
      if (nullSlot) {
        warnings.push("options contained null/undefined slots — stripped");
      }
      optionsOut = trimmed;
      if (isPrimary && optionsOut.length < 2) {
        reasons.push(`need at least 2 non-empty options (got ${optionsOut.length})`);
      }
    }
  } else if (isPrimary) {
    reasons.push("missing options");
  }

  // correct_answer — primary only; secondary always ignored
  let correct_answer: string | string[] | null = null;
  if (isPrimary && raw.correct_answer !== undefined && raw.correct_answer !== null) {
    const at = answer_type;
    const ca = raw.correct_answer;
    if (at === "single") {
      // single → string or number, or array of length 1
      let value: string | null = null;
      if (typeof ca === "string" || typeof ca === "number") {
        value = String(ca);
      } else if (Array.isArray(ca)) {
        if (ca.length > 1) {
          reasons.push("single-answer question has multiple correct answers");
        } else if (ca.length === 1) {
          value = String(ca[0]);
        }
      } else {
        reasons.push("correct_answer must be a string, number, or array");
      }
      if (value !== null) {
        const idx = Number(value);
        if (!Number.isInteger(idx) || idx < 0 || idx >= optionsOut.length) {
          reasons.push(`correct_answer index "${value}" out of range (0 - ${optionsOut.length - 1})`);
        } else {
          correct_answer = String(idx);
        }
      }
    } else if (at === "multi") {
      if (!Array.isArray(ca)) {
        reasons.push('correct_answer for "multi" must be an array of indices');
      } else if (ca.length === 0) {
        // empty array → leave null (creator finishes later)
      } else {
        const out: string[] = [];
        let bad = false;
        for (const item of ca) {
          if (typeof item !== "string" && typeof item !== "number") {
            reasons.push("correct_answer entries must be strings or numbers");
            bad = true;
            break;
          }
          const idx = Number(item);
          if (!Number.isInteger(idx) || idx < 0 || idx >= optionsOut.length) {
            reasons.push(`correct_answer index "${item}" out of range (0 - ${optionsOut.length - 1})`);
            bad = true;
            break;
          }
          out.push(String(idx));
        }
        if (!bad) {
          const deduped = Array.from(new Set(out));
          correct_answer = deduped;
        }
      }
    }
  } else if (!isPrimary && raw.correct_answer !== undefined) {
    warnings.push("correct_answer ignored on secondary language — primary is authoritative.");
  }

  // marks_config — primary only
  let marks_config: Partial<ScoringConfig> | undefined;
  if (isPrimary && raw.marks_config !== undefined) {
    const cfg = normaliseMarksConfig(raw.marks_config, warnings, `question #${index + 1}.marks_config`);
    if (cfg) marks_config = cfg;
  }

  // image_url / image_urls — silently ignored in v1
  if (raw.image_url || (Array.isArray(raw.image_urls) && raw.image_urls.length > 0)) {
    warnings.push(`question #${index + 1} has image_url — images aren't imported in v1; add manually after upload.`);
  }

  // passage — optional. If present, wraps `text` using the same HTML contract
  // the manual-add flow uses (see ExamDetail.tsx:1098-1100), so the existing
  // simulator/review renderers pick it up with no changes.
  let passageText: string | null = null;
  if (raw.passage !== undefined && raw.passage !== null && raw.passage !== "") {
    if (typeof raw.passage !== "string") {
      warnings.push(`question #${index + 1} has non-string passage — ignored.`);
    } else {
      let p = raw.passage;
      // Strip <div> and <script> tags (keep their inner content so we don't
      // lose passage text); they would conflict with the wrapper divs or be
      // a security risk respectively.
      const hadBlocked = /<\s*(div|script)\b/i.test(p);
      p = p
        .replace(/<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi, "") // script + content
        .replace(/<\s*\/?\s*div\b[^>]*>/gi, ""); // div tags (keep inner)
      if (hadBlocked) {
        warnings.push(`question #${index + 1} passage contained <div> or <script> tags — stripped.`);
      }
      passageText = p;
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  // For secondary, fall back to defaults if needed (they'll get overwritten at commit
  // by primary's authoritative values for answer_type / correct_answer)
  const finalAnswerType = (answer_type ?? "single") as "single" | "multi";

  // q_no: take from JSON if positive integer, else position; the parser renumbers
  // post-loop anyway, but a stable initial value avoids surprise downstream.
  const rawQNo = Number(raw.q_no);
  const q_no = Number.isInteger(rawQNo) && rawQNo > 0 ? rawQNo : index + 1;

  // If passage is present, wrap text into the manual-flow HTML contract.
  const finalText =
    passageText && passageText.length > 0
      ? `<div class="passage-section">${passageText}</div><div class="question-section">${text}</div>`
      : text;

  return {
    ok: true,
    warnings,
    value: {
      q_no,
      text: finalText,
      answer_type: finalAnswerType,
      options: optionsOut,
      correct_answer,
      marks_config,
    },
  };
}

function normaliseMarksConfig(
  raw: any,
  warnings: string[],
  context: string
): Partial<ScoringConfig> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const out: Partial<ScoringConfig> = {};
  let hasAny = false;

  for (const key of ["marks_correct", "marks_wrong", "marks_skipped"] as const) {
    if (raw[key] === undefined) continue;
    const v = Number(raw[key]);
    if (!Number.isFinite(v)) {
      warnings.push(`${context}: ${key} is not a finite number — dropped.`);
      continue;
    }
    if (v < 0) {
      warnings.push(`${context}: ${key} was negative (${v}) — using absolute value ${Math.abs(v)}.`);
      out[key] = Math.abs(v);
    } else {
      out[key] = v;
    }
    hasAny = true;
  }

  if (raw.mcq_mode !== undefined) {
    if (typeof raw.mcq_mode === "string" && VALID_MCQ_MODE.has(raw.mcq_mode)) {
      out.mcq_mode = raw.mcq_mode as ScoringConfig["mcq_mode"];
      hasAny = true;
    } else {
      warnings.push(`${context}: mcq_mode "${raw.mcq_mode}" invalid — dropped.`);
    }
  }
  if (raw.mcq_wrong_penalty !== undefined) {
    if (typeof raw.mcq_wrong_penalty === "string" && VALID_MCQ_WRONG_PENALTY.has(raw.mcq_wrong_penalty)) {
      out.mcq_wrong_penalty = raw.mcq_wrong_penalty as ScoringConfig["mcq_wrong_penalty"];
      hasAny = true;
    } else {
      warnings.push(`${context}: mcq_wrong_penalty "${raw.mcq_wrong_penalty}" invalid — dropped.`);
    }
  }
  if (raw.rounding_strategy !== undefined) {
    if (typeof raw.rounding_strategy === "string" && VALID_ROUNDING.has(raw.rounding_strategy)) {
      out.rounding_strategy = raw.rounding_strategy as ScoringConfig["rounding_strategy"];
      hasAny = true;
    } else {
      warnings.push(`${context}: rounding_strategy "${raw.rounding_strategy}" invalid — dropped.`);
    }
  }

  return hasAny ? out : undefined;
}
