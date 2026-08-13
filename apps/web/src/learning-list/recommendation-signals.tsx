import type { LearningListRecommendation } from '@post-anki/shared'

import {
  DESTINATION_LABEL,
  VERDICT_LABEL,
  decidingSignals,
  placementSummary,
  signalsFraming,
} from './recommendation-summary'

export interface RecommendationSignalsProps {
  recommendation: LearningListRecommendation
  awaitingDecision: boolean
}

export function RecommendationSignals({
  recommendation,
  awaitingDecision,
}: RecommendationSignalsProps) {
  const placement = placementSummary(recommendation)

  return (
    <div data-testid="recommendation-signals-block">
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
        {DESTINATION_LABEL[recommendation.destination]}
      </p>
      <p className="mt-0.5 text-xs text-indigo-900">
        {VERDICT_LABEL[recommendation.verdict]}
      </p>

      <p className="mt-3 text-xs font-medium text-indigo-900">
        What decided this
      </p>
      <ul
        data-testid="recommendation-signals"
        className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-indigo-900"
      >
        {decidingSignals(recommendation).map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>

      {placement.length > 0 ? (
        <p
          data-testid="recommendation-placement"
          className="mt-2 text-xs text-indigo-700"
        >
          {placement.join(' · ')}
        </p>
      ) : null}

      <p className="mt-3 text-xs text-indigo-800">
        {signalsFraming({
          destination: recommendation.destination,
          awaitingDecision,
        })}
      </p>
    </div>
  )
}
