/**
 * ReportPacingTab.tsx — how the room was actually paced, question by question.
 *
 * The recap compresses pacing into one sentence. This tab is the same unlock
 * log (already sitting in the report payload, fetched and unrendered until
 * now) laid out per question: what was planned, what was granted or cut, and
 * the talk gap — the stretch between one question closing and the next
 * unlock, which is the time the creator spent explaining. That column is the
 * one a creator plans their next session with.
 */

import { useMemo } from "react";
import { pacingRows } from "@/lib/live/reportInsights.js";
import type { LiveQuestion, LiveReport } from "@/services/liveExamService";
import { fmtSecs } from "./reportFormat";

export default function ReportPacingTab({
  pacing,
  questions,
  endedAt,
  durationMin,
}: {
  pacing: LiveReport["pacing"];
  questions: LiveQuestion[] | undefined;
  endedAt: string | null;
  durationMin: number | null;
}) {
  const rows = useMemo(
    () => pacingRows({ pacing, questions: questions || [], endedAt }),
    [pacing, questions, endedAt]
  );

  if (rows.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        No pacing log for this session — it predates the unlock log.
      </p>
    );
  }

  const grantedTotal = rows.reduce((s, r) => s + r.grantedSeconds, 0);
  const cutCount = rows.filter((r) => r.closedEarly).length;
  const undoTotal = rows.reduce((s, r) => s + r.undoCount, 0);
  const talkTotal = rows.reduce((s, r) => s + (r.talkGapSeconds || 0), 0);

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        {durationMin !== null ? `${durationMin} minutes end to end` : "Duration unknown"}
        {grantedTotal > 0 && ` · ${fmtSecs(grantedTotal)} of extra time granted`}
        {cutCount > 0 && ` · ${cutCount} question${cutCount === 1 ? "" : "s"} closed early`}
        {undoTotal > 0 && ` · ${undoTotal} unlock${undoTotal === 1 ? "" : "s"} taken back`}
        {talkTotal > 0 && ` · ~${fmtSecs(talkTotal)} spent between questions`}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Q</th>
              <th className="px-3 py-2 text-right font-semibold">Planned</th>
              <th className="px-3 py-2 text-right font-semibold">Adjustment</th>
              <th className="px-3 py-2 text-right font-semibold">Open for</th>
              <th className="px-3 py-2 text-right font-semibold">Talk gap after</th>
              <th className="px-3 py-2 text-right font-semibold">Undone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ordinal} className="border-t border-border/50">
                <td className="px-3 py-2 font-semibold tabular-nums">Q{r.ordinal + 1}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {fmtSecs(r.plannedSeconds)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.grantedSeconds > 0 ? (
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      +{fmtSecs(r.grantedSeconds)}
                    </span>
                  ) : r.closedEarly ? (
                    <span className="font-medium text-rose-600 dark:text-rose-400">
                      −{fmtSecs(r.cutSeconds)} (closed early)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtSecs(r.windowSeconds)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.talkGapSeconds !== null ? fmtSecs(r.talkGapSeconds) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {r.undoCount || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        "Talk gap" is the time between a question closing and the next one being unlocked —
        explanation, discussion, or a breather. The last question's gap runs to the moment the
        session ended.
      </p>
    </div>
  );
}
