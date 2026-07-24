import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { listTags } from '../curriculum/curriculum.api'
import { ProbeSessionQuiz } from '../curriculum/probe-session-quiz'

export const Route = createFileRoute('/probe/tag/$tagId')({
  loader: () => listTags(),
  component: TagProbeRoom,
})

function TagProbeRoom() {
  const { tagId } = Route.useParams()
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags(),
    initialData: Route.useLoaderData(),
  })
  const tag = tags?.find((candidate) => candidate.id === tagId)

  if (!tag) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm text-neutral-500">This tag isn’t available.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 sm:px-8">
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All curricula
      </Link>

      <header className="mb-2 mt-3">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          Cross-cutting tag
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          #{tag.name}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Questions drawn from every module or topic tagged #{tag.name},
          across every course that has it.
        </p>
      </header>

      <div className="min-w-0 flex-1">
        <ProbeSessionQuiz key={tag.id} scope="tag" scopeId={tag.id} />
      </div>
    </main>
  )
}
