import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import { listTags } from '../curriculum/curriculum.api'
import { ProbeSessionQuiz } from '../curriculum/probe-session-quiz'
import { TagNodeBrowser } from '../curriculum/tag-node-browser'
import type { Tag } from '../curriculum/model'

type TagRoomView = 'browse' | 'practice'

export const Route = createFileRoute('/probe/tag/$tagId')({
  validateSearch: (search: Record<string, unknown>): { view?: TagRoomView } => ({
    view: search.view === 'browse' ? 'browse' : 'practice',
  }),
  loader: () => listTags(),
  component: TagProbeRoom,
})

function TagProbeRoom() {
  const { tagId } = Route.useParams()
  const { view: rawView } = Route.useSearch()
  const view: TagRoomView = rawView ?? 'practice'
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
          {view === 'browse'
            ? `Every topic, module, and knowledge bit tagged #${tag.name}, across every course that has it.`
            : `Questions drawn from every module or topic tagged #${tag.name}, across every course that has it.`}
        </p>
      </header>

      <ViewToggle tag={tag} view={view} />

      <div className="min-w-0 flex-1">
        {view === 'browse' ? (
          <TagNodeBrowser key={tag.id} tagId={tag.id} />
        ) : (
          <ProbeSessionQuiz key={tag.id} scope="tag" scopeId={tag.id} />
        )}
      </div>
    </main>
  )
}

export function ViewToggle({ tag, view }: { tag: Tag; view: TagRoomView }) {
  const base = 'rounded-md px-2.5 py-1 text-xs font-medium'
  const on = 'bg-neutral-900 text-white'
  const off = 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'

  return (
    <div className="mt-3 flex gap-1">
      <Link
        to="/probe/tag/$tagId"
        params={{ tagId: tag.id }}
        search={{ view: 'browse' }}
        className={`${base} ${view === 'browse' ? on : off}`}
        data-testid="tag-room-view-browse"
      >
        Browse
      </Link>
      <Link
        to="/probe/tag/$tagId"
        params={{ tagId: tag.id }}
        search={{ view: 'practice' }}
        className={`${base} ${view === 'practice' ? on : off}`}
        data-testid="tag-room-view-practice"
      >
        Practice
      </Link>
    </div>
  )
}
