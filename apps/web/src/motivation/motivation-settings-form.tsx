import { useState } from 'react'
import { isValidTimeZone, updateMotivationSettingsInput, type MotivationSettings } from '@post-anki/shared'

import { useStudyGoalData } from '../study-goal/use-study-goal-data'
import { getMotivationSettings, saveMotivationSettings } from './motivation.api'

export function MotivationSettingsForm({
  initial,
  onSave,
}: {
  initial: MotivationSettings
  onSave: (settings: MotivationSettings) => Promise<MotivationSettings>
}) {
  const [saved, setSaved] = useState(initial)
  const [timeZone, setTimeZone] = useState(initial.timeZone)
  const [minReviews, setMinReviews] = useState(String(initial.streakMinReviews))
  const [restDays, setRestDays] = useState(String(initial.restDaysPerMonth))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const draft = {
    timeZone: timeZone.trim(),
    streakMinReviews: Number(minReviews),
    restDaysPerMonth: Number(restDays),
  }
  const valid = updateMotivationSettingsInput.safeParse(draft).success && isValidTimeZone(draft.timeZone)
  const changed =
    draft.timeZone !== saved.timeZone ||
    draft.streakMinReviews !== saved.streakMinReviews ||
    draft.restDaysPerMonth !== saved.restDaysPerMonth

  async function save(): Promise<void> {
    setBusy(true)
    setFailed(false)

    try {
      setSaved(await onSave({ ...saved, ...draft, timeZoneConfigured: true }))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section data-testid="motivation-settings" className="mt-6 flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Streak and time zone</h2>
      <label className="flex flex-col gap-1 text-sm">
        Time zone
        <input
          data-testid="motivation-time-zone"
          value={timeZone}
          disabled={busy}
          onChange={(event) => setTimeZone(event.target.value)}
          className="w-64 rounded-md border border-neutral-300 px-2 py-1 min-h-[44px] sm:min-h-0"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Reviews that count a day when no daily goal is set
        <input
          type="number"
          min={1}
          max={500}
          data-testid="motivation-min-reviews"
          value={minReviews}
          disabled={busy}
          onChange={(event) => setMinReviews(event.target.value)}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 min-h-[44px] sm:min-h-0"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Rest days per month
        <input
          type="number"
          min={0}
          max={10}
          data-testid="motivation-rest-days"
          value={restDays}
          disabled={busy}
          onChange={(event) => setRestDays(event.target.value)}
          className="w-28 rounded-md border border-neutral-300 px-2 py-1 min-h-[44px] sm:min-h-0"
        />
      </label>
      <button
        type="button"
        data-testid="motivation-settings-save"
        disabled={busy || !valid || !changed}
        onClick={() => void save()}
        className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        Save
      </button>
      {!valid ? (
        <p data-testid="motivation-settings-invalid" className="text-sm text-red-600">
          Use a real time zone, 1 to 500 reviews and 0 to 10 rest days.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" data-testid="motivation-settings-error" className="text-sm text-red-600">
          Could not save, try again.
        </p>
      ) : null}
    </section>
  )
}

export function MotivationSettingsField() {
  const { result } = useStudyGoalData(() => getMotivationSettings())

  if (!result?.ok) {
    return null
  }

  return (
    <MotivationSettingsForm
      initial={result.data}
      onSave={(settings) =>
        saveMotivationSettings({
          data: {
            timeZone: settings.timeZone,
            streakMinReviews: settings.streakMinReviews,
            restDaysPerMonth: settings.restDaysPerMonth,
          },
        })
      }
    />
  )
}
