import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { DomainRecommendation } from '@post-anki/shared'

import { resolveRecommendation } from './domain-recommendation.api'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

const AXIS_LABEL: Record<DomainRecommendation['axis'], string> = {
  deepen: 'Deepen',
  widen: 'Widen',
}

// deepen-widen-recommendations (issue #90), SCENARIOS 6/7/8/10 — same
// per-item Accept/Reject shape as PriorityReviewPanel, reusing
// useResolvingSuggestions() directly rather than duplicating its
// claim/release guard against a double-click reaching the backend twice.
export function RecommendationPanel({
  initialRecommendations,
  nodeNamesById,
}: {
  initialRecommendations: DomainRecommendation[]
  nodeNamesById: Record<string, string>
}) {
  const [recommendations, setRecommendations] = useState(initialRecommendations)
  const [confirmation, setConfirmation] = useState<{ name: string; curriculumId: string } | null>(
    null,
  )

  const { claim, release, isResolving } = useResolvingSuggestions()

  async function resolve(recommendation: DomainRecommendation, decision: 'accept' | 'reject') {
    if (!claim(recommendation.id)) {
      return
    }

    const status = decision === 'accept' ? 'accepted' : 'rejected'

    try {
      const result = await resolveRecommendation({
        data: { recommendationId: recommendation.id, status },
      })

      setRecommendations((prev) => prev.filter((item) => item.id !== recommendation.id))

      // Mirrors PriorityReviewPanel.resolve()'s own accept-only-confirms
      // posture: `already_resolved` (a 409 from the second tab, or this
      // user's own double-click) is a success as far as the list is
      // concerned, but never shown as a confirmation here — the other tab
      // may well have rejected it.
      if (decision === 'accept' && result.outcome === 'resolved' && result.suggestion.createdCurriculumId) {
        const name = nodeNamesById[recommendation.domainNodeId] ?? recommendation.domainNodeId
        setConfirmation({ name, curriculumId: result.suggestion.createdCurriculumId })
      }
    } catch {
      // The row deliberately stays in the list on failure so the decision
      // can be retried; `release` below re-enables its buttons.
    } finally {
      release(recommendation.id)
    }
  }

  return (
    <div data-testid="recommendation-panel" className="space-y-4">
      {confirmation ? (
        <p data-testid="recommendation-confirmation" className="text-sm text-emerald-700">
          Course created:{' '}
          <Link
            to="/curriculum/$curriculumId"
            params={{ curriculumId: confirmation.curriculumId }}
            className="underline"
          >
            {confirmation.name}
          </Link>
        </p>
      ) : null}

      {recommendations.length === 0 ? (
        <p className="text-sm text-neutral-500">No pending recommendations.</p>
      ) : (
        <ul className="space-y-2">
          {recommendations.map((recommendation) => (
            <li
              key={recommendation.id}
              data-testid={`recommendation-${recommendation.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {nodeNamesById[recommendation.domainNodeId] ?? recommendation.domainNodeId}
                </span>
                <span
                  data-testid={`recommendation-axis-${recommendation.id}`}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                >
                  {AXIS_LABEL[recommendation.axis]}
                </span>
              </div>

              <p
                data-testid={`recommendation-reason-${recommendation.id}`}
                className="mt-1 text-xs text-neutral-600"
              >
                {recommendation.reason}
              </p>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid={`recommendation-accept-${recommendation.id}`}
                  disabled={isResolving(recommendation.id)}
                  onClick={() => resolve(recommendation, 'accept')}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`recommendation-reject-${recommendation.id}`}
                  disabled={isResolving(recommendation.id)}
                  onClick={() => resolve(recommendation, 'reject')}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
