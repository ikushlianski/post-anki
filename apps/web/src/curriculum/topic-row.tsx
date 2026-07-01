import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import {
  DEPTH_ORDER,
  type Concern,
  type Depth,
  type Gap,
  type SelfGrade as SelfGradeValue,
  type Topic,
  type TopicProgressStatus,
} from './model'
import { declareGap, setTopicState } from './curriculum.api'
import { useCurateGap, useToggleTopicIncluded } from './curriculum.mutations'
import { CONCERN_LABEL, CONCERN_OPTIONS } from './concern-labels'
import { SelfGrade } from './self-grade'
import { TopicShapeBar } from './topic-shape-bar'
import { InlineRename } from './shape-controls'
import { DepthSlider } from './depth-slider'

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

function isInScope(gap: Gap, targetDepth: Depth): boolean {
  return DEPTH_ORDER[gap.depth] <= DEPTH_ORDER[targetDepth]
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
}: {
  topic: Topic
  recommended: boolean
  canProbe: boolean
  editable: boolean
  topicOrder: string[]
  moduleId: string
  curriculumId: string
  allModules: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const toggleIncludedMutation = useToggleTopicIncluded(curriculumId)
  const included = topic.included

  async function patch(data: {
    title?: string
    selfGrade?: SelfGradeValue | null
    targetDepth?: Depth
  }) {
    setBusy(true)
    await setTopicState({ data: { topicId: topic.id, ...data } })
    setBusy(false)
    await router.invalidate()
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
            <h4 className="font-medium">
              {editable ? (
                <InlineRename
                  value={topic.title}
                  busy={busy}
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
          </div>
          {topic.summary ? (
            <p className="mt-0.5 text-sm text-neutral-500">{topic.summary}</p>
          ) : null}
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
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleIncluded}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            included
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {included ? 'Included' : 'Skipped'}
        </button>
      </div>

      {editable ? (
        <TopicShapeBar
          topic={topic}
          topicOrder={topicOrder}
          moduleId={moduleId}
          allModules={allModules}
        />
      ) : null}

      {included ? (
        <div className="mt-3 space-y-4">
          <div>
            <span className="text-xs text-neutral-400">
              Your estimate (rough — the mentor weighs it, then tests it)
            </span>
            <SelfGrade
              value={topic.selfGrade}
              onChange={(grade) => patch({ selfGrade: grade })}
              disabled={busy}
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
                disabled={busy}
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

          <GapChecklist topic={topic} curriculumId={curriculumId} />

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
    </article>
  )
}

function GapChecklist({
  topic,
  curriculumId,
}: {
  topic: Topic
  curriculumId: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [concern, setConcern] = useState<Concern | ''>('')
  const curateGapMutation = useCurateGap(curriculumId)

  function curate(
    gapId: string,
    data: { status?: 'skipped'; wanted?: boolean },
  ) {
    curateGapMutation.mutate({ gapId, ...data })
  }

  async function addGap(event: FormEvent) {
    event.preventDefault()

    if (!label.trim()) {
      return
    }

    setBusy(true)
    await declareGap({
      data: {
        topicId: topic.id,
        label: label.trim(),
        concern: concern || undefined,
      },
    })
    setLabel('')
    setConcern('')
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {topic.gaps.map((gap) => (
          <GapRow
            key={gap.id}
            gap={gap}
            inScope={isInScope(gap, topic.targetDepth)}
            busy={busy}
            onWant={() => curate(gap.id, { wanted: !gap.wanted })}
            onSkip={() => curate(gap.id, { status: 'skipped' })}
          />
        ))}
      </ul>

      <form onSubmit={addGap} className="flex flex-wrap gap-2 pt-1">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Add a gap you want covered…"
          className="min-w-[8rem] flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
        />
        <select
          value={concern}
          onChange={(event) => setConcern(event.target.value as Concern | '')}
          aria-label="Concern"
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 outline-none focus:border-neutral-400"
        >
          <option value="">No concern</option>
          {CONCERN_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {CONCERN_LABEL[option]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-50"
        >
          Add gap
        </button>
      </form>
    </div>
  )
}

function GapRow({
  gap,
  inScope,
  busy,
  onWant,
  onSkip,
}: {
  gap: Gap
  inScope: boolean
  busy: boolean
  onWant: () => void
  onSkip: () => void
}) {
  if (gap.status === 'skipped') {
    return (
      <li className="text-xs text-neutral-400">
        <span className="line-through">{gap.label}</span> · skipped
      </li>
    )
  }

  if (!inScope) {
    return (
      <li className="text-xs text-neutral-300">
        ◦ {gap.label} · deeper than your chosen depth
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span
        className={gap.status === 'covered' ? 'text-emerald-700' : 'text-neutral-600'}
      >
        {gap.status === 'covered' ? '✓' : '○'} {gap.label}
        {gap.origin === 'user' ? (
          <span className="ml-1 rounded bg-neutral-100 px-1 text-[10px] text-neutral-400">
            yours
          </span>
        ) : null}
        {gap.concern ? (
          <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-500">
            {CONCERN_LABEL[gap.concern]}
          </span>
        ) : null}
      </span>
      {gap.status === 'open' ? (
        <span className="flex shrink-0 items-center gap-2 text-neutral-400">
          <button
            type="button"
            disabled={busy}
            onClick={onWant}
            className={gap.wanted ? 'text-amber-500' : 'hover:text-neutral-700'}
          >
            {gap.wanted ? '★ wanted' : '☆ want'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="hover:text-neutral-700"
          >
            skip
          </button>
        </span>
      ) : null}
    </li>
  )
}

function probeButtonClass(active: boolean): string {
  return `rounded-md border px-3 py-1 text-xs font-medium ${
    active
      ? 'border-neutral-900 bg-neutral-900 text-white'
      : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
  }`
}
