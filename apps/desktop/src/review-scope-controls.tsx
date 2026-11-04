import type { Subject } from "@/api/desktop-commands";
import type { SubjectDueCounts } from "@/api/review-commands";
import { AHEAD_OPTIONS, aheadLabel, subjectOptions } from "@/review-scope";

const segmentClass =
  "min-h-10 rounded-[6px] px-3 text-body font-medium shadow-none hover:enabled:filter-none disabled:opacity-45";
const segmentIdle = `${segmentClass} bg-transparent text-muted hover:enabled:text-text`;
const segmentActive = `${segmentClass} bg-control text-text shadow-control ring-1 ring-border-strong`;

export function ReviewScopeControls({
  subjects,
  counts,
  subjectId,
  aheadDays,
  disabled,
  onSubjectChange,
  onAheadChange,
}: {
  subjects: readonly Subject[];
  counts: SubjectDueCounts | null;
  subjectId: string | null;
  aheadDays: number;
  disabled: boolean;
  onSubjectChange: (subjectId: string | null) => void;
  onAheadChange: (days: number) => void;
}) {
  const options = subjectOptions(subjects, counts);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <label className="field-label min-w-[220px] flex-1">
        <span className="text-muted">Subject</span>
        <select
          aria-label="Subject"
          value={subjectId ?? ""}
          disabled={disabled}
          className="field font-normal"
          onChange={(event) => onSubjectChange(event.target.value === "" ? null : event.target.value)}
        >
          <option value="">All subjects</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold text-muted">Learn ahead</span>
        <div className="inline-flex gap-0.5 rounded-control bg-hover p-0.5" role="group" aria-label="Learn ahead">
          {AHEAD_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={aheadDays === days}
              disabled={disabled}
              className={aheadDays === days ? segmentActive : segmentIdle}
              onClick={() => onAheadChange(days)}
            >
              {aheadLabel(days)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
