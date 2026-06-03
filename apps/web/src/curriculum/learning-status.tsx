import type { LearningStatus } from './model'

export const LEARNING_STATUSES: LearningStatus[] = [
  'not_started',
  'probing',
  'going_deeper',
  'reviewing',
  'skipping',
  'done',
]

const LABEL: Record<LearningStatus, string> = {
  not_started: 'Not started',
  probing: 'Probing',
  going_deeper: 'Going deeper',
  reviewing: 'Reviewing',
  skipping: 'Skipping',
  done: 'Done',
}

const PILL_CLASS: Record<LearningStatus, string> = {
  not_started: 'bg-neutral-100 text-neutral-500',
  probing: 'bg-blue-100 text-blue-700',
  going_deeper: 'bg-violet-100 text-violet-700',
  reviewing: 'bg-amber-100 text-amber-700',
  skipping: 'bg-neutral-100 text-neutral-400',
  done: 'bg-emerald-100 text-emerald-700',
}

export function learningStatusLabel(status: LearningStatus): string {
  return LABEL[status]
}

export function LearningStatusPill({ status }: { status: LearningStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${PILL_CLASS[status]}`}>
      {LABEL[status]}
    </span>
  )
}

export function LearningStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: LearningStatus
  onChange: (status: LearningStatus) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as LearningStatus)}
      className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-neutral-500 disabled:opacity-50"
    >
      {LEARNING_STATUSES.map((status) => (
        <option key={status} value={status}>
          {LABEL[status]}
        </option>
      ))}
    </select>
  )
}
