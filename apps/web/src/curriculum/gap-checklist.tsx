import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import { ActionFailedLine } from './action-failed-line'
import { DEPTH_ORDER, type Concern, type Depth, type Gap, type GapMastery, type Topic } from './model'
import { declareGap } from './curriculum.api'
import { useCurateGap } from './curriculum.mutations'
import { CONCERN_LABEL, CONCERN_OPTIONS } from './concern-labels'
import { controlHint, controlState, isControlDisabled } from '../shared/control-state'

function isInScope(gap: Gap, targetDepth: Depth): boolean {
  return DEPTH_ORDER[gap.depth] <= DEPTH_ORDER[targetDepth]
}

export function isGapActionable(gap: Pick<Gap, 'status' | 'mastery'>): boolean {
  return gap.status === 'open'
}

export function GapChecklist({
  topic,
  curriculumId,
  hydrated,
}: {
  topic: Topic
  curriculumId: string
  hydrated: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [label, setLabel] = useState('')
  const [concern, setConcern] = useState<Concern | ''>('')
  const curateGapMutation = useCurateGap(curriculumId)
  const state = controlState({ editable: true, hydrated, busy })
  const disabled = isControlDisabled(state)
  const hint = controlHint(state)

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
    setFailed(false)

    try {
      await declareGap({
        data: {
          topicId: topic.id,
          label: label.trim(),
          concern: concern || undefined,
        },
      })
      setLabel('')
      setConcern('')
      await router.invalidate()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <ul className="space-y-1">
        {topic.gaps.map((gap) => (
          <GapRow
            key={gap.id}
            gap={gap}
            inScope={isInScope(gap, topic.targetDepth)}
            disabled={disabled}
            hint={hint}
            onWant={() => curate(gap.id, { wanted: !gap.wanted })}
            onSkip={() => curate(gap.id, { status: 'skipped' })}
          />
        ))}
      </ul>

      <ActionFailedLine failed={failed} testId="gap-add-error" />
      <form onSubmit={addGap} className="flex flex-wrap gap-2 pt-1">
        <input
          value={label}
          disabled={disabled}
          onChange={(event) => setLabel(event.target.value)}
          aria-label="Gap to cover"
          placeholder="Add a gap you want covered…"
          className="min-w-[8rem] flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-neutral-400"
        />
        <select
          value={concern}
          disabled={disabled}
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
          title={hint}
          disabled={disabled}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500 disabled:opacity-40"
        >
          Add gap
        </button>
      </form>
    </div>
  )
}

// Generalized recall-gap mastery tracking (issue #57) — display-precedence
// rule (spec.md Decision 2 addendum): a gap that carries a mastery
// sub-object renders ITS status, distinctly from a bare open/covered gap —
// never falling back to `gap.status` once `gap.mastery` exists, even if
// `gap.status` happens to independently read 'covered' via an unrelated
// writer (the untouched freeform Socratic flow touching the same topic).
const MASTERY_MARK: Record<GapMastery['status'], string> = {
  new: '○',
  practicing: '◐',
  struggling: '◑',
  mastered: '✓',
}

const MASTERY_CLASS: Record<GapMastery['status'], string> = {
  new: 'text-neutral-600',
  practicing: 'text-amber-600',
  struggling: 'text-amber-700',
  mastered: 'text-emerald-700',
}

function masteryLabel(mastery: GapMastery): string {
  if (mastery.status === 'mastered') {
    return 'mastered'
  }

  return `${mastery.status} (${mastery.masteryStage}/3)`
}

function GapRow({
  gap,
  inScope,
  disabled,
  hint,
  onWant,
  onSkip,
}: {
  gap: Gap
  inScope: boolean
  disabled: boolean
  hint: string | undefined
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

  const mastery = gap.mastery ?? null
  const mark = mastery ? MASTERY_MARK[mastery.status] : gap.status === 'covered' ? '✓' : '○'
  const markClass = mastery
    ? MASTERY_CLASS[mastery.status]
    : gap.status === 'covered'
      ? 'text-emerald-700'
      : 'text-neutral-600'

  return (
    <li
      className="flex items-center justify-between gap-2 text-xs"
      data-testid={`gap-row-${gap.id}`}
    >
      <span className={markClass}>
        {mark} {gap.label}
        {mastery ? (
          <span
            className="ml-1 rounded bg-neutral-100 px-1 text-[10px] text-neutral-500"
            data-testid={`gap-mastery-status-${gap.id}`}
          >
            {masteryLabel(mastery)}
          </span>
        ) : null}
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
      {isGapActionable(gap) ? (
        <span className="flex shrink-0 items-center gap-2 text-neutral-400">
          <button
            type="button"
            title={hint}
            disabled={disabled}
            onClick={onWant}
            className={`disabled:opacity-40 ${gap.wanted ? 'text-amber-500' : 'hover:text-neutral-700'}`}
          >
            {gap.wanted ? '★ wanted' : '☆ want'}
          </button>
          <button
            type="button"
            title={hint}
            disabled={disabled}
            onClick={onSkip}
            className="hover:text-neutral-700 disabled:opacity-40"
          >
            skip
          </button>
        </span>
      ) : null}
    </li>
  )
}
