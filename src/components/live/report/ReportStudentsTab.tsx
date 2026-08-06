/**
 * ReportStudentsTab.tsx — the roster, one level deeper than a rank table.
 *
 * The recap's attendance table answers "who won". This tab answers the
 * question a teacher actually carries out of the room: WHO do I check in on
 * tomorrow, and what exactly happened to them, question by question.
 *
 * Names are real here on purpose — this is the creator's private screen, the
 * one surface allowed to show them (the public link never renders this tab,
 * and its queries are creator-gated by RLS anyway).
 *
 * Heatmap colors are emerald-700 / rose-400 rather than the 500 steps the
 * OutcomeBar uses: the extra lightness gap is what pushes the red↔green pair
 * past color-blind separation (validated ΔE 10.6 protan vs 5.6 for the 500s).
 * Every cell also carries a glyph, so the grid reads without color at all.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, UserRoundSearch } from "lucide-react";
import {
  buildHeatmap,
  studentsToCheckOn,
} from "@/lib/live/reportInsights.js";
import { fmtMs } from "./reportFormat";

export type StudentRow = {
  userId: string;
  name: string;
  rank: number | null;
  joinedAt: string;
  answered: number;
  correct: number;
  accuracyPct: number | null;
  avgTimeMs: number | null;
  lastAnsweredOrdinal: number;
  neverAnswered: boolean;
  droppedOff: boolean;
  confusionCount: number;
  responses: { question_ordinal: number; is_correct: boolean | null; time_taken_ms: number }[];
};

type CellState = "correct" | "wrong" | "answered" | "skipped";

const CELL_STYLE: Record<CellState, string> = {
  correct: "bg-emerald-700 text-white",
  wrong: "bg-rose-400 text-rose-950",
  answered: "bg-muted-foreground/40 text-background",
  skipped: "bg-muted text-muted-foreground",
};

const CELL_GLYPH: Record<CellState, string> = {
  correct: "✓",
  wrong: "✕",
  answered: "•",
  skipped: "–",
};

const CELL_WORD: Record<CellState, string> = {
  correct: "correct",
  wrong: "wrong",
  answered: "answered (outcome unknown)",
  skipped: "did not answer",
};

function Cell({ state, title }: { state: CellState; title: string }) {
  return (
    <span
      title={title}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold ${CELL_STYLE[state]}`}
    >
      {CELL_GLYPH[state]}
    </span>
  );
}

export default function ReportStudentsTab({
  studentRows,
  askedCount,
}: {
  studentRows: StudentRow[];
  askedCount: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const checkOn = useMemo(() => studentsToCheckOn(studentRows), [studentRows]);
  const heatmap = useMemo(
    () => buildHeatmap({ studentRows, askedCount }),
    [studentRows, askedCount]
  ) as { userId: string; name: string; cells: { state: CellState; timeMs: number | null }[] }[];
  const cellsByUser = useMemo(
    () => new Map(heatmap.map((h) => [h.userId, h.cells])),
    [heatmap]
  );

  if (studentRows.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">Nobody joined this session.</p>;
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ─── Who to check in on ─── */}
      {checkOn.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <UserRoundSearch className="h-4 w-4 text-amber-500" />
            Worth checking in on
          </h3>
          <ul className="mt-2 space-y-1.5">
            {checkOn.map(({ row, reasons }) => (
              <li
                key={row.userId}
                className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm"
              >
                <span className="font-semibold">{row.name}</span>{" "}
                <span className="text-muted-foreground">— {reasons.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── The roster ─── */}
      <section>
        <h3 className="text-sm font-bold">Every student</h3>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" aria-label="Expand" />
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Student</th>
                <th className="px-3 py-2 text-right font-semibold">Correct</th>
                <th className="px-3 py-2 text-right font-semibold">Answered</th>
                <th className="px-3 py-2 text-right font-semibold">Accuracy</th>
                <th className="px-3 py-2 text-right font-semibold">Avg time</th>
                <th className="px-3 py-2 text-right font-semibold">"I'm lost"</th>
                <th className="px-3 py-2 text-right font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {studentRows.map((s) => {
                const isOpen = expanded === s.userId;
                const cells = cellsByUser.get(s.userId) || [];
                return (
                  <Fragment key={s.userId}>
                    <tr
                      className="cursor-pointer border-t border-border/50 hover:bg-muted/30"
                      onClick={() => setExpanded(isOpen ? null : s.userId)}
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {s.rank ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {s.name}
                        {s.droppedOff && (
                          <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            dropped off
                          </span>
                        )}
                        {s.neverAnswered && (
                          <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            never answered
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.correct}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.answered}
                        <span className="text-xs">/{askedCount}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.accuracyPct !== null ? `${s.accuracyPct}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtMs(s.avgTimeMs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.confusionCount || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.joinedAt
                          ? new Date(s.joinedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border/30 bg-muted/20">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {cells.map((c, o) => (
                              <span
                                key={o}
                                className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-card px-1.5 py-1 text-[11px] tabular-nums"
                                title={`Q${o + 1} — ${CELL_WORD[c.state]}${
                                  c.timeMs != null ? ` in ${fmtMs(c.timeMs)}` : ""
                                }`}
                              >
                                <span className="font-semibold text-muted-foreground">
                                  Q{o + 1}
                                </span>
                                <Cell state={c.state} title={CELL_WORD[c.state]} />
                                {c.timeMs != null && (
                                  <span className="text-muted-foreground">{fmtMs(c.timeMs)}</span>
                                )}
                              </span>
                            ))}
                            {cells.length === 0 && (
                              <span className="text-xs text-muted-foreground">
                                No questions were asked.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── The class grid ─── */}
      {askedCount > 0 && (
        <section>
          <h3 className="text-sm font-bold">Class grid</h3>
          <div className="mt-1 flex items-center gap-3 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Cell state="correct" title="correct" /> correct
            </span>
            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
              <Cell state="wrong" title="wrong" /> wrong
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Cell state="skipped" title="did not answer" /> no answer
            </span>
          </div>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-border/60 bg-card p-3">
            <div className="min-w-max">
              <div className="flex items-center gap-0.5 pb-1">
                <span className="sticky left-0 z-10 w-36 shrink-0 bg-card" />
                {Array.from({ length: askedCount }, (_, o) => (
                  <span
                    key={o}
                    className="w-6 shrink-0 text-center text-[9px] font-semibold tabular-nums text-muted-foreground"
                  >
                    {o + 1}
                  </span>
                ))}
              </div>
              {heatmap.map((row) => (
                <div key={row.userId} className="flex items-center gap-0.5 py-0.5">
                  <span
                    className="sticky left-0 z-10 w-36 shrink-0 truncate bg-card pr-2 text-xs font-medium"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  {row.cells.map((c, o) => (
                    <Cell
                      key={o}
                      state={c.state}
                      title={`${row.name} · Q${o + 1} — ${CELL_WORD[c.state]}${
                        c.timeMs != null ? ` in ${fmtMs(c.timeMs)}` : ""
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
