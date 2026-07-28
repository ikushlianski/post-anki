import { Link, createFileRoute } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { getDomainMapForSubject, getSubjectForMap } from '../domain-map/domain-map.api'
import { getPriorityReviewStatus, getPrioritySuggestions } from '../domain-map/domain-map.api'
import { PriorityReviewPanel } from '../domain-map/priority-review-panel'

// domain-priority-review (issue #52) — SSR-first, loader-seeded, same
// Electric-avoidance rationale as subject.$subjectId.map.tsx: this screen
// has no live-multi-client requirement.
export const Route = createFileRoute('/subject/$subjectId/priority-review')({
  component: PriorityReviewPage,
  loader: async ({ params }) => {
    const [subject, tree, suggestions, status] = await Promise.all([
      getSubjectForMap({ data: params.subjectId }),
      getDomainMapForSubject({ data: params.subjectId }),
      getPrioritySuggestions({ data: { subjectId: params.subjectId, status: 'pending' } }),
      getPriorityReviewStatus({ data: params.subjectId }),
    ])

    return { subject, tree, suggestions, status }
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

function PriorityReviewPage() {
  const { subjectId } = Route.useParams()
  const { subject, tree, suggestions, status } = Route.useLoaderData()

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

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/subject/$subjectId/map" params={{ subjectId }} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Domain map
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{subject.name} — Priority review</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Suggested re-prioritizations for this subject's domain tree, for you to accept or
          reject.
        </p>
      </header>

      <PriorityReviewPanel
        subjectId={subjectId}
        nodeNamesById={collectNodeNames(tree)}
        initialSuggestions={suggestions}
        initialDue={status.due}
      />
    </main>
  )
}
