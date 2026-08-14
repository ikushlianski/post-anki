import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { getDomainMapForSubject, getSubjectForMap } from '../domain-map/domain-map.api'
import { getDomainRecommendations, triggerRecommendations } from '../domain-recommendation/domain-recommendation.api'
import { RecommendationPanel } from '../domain-recommendation/recommendation-panel'

// deepen-widen-recommendations (issue #90) — SSR-first, loader-seeded, same
// Electric-avoidance rationale as subject.$subjectId.priority-review.tsx:
// this screen has no live-multi-client requirement.
export const Route = createFileRoute('/subject/$subjectId/recommendations')({
  component: RecommendationsPage,
  loader: async ({ params }) => {
    const [subject, tree, recommendations] = await Promise.all([
      getSubjectForMap({ data: params.subjectId }),
      getDomainMapForSubject({ data: params.subjectId }),
      getDomainRecommendations({ data: { subjectId: params.subjectId, status: 'pending' } }),
    ])

    return { subject, tree, recommendations }
  },
})

function collectNodeNames(nodes: DomainNodeTreeItem[]): Record<string, string> {
  const map: Record<string, string> = {}

  function walk(items: DomainNodeTreeItem[]) {
    for (const item of items) {
      map[item.id] = item.name
      walk(item.children)
    }
  }

  walk(nodes)

  return map
}

function RecommendationsPage() {
  const { subjectId } = Route.useParams()
  const { subject, tree, recommendations } = Route.useLoaderData()
  const router = useRouter()
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)

  if (!subject) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Subject not found.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  async function findRecommendations() {
    if (triggering) {
      return
    }

    setTriggering(true)
    setTriggerError(null)

    try {
      await triggerRecommendations({ data: subjectId })
      await router.invalidate()
    } catch {
      setTriggerError('Could not compute recommendations — try again.')
    } finally {
      setTriggering(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/subject/$subjectId/map" params={{ subjectId }} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Domain map
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{subject.name} — Recommendations</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Structural deepen/widen suggestions grounded in your own mastery data, for you to accept
          or reject.
        </p>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          data-testid="recommendations-trigger-button"
          disabled={triggering}
          onClick={findRecommendations}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {triggering ? 'Finding…' : 'Find recommendations'}
        </button>
      </div>

      {triggerError ? (
        <p data-testid="recommendations-trigger-error" className="mb-4 text-sm text-red-600">
          {triggerError}
        </p>
      ) : null}

      <RecommendationPanel
        key={recommendations.map((recommendation) => recommendation.id).join(',')}
        initialRecommendations={recommendations}
        nodeNamesById={collectNodeNames(tree)}
      />
    </main>
  )
}
