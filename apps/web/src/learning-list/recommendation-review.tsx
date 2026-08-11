import { useState } from 'react'

import type { LearningListRecommendation } from '@post-anki/shared'

import { RecommendationSignals } from './recommendation-signals'
import { approveOutcome, declineOutcome } from './recommendation-summary'
import type { ApiResult } from './learning-list.model'

export interface RecommendationReviewProps {
  itemId: string
  title: string
  recommendation: LearningListRecommendation
  onResolve: (input: {
    itemId: string
    decision: 'approve' | 'decline'
  }) => Promise<ApiResult<unknown>>
  onResolved: () => void | Promise<void>
}

export function RecommendationReview({
  itemId,
  title,
  recommendation,
  onResolve,
  onResolved,
}: RecommendationReviewProps) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resolve(decision: 'approve' | 'decline') {
    setBusy(true)
    setError(null)

    const result = await onResolve({ itemId, decision })

    setBusy(false)

    if (!result.ok) {
      setError(`That decision was not accepted (${result.code}).`)
      return
    }

    setOutcome(
      decision === 'approve'
        ? approveOutcome(recommendation.destination)
        : declineOutcome(),
    )
    await onResolved()
  }

  return (
    <div
      data-testid="recommendation-review"
      className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4"
    >
      <p className="mb-1 text-sm font-medium text-indigo-950">{title}</p>

      <RecommendationSignals recommendation={recommendation} awaitingDecision />

      {outcome ? (
        <p
          role="status"
          data-testid="recommendation-outcome"
          className="mt-3 rounded-md border border-indigo-300 bg-white px-3 py-2 text-xs text-indigo-900"
        >
          {outcome}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('approve')}
            data-testid="recommendation-approve"
            className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {recommendation.destination === 'extend_curriculum'
              ? 'Approve — extend the existing course'
              : 'Approve the mini-course'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('decline')}
            data-testid="recommendation-decline"
            className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 disabled:opacity-50"
          >
            Decline — create nothing
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
