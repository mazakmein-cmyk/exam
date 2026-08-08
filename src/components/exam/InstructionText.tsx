/**
 * InstructionText.tsx — renders stored instruction text, upgrading palette-
 * legend lines into the colour tiles they describe.
 *
 * The problem it solves: the General Instructions explain the question
 * palette's colours, and prose saying "Green: you have answered" makes the
 * reader do the matching that a green square does at a glance — every big
 * exam platform shows swatches here, and candidates expect them. But our
 * instruction is creator-editable plain text in a translations column, not
 * markup, so the legend cannot be React elements in the stored string.
 *
 * The bridge is a one-word token at the start of a line:
 *
 *     [green] You have answered the question.
 *
 * This component renders such a line as a colour tile beside its text.
 * Everywhere else — the editor's textarea, an export, any surface without
 * this component — the token degrades to a readable label rather than
 * garbage, which is the property that makes it safe to store.
 *
 * Two rules keep it honest:
 *  • The tile colours are EXACTLY the runner's palette legend classes
 *    (ExamSimulator: green attempted, purple viewed, red marked for review,
 *    plain untouched). If the legend there changes, change TILE_CLASS with
 *    it — a legend that disagrees with the palette is worse than text.
 *  • Only the four known tokens are special. Any other line — including a
 *    creator's edits, numbers, headings, blank lines — passes through as
 *    whitespace-pre-wrap text, exactly as it rendered before tiles existed.
 */

/** Token → the runner's own legend classes. Keys are syntax, not prose. */
const TILE_CLASS: Record<string, string> = {
  green: "bg-green-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  plain: "bg-background border border-border",
};

const TILE_TOKEN = /^\s*\[(green|purple|red|plain)\]\s*(.*)$/i;

type Segment =
  | { kind: "text"; text: string }
  | { kind: "tile"; colour: keyof typeof TILE_CLASS; text: string };

/** Split into tile rows and runs of ordinary lines (kept intact for pre-wrap). */
function toSegments(text: string): Segment[] {
  const out: Segment[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(TILE_TOKEN);
    if (match) {
      out.push({ kind: "tile", colour: match[1].toLowerCase(), text: match[2] });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "text") {
      last.text += `\n${line}`;
    } else {
      out.push({ kind: "text", text: line });
    }
  }
  return out;
}

type Props = {
  text: string;
  className?: string;
};

export default function InstructionText({ text, className = "" }: Props) {
  return (
    <div className={className}>
      {toSegments(text).map((segment, i) =>
        segment.kind === "tile" ? (
          <span key={i} className="my-1.5 flex items-center gap-3 pl-1">
            <span
              aria-hidden="true"
              className={`h-6 w-6 shrink-0 rounded-md ${TILE_CLASS[segment.colour]}`}
            />
            {/* The colour itself is information ("red means marked") — say it
                to screen readers, since the tile is the only place it lives. */}
            <span className="sr-only">{segment.colour}: </span>
            <span>{segment.text}</span>
          </span>
        ) : (
          <span key={i} className="block whitespace-pre-wrap">
            {segment.text}
          </span>
        )
      )}
    </div>
  );
}
