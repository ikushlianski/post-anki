import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { TopicRecommendation } from '@post-anki/shared'

import { generateRecommendations } from './stats.api'

export function RecommendationPanel({
  curriculumId,
  eligible,
  recommendations,
  onGenerated,
}: {
  curriculumId: string
  eligible: boolean
  recommendations: TopicRecommendation[]
  onGenerated: (recommendations: TopicRecommendation[]) => void
}) {
  const [failed, setFailed] = useState(false)

  const mutation = useMutation({
    mutationFn: () => generateRecommendations({ data: curriculumId }),
    onSuccess: (result) => {
      if (!result || result.failed) {
        setFailed(true)
        return
      }

      setFailed(false)
      onGenerated(result.recommendations)
    },
    onError: () => setFailed(true),
  })

  if (!eligible) {
    return (
      <p data-testid="recommendations-gated" className="text-sm text-neutral-400">
        Complete a couple more topics in this curriculum to unlock AI reading
        recommendations.
      </p>
    )
  }

  return (
    <div data-testid="recommendation-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Recommendations
        </h2>
        <button
          type="button"
          data-testid="generate-recommendations-button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          {mutation.isPending
            ? 'Generating…'
            : recommendations.length > 0
              ? 'Regenerate'
              : 'Get recommendations'}
        </button>
      </div>

      {mutation.isPending ? (
        <p data-testid="recommendations-loading" className="text-sm text-neutral-400">
          Looking up what to read next…
        </p>
      ) : failed ? (
        <p data-testid="recommendations-failed" className="text-sm text-red-600">
          Couldn't generate recommendations — try again.
        </p>
      ) : recommendations.length === 0 ? (
        <p className="text-sm text-neutral-400">No recommendations yet.</p>
      ) : (
        <ul className="space-y-2">
          {recommendations.map((rec) => (
            <li
              key={rec.topicId}
              data-testid="recommendation-item"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
            >
              <p>{rec.text}</p>
              {rec.citations.length > 0 ? (
                <a
                  href={rec.citations[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 underline underline-offset-2"
                >
                  {rec.citations[0]}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
