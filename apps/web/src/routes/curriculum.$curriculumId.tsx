import { useState } from 'react'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'

import type { Source } from '../curriculum/model'
import { createModule, renameCurriculum } from '../curriculum/curriculum.api'
import { curriculumDetailQuery, structureTurnsQuery } from '../curriculum/curriculum.queries'
import { needsPreAssessment } from '../curriculum/pre-assessment'
import { AddSourcesForm } from '../curriculum/add-sources-form'
import { SourceApprovalPanel } from '../curriculum/source-approval-panel'
import { CurriculumStructureChat } from '../curriculum/curriculum-structure-chat'
import {
  ConfirmBar,
  CuratingBanner,
  FailedBanner,
} from '../curriculum/curriculum-lifecycle'
import { ModuleSection } from '../curriculum/module-section'
import { ProgressBar } from '../curriculum/progress-bar'
import { describeCreationProgress } from '../curriculum/curriculum-creation-progress'
import { CardsSummaryBadge } from '../curriculum/cards-summary-badge'
import { AddInline, RenameButton } from '../curriculum/shape-controls'
import { CurriculumSettingsPanel } from '../curriculum/curriculum-settings-panel'
import { safeHref } from '../shared/safe-href'
import { useHydrated } from '../shared/use-hydrated'
import { listSubjects } from '../curriculum/api-client'
import { getAdminSettings } from '../admin-settings/admin-settings.api'
import { settle } from '../shared/load-result'

export const Route = createFileRoute('/curriculum/$curriculumId')({
  component: CurriculumPage,
  loader: async ({ params, context }) => {
    // subjects/adminSettings don't depend on the curriculum detail fetch at
    // all — only their later USE (picking this curriculum's own subject)
    // does — so kick them off alongside it instead of after it, cutting one
    // full network round-trip off this page's load time.
    const subjectsAndSettingsPromise = Promise.all([
      settle(listSubjects()),
      getAdminSettings().catch(() => ({ testToggle: false, modelTier: 'cheap' as const })),
    ])

    const detail = await context.queryClient.ensureQueryData(
      curriculumDetailQuery(params.curriculumId),
    )

    if (detail && needsPreAssessment(detail.curriculum)) {
      throw redirect({
        to: '/curriculum/$curriculumId/assess',
        params: { curriculumId: params.curriculumId },
      })
    }

    if (detail && detail.curriculum.status === 'shaping_structure') {
      await context.queryClient.ensureQueryData(structureTurnsQuery(params.curriculumId))
    }

    const [subjects, adminSettings] = await subjectsAndSettingsPromise

    const subject =
      subjects.ok && detail
        ? subjects.data.find((s) => s.id === detail.curriculum.subjectId)
        : undefined
    const subjectModelTier = subject?.modelTier ?? adminSettings.modelTier

    return { ...detail, subjectModelTier, subjectsFailed: !subjects.ok }
  },
})

function CurriculumPage() {
  const { curriculumId } = Route.useParams()
  const { data: detail } = useSuspenseQuery(curriculumDetailQuery(curriculumId))
  const { subjectModelTier, subjectsFailed } = Route.useLoaderData()

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
  const isAwaitingSourceApproval = curriculum.status === 'awaiting_source_approval'
  const isShapingStructure = curriculum.status === 'shaping_structure'
  const approvedSources = sources.filter((source) => source.approvalStatus === 'approved')
  const moduleOrder = modules.map((module) => module.id)
  const allModules = modules.map((module) => ({
    id: module.id,
    title: module.title,
  }))
  const recommended = modules
    .flatMap((module) => module.topics)
    .find((topic) => topic.id === recommendedTopicId)
  const creationProgress = describeCreationProgress(curriculum.status)
  const studyable = modules.some(
    (module) =>
      module.topics.length === 0 || module.topics.some((topic) => topic.included),
  )

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All curricula
      </Link>

      <header className="mb-4 mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {curriculum.name}
          </h1>
          <RenameCurriculumButton curriculum={curriculum} />
          {curriculum.origin === 'research' ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
              🔎 Researched
            </span>
          ) : null}
          <Link
            to="/curriculum/$curriculumId/cards"
            params={{ curriculumId: curriculum.id }}
            data-testid="cards-browser-link"
            className="ml-auto text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            Browse cards
          </Link>
          <Link
            to="/curriculum/$curriculumId/stats"
            params={{ curriculumId: curriculum.id }}
            data-testid="stats-page-link"
            className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
          >
            View stats
          </Link>
        </div>
        {curriculum.description ? (
          <p className="mt-1 text-sm text-neutral-500">
            {curriculum.description}
          </p>
        ) : null}

        <div className="mt-1">
          <CardsSummaryBadge curriculumId={curriculum.id} />
        </div>

        {modules.length > 0 ? (
          <div className="mt-3">
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

      {subjectsFailed ? (
        <p role="alert" className="mb-4 text-sm text-red-600">
          Couldn't load your subjects — try refreshing.
        </p>
      ) : null}

      <CurriculumSettingsPanel
        curriculum={curriculum}
        domainMappings={detail.domainMappings}
        inheritedModelTier={subjectModelTier}
        showAdaptive={editable && modules.length > 0}
      />

      {recommended && canProbe ? (
        <div className="mb-5 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white">
          <span className="text-neutral-400">Smart next step · </span>
          poke yourself on <span className="font-medium">{recommended.title}</span>{' '}
          — your weakest included topic right now.
        </div>
      ) : null}

      {creationProgress ? (
        <div className="mb-4" data-testid="creation-progress">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>{creationProgress.label}</span>
            <span>{creationProgress.percent}%</span>
          </div>
          <ProgressBar percent={creationProgress.percent} />
        </div>
      ) : null}

      {!isAwaitingSourceApproval && !isShapingStructure ? (
        <section className="mb-6">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Sources
          </h2>
          <ul className="space-y-0.5 text-sm">
            {approvedSources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ul>
          <div className="mt-1.5">
            <AddSourcesForm curriculumId={curriculum.id} />
          </div>
        </section>
      ) : null}

      {isAwaitingSourceApproval ? (
        <SourceApprovalPanel curriculumId={curriculum.id} sources={sources} />
      ) : isShapingStructure ? (
        <CurriculumStructureChat curriculumId={curriculum.id} />
      ) : isCurating ? (
        <CuratingBanner />
      ) : curriculum.status === 'failed' ? (
        <FailedBanner
          curriculumId={curriculum.id}
          origin={curriculum.origin}
          hasStructureDraftAttempt={detail.hasStructureDraftAttempt}
        />
      ) : (
        <>
          {curriculum.status === 'ready' ? (
            <ConfirmBar curriculumId={curriculum.id} studyable={studyable} />
          ) : null}
          {modules.length === 0 ? (
            <p className="mb-4 card-empty">
              No modules yet. Add one below to start shaping this curriculum by
              hand.
            </p>
          ) : (
            <div className="space-y-4">
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
                  strictOrder={curriculum.strictOrder}
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

function RenameCurriculumButton({ curriculum }: { curriculum: { id: string; name: string } }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveName(next: string): Promise<boolean> {
    setBusy(true)
    setError(null)

    try {
      await renameCurriculum({ data: { curriculumId: curriculum.id, name: next } })
      await router.invalidate()
      return true
    } catch {
      setError('Rename failed — try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <RenameButton
      value={curriculum.name}
      busy={busy}
      hydrated={hydrated}
      onSave={saveName}
      error={error}
      testId={`curriculum-rename-${curriculum.id}`}
    />
  )
}

function AddModuleBar({ curriculumId }: { curriculumId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const hydrated = useHydrated()

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
      hydrated={hydrated}
      onAdd={add}
    />
  )
}

export function SourceRow({ source }: { source: Source }) {
  if (source.kind === 'link') {
    return (
      <li>
        <a
          href={safeHref(source.value)}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline underline-offset-2"
        >
          {source.title ?? source.value}
        </a>
      </li>
    )
  }

  if (source.kind === 'llms_txt') {
    return (
      <li data-testid="source-row-llms-txt" className="text-neutral-600">
        📖 {source.title ?? `Site-published map: ${source.value}`}
      </li>
    )
  }

  if (source.kind === 'web_research') {
    return (
      <li data-testid="source-row-web-research" className="text-neutral-600">
        🔎 {source.title ?? `Auto-researched: ${source.value}`}
      </li>
    )
  }

  return <li className="text-neutral-600">“{source.value}”</li>
}
