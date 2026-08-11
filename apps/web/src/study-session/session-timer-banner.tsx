import { formatElapsedClock, formatPlannedDuration } from './session-timer'

export interface SessionTimerBannerProps {
  elapsedMinutes: number
  plannedDurationMinutes: number
  timeUp: boolean
  ending: boolean
  onEndNow: () => void
}

export function SessionTimerBanner({
  elapsedMinutes,
  plannedDurationMinutes,
  timeUp,
  ending,
  onEndNow,
}: SessionTimerBannerProps) {
  return (
    <div
      data-testid="session-timer-banner"
      className="mb-4 flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
    >
      <p className="text-sm text-neutral-700">
        <span data-testid="session-elapsed" className="font-medium text-neutral-900">
          {formatElapsedClock(elapsedMinutes)}
        </span>{' '}
        of {formatPlannedDuration(plannedDurationMinutes)} planned
        {timeUp ? (
          <span data-testid="session-time-up" className="ml-2 text-amber-700">
            — time's up, finish this one whenever you're ready
          </span>
        ) : null}
      </p>
      <button
        type="button"
        disabled={ending}
        onClick={onEndNow}
        data-testid="session-end-now"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
      >
        {ending ? 'Ending…' : 'End now'}
      </button>
    </div>
  )
}
