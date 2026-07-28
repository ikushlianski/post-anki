import { Link, createFileRoute } from '@tanstack/react-router'

import { getDomainMapForSubject, getSubjectForMap } from '../domain-map/domain-map.api'
import { DomainMapTree } from '../domain-map/domain-map-tree'

export const Route = createFileRoute('/subject/$subjectId/map')({
  component: SubjectMapPage,
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
      </header>

      {tree.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
          No domain map seeded for this subject yet.
        </p>
      ) : (
        <DomainMapTree subjectId={subjectId} nodes={tree} requireSources={subject.requireSources} />
      )}
    </main>
  )
}
