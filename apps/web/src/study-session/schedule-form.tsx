import { useState } from 'react'

import type { CreateStudySessionInput, StudySession } from '@post-anki/shared'

import { resolveScheduleTarget, type ScheduleTargetKind } from './schedule-target'
import type { ApiResult } from './study-session.model'

export interface ScheduleFormProps {
  curricula: Array<{ id: string; name: string }>
  learningPaths: Array<{ id: string; name: string }>
  onSchedule: (input: CreateStudySessionInput) => Promise<ApiResult<StudySession>>
  onScheduled: (session: StudySession) => void | Promise<void>
}

const TARGET_KINDS: Array<{ value: ScheduleTargetKind; label: string }> = [
  { value: 'anything', label: 'Anything' },
  { value: 'curriculum', label: 'A curriculum' },
  { value: 'learning_path', label: 'A learning path' },
]

export function ScheduleForm({
  curricula,
  learningPaths,
  onSchedule,
  onScheduled,
}: ScheduleFormProps) {
  const [kind, setKind] = useState<ScheduleTargetKind>('anything')
  const [targetId, setTargetId] = useState('')
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState(20)
  const [scheduledFor, setScheduledFor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scopedOptions = kind === 'curriculum' ? curricula : kind === 'learning_path' ? learningPaths : []

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const target = resolveScheduleTarget({ kind, id: targetId || null })

    const result = await onSchedule({
      ...target,
      plannedDurationMinutes,
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
    })

    setBusy(false)

    if (!result.ok) {
      setError('Could not plan that session — try again.')
      return
    }

    setTargetId('')
    setScheduledFor('')
    await onScheduled(result.data)
  }

  return (
    <form
      onSubmit={submit}
      data-testid="schedule-form"
      className="card"
    >
      <h2 className="text-sm font-medium">Plan a study session</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        Pick what to focus on and how long. Nothing is scheduled to nag you — a
        planned time is just a reminder to yourself.
      </p>

      <div className="mt-3 flex gap-1">
        {TARGET_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            data-testid={`schedule-target-kind-${option.value}`}
            onClick={() => {
              setKind(option.value)
              setTargetId('')
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              kind === option.value
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {kind !== 'anything' ? (
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          data-testid="schedule-target-id"
          className="mt-3 w-full input"
        >
          <option value="">Choose one…</option>
          {scopedOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      ) : null}

      <label className="mt-3 block text-xs text-neutral-500" htmlFor="schedule-duration">
        Duration (minutes)
      </label>
      <input
        id="schedule-duration"
        type="number"
        min={1}
        value={plannedDurationMinutes}
        onChange={(event) => setPlannedDurationMinutes(Number(event.target.value))}
        data-testid="schedule-duration"
        className="mt-1 w-full input"
      />

      <label className="mt-3 block text-xs text-neutral-500" htmlFor="schedule-for">
        Scheduled for (optional — leave blank to start whenever)
      </label>
      <input
        id="schedule-for"
        type="datetime-local"
        value={scheduledFor}
        onChange={(event) => setScheduledFor(event.target.value)}
        data-testid="schedule-for"
        className="mt-1 w-full input"
      />

      {error ? (
        <p
          role="alert"
          data-testid="schedule-error"
          className="mt-3 alert alert-error text-xs"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || (kind !== 'anything' && targetId === '') || plannedDurationMinutes < 1}
        data-testid="schedule-submit"
        className="mt-4 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Planning…' : 'Plan session'}
      </button>
    </form>
  )
}
