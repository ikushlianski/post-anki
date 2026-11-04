import type { ReviewCounts } from "@/api/review-commands";

const valueClass = "ml-1.5 font-semibold tabular-nums text-text";

export function ReviewCountsStrip({ counts }: { counts: ReviewCounts }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-body text-muted" aria-label="Cards remaining" role="group">
      <span>
        New<span className={valueClass}>{counts.new}</span>
      </span>
      <span>
        Learning<span className={valueClass}>{counts.learning}</span>
      </span>
      <span>
        Due<span className={valueClass}>{counts.review}</span>
      </span>
    </div>
  );
}
