import { Link } from '@tanstack/react-router'

import type { EarlierSource } from './submit-knowledge-blocks'

interface DuplicateSourceWarningProps {
  index: number
  earlier: EarlierSource
  disabled: boolean
  onAddAgain: () => void
}

function formatAddedOn(addedAt: string): string {
  const date = new Date(addedAt)

  return Number.isNaN(date.getTime()) ? 'earlier' : date.toLocaleDateString('en-US', { dateStyle: 'medium' })
}

export function DuplicateSourceWarning({ index, earlier, disabled, onAddAgain }: DuplicateSourceWarningProps) {
  return (
    <div data-testid={`knowledge-block-duplicate-${index}`} className="flex flex-wrap items-center gap-3 text-sm text-amber-800">
      <p data-testid={`knowledge-block-error-${index}`}>
        Already added on {formatAddedOn(earlier.addedAt)}.
      </p>
      <Link
        to="/knowledge-bit-review"
        data-testid={`knowledge-block-duplicate-link-${index}`}
        className="text-neutral-700 underline"
      >
        See its suggestions
      </Link>
      <button
        type="button"
        disabled={disabled}
        onClick={onAddAgain}
        data-testid={`knowledge-block-add-again-${index}`}
        className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        Add again
      </button>
    </div>
  )
}
