import type { Streak } from '@post-anki/shared'

export function StreakBanner({ streak }: { streak: Streak }) {
  if (streak.currentStreak === 0) {
    return (
      <div
        data-testid="streak-banner"
        className="mb-6 card-compact text-neutral-500"
      >
        No streak yet — answer a question today to start one.
      </div>
    )
  }

  return (
    <div
      data-testid="streak-banner"
      className="mb-6 flex items-center gap-4 alert alert-warning"
    >
      <span data-testid="streak-current" className="font-semibold text-orange-900">
        🔥 {streak.currentStreak} day{streak.currentStreak === 1 ? '' : 's'} streak
      </span>
      <span data-testid="streak-longest" className="text-orange-700">
        Longest · {streak.longestStreak} day{streak.longestStreak === 1 ? '' : 's'}
      </span>
    </div>
  )
}
