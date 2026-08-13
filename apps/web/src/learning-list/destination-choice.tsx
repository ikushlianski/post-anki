import { useState } from 'react'

import type { ChosenLearningListDestination } from '@post-anki/shared'

import type { ApiResult } from './learning-list.model'

export interface DestinationChoiceProps {
  itemId: string
  onChoose: (input: {
    itemId: string
    destination: ChosenLearningListDestination
  }) => Promise<ApiResult<unknown>>
  onChosen: () => void | Promise<void>
}

export function DestinationChoice({
  itemId,
  onChoose,
  onChosen,
}: DestinationChoiceProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(destination: ChosenLearningListDestination) {
    setBusy(true)
    setError(null)

    const result = await onChoose({ itemId, destination })

    setBusy(false)

    if (!result.ok) {
      setError(`That choice was not accepted (${result.code}).`)
      return
    }

    await onChosen()
  }

  return (
    <div
      data-testid="destination-choice"
      className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4"
    >
      <p className="text-sm text-amber-900">
        We could not tell whether this is a single article or part of a
        series, so we set it aside instead of guessing. Where should it go?
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('mini_course')}
          data-testid="destination-choice-mini-course"
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Make it a mini-course
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('fold_in')}
          data-testid="destination-choice-fold-in"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 disabled:opacity-50"
        >
          Fold into its Area
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="destination-choice-error"
          className="mt-2 text-xs text-rose-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
