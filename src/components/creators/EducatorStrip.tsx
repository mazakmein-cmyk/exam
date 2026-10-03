import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * EducatorStrip — one line routing teachers from a student page to the pillar.
 *
 * WHY IT EXISTS
 * -------------
 * `/for-creators` is the page the creator content cluster has to lift, and the
 * cheapest ranking signal available to it is internal links from pages this
 * site already ranks with. Until now the only sitewide route to it was the
 * footer's "Become a Creator", which sits below every other column and reads as
 * boilerplate.
 *
 * The exam landing pages and the library are where the overlap actually is: a
 * coaching owner researching what their batch should practise reads the same
 * JEE Main or SSC MTS page the students do. Catching them there, once, in a
 * line that names what they would get, is worth more than any number of footer
 * links — and it is honest, because the offer is real and free.
 *
 * WHY IT IS DELIBERATELY SMALL
 * ----------------------------
 * These are student pages and must stay student pages. The strip is one row,
 * below the page's own content, with no image and no competing call to action —
 * it must never outrank the "start this mock" button that the page exists for.
 * The home page deliberately has no creator entry at all (see HomeLanding), so
 * this never goes there.
 */
const EducatorStrip = ({
  /**
   * The exam this page is about, e.g. "JEE Main". Folded into the sentence when
   * given so the offer is concrete; omitted on the library, which has no single
   * exam to name.
   */
  examLabel,
}: {
  examLabel?: string;
}) => (
  <section className="px-5 pb-14" aria-label="For educators">
    <div className="container mx-auto max-w-4xl">
      <div className="rounded-2xl border border-border/60 bg-secondary/30 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex items-start gap-3 flex-1">
          <span className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </span>
          <p className="text-[13.5px] text-muted-foreground leading-[1.65]">
            <strong className="font-semibold text-foreground">Teaching this exam?</strong>{" "}
            Publish your own {examLabel ? `${examLabel} ` : ""}mock tests free — timed, with
            negative marking and batch analytics.
          </p>
        </div>
        <Link
          to="/for-creators"
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          For educators <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  </section>
);

export default EducatorStrip;
