/**
 * LiveExamReport.tsx — D1. What the session was actually for.
 *
 * Pressing End used to compute rankings and offer a button back to the editor.
 * Every insight stayed scattered across per-question rows that nobody assembles by
 * hand at 3:40pm on a Friday. A live quiz with no report is entertainment; a live
 * quiz that ends with "here are the three things to reteach" is a teaching tool.
 *
 * It is GENERATED, not requested. The creator lands here automatically when the
 * session ends. A report behind a "generate report" button gets looked at by maybe
 * one creator in five, and the value of this feature is entirely in being read.
 *
 * One page, two audiences
 * ----------------------
 * The same component serves the creator's private view and a public shareable
 * link. The difference is decided server-side — the token path always masks names
 * when privacy mode is on — so there is no branch here that could get it wrong.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Gauge,
  HandHelping,
  Link2,
  Sparkles,
  Timer,
  TrendingDown,
  Users,
} from "lucide-react";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { OutcomeBar } from "@/components/live/LiveStats";
import LiveQuestionBody from "@/components/live/LiveQuestionBody";
import { classifyDistribution } from "@/lib/live/classifyDistribution.js";
import { momentCopy } from "@/lib/live/moments.js";
import { optionLabel } from "@/lib/live/optionTally.js";
import {
  fetchLiveExam,
  fetchLiveReport,
  fetchLiveReportByToken,
  setLiveReportSharing,
  type LiveReport,
} from "@/services/liveExamService";

/** How many questions the "reteach these" list shows before it stops being a list. */
const HARDEST_COUNT = 5;

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4" title={hint}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Empty states say "N/A" rather than hiding — a missing section reads as a bug. */
const NA = <span className="text-muted-foreground">N/A</span>;

export default function LiveExamReport() {
  const { creatorId, liveExamId, token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isPublic = !!token;
  const [report, setReport] = useState<LiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = isPublic
          ? await fetchLiveReportByToken(token!)
          : await fetchLiveReport(liveExamId!);
        if (cancelled) return;
        if (!data) {
          setError(
            isPublic
              ? "This link is no longer available."
              : "This session has no report yet."
          );
        } else {
          setReport(data);
        }
        if (!isPublic && liveExamId) {
          const exam = await fetchLiveExam(liveExamId);
          if (!cancelled) setShareToken(exam.report_public ? exam.report_share_token : null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load this report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPublic, token, liveExamId]);

  const nameOf = useCallback(
    (userId: string | null) => (userId ? report?.names?.[userId] || "Someone" : null),
    [report]
  );

  /**
   * The reteach list.
   *
   * Already ordered hardest-first server-side; this only classifies each one so a
   * creator sees WHY it was hard, not just that it was. A question everyone got
   * wrong and a question the class split on need different lessons.
   */
  const hardest = useMemo(() => {
    if (!report) return [];
    return report.questions.slice(0, HARDEST_COUNT).map((q) => ({
      q,
      classification: classifyDistribution({
        optionDistribution: q.option_distribution,
        correctAnswer: q.correct_answer,
        totalResponses: q.total_responses,
        optionCount: Array.isArray(q.options) ? q.options.length : 0,
        answerType: q.answer_type,
      }),
    }));
  }, [report]);

  const misconceptions = useMemo(
    () =>
      hardest.filter(
        (h) => h.classification.kind === "systematic" && h.classification.dominantIndex !== null
      ),
    [hardest]
  );

  const confusionHotspots = useMemo(
    () =>
      (report?.questions || [])
        .filter((q) => (q.confusion_count || 0) > 0)
        .sort((a, b) => b.confusion_count - a.confusion_count)
        .slice(0, 3),
    [report]
  );

  const handleShareToggle = async (enabled: boolean) => {
    if (!liveExamId) return;
    setSharing(true);
    try {
      setShareToken(await setLiveReportSharing(liveExamId, enabled));
    } catch (e: any) {
      toast({ title: "Couldn't change sharing", description: e.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const shareUrl = shareToken ? `${window.location.origin}/live-report/${shareToken}` : null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-muted-foreground">{error || "Nothing to display."}</p>
        {!isPublic && (
          <Button variant="outline" onClick={() => navigate("/dashboard?tab=live")}>
            Back to dashboard
          </Button>
        )}
      </div>
    );
  }

  const { totals } = report;
  const durationMin =
    report.started_at && report.ended_at
      ? Math.max(
          1,
          Math.round(
            (new Date(report.ended_at).getTime() - new Date(report.started_at).getTime()) / 60000
          )
        )
      : null;
  const grantedSeconds = report.pacing.reduce((s, p) => s + (p.extra_seconds || 0), 0);
  const undos = report.pacing.reduce((s, p) => s + (p.undo_count || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${report.exam_name} | Session report`}
        description="What happened in this live session."
        path={isPublic ? `/live-report/${token}` : `/live-exam/${creatorId}/${liveExamId}/report`}
        noindex
      />

      <div className="mx-auto w-full max-w-4xl px-5 py-10">
        {!isPublic && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to editor
          </Button>
        )}

        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Session report
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{report.exam_name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {report.ended_at
            ? new Date(report.ended_at).toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "In progress"}
          {durationMin !== null && ` · ${durationMin} min`}
        </p>

        {/* ─── Headline ─── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={Gauge}
            label="Class accuracy"
            value={totals.accuracy_pct !== null ? `${totals.accuracy_pct}%` : NA}
          />
          <Stat icon={Users} label="Took part" value={report.attendance.length || NA} />
          <Stat icon={Timer} label="Questions" value={totals.questions_asked || NA} />
          <Stat
            icon={HandHelping}
            label="Said they were lost"
            value={totals.confusion_total || 0}
            hint="Total 'I'm lost' taps across the session"
          />
        </div>

        {/* ─── Reteach ─── */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            Worth going over again
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hardest first. The label says <em>why</em> it was hard — a question
            everyone got wrong and one the class split on need different lessons.
          </p>

          {hardest.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing to display.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {hardest.map(({ q, classification }) => (
                <li key={q.ordinal} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-bold tabular-nums text-muted-foreground">
                      Q{(q.ordinal ?? 0) + 1}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {q.accuracy_pct !== null ? `${q.accuracy_pct}% correct` : "no answers"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm">
                    <LiveQuestionBody text={q.text} compact />
                  </div>
                  <OutcomeBar
                    className="mt-3"
                    correct={q.correct_count}
                    wrong={q.wrong_count}
                    skipped={q.skipped_count}
                  />
                  {classification.kind === "systematic" && classification.dominantIndex !== null && (
                    <p className="mt-2 text-[13px] font-medium text-amber-700 dark:text-amber-300">
                      {classification.percentages[classification.dominantIndex]}% chose{" "}
                      {optionLabel(classification.dominantIndex)} — a shared belief, not guessing.
                    </p>
                  )}
                  {classification.kind === "scattered" && (
                    <p className="mt-2 text-[13px] font-medium text-muted-foreground">
                      Answers spread evenly — this looks like the idea is missing rather than muddled.
                    </p>
                  )}
                  {classification.kind === "split" && (
                    <p className="mt-2 text-[13px] font-medium text-muted-foreground">
                      Split between {optionLabel(classification.topTwo[0])} and{" "}
                      {optionLabel(classification.topTwo[1])} — two ideas being confused.
                    </p>
                  )}
                  {q.impulsive_wrong > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {q.impulsive_wrong} answered wrong within seconds — confident, not lost.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ─── Misconceptions, in one list ─── */}
        {misconceptions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold">Misconceptions to address</h2>
            <ul className="mt-3 space-y-1.5">
              {misconceptions.map(({ q, classification }) => (
                <li key={q.ordinal} className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Q{(q.ordinal ?? 0) + 1}:
                  </span>{" "}
                  {classification.percentages[classification.dominantIndex!]}% believe{" "}
                  {optionLabel(classification.dominantIndex!)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Confusion hotspots ─── */}
        {confusionHotspots.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <HandHelping className="h-4 w-4 text-amber-500" />
              Where people said they were lost
            </h2>
            <ul className="mt-3 space-y-1.5">
              {confusionHotspots.map((q) => (
                <li key={q.ordinal} className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Q{(q.ordinal ?? 0) + 1}</span> —{" "}
                  {q.confusion_count} {q.confusion_count === 1 ? "student" : "students"}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── Moments ─── */}
        {report.moments.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Moments
            </h2>
            <ul className="mt-3 space-y-1.5">
              {report.moments.slice(0, 6).map((m, i) => {
                const copy = momentCopy({ ...m, display_name: nameOf(m.user_id) });
                if (!copy) return null;
                return (
                  <li key={`${m.ordinal}-${m.kind}-${i}`} className="text-sm">
                    <span className="mr-1.5">{copy.emoji}</span>
                    <span className="font-medium">{copy.headline}</span>{" "}
                    <span className="text-muted-foreground">{copy.detail}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ─── Pacing ─── */}
        <section className="mt-8">
          <h2 className="text-lg font-bold">Pacing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {durationMin !== null ? `${durationMin} minutes` : "Duration unknown"}
            {grantedSeconds > 0 && ` · ${grantedSeconds}s of extra time granted`}
            {undos > 0 && ` · ${undos} unlock${undos === 1 ? "" : "s"} taken back`}
          </p>
        </section>

        {/* ─── Attendance ─── */}
        <section className="mt-8">
          <h2 className="text-lg font-bold">Who took part</h2>
          {report.attendance.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing to display.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Student</th>
                    <th className="px-3 py-2 text-right font-semibold">Correct</th>
                    <th className="px-3 py-2 text-right font-semibold">Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {report.attendance.map((a) => (
                    <tr key={a.user_id} className="border-t border-border/50">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {a.rank ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-medium">{nameOf(a.user_id)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.total_correct}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {a.total_answered}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Sharing (creator only) ─── */}
        {!isPublic && (
          <section className="mt-10 rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Link2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Shareable link</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Anyone with the link can read this report. Names follow your
                  privacy setting — with it on, the shared copy shows nicknames.
                </p>
              </div>
              <Switch
                checked={!!shareToken}
                disabled={sharing}
                onCheckedChange={handleShareToggle}
                aria-label="Enable the shareable link"
              />
            </div>

            {shareUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-2">
                <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs">{shareUrl}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    });
                  }}
                  aria-label="Copy the link"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
