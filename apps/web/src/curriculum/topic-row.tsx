import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import { type Depth, type SelfGrade as SelfGradeValue, type Topic, type TopicProgressStatus } from './model'
import { ActionFailedLine } from './action-failed-line'
import { addTopicComment, setTopicState } from './curriculum.api'
import { useToggleTopicIncluded } from './curriculum.mutations'
import { SelfGrade } from './self-grade'
import { TopicShapeBar } from './topic-shape-bar'
import { InlineRename, StrictOrderNote } from './shape-controls'
import { NodeCommentControl } from './node-comment-control'
import { DepthSlider } from './depth-slider'
import { TagPicker } from './tag-picker'
import { GapChecklist } from './gap-checklist'
import { useHydrated } from '../shared/use-hydrated'
import { controlHint, controlState, isControlDisabled } from '../shared/control-state'

const STATUS_LABEL: Record<TopicProgressStatus, string> = {
  not_started: 'not started',
  in_progress: 'in progress',
  mastered: 'mastered',
}

const STATUS_CLASS: Record<TopicProgressStatus, string> = {
  not_started: 'bg-neutral-100 text-neutral-500',
  in_progress: 'bg-amber-100 text-amber-700',
  mastered: 'bg-emerald-100 text-emerald-700',
}

export function TopicRow({
  topic,
  recommended,
  canProbe,
  editable,
  topicOrder,
  moduleId,
  curriculumId,
  allModules,
  strictOrder,
}: {
  topic: Topic
  recommended: boolean
  canProbe: boolean
  editable: boolean
  topicOrder: string[]
  moduleId: string
  curriculumId: string
  allModules: { id: string; title: string }[]
  strictOrder: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)
  const hydrated = useHydrated()
  const toggleIncludedMutation = useToggleTopicIncluded(curriculumId)
  const included = topic.included
  const shapeState = controlState({ editable: true, hydrated, busy })
  const shapeDisabled = isControlDisabled(shapeState)
  const includeState = controlState({ editable: true, hydrated, busy: false })

  async function guarded(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setFailed(false)

    try {
      await action()
      await router.invalidate()

      return true
    } catch {
      setFailed(true)

      return false
    } finally {
      setBusy(false)
    }
  }

  async function patch(data: {
    title?: string
    selfGrade?: SelfGradeValue | null
    targetDepth?: Depth
  }) {
    await guarded(async () => {
      await setTopicState({ data: { topicId: topic.id, ...data } })
    })
  }

  async function submitComment(comment: string): Promise<boolean> {
    return guarded(async () => {
      await addTopicComment({ data: { topicId: topic.id, comment } })
    })
  }

  function toggleIncluded() {
    toggleIncludedMutation.mutate({ topicId: topic.id, included: !included })
  }

  return (
    <article
      className={`rounded-lg border p-4 ${
        included
          ? recommended
            ? 'border-neutral-900 bg-white'
            : 'border-neutral-200 bg-white'
          : 'border-dashed border-neutral-300 bg-neutral-50 opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 data-testid="topic-title" className="font-medium">
              {editable ? (
                <InlineRename
                  value={topic.title}
                  busy={busy}
                  hydrated={hydrated}
                  onSave={(title) => patch({ title })}
                />
              ) : (
                topic.title
              )}
            </h4>
            {recommended && included ? (
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                Suggested next
              </span>
            ) : null}
            {editable && strictOrder ? <StrictOrderNote /> : null}
          </div>
          {topic.summary ? (
            <p className="mt-0.5 text-sm text-neutral-500">{topic.summary}</p>
          ) : null}
          <div className="mt-1.5">
            <TagPicker
              nodeType="topic"
              nodeId={topic.id}
              tags={topic.tags ?? []}
              editable={editable}
              hydrated={hydrated}
            />
          </div>
          {included ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[topic.progress.status]}`}
              >
                {STATUS_LABEL[topic.progress.status]}
              </span>
              <span className="text-xs text-neutral-400">
                {topic.progress.gapsCovered}/{topic.progress.gapsTotal} gaps closed
                · {topic.progress.maturity}%
                {topic.progress.attempts > 0
                  ? ` · probed ${topic.progress.attempts}×`
                  : ''}
              </span>
              {topic.dueCount && topic.dueCount > 0 ? <span className="ml-1 text-xs text-amber-600">{topic.dueCount} due</span> : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title={controlHint(includeState)}
            disabled={isControlDisabled(includeState)}
            data-testid={`topic-included-toggle-${topic.id}`}
            onClick={toggleIncluded}
            className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-40 ${
              included
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            {included ? 'Included' : 'Skipped'}
          </button>
          {editable ? (
            <button
              type="button"
              aria-label="Topic controls"
              aria-expanded={controlsOpen}
              data-testid={`topic-controls-toggle-${topic.id}`}
              onClick={() => setControlsOpen((current) => !current)}
              className={`rounded-full px-2 py-1 text-xs ${
                controlsOpen
                  ? 'bg-neutral-200 text-neutral-700'
                  : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700'
              }`}
            >
              ⋯
            </button>
          ) : null}
        </div>
      </div>

      {editable && controlsOpen ? (
        <>
          <TopicShapeBar
            topic={topic}
            topicOrder={topicOrder}
            moduleId={moduleId}
            curriculumId={curriculumId}
            allModules={allModules}
            hydrated={hydrated}
          />
          <div className="mt-2">
            <NodeCommentControl
              busy={busy}
              hydrated={hydrated}
              onSubmit={submitComment}
            />
          </div>
        </>
      ) : null}

      {included ? (
        <div className="mt-3 space-y-3">
          <div>
            <span className="text-xs text-neutral-400">
              Your estimate (rough — the mentor weighs it, then tests it)
            </span>
            <SelfGrade
              value={topic.selfGrade}
              onChange={(grade) => patch({ selfGrade: grade })}
              disabled={shapeDisabled}
            />
          </div>

          <div>
            <span className="text-xs text-neutral-400">
              How deep do you want to go?
            </span>
            <div className="mt-1">
              <DepthSlider
                value={topic.targetDepth}
                onChange={(depth) => patch({ targetDepth: depth })}
                disabled={shapeDisabled}
              />
            </div>
          </div>

          {topic.gaps.length === 0 ? (
            <p className="text-xs text-neutral-500">
              {canProbe
                ? 'No gaps yet — poke yourself with a question or declare one below. Either one fills this checklist.'
                : 'No gaps yet — declare gaps you want covered below, or confirm the curriculum to start probing.'}
            </p>
          ) : null}

          <GapChecklist topic={topic} curriculumId={curriculumId} hydrated={hydrated} />

          {canProbe ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">Poke me:</span>
              <Link
                to="/probe/$topicId"
                params={{ topicId: topic.id }}
                search={{ mode: 'socratic', curriculumId }}
                className={probeButtonClass(false)}
              >
                Socratic question →
              </Link>
              <Link
                to="/probe/$topicId"
                params={{ topicId: topic.id }}
                search={{ mode: 'quick_test', curriculumId }}
                className={probeButtonClass(false)}
              >
                Quick test →
              </Link>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">
              Confirm the curriculum to start probing this topic.
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-3">
        <Link
          to="/lecture/$topicId"
          params={{ topicId: topic.id }}
          data-testid="lecture-link"
          className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
        >
          Read the lecture (~2 min) →
        </Link>
      </div>
      <ActionFailedLine failed={failed} testId="topic-row-error" />
    </article>
  )
}

function probeButtonClass(active: boolean): string {
  return `rounded-md border px-3 py-1 text-xs font-medium ${
    active
      ? 'border-neutral-900 bg-neutral-900 text-white'
      : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
  }`
}
