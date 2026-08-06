/**
 * ReportQuestionsTab.tsx — every question of the session, in play order.
 *
 * The recap deliberately shows only the five hardest questions; this tab is
 * the other 80% of the story. Everything rendered here was already computed
 * and stored by compute_live_question_analytics — the option distribution,
 * the median time, the fast/slow × right/wrong split, the 12-bucket time
 * histogram — it just never had a screen.
 *
 * One chart, on purpose. The difficulty curve is the single question this tab
 * answers at a glance ("where did the class fall off?"); the rest are small
 * per-question visuals in the live pages' chart-free idiom.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { OutcomeBar } from "@/components/live/LiveStats";
import LiveQuestionBody from "@/components/live/LiveQuestionBody";
import { classifyDistribution, topWrongValues } from "@/lib/live/classifyDistribution.js";
import {
  isCorrectIndex,
  optionLabel,
  tallyOptions,
  toPercentages,
} from "@/lib/live/optionTally.js";
import { accuracyByOrdinal, buildQuestionRows } from "@/lib/live/reportInsights.js";
import type { LiveDeepDive, LiveReport } from "@/services/liveExamService";
import { fmtMs, fmtSecs } from "./reportFormat";

/** emerald-600 — the live brand hue. A single series needs no palette. */
const CURVE_COLOR = "#059669";

function CurveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs shadow-md">
      <span className="font-semibold">{label}</span>
      {" — "}
      {p.accuracy === null
        ? "no answers"
        : `${p.accuracy}% correct (${p.correct}/${p.responses})`}
    </div>
  );
}

/** One cell of the fast/slow × right/wrong quadrant. */
function Quad({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-2 py-1.5 text-center">
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * The 12-bucket answer-time histogram, as a sparkline. Magnitude in a single
 * hue; each bucket carries its own tooltip so the shape is inspectable.
 */
function TimeHistogram({
  histogram,
  windowSeconds,
}: {
  histogram: number[];
  windowSeconds: number | null;
}) {
  const max = Math.max(1, ...histogram);
  const total = histogram.reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const bucketLabel = (i: number) => {
    if (!windowSeconds || windowSeconds <= 0) return `bucket ${i + 1} of 12`;
    const from = (i * windowSeconds) / 12;
    const to = ((i + 1) * windowSeconds) / 12;
    return `${fmtSecs(from)}–${fmtSecs(to)}`;
  };
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        When answers came in
      </p>
      <div
        className="mt-1 flex h-10 items-end gap-px"
        role="img"
        aria-label={`Answer-time histogram: ${total} answers across the question window`}
      >
        {histogram.map((n, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${n > 0 ? "bg-emerald-600/50" : "bg-muted"}`}
            style={{ height: n > 0 ? `${Math.max(8, (n / max) * 100)}%` : "2px" }}
            title={`${bucketLabel(i)}: ${n} ${n === 1 ? "answer" : "answers"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Per-option bars: who picked what, with the correct option marked. */
function OptionBreakdown({
  options,
  distribution,
  correctAnswer,
  totalResponses,
  answerType,
}: {
  options: unknown[];
  distribution: Record<string, number>;
  correctAnswer: unknown;
  totalResponses: number;
  answerType: string;
}) {
  const { counts } = tallyOptions(distribution, options.length);
  const percentages = toPercentages(counts, totalResponses);
  const isMulti = answerType === "multi" || answerType === "multi-select";
  return (
    <div className="mt-3 space-y-1.5">
      {options.map((opt, i) => {
        const correct = isCorrectIndex(correctAnswer, i);
        const text = typeof opt === "string" ? opt : ((opt as any)?.text ?? "");
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className={`w-5 shrink-0 text-center font-bold ${
                correct ? "text-emerald-600" : "text-muted-foreground"
              }`}
            >
              {optionLabel(i)}
            </span>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${correct ? "bg-emerald-600" : "bg-muted-foreground/50"}`}
                style={{ width: `${Math.min(100, percentages[i] || 0)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
              {percentages[i] || 0}% · {counts[i] || 0}
              {correct && <span className="ml-1 font-bold text-emerald-600">✓</span>}
            </span>
          </div>
        );
      })}
      {isMulti && (
        <p className="text-[10px] text-muted-foreground">
          Multi-select — bars count selections, not students.
        </p>
      )}
    </div>
  );
}

function ClassificationNote({
  classification,
}: {
  classification: ReturnType<typeof classifyDistribution>;
}) {
  if (classification.kind === "systematic" && classification.dominantIndex !== null) {
    return (
      <p className="mt-2 text-[13px] font-medium text-amber-700 dark:text-amber-300">
        {classification.percentages[classification.dominantIndex]}% chose{" "}
        {optionLabel(classification.dominantIndex)} — a shared belief, not guessing.
      </p>
    );
  }
  if (classification.kind === "split") {
    return (
      <p className="mt-2 text-[13px] font-medium text-muted-foreground">
        Split between {optionLabel(classification.topTwo[0])} and{" "}
        {optionLabel(classification.topTwo[1])} — two ideas being confused.
      </p>
    );
  }
  if (classification.kind === "scattered") {
    return (
      <p className="mt-2 text-[13px] font-medium text-muted-foreground">
        Answers spread evenly — this looks like the idea is missing rather than muddled.
      </p>
    );
  }
  return null;
}

export default function ReportQuestionsTab({
  deep,
  askedCount,
  pacing,
}: {
  deep: LiveDeepDive;
  askedCount: number;
  pacing: LiveReport["pacing"];
}) {
  const allRows = useMemo(() => buildQuestionRows(deep), [deep]);
  const rows = useMemo(() => allRows.slice(0, askedCount), [allRows, askedCount]);
  const curve = useMemo(() => accuracyByOrdinal(allRows, askedCount), [allRows, askedCount]);
  const extraByOrdinal = useMemo(
    () => new Map(pacing.map((p) => [p.ordinal, p.extra_seconds || 0])),
    [pacing]
  );

  if (askedCount === 0 || rows.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        This session ended before any question was asked.
      </p>
    );
  }

  const answeredPoints = curve.filter((c) => c.accuracy !== null).length;

  return (
    <div className="mt-6 space-y-6">
      {/* ─── The difficulty curve ─── */}
      {answeredPoints >= 2 && (
        <section className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="text-sm font-bold">Accuracy by question</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            In play order — dips are where the class fell off.
          </p>
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="%"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CurveTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke={CURVE_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3, fill: CURVE_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ─── Every question, in play order ─── */}
      <ol className="space-y-3">
        {rows.map(({ ordinal, question, analytics, accuracyPct }) => {
          const options = Array.isArray(question.options) ? question.options : [];
          const classification = analytics
            ? classifyDistribution({
                optionDistribution: analytics.option_distribution,
                correctAnswer: question.correct_answer,
                totalResponses: analytics.total_responses,
                optionCount: options.length,
                answerType: question.answer_type,
              })
            : null;
          const wrongValues =
            analytics && options.length === 0
              ? topWrongValues(analytics.option_distribution, question.correct_answer)
              : [];
          const windowSeconds =
            (Number(question.time_seconds) || 0) + (extraByOrdinal.get(ordinal) || 0);

          return (
            <li key={ordinal} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  Q{ordinal + 1}
                </span>
                <div className="flex items-baseline gap-3 text-xs tabular-nums text-muted-foreground">
                  {analytics?.median_time_ms != null && (
                    <span title="Median answer time">median {fmtMs(analytics.median_time_ms)}</span>
                  )}
                  {(analytics?.confusion_count || 0) > 0 && (
                    <span title="'I'm lost' taps on this question">
                      {analytics!.confusion_count} lost
                    </span>
                  )}
                  <span className="text-sm font-bold text-foreground">
                    {accuracyPct !== null ? `${accuracyPct}% correct` : "no answers"}
                  </span>
                </div>
              </div>

              <div className="mt-2 text-sm">
                <LiveQuestionBody text={question.text} compact />
              </div>

              {analytics ? (
                <>
                  <OutcomeBar
                    className="mt-3"
                    correct={analytics.correct_count}
                    wrong={analytics.wrong_count}
                    skipped={analytics.skipped_count}
                  />

                  {options.length > 0 && (
                    <OptionBreakdown
                      options={options}
                      distribution={analytics.option_distribution}
                      correctAnswer={question.correct_answer}
                      totalResponses={analytics.total_responses}
                      answerType={question.answer_type}
                    />
                  )}
                  {wrongValues.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Common wrong answers:{" "}
                      {wrongValues.map((w, i) => (
                        <span key={w.value}>
                          {i > 0 && " · "}
                          <span className="font-semibold text-foreground">{w.value}</span> ×
                          {w.count}
                        </span>
                      ))}
                    </p>
                  )}

                  {classification && <ClassificationNote classification={classification} />}

                  {analytics.median_time_ms != null && analytics.total_responses > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      <Quad label="fast · right" value={analytics.fast_correct} />
                      <Quad label="slow · right" value={analytics.slow_correct} />
                      <Quad label="fast · wrong" value={analytics.fast_wrong} />
                      <Quad label="slow · wrong" value={analytics.slow_wrong} />
                    </div>
                  )}
                  {analytics.impulsive_wrong > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {analytics.impulsive_wrong} answered wrong within seconds — confident, not
                      lost.
                    </p>
                  )}

                  {Array.isArray(analytics.time_histogram) &&
                    analytics.time_histogram.length > 0 && (
                      <div className="mt-3">
                        <TimeHistogram
                          histogram={analytics.time_histogram}
                          windowSeconds={windowSeconds > 0 ? windowSeconds : null}
                        />
                      </div>
                    )}
                </>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No answers were recorded for this question.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
