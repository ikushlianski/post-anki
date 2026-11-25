import type { NewCardOrder, SubjectStudyOptions } from '@post-anki/shared'
import type { ReactNode } from 'react'

const ORDERS: { value: NewCardOrder; label: string }[] = [
  { value: 'oldest-first', label: 'Oldest first' },
  { value: 'newest-first', label: 'Newest first' },
]

export function NewCardOrderField({
  own,
  effective,
  disabled,
  hint,
  onChange,
}: {
  own: SubjectStudyOptions['own']['newCardOrder']
  effective: NewCardOrder
  disabled?: boolean
  hint?: ReactNode
  onChange: (next: NewCardOrder | null) => void
}) {
  const choices: { key: string; label: string; selected: boolean; next: NewCardOrder | null }[] = [
    ...ORDERS.map(({ value, label }) => ({ key: value, label, selected: own === value, next: value })),
    { key: 'inherit', label: 'Inherit', selected: own === null, next: null },
  ]

  return (
    <div data-testid="study-options-new-card-order" className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium">New card order</p>
      <p className="mt-0.5 text-xs text-neutral-400">
        Which new cards from this subject come first. Newest first puts recently added cards ahead of older ones.
      </p>
      <div
        role="radiogroup"
        aria-label="New card order"
        className="mt-2 inline-flex overflow-hidden rounded-md border border-neutral-300"
      >
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={choice.selected}
            disabled={disabled}
            data-testid={`study-options-new-card-order-${choice.key}`}
            onClick={() => onChange(choice.next)}
            className={`min-h-[44px] px-3 py-1 text-sm disabled:opacity-50 sm:min-h-0 ${
              choice.selected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p data-testid="study-options-new-card-order-current" className="mt-1 text-xs text-neutral-500">
        Serving: {ORDERS.find((order) => order.value === effective)?.label}.
      </p>
      {hint}
    </div>
  )
}
