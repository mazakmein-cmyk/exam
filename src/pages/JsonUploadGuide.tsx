import { useEffect, useState } from "react";
import { FileJson, ChevronRight, ArrowUp, Copy, Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { useToast } from "@/hooks/use-toast";

const tocSections = [
  { id: "before-you-start", label: "Before you start" },
  { id: "step-1-copy", label: "Step 1 — Copy the prompt" },
  { id: "step-2-run", label: "Step 2 — Run it in your AI" },
  { id: "step-3-save", label: "Step 3 — Save the JSON" },
  { id: "step-4-upload", label: "Step 4 — Upload to MockSetu" },
  { id: "step-5-review", label: "Step 5 — Review & confirm" },
  { id: "step-6-repeat", label: "Step 6 — Repeat per language" },
  { id: "step-7-publish", label: "Step 7 — Publish" },
  { id: "sample-json", label: "Sample JSON" },
  { id: "fixing-errors", label: "Fixing errors" },
  { id: "fix-invalid-json", label: "→ Invalid JSON syntax" },
  { id: "fix-schema-version", label: "→ Wrong schema version" },
  { id: "fix-language-mismatch", label: "→ Language mismatch" },
  { id: "fix-missing-sections", label: "→ No sections" },
  { id: "fix-file-too-large", label: "→ File too large" },
  { id: "fix-file-read", label: "→ Couldn't read file" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

const EXTRACTION_PROMPT = `You are converting an exam PDF into a strict JSON object that will be
uploaded into MockSetu's exam builder.

Your job is ONLY to convert — never to invent. If something is not in
the PDF, leave it null or omit it.

# OUTPUT CONTRACT

Output a single JSON object, wrapped between these literal delimiters
with NOTHING else before, after, or between them:

<<<EXAM_JSON_START>>>
{ ... the JSON ... }
<<<EXAM_JSON_END>>>

No prose, no code fences, no commentary outside the delimiters.

# SCHEMA (v1.0)

{
  "schema_version": "1.0",
  "language": "en" | "hi",
  "_extraction_summary": {
    "source_pdf": "<file name>",
    "model": "<your model name>",
    "total_in_pdf": <n>,
    "extracted": <n>,
    "skipped": [ { "reason": "...", "page": <n> } ],
    "needs_manual_review": [ { "section": "...", "q_no": <n>, "reason": "..." } ],
    "marks_source": "found_in_pdf" | "not_present",
    "answers_source": "found_in_pdf" | "not_present"
  },
  "marks_config": {
    "exam_default": {
      "marks_correct": 4,
      "marks_wrong": 1,
      "marks_skipped": 0,
      "mcq_mode": "partial" | "all_or_nothing",
      "mcq_wrong_penalty": "flat" | "per_option",
      "rounding_strategy": "floor" | "round" | "ceil" | "none"
    }
  },
  "sections": [
    {
      "name": "<EXACT section name as in my exam>",
      "questions": [
        {
          "q_no": 1,
          "text": "<question stem>",
          "answer_type": "single" | "multi",
          "options": ["A text", "B text", "C text", "D text"],
          "correct_answer": "1"
        }
      ]
    }
  ]
}

# SECTION NAMES — I provide these to you

I will tell you the EXACT section names my exam expects and the
language code. Use those exact strings as each section's "name" field.
Do not paraphrase, do not change capitalisation, do not add or remove
words.

If the PDF's sections are differently named, map them by the order
they appear in the PDF. If you cannot map confidently, ASK me — do
not guess.

# RULES

1. CONVERT, NEVER INVENT.
   - No answer in the PDF? Set "correct_answer": null or omit it.
   - No marks scheme in the PDF? Omit "marks_config" entirely.
   - Question unclear or damaged? Skip it; add to
     _extraction_summary.skipped with a reason.

2. answer_type: ONLY "single" or "multi".
   Anything else (true/false, numeric, fill-in-the-blank, short
   answer, match-the-following) is NOT supported in v1 — skip those
   and add to _extraction_summary.skipped with reason
   "unsupported answer_type".

3. correct_answer encoding is ZERO-BASED INDEX AS STRING.
   - If "B" is correct in ["A","B","C","D"] → "correct_answer": "1".
   - For multi-correct → ["0", "2"].

4. SKIP-AND-CONTINUE at the question level. One bad question does NOT
   halt the batch. Record skipped Qs in _extraction_summary.skipped.

5. MATH / IMAGES — flag, do not invent.
   - Math notation: extract "text" in plain Unicode where possible.
     Add _extraction_summary.needs_manual_review entry with reason
     "math notation — verify".
   - Image-based question: extract any accompanying text you can read.
     Add _extraction_summary.needs_manual_review with reason
     "image required". Do NOT fabricate ASCII diagrams.

6. marks_wrong is POSITIVE magnitude. "marks_wrong": 1 means a penalty
   of 1 point. Never use a signed value.

7. MODEL TIER. This prompt assumes you are GPT-5 / Claude Opus 4+ /
   Gemini 2.5 Pro or equivalent. If you are an older / smaller model,
   stop and tell the user to switch.

# SELF-CHECK BEFORE EMITTING

- "schema_version" is exactly "1.0"
- "language" is "en" or "hi" and matches what I told you
- "sections" array is non-empty
- Every "correct_answer" index (when present) exists in that
  question's "options"
- No two questions in the same section share a "q_no"
- single-answer questions do not have multi-element correct_answer
- JSON parses (no trailing commas, no comments)

# YOUR CONTEXT — fill in before running, then attach your PDF

- Language code: ______ (e.g., "en" or "hi")
- Section names from my exam, in order:
  1. ______
  2. ______
  3. ______
  (...add more lines if needed)

Now extract.`;

const FIX_INVALID_JSON_PROMPT = `The JSON file you generated for me is structurally invalid —
MockSetu's parser failed because of a syntax error somewhere in
the file.

Please:
1. Re-emit the FULL JSON between the literal delimiters
   <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.
2. Make the JSON STRICTLY valid:
   - All strings double-quoted
   - No trailing commas
   - No comments and no shell-style ## headers
   - All braces { } and brackets [ ] balanced
   - No unescaped double-quotes inside string values
3. Do NOT change any content — questions, options, answers, marks,
   and section names must be preserved exactly.
4. Mentally parse the JSON before emitting; make sure it would
   parse with a strict parser.

Here is the broken JSON to fix — paste it below this prompt:`;

const FIX_SCHEMA_VERSION_PROMPT = `The JSON you produced has an unsupported or missing
schema_version. MockSetu only accepts schema_version "1.0".

Please re-emit the FULL JSON with:
  "schema_version": "1.0"
as the first field after the opening brace.

Do NOT change anything else — keep questions, options, answers,
marks, and section names exactly as they are.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.

Here is the JSON to fix — paste it below this prompt:`;

const FIX_LANGUAGE_PROMPT = `The JSON's "language" field doesn't match the language slot I
am uploading to in MockSetu.

The correct language code for this upload is: "______"
(use "en" for English, "hi" for Hindi).

Please re-emit the FULL JSON with that exact value in the
"language" field. Do NOT change anything else — keep questions,
options, answers, marks, and section names exactly as they are.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.

Here is the JSON to fix — paste it below this prompt:`;

const FIX_MISSING_SECTIONS_PROMPT = `The JSON you produced is missing the "sections" array (or it is
empty). MockSetu requires at least one section, and every question
must live inside a section.

Please re-extract from the original PDF, making sure to group all
questions into "sections", each with a "name" field that matches
my exam's section names exactly.

My exam's section names, in order:
  1. ______
  2. ______
  3. ______
  (add more lines if your exam has more sections)

For each section, put its questions inside a "questions" array.
Follow the schema in my original prompt.

Output between <<<EXAM_JSON_START>>> and <<<EXAM_JSON_END>>>.`;

const SAMPLE_JSON = `{
  "schema_version": "1.0",
  "language": "en",
  "sections": [
    {
      "name": "Quantitative",
      "questions": [
        {
          "text": "Capital of France?",
          "answer_type": "single",
          "options": ["Berlin", "Paris", "Madrid"],
          "correct_answer": "1"
        }
      ]
    }
  ]
}`;

const SectionHeading = ({ id, title, sub }: { id: string; title: string; sub?: string }) => (
  <div id={id} className="scroll-mt-24 pt-10 pb-3 border-b border-border/50 mb-6">
    {sub && <p className="text-xs font-bold tracking-widest text-primary uppercase mb-1">{sub}</p>}
    <h2 className="text-[22px] font-bold text-foreground tracking-tight">{title}</h2>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] text-muted-foreground leading-[1.85] mb-4">{children}</p>
);

const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="mb-5 space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-[14.5px] text-muted-foreground leading-[1.75]">
        <ChevronRight className="h-4 w-4 mt-[3px] flex-shrink-0 text-primary/50" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const OL = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="mb-5 space-y-2 list-decimal pl-5">
    {items.map((item, i) => (
      <li key={i} className="text-[14.5px] text-muted-foreground leading-[1.75]">
        {item}
      </li>
    ))}
  </ol>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1.5 py-0.5 rounded bg-secondary text-[12.5px] font-mono text-foreground">
    {children}
  </code>
);

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: label ? `${label} copied to clipboard.` : "Copied to clipboard.",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the text manually and copy it.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="relative mb-6 group">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied!" : "Copy"}
      </button>
      <pre className="bg-[#0c0f1a] text-slate-100 text-[12.5px] leading-[1.6] p-5 pr-28 rounded-lg overflow-x-auto whitespace-pre font-mono max-h-[520px]">
        {text}
      </pre>
    </div>
  );
}

const JsonUploadGuide = () => {
  const [activeSection, setActiveSection] = useState("before-you-start");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowTop(window.scrollY > 400);
      const ids = tocSections.map((s) => s.id);
      for (let i = ids.length - 1; i >= 0; i--) {
        const el = document.getElementById(ids[i]);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(ids[i]);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="JSON Upload Guide | MockSetu"
        description="Step-by-step guide for creators: convert your exam PDF into JSON using your own AI, then upload to MockSetu in a few minutes."
        path="/json-upload-guide"
      />
      <Navbar />

      {/* Hero */}
      <div className="bg-[#07091A] pt-32 pb-16 px-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#6C3EF4]/15 border border-[#6C3EF4]/25 mb-6">
          <FileJson className="h-7 w-7 text-[#6C3EF4]" />
        </div>
        <h1 className="text-[36px] sm:text-[48px] font-black text-white tracking-[-0.03em] leading-tight">
          JSON Upload Guide
        </h1>
        <p className="mt-3 text-white/40 text-[15px] max-w-xl mx-auto">
          Convert your exam PDF into JSON using your own AI, then upload it to MockSetu. About 5 minutes per language.
        </p>
      </div>

      {/* Body */}
      <div className="container mx-auto max-w-6xl px-5 py-16">
        <div className="flex gap-12">
          {/* Sticky ToC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground/60 uppercase mb-4">
                Contents
              </p>
              <nav className="space-y-0.5">
                {tocSections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`block px-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                      activeSection === s.id
                        ? "bg-primary/8 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    } ${s.label.startsWith("→") ? "pl-6" : ""}`}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 max-w-3xl">
            {/* Before you start */}
            <SectionHeading id="before-you-start" title="Before you start" />
            <P>You need three things to use this feature:</P>
            <UL
              items={[
                <>
                  <strong>An exam already created in MockSetu</strong>, with{" "}
                  <strong>sections</strong> added. Write down each section's exact name — they
                  must match the section names inside your JSON.
                </>,
                <>
                  <strong>A PDF</strong> of your exam paper (the source you want to convert).
                </>,
                <>
                  <strong>A frontier-AI account</strong>: ChatGPT (GPT-5), Claude (Opus 4 or
                  newer), or Gemini (2.5 Pro). Older or smaller models will hallucinate answers
                  — do not use them for this.
                </>,
              ]}
            />
            <P>Typical time: about 5 minutes per language.</P>

            {/* Step 1 */}
            <SectionHeading id="step-1-copy" title="Step 1 — Copy the prompt" sub="Step 1 of 7" />
            <P>
              Click the Copy button at the top-right of the block below. You'll paste this into
              your AI in Step 2.
            </P>
            <CopyBlock text={EXTRACTION_PROMPT} label="Prompt" />
            <P>
              What this prompt does: it instructs the AI to read your PDF and produce JSON in
              the exact format MockSetu expects, and to <strong>never invent</strong> answers or
              marks — only convert what's actually in the PDF.
            </P>

            {/* Step 2 */}
            <SectionHeading id="step-2-run" title="Step 2 — Run it in your AI" sub="Step 2 of 7" />
            <OL
              items={[
                "Open ChatGPT, Claude, or Gemini in a new tab and start a fresh chat.",
                "Paste the prompt from Step 1.",
                <>
                  <strong>Before sending</strong>, fill in the placeholders at the bottom of the
                  prompt: the language code (<Code>en</Code> or <Code>hi</Code>) and your exam's
                  section names in the order they appear in MockSetu.
                </>,
                "Attach your PDF to the chat.",
                "Send.",
              ]}
            />
            <P>
              The AI replies with a JSON block wrapped between{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_START&gt;&gt;&gt;</Code> and{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_END&gt;&gt;&gt;</Code>.
            </P>

            {/* Step 3 */}
            <SectionHeading id="step-3-save" title="Step 3 — Save the JSON" sub="Step 3 of 7" />
            <OL
              items={[
                "Select everything between the delimiters in the AI's reply (including or excluding the delimiter lines — both work; the parser strips them).",
                "Copy.",
                "Open Notepad, TextEdit, or VS Code.",
                "Paste.",
                <>
                  Save the file with a <Code>.json</Code> extension. Tip: include the language
                  code in the filename, e.g. <Code>my-exam-en.json</Code>.
                </>,
              ]}
            />

            {/* Step 4 */}
            <SectionHeading id="step-4-upload" title="Step 4 — Upload to MockSetu" sub="Step 4 of 7" />
            <OL
              items={[
                "Open your exam's edit page.",
                <>
                  Click the <strong>⋮</strong> menu in the top-right corner.
                </>,
                <>
                  Click <strong>Upload JSON</strong>.
                </>,
                "In the modal, click the Upload JSON button next to the language you just generated.",
                <>
                  Pick your <Code>.json</Code> file.
                </>,
              ]}
            />

            {/* Step 5 */}
            <SectionHeading id="step-5-review" title="Step 5 — Review & confirm" sub="Step 5 of 7" />
            <P>The preview shows you exactly what will happen if you confirm:</P>
            <UL
              items={[
                "Per-section match status: ✓ matched in your exam, ✗ not in this exam.",
                "How many questions are valid vs skipped, with the reason for each skip.",
                "AI-flagged questions that need your eyes (math, images, ambiguity).",
                "Whether a marks scheme was found in the PDF.",
              ]}
            />
            <P>
              <strong>If section names don't match</strong>: a guided-fix panel appears at the
              top of the preview, with a one-click Copy prompt. Paste it into your AI along
              with the JSON — the AI returns a renamed version you can re-upload. Or rename your
              exam's sections in MockSetu to match.
            </P>
            <P>
              <strong>If the language already has questions</strong>, you'll pick one of:
            </P>
            <UL
              items={[
                <>
                  <strong>Replace</strong> — deletes every question in this language and inserts
                  fresh ones. Destructive. Blocked if any student has already submitted attempts
                  on this language.
                </>,
                <>
                  <strong>Append</strong> — adds the new questions after the existing ones in
                  each matched section. Safe; the default.
                </>,
              ]}
            />
            <P>
              Click <strong>Confirm Upload</strong>. In a few seconds your questions are
              created.
            </P>

            {/* Step 6 */}
            <SectionHeading
              id="step-6-repeat"
              title="Step 6 — Repeat for other languages"
              sub="Step 6 of 7"
            />
            <P>
              If your exam supports more than one language (for example, English + Hindi),
              upload one JSON per language:
            </P>
            <OL
              items={[
                <>
                  Upload the <strong>primary</strong> language first — the one marked with the
                  PRIMARY badge in the modal.
                </>,
                "Then upload each secondary language. The system pairs its questions to primary by order.",
              ]}
            />
            <P>For secondary-language uploads:</P>
            <UL
              items={[
                <>
                  The AI's <Code>correct_answer</Code> is <strong>ignored</strong> — primary is
                  the source of truth for correct answers.
                </>,
                <>
                  The AI's <Code>marks_config</Code> is <strong>ignored</strong> — marks are
                  managed on the primary language only.
                </>,
                "Empty text, missing options, and count mismatches are allowed at upload time, but they will block publishing of that secondary language until you fix them.",
              ]}
            />

            {/* Step 7 */}
            <SectionHeading id="step-7-publish" title="Step 7 — Publish" sub="Step 7 of 7" />
            <P>When you publish your exam:</P>
            <UL
              items={[
                "The primary language publishes independently — your existing rules still apply (each section has at least one question, no blank stems, etc.).",
                "Each secondary language is checked against primary: same section count, same question count per section, every question linked back to primary, non-empty text, matching option counts, matching answer types.",
                "If a check fails, the Publish dialog lists exactly what to fix. Primary still publishes — secondary failures only block that secondary language.",
              ]}
            />

            {/* Sample JSON */}
            <SectionHeading id="sample-json" title="Sample JSON" />
            <P>The smallest valid example — one section with one question:</P>
            <CopyBlock text={SAMPLE_JSON} label="Sample JSON" />
            <P>
              For the full schema (marks config, multi-section, per-question marks overrides),
              look at the SCHEMA block inside the prompt in Step 1.
            </P>

            {/* Fixing errors */}
            <SectionHeading id="fixing-errors" title="Fixing errors" />
            <P>
              When an upload fails, the dialog shows the exact error and links you here. Each
              section below covers one error type, what causes it, and a Copy-able prompt you
              can paste into your AI to fix the JSON without re-extracting from the PDF.
            </P>
            <P>
              Workflow for AI-fix-prompts: copy the prompt, open the same chat where you
              originally extracted the JSON (so the AI still has the PDF context), paste the
              prompt, then paste your broken JSON below it. The AI returns a corrected version
              between <Code>&lt;&lt;&lt;EXAM_JSON_START&gt;&gt;&gt;</Code> and{" "}
              <Code>&lt;&lt;&lt;EXAM_JSON_END&gt;&gt;&gt;</Code> — save it as <Code>.json</Code>{" "}
              and re-upload.
            </P>

            {/* Fix: Invalid JSON */}
            <SectionHeading id="fix-invalid-json" title="Invalid JSON syntax" sub="Error type" />
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 mb-5">
              <p className="text-[13.5px] text-blue-900 dark:text-blue-200 leading-[1.7]">
                <strong>Before this error reaches you, MockSetu auto-repairs common AI mistakes.</strong>{" "}
                The parser silently fixes unescaped quotes inside strings, trailing commas,
                markdown code fences, smart quotes, Python <Code>True</Code> /{" "}
                <Code>False</Code> / <Code>None</Code>, missing commas, and explanatory prose
                around the JSON. If you're seeing this error, even auto-repair couldn't
                recover the file — usually the AI's reply was truncated mid-output, or the
                content is genuinely corrupted. Either re-extract from the PDF or fix
                manually using the steps below.
              </p>
            </div>
            <P>
              <strong>What it looks like:</strong> a red toast or banner like{" "}
              <Code>{`"Couldn't parse JSON: Expected ',' or '}' after property value..."`}</Code>{" "}
              with a line-and-column reference and a few lines of context around the broken
              spot.
            </P>
            <P>
              <strong>What happened:</strong> the AI's output isn't valid JSON. Common causes
              are a missing comma, a stray quote, an unescaped character inside a string value,
              or extra prose the AI added outside the delimiters.
            </P>
            <P>
              <strong>Fix it manually (faster for one stray character):</strong>
            </P>
            <OL
              items={[
                <>
                  Open the <Code>.json</Code> file in VS Code or Notepad++ (not Word — Word
                  will introduce smart quotes that break JSON).
                </>,
                "Jump to the line and column shown in the error message.",
                <>
                  Fix the issue: add the missing comma, escape the stray quote (
                  <Code>\"</Code> inside strings), or remove the trailing comma.
                </>,
                "Save and re-upload.",
              ]}
            />
            <P>
              <strong>Or have your AI fix it</strong> — copy this prompt and paste it into the
              same chat where you originally extracted the JSON:
            </P>
            <CopyBlock text={FIX_INVALID_JSON_PROMPT} label="Invalid-JSON fix prompt" />

            {/* Fix: Schema version */}
            <SectionHeading
              id="fix-schema-version"
              title="Wrong or missing schema version"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"Unsupported schema_version "X" — this builder supports "1.0""</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the AI emitted a different version (or no version
              at all). MockSetu's parser is strict about this so old / future-incompatible JSONs
              can't sneak in.
            </P>
            <P>
              <strong>Fix it</strong> — copy this prompt and paste it into your AI chat:
            </P>
            <CopyBlock text={FIX_SCHEMA_VERSION_PROMPT} label="Schema-version fix prompt" />

            {/* Fix: Language mismatch */}
            <SectionHeading
              id="fix-language-mismatch"
              title="Language mismatch"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong> any of —
            </P>
            <UL
              items={[
                <>
                  <Code>"Missing 'language' field"</Code>
                </>,
                <>
                  <Code>"Language 'fr' is not supported by this exam"</Code>
                </>,
                <>
                  <Code>"JSON is for 'hi' but you clicked Upload on 'en'"</Code>
                </>,
              ]}
            />
            <P>
              <strong>What happened:</strong> the JSON declares a language that doesn't match
              the row you clicked in the upload modal, or doesn't declare one at all.
            </P>
            <P>
              <strong>Fix it (option 1):</strong> upload the file to the right language slot —
              the modal shows one row per language; click the button next to the one whose code
              matches the JSON.
            </P>
            <P>
              <strong>Fix it (option 2):</strong> ask your AI to change the language in the
              JSON to match the slot you want to upload to. Fill the underscore in the prompt
              with <Code>en</Code> or <Code>hi</Code>:
            </P>
            <CopyBlock text={FIX_LANGUAGE_PROMPT} label="Language fix prompt" />

            {/* Fix: No sections */}
            <SectionHeading
              id="fix-missing-sections"
              title="No sections in JSON"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"JSON has no 'sections' — nothing to import"</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the JSON is missing the <Code>"sections"</Code>{" "}
              array or it's an empty array. MockSetu requires every question to live inside a
              section, and every JSON to declare at least one.
            </P>
            <P>
              <strong>Fix it</strong> — copy this prompt, fill in your exam's section names,
              and paste into your AI chat:
            </P>
            <CopyBlock
              text={FIX_MISSING_SECTIONS_PROMPT}
              label="Missing-sections fix prompt"
            />
            <P>
              If you don't remember your exam's section names, the upload dialog shows them at
              the top — re-open ⋮ → Upload JSON to see the list.
            </P>

            {/* Fix: File too large */}
            <SectionHeading
              id="fix-file-too-large"
              title="File too large"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"File too large — Max 10 MB"</Code>.
            </P>
            <P>
              <strong>What happened:</strong> the JSON is over 10 MB. Most exams should be a
              fraction of this; usually this means the AI duplicated long passages across
              questions, or your exam is genuinely enormous (~5000+ questions).
            </P>
            <P>
              <strong>Fix it</strong>:
            </P>
            <UL
              items={[
                "Check for repeated passages. If you have a comprehension section where each question repeats the full passage in its text, ask your AI to factor the passage out and reference it once per group instead.",
                "Split the JSON. Emit just some sections at a time, save each as a separate file, and upload them one after another. MockSetu's parser commits only the sections it finds in your exam — leaving the others untouched — so you can split safely.",
                "Re-extract on a leaner model setting (no verbose preambles, no explanations).",
              ]}
            />
            <P>
              There is no Copy-prompt for this one because the right fix depends on which
              cause it is.
            </P>

            {/* Fix: File read */}
            <SectionHeading
              id="fix-file-read"
              title="Couldn't read file"
              sub="Error type"
            />
            <P>
              <strong>What it looks like:</strong>{" "}
              <Code>"Couldn't read file"</Code> followed by a browser-specific message.
            </P>
            <P>
              <strong>What happened:</strong> the browser failed to read the file off disk.
              Rare — usually a deleted file, a cloud-sync conflict (OneDrive/Dropbox writing
              the file mid-read), or a permissions issue.
            </P>
            <P>
              <strong>Fix it</strong>:
            </P>
            <UL
              items={[
                <>
                  Re-save the file with a fresh name (e.g. <Code>my-exam-en-fixed.json</Code>).
                </>,
                "Move it out of any cloud-sync folder while uploading.",
                "Try a different browser (Chrome, Firefox, Edge) if one is misbehaving.",
                "If the file genuinely got corrupted on save, paste the AI's reply into a fresh editor window and save again.",
              ]}
            />

            {/* Troubleshooting */}
            <SectionHeading id="troubleshooting" title="Troubleshooting" />
            <div className="overflow-x-auto mb-6 rounded-lg border border-border/50">
              <table className="w-full text-[14px] border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border/50">
                    <th className="text-left py-3 px-4 font-semibold text-foreground w-2/5">
                      Symptom
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-foreground">Fix</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground leading-[1.65]">
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "Couldn't parse JSON"</td>
                    <td className="py-3 px-4">
                      The file isn't valid JSON. Open it in VS Code; look for missing commas or
                      stray characters.{" "}
                      <a
                        href="#fix-invalid-json"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "Unsupported schema_version"</td>
                    <td className="py-3 px-4">
                      The AI didn't emit <Code>"schema_version": "1.0"</Code>. Re-run with the
                      exact prompt above on a frontier model.{" "}
                      <a
                        href="#fix-schema-version"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "JSON is for X but you clicked Upload on Y"</td>
                    <td className="py-3 px-4">
                      Wrong file for this language slot. Pick the right one for the row you
                      clicked, or ask your AI to change the JSON's <Code>language</Code> field.{" "}
                      <a
                        href="#fix-language-mismatch"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "JSON has no 'sections'"</td>
                    <td className="py-3 px-4">
                      The AI's output is missing the <Code>sections</Code> array.{" "}
                      <a
                        href="#fix-missing-sections"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Toast: "File too large"</td>
                    <td className="py-3 px-4">
                      Max upload is 10 MB.{" "}
                      <a
                        href="#fix-file-too-large"
                        className="text-primary font-semibold hover:underline"
                      >
                        See full fix →
                      </a>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Preview shows ✗ next to a section</td>
                    <td className="py-3 px-4">
                      The JSON's section name doesn't match your exam. Use the in-app rename
                      prompt that appears in the preview — click its Copy button, paste into
                      your AI along with the JSON, then re-upload.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">Many questions show as "skipped"</td>
                    <td className="py-3 px-4">
                      Check the reasons in the preview. Common causes: math/image questions,
                      true/false (not supported), missing options. Add those manually after
                      upload in the editor.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">
                      Imported questions have no <Code>correct_answer</Code>
                    </td>
                    <td className="py-3 px-4">
                      The AI couldn't find the answer in the PDF. Fill in the answers manually
                      in the editor after upload.
                    </td>
                  </tr>
                  <tr className="border-b border-border/30 align-top">
                    <td className="py-3 px-4">AI's reply isn't wrapped in delimiters</td>
                    <td className="py-3 px-4">
                      Older or weaker model. Switch to GPT-5, Claude Opus 4 (or newer), or
                      Gemini 2.5 Pro.
                    </td>
                  </tr>
                  <tr className="align-top">
                    <td className="py-3 px-4">Cannot publish a secondary language</td>
                    <td className="py-3 px-4">
                      Open the Publish dialog — it lists the exact parity failures (missing
                      section, wrong question count, empty text, option-count mismatch, etc.).
                      Fix each item and retry.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 z-30 inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      <Footer />
    </div>
  );
};

export default JsonUploadGuide;
