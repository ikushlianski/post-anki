import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { buildSubjectPathLabel } from '@post-anki/core'
import type {
  AddKnowledgeGoal,
  AddKnowledgeGoalPeriod,
  AddKnowledgeGoalProgress,
  PutAddKnowledgeGoalInput,
} from '@post-anki/shared'

import { mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import {
  deleteAddKnowledgeGoal,
  listAddKnowledgeGoalProgress,
  listAddKnowledgeGoals,
  saveAddKnowledgeGoal,
} from './study-goal.api'
import { useStudyGoalData } from './use-study-goal-data'
import { browserTimeZone } from '../shared/browser-time-zone'

export interface SubjectOption {
  id: string
  label: string
}

const PERIOD_LABEL: Record<AddKnowledgeGoalPeriod, string> = { day: 'today', week: 'this week' }

export function AddKnowledgeGoalView({
  progress,
  goals,
  options,
  onSave,
  onRemove,
}: {
  progress: AddKnowledgeGoalProgress[]
  goals: AddKnowledgeGoal[]
  options: SubjectOption[]
  onSave: (input: PutAddKnowledgeGoalInput) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [subjectId, setSubjectId] = useState('')
  const [period, setPeriod] = useState<AddKnowledgeGoalPeriod>('week')
  const [target, setTarget] = useState('5')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const labelOf = (id: string) => options.find((option) => option.id === id)?.label ?? id
  const targetNumber = Number(target)
  const valid = subjectId !== '' && Number.isInteger(targetNumber) && targetNumber >= 1

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setFailed(false)

    try {
      await action()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-testid="add-knowledge-goals" className="mb-6 rounded-md border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold">Knowledge goals</h2>
      {progress.length === 0 ? (
        <p data-testid="add-knowledge-goals-empty" className="mt-1 text-sm text-neutral-500">
          Mark a subject as hot and set how many notes you want to add to it.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {progress.map((entry) => {
            const goal = goals.find((candidate) => candidate.subjectId === entry.subjectId)

            return (
              <li key={entry.subjectId} data-testid="add-knowledge-goal-row" className="flex items-center gap-2 text-sm">
                <span data-testid="add-knowledge-goal-progress">
                  {labelOf(entry.subjectId)}: {entry.added} of {entry.target} notes {PERIOD_LABEL[entry.period]}
                </span>
                {entry.added === 0 ? (
                  <span data-testid="add-knowledge-nudge" className="text-amber-700">
                    Nothing added yet
                  </span>
                ) : null}
                {goal ? (
                  <button
                    type="button"
                    data-testid="add-knowledge-goal-remove"
                    disabled={busy}
                    onClick={() => void run(() => onRemove(goal.id))}
                    className="ml-auto text-xs text-neutral-500 hover:text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => onSave({ subjectId, period, targetNotes: targetNumber }))
        }}
      >
        <select
          aria-label="Hot subject"
          data-testid="add-knowledge-goal-subject"
          value={subjectId}
          onChange={(event) => setSubjectId(event.target.value)}
          className="min-w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
        >
          <option value="">Choose a subject</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          aria-label="Notes"
          data-testid="add-knowledge-goal-target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
        />
        <select
          aria-label="Per"
          data-testid="add-knowledge-goal-period"
          value={period}
          onChange={(event) => setPeriod(event.target.value as AddKnowledgeGoalPeriod)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
        >
          <option value="week">notes per week</option>
          <option value="day">notes per day</option>
        </select>
        <button
          type="submit"
          data-testid="add-knowledge-goal-save"
          disabled={busy || !valid}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
        >
          Set goal
        </button>
      </form>
      {failed ? (
        <p role="alert" data-testid="add-knowledge-goal-error" className="mt-2 text-sm text-red-600">
          Could not save, try again.
        </p>
      ) : null}
    </section>
  )
}

export function AddKnowledgeGoalPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const tz = browserTimeZone()
  const subjectsQuery = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const subjects = (subjectsQuery.data ?? []).map(mapSubjectRow)
  const options = subjects
    .map((subject) => ({ id: subject.id, label: buildSubjectPathLabel(subject.id, subjects) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const { result, reload } = useStudyGoalData(async () => {
    const [progress, goals] = await Promise.all([
      listAddKnowledgeGoalProgress({ data: tz }),
      listAddKnowledgeGoals(),
    ])

    return { progress: progress.goals, goals: goals.goals }
  }, refreshKey)

  if (!result?.ok) {
    return null
  }

  return (
    <AddKnowledgeGoalView
      progress={result.data.progress}
      goals={result.data.goals}
      options={options}
      onSave={async (input) => {
        await saveAddKnowledgeGoal({ data: input })
        reload()
      }}
      onRemove={async (id) => {
        await deleteAddKnowledgeGoal({ data: id })
        reload()
      }}
    />
  )
}
