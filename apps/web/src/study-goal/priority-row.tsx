import type { SubjectPriority } from '@post-anki/shared'

const METRIC_LABEL = { reviews: 'reviews', new_cards: 'new cards', notes: 'notes', none: '' } as const

export function describeProgress(priority: SubjectPriority): string {
  const { reviews, newCards, notes } = priority.progress
  const base = `${reviews} reviews · ${newCards} new cards · ${notes} notes`

  if (priority.targetMetric === 'none' || priority.targetValue === null) {
    return base
  }

  return `${priority.current ?? 0} of ${priority.targetValue} ${METRIC_LABEL[priority.targetMetric]} · ${base}`
}

export function targetFraction(priority: SubjectPriority): number | null {
  if (priority.targetValue === null || priority.current === null) {
    return null
  }

  return Math.min(1, priority.current / priority.targetValue)
}

export function PriorityRow({
  priority,
  subjectName,
  disabled,
  onToggleDone,
  onDelete,
}: {
  priority: SubjectPriority
  subjectName: string | null
  disabled: boolean
  onToggleDone: (done: boolean) => void
  onDelete: () => void
}) {
  const fraction = targetFraction(priority)
  const manuallyDone = priority.doneAt !== null

  return (
    <li data-testid="priority-row" data-met={priority.targetMet} className="rounded-md border border-neutral-200 p-3">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          aria-label={`Mark "${priority.title}" done`}
          data-testid="priority-done"
          checked={manuallyDone}
          disabled={disabled}
          onChange={(event) => onToggleDone(event.target.checked)}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${priority.targetMet ? 'text-emerald-800' : ''}`}>
            {priority.title}
            {subjectName ? <span className="ml-2 text-xs font-normal text-neutral-500">{subjectName}</span> : null}
          </p>
          <p data-testid="priority-progress" className="mt-0.5 text-xs text-neutral-500">
            {describeProgress(priority)}
          </p>
          {fraction !== null ? (
            <div className="mt-2 h-1.5 w-full rounded bg-neutral-100">
              <div
                data-testid="priority-bar"
                className="h-1.5 rounded bg-neutral-800"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          data-testid="priority-delete"
          disabled={disabled}
          onClick={onDelete}
          className="text-xs text-neutral-500 hover:text-red-600 disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </li>
  )
}
