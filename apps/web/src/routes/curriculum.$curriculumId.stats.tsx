import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import type { TopicRecommendation } from '@post-anki/shared'

import {
  curriculumDetailQuery,
  curriculumStatsQuery,
} from '../curriculum/curriculum.queries'
import { WeakStrongList } from '../curriculum/weak-strong-list'
import { RecommendationPanel } from '../curriculum/recommendation-panel'

export const Route = createFileRoute('/curriculum/$curriculumId/stats')({
  component: CurriculumStatsPage,
  loader: ({ params, context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(curriculumDetailQuery(params.curriculumId)),
      context.queryClient.ensureQueryData(curriculumStatsQuery(params.curriculumId)),
    ]),
})

function CurriculumStatsPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))
  const { data: stats } = useSuspenseQuery(curriculumStatsQuery(curriculumId))
  const [recommendations, setRecommendations] = useState<TopicRecommendation[]>(
    stats?.recommendations ?? [],
  )

  if (!detail || !stats) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Curriculum not found.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10" data-testid="stats-page">
      <Link
        to="/curriculum/$curriculumId"
        params={{ curriculumId }}
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← {detail.curriculum.name}
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Study stats</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Weak spots, strong points, and what to study next in{' '}
          {detail.curriculum.name}.
        </p>
      </header>

      {stats.nextStep ? (
        <div
          data-testid="next-step-suggestion"
          className="mb-6 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white"
        >
          <span className="text-neutral-400">Next step · </span>
          {stats.nextStep.kind === 'next_level'
            ? `Continue this curriculum at ${stats.nextStep.level} level.`
            : `Try a different topic elsewhere to keep momentum.`}
        </div>
      ) : null}

      <section className="mb-8">
        <WeakStrongList
          weakSpots={stats.weakSpots}
          strongPoints={stats.strongPoints}
          attemptedTopicCount={stats.attemptedTopicCount}
        />
      </section>

      <section>
        <RecommendationPanel
          curriculumId={curriculumId}
          eligible={stats.recommendationsEligible}
          recommendations={recommendations}
          onGenerated={setRecommendations}
        />
      </section>
    </main>
  )
}
