import { useState } from 'react'

import type {
  CreateSubjectPriorityInput,
  PriorityPeriodKind,
  PriorityTargetMetric,
} from '@post-anki/shared'

const KIND_LABEL: Record<PriorityPeriodKind, string> = { year: 'This year', month: 'This month', week: 'This week' }
const METRIC_LABEL: Record<PriorityTargetMetric, string> = {
  none: 'No number, just a note',
  reviews: 'Reviews',
  new_cards: 'New cards learned',
  notes: 'Notes added',
}

export function PriorityForm({
  disabled,
  keyFor,
  onSubmit,
}: {
  disabled: boolean
  keyFor: (kind: PriorityPeriodKind) => string
  onSubmit: (input: CreateSubjectPriorityInput) => Promise<boolean>
}) {
  const [kind, setKind] = useState<PriorityPeriodKind>('week')
  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<PriorityTargetMetric>('none')
  const [target, setTarget] = useState('')
  const targetNumber = Number(target)
  const needsTarget = metric !== 'none'
  const valid =
    title.trim() !== '' && (!needsTarget || (Number.isInteger(targetNumber) && targetNumber >= 1))

  async function submit(): Promise<void> {
    const created = await onSubmit({
      periodKind: kind,
      periodKey: keyFor(kind),
      title: title.trim(),
      targetMetric: metric,
      targetValue: needsTarget ? targetNumber : null,
    })

    if (created) {
      setTitle('')
      setTarget('')
      setMetric('none')
    }
  }

  return (
    <form
      data-testid="priority-form"
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <select
        aria-label="Period"
        data-testid="priority-kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as PriorityPeriodKind)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
      >
        {(Object.keys(KIND_LABEL) as PriorityPeriodKind[]).map((value) => (
          <option key={value} value={value}>
            {KIND_LABEL[value]}
          </option>
        ))}
      </select>
      <input
        aria-label="Priority"
        data-testid="priority-title"
        placeholder="What matters most"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="min-w-48 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
      />
      <select
        aria-label="Count"
        data-testid="priority-metric"
        value={metric}
        onChange={(event) => setMetric(event.target.value as PriorityTargetMetric)}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
      >
        {(Object.keys(METRIC_LABEL) as PriorityTargetMetric[]).map((value) => (
          <option key={value} value={value}>
            {METRIC_LABEL[value]}
          </option>
        ))}
      </select>
      {needsTarget ? (
        <input
          type="number"
          min={1}
          aria-label="Target"
          data-testid="priority-target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
      ) : null}
      <button
        type="submit"
        data-testid="priority-add"
        disabled={disabled || !valid}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        Add
      </button>
    </form>
  )
}
