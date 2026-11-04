import { DEFAULT_DETAIL_LEVEL, detailLevelSchema, type DetailLevel } from '@post-anki/shared'

const DETAIL_LABELS: Record<DetailLevel, string> = {
  concise: 'Concise',
  standard: 'Standard',
  deep: 'Deep',
}

export function LearningSettingsField({
  detailLevel,
  hintingEnabled,
  onDetailLevelChange,
  onHintingChange,
  disabled,
}: {
  detailLevel: DetailLevel | null
  hintingEnabled: boolean | null
  onDetailLevelChange: (next: DetailLevel) => void
  onHintingChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <div
      data-testid="study-options-learning"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="study-options-detail-level-input" className="text-sm font-medium">
            Card detail
          </label>
          <p className="mt-0.5 text-xs text-neutral-400">
            How much of a source new cards cover. Applies to cards generated from now on.
          </p>
        </div>
        <select
          id="study-options-detail-level-input"
          data-testid="study-options-detail-level-input"
          value={detailLevel ?? DEFAULT_DETAIL_LEVEL}
          disabled={disabled}
          onChange={(event) => onDetailLevelChange(detailLevelSchema.parse(event.target.value))}
          className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50 min-h-[44px] sm:min-h-0"
        >
          {detailLevelSchema.options.map((level) => (
            <option key={level} value={level}>
              {DETAIL_LABELS[level]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center justify-between gap-4 text-sm font-medium">
        <span>
          Show hints in review
          <span className="mt-0.5 block text-xs font-normal text-neutral-400">
            Hides the hint next to a blank when off.
          </span>
        </span>
        <input
          type="checkbox"
          data-testid="study-options-hinting-input"
          className="size-[44px] sm:size-auto"
          checked={hintingEnabled ?? true}
          disabled={disabled}
          onChange={(event) => onHintingChange(event.target.checked)}
        />
      </label>
    </div>
  )
}
