import { useState } from 'react'

import {
  currentPeriodKey,
  type CreateSubjectPriorityInput,
  type PriorityPeriodKind,
  type SubjectPriority,
  type UpdateSubjectPriorityInput,
} from '@post-anki/shared'

import { PriorityForm } from './priority-form'
import { PriorityRow } from './priority-row'
import {
  createSubjectPriority,
  deleteSubjectPriority,
  listSubjectPriorities,
  updateSubjectPriority,
} from './study-goal.api'
import { useStudyGoalData } from './use-study-goal-data'
import { browserTimeZone } from '../shared/browser-time-zone'

const GROUPS: { kind: PriorityPeriodKind; title: string }[] = [
  { kind: 'year', title: 'This year' },
  { kind: 'month', title: 'This month' },
  { kind: 'week', title: 'This week' },
]

export function SubjectPrioritiesView({
  subjectId,
  priorities,
  subjectNames,
  now,
  tz,
  onCreate,
  onUpdate,
  onDelete,
}: {
  subjectId: string
  priorities: SubjectPriority[]
  subjectNames: Record<string, string>
  now: Date
  tz: string
  onCreate: (input: CreateSubjectPriorityInput) => Promise<void>
  onUpdate: (id: string, patch: UpdateSubjectPriorityInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setFailed(false)

    try {
      await action()

      return true
    } catch {
      setFailed(true)

      return false
    } finally {
      setBusy(false)
    }
  }

  const active = priorities.filter((priority) => priority.periodKey === currentPeriodKey(priority.periodKind, now, tz))

  return (
    <section data-testid="subject-priorities" className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">Priorities</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Progress counts this subject and its sub-subjects, so moving a subject changes the numbers.
      </p>
      {failed ? (
        <p role="alert" data-testid="priorities-error" className="mt-2 text-sm text-red-600">
          Could not save, try again.
        </p>
      ) : null}
      {active.length === 0 ? (
        <p data-testid="priorities-empty" className="mt-3 text-sm text-neutral-500">
          No priorities set for this year, month or week. Add one below, or leave it empty.
        </p>
      ) : (
        GROUPS.map(({ kind, title }) => {
          const rows = active.filter((priority) => priority.periodKind === kind)

          return rows.length === 0 ? null : (
            <div key={kind} data-testid={`priorities-${kind}`} className="mt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</h3>
              <ul className="space-y-2">
                {rows.map((priority) => (
                  <PriorityRow
                    key={priority.id}
                    priority={priority}
                    subjectName={priority.subjectId === subjectId ? null : (subjectNames[priority.subjectId] ?? null)}
                    disabled={busy}
                    onToggleDone={(done) => void run(() => onUpdate(priority.id, { done }))}
                    onDelete={() => void run(() => onDelete(priority.id))}
                  />
                ))}
              </ul>
            </div>
          )
        })
      )}
      <PriorityForm
        disabled={busy}
        keyFor={(kind) => currentPeriodKey(kind, now, tz)}
        onSubmit={(input) => run(() => onCreate(input))}
      />
    </section>
  )
}

export function SubjectPrioritiesPanel({
  subjectId,
  subjectNames,
}: {
  subjectId: string
  subjectNames: Record<string, string>
}) {
  const tz = browserTimeZone()
  const { result, reload } = useStudyGoalData(
    () => listSubjectPriorities({ data: { subjectId, tz } }),
    subjectId,
  )

  if (!result) {
    return null
  }

  if (!result.ok) {
    return (
      <p data-testid="priorities-load-error" className="mt-8 text-sm text-red-600">
        Could not load priorities. Reload to try again.
      </p>
    )
  }

  return (
    <SubjectPrioritiesView
      subjectId={subjectId}
      priorities={result.data.priorities}
      subjectNames={subjectNames}
      now={new Date()}
      tz={tz}
      onCreate={async (priority) => {
        await createSubjectPriority({ data: { subjectId, tz, priority } })
        reload()
      }}
      onUpdate={async (id, patch) => {
        await updateSubjectPriority({ data: { id, tz, patch } })
        reload()
      }}
      onDelete={async (id) => {
        await deleteSubjectPriority({ data: id })
        reload()
      }}
    />
  )
}
