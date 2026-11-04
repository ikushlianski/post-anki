import { REVIEW_GRADES, type IntervalPreview, type ReviewGrade } from "@/api/review-commands";
import { formatInterval } from "@/review-counts";

const LABELS: Record<ReviewGrade, { label: string; key: string }> = {
  again: { label: "Again", key: "1" },
  hard: { label: "Hard", key: "2" },
  good: { label: "Good", key: "3" },
  easy: { label: "Easy", key: "4" },
};

export function ReviewGradeButtons({
  disabled,
  intervals,
  onGrade,
}: {
  disabled: boolean;
  intervals: IntervalPreview | null;
  onGrade: (grade: ReviewGrade) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {REVIEW_GRADES.map((grade) => (
        <button
          key={grade}
          type="button"
          disabled={disabled}
          title={`${LABELS[grade].label}, shortcut ${LABELS[grade].key}`}
          className="btn min-h-16 flex-col gap-1.5 py-2"
          onClick={() => onGrade(grade)}
        >
          {intervals && (
            <span className="text-caption font-normal tabular-nums text-muted">{formatInterval(intervals[grade])}</span>
          )}
          <span className="flex items-center gap-2">
            <span className={`text-heading font-semibold ${grade === "again" ? "text-danger" : ""}`}>
              {LABELS[grade].label}
            </span>
            <kbd className="kbd">{LABELS[grade].key}</kbd>
          </span>
        </button>
      ))}
    </div>
  );
}
