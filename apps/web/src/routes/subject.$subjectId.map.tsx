import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import reactFlowCss from '@xyflow/react/dist/style.css?url'

import { getDomainMapForSubject, getSubjectForMap } from '../domain-map/domain-map.api'
import { DomainMapTree } from '../domain-map/domain-map-tree'
import { DomainMapGraph } from '../domain-map/domain-map-graph'
import { DomainMapViewToggle, type DomainMapView } from '../domain-map/domain-map-view-toggle'

export const Route = createFileRoute('/subject/$subjectId/map')({
  component: SubjectMapPage,
  // visual-knowledge-map (issue #86) — React Flow's own stylesheet, added via
  // THIS route's own head() + a `?url` import, mirroring __root.tsx's only
  // existing precedent for CSS in this app (appCss via `?url` + head()).
  // Scoped to this route only, not __root.tsx, since no other route needs
  // React Flow's styles.
  head: () => ({
    links: [
      {
        rel: 'stylesheet',
        href: reactFlowCss,
      },
    ],
  }),
  loader: async ({ params }) => {
    const [subject, tree] = await Promise.all([
      getSubjectForMap({ data: params.subjectId }),
      getDomainMapForSubject({ data: params.subjectId }),
    ])

    return { subject, tree }
  },
})

function SubjectMapPage() {
  const { subjectId } = Route.useParams()
  const { subject, tree } = Route.useLoaderData()
  // visual-knowledge-map (issue #86), SCENARIO 1 — component-local, defaults
  // to List (zero behavior change for anyone who never touches the toggle);
  // never persisted (spec.md's Decisions #3).
  const [view, setView] = useState<DomainMapView>('list')

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
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All curricula
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{subject.name} — Domain map</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The real shape of this domain — studied or not — with an approximate knowledge
          percentage per area.
        </p>
        <Link
          to="/subject/$subjectId/priority-review"
          params={{ subjectId }}
          data-testid="priority-review-link"
          className="mt-2 inline-block text-sm text-neutral-500 underline hover:text-neutral-900"
        >
          Priority review →
        </Link>
      </header>

      {tree.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No domain map seeded for this subject yet.
        </p>
      ) : (
        <>
          <DomainMapViewToggle view={view} onChange={setView} />

          {view === 'list' ? (
            <DomainMapTree
              subjectId={subjectId}
              nodes={tree}
              requireSources={subject.requireSources}
            />
          ) : (
            <DomainMapGraph nodes={tree} onManageInListView={() => setView('list')} />
          )}
        </>
      )}
    </main>
  )
}
