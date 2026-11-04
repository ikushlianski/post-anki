import { useState } from 'react'

import type { DailyGoal } from '@post-anki/shared'

import { getDailyGoal, saveDailyGoal } from './study-goal.api'
import { useStudyGoalData } from './use-study-goal-data'

export function DailyGoalForm({
  initial,
  onSave,
}: {
  initial: DailyGoal
  onSave: (goal: DailyGoal) => Promise<DailyGoal>
}) {
  const [saved, setSaved] = useState(initial.dailyReviewTarget)
  const [draft, setDraft] = useState(initial.dailyReviewTarget === null ? '' : String(initial.dailyReviewTarget))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const parsed = draft.trim() === '' ? null : Number(draft)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000)

  async function save(): Promise<void> {
    setBusy(true)
    setFailed(false)

    try {
      const next = await onSave({ dailyReviewTarget: parsed })

      setSaved(next.dailyReviewTarget)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-testid="daily-goal-field" className="mt-6">
      <h2 className="text-lg font-semibold tracking-tight">Daily study goal</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Card reviews per day. Leave empty for no goal. The count restarts at your local midnight.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={10000}
          data-testid="daily-goal-input"
          aria-label="Reviews per day"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-sm min-h-[44px] sm:min-h-0"
        />
        <button
          type="button"
          data-testid="daily-goal-save"
          disabled={busy || !valid || parsed === saved}
          onClick={() => void save()}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
        >
          Save
        </button>
      </div>
      {!valid ? (
        <p data-testid="daily-goal-invalid" className="mt-2 text-sm text-red-600">
          Enter a whole number from 1 to 10000, or leave it empty.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" data-testid="daily-goal-error" className="mt-2 text-sm text-red-600">
          Could not save, try again.
        </p>
      ) : null}
    </section>
  )
}

export function DailyGoalField() {
  const { result } = useStudyGoalData(() => getDailyGoal())

  if (!result) {
    return null
  }

  if (!result.ok) {
    return (
      <p data-testid="daily-goal-load-error" className="mt-6 text-sm text-red-600">
        Could not load the daily goal. Reload to try again.
      </p>
    )
  }

  return <DailyGoalForm initial={result.data} onSave={(goal) => saveDailyGoal({ data: goal })} />
}
