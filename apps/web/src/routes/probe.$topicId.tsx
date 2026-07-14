import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import type { QuestionKind } from '../curriculum/model'
import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { ProbePanel } from '../curriculum/probe-panel'
import { ProbeRoomDrawer } from '../curriculum/probe-room-drawer'

export const Route = createFileRoute('/probe/$topicId')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode: QuestionKind; curriculumId: string } => ({
    mode: search.mode === 'quick_test' ? 'quick_test' : 'socratic',
    curriculumId:
      typeof search.curriculumId === 'string' ? search.curriculumId : '',
  }),
  loaderDeps: ({ search }) => ({ curriculumId: search.curriculumId }),
  loader: ({ deps, context }) =>
    deps.curriculumId
      ? context.queryClient.ensureQueryData(
          curriculumDetailQuery(deps.curriculumId),
        )
      : null,
  component: ProbeRoom,
})

function ProbeRoom() {
  const { topicId } = Route.useParams()
  const { mode, curriculumId } = Route.useSearch()
  const { data: detail } = useQuery({
    ...curriculumDetailQuery(curriculumId),
    enabled: curriculumId !== '',
  })

  const topic = detail?.modules
    .flatMap((module) => module.topics)
    .find((candidate) => candidate.id === topicId)

  if (!detail || !topic) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm text-neutral-500">This topic isn’t available.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <ProbeRoomDrawer detail={detail} currentTopicId={topic.id} mode={mode} />
        <ModeToggle topicId={topic.id} curriculumId={curriculumId} mode={mode} />
      </div>

      <header className="mb-2">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          {detail.curriculum.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {topic.title}
        </h1>
        {topic.summary ? (
          <p className="mt-1 text-sm text-neutral-500">{topic.summary}</p>
        ) : null}
        <p className="mt-2 text-xs text-neutral-400">
          {topic.progress.gapsCovered}/{topic.progress.gapsTotal} gaps closed ·{' '}
          {topic.progress.maturity}%
        </p>
      </header>

      <ProbePanel key={mode} topicId={topic.id} mode={mode} />
    </main>
  )
}

function ModeToggle({
  topicId,
  curriculumId,
  mode,
}: {
  topicId: string
  curriculumId: string
  mode: QuestionKind
}) {
  const base = 'rounded-md px-2.5 py-1 text-xs font-medium'
  const on = 'bg-neutral-900 text-white'
  const off = 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'

  return (
    <div className="flex gap-1">
      <Link
        to="/probe/$topicId"
        params={{ topicId }}
        search={{ mode: 'socratic', curriculumId }}
        className={`${base} ${mode === 'socratic' ? on : off}`}
      >
        Socratic
      </Link>
      <Link
        to="/probe/$topicId"
        params={{ topicId }}
        search={{ mode: 'quick_test', curriculumId }}
        className={`${base} ${mode === 'quick_test' ? on : off}`}
      >
        Quick test
      </Link>
    </div>
  )
}
