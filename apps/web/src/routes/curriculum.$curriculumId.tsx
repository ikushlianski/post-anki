import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import type { Source } from '../curriculum/model'
import { createModule } from '../curriculum/curriculum.api'
import { curriculumDetailQuery } from '../curriculum/curriculum.queries'
import { AddSourcesForm } from '../curriculum/add-sources-form'
import {
  ConfirmBar,
  CuratingBanner,
  FailedBanner,
} from '../curriculum/curriculum-lifecycle'
import { ModuleSection } from '../curriculum/module-section'
import { ProgressBar } from '../curriculum/progress-bar'
import { AddInline } from '../curriculum/shape-controls'
import { AdaptiveSettings } from '../curriculum/adaptive-settings'

export const Route = createFileRoute('/curriculum/$curriculumId')({
  component: CurriculumPage,
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(
      curriculumDetailQuery(params.curriculumId),
    ),
})

function CurriculumPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))

  if (!detail) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Curriculum not found.</p>
        <Link to="/" className="text-sm underline">
          Back to curricula
        </Link>
      </main>
    )
  }

  const { curriculum, sources, modules, progress, recommendedTopicId } = detail
  const canProbe = curriculum.status === 'confirmed'
  const editable =
    curriculum.status === 'ready' || curriculum.status === 'confirmed'
  const isCurating =
    curriculum.status === 'curating' || curriculum.status === 'draft'
  const moduleOrder = modules.map((module) => module.id)
  const allModules = modules.map((module) => ({
    id: module.id,
    title: module.title,
  }))
  const recommended = modules
    .flatMap((module) => module.topics)
    .find((topic) => topic.id === recommendedTopicId)

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All curricula
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {curriculum.name}
        </h1>
        {curriculum.description ? (
          <p className="mt-1 text-sm text-neutral-500">
            {curriculum.description}
          </p>
        ) : null}

        {modules.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-xs text-neutral-400">
              <span>Overall progress · {curriculum.status}</span>
              <span>
                {progress.topicsMastered}/{progress.topicsIncluded} topics
                mastered · {progress.percent}%
              </span>
            </div>
            <ProgressBar percent={progress.percent} />
          </div>
        ) : null}
      </header>

      {editable && modules.length > 0 ? (
        <div className="mb-6">
          <AdaptiveSettings curriculum={curriculum} />
        </div>
      ) : null}

      {recommended && canProbe ? (
        <div className="mb-6 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-3 text-sm text-white">
          <span className="text-neutral-400">Smart next step · </span>
          poke yourself on <span className="font-medium">{recommended.title}</span>{' '}
          — your weakest included topic right now.
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Sources
        </h2>
        <ul className="space-y-1 text-sm">
          {sources.map((source) => (
            <SourceRow key={source.id} source={source} />
          ))}
        </ul>
        <div className="mt-2">
          <AddSourcesForm curriculumId={curriculum.id} />
        </div>
      </section>

      {isCurating ? (
        <CuratingBanner />
      ) : curriculum.status === 'failed' ? (
        <FailedBanner curriculumId={curriculum.id} />
      ) : (
        <>
          {curriculum.status === 'ready' ? (
            <ConfirmBar curriculumId={curriculum.id} />
          ) : null}
          {modules.length === 0 ? (
            <p className="mb-4 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
              No modules yet. Add one below to start shaping this curriculum by
              hand.
            </p>
          ) : (
            <div className="space-y-5">
              {modules.map((module) => (
                <ModuleSection
                  key={module.id}
                  module={module}
                  recommendedTopicId={recommendedTopicId}
                  canProbe={canProbe}
                  editable={editable}
                  curriculumId={curriculum.id}
                  moduleOrder={moduleOrder}
                  allModules={allModules}
                />
              ))}
            </div>
          )}
          {editable ? (
            <div className="mt-5">
              <AddModuleBar curriculumId={curriculum.id} />
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}

function AddModuleBar({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function add(title: string) {
    setBusy(true)
    await createModule({ data: { curriculumId, title } })
    setBusy(false)
    await router.invalidate()
  }

  return (
    <AddInline
      cta="+ Add module"
      placeholder="Module title…"
      busy={busy}
      onAdd={add}
    />
  )
}

function SourceRow({ source }: { source: Source }) {
  if (source.kind === 'link') {
    return (
      <li>
        <a
          href={source.value}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline underline-offset-2"
        >
          {source.title ?? source.value}
        </a>
      </li>
    )
  }

  return <li className="text-neutral-600">“{source.value}”</li>
}
