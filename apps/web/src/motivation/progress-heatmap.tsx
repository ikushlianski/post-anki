import type { ProgressView } from '@post-anki/shared'

type Day = ProgressView['heatmap'][number]

export function heatLevel(reviews: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (reviews <= 0 || max <= 0) {
    return 0
  }

  return Math.min(4, Math.max(1, Math.ceil((reviews / max) * 4))) as 1 | 2 | 3 | 4
}

const LEVEL_CLASSES = ['bg-neutral-100', 'bg-indigo-100', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700']

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()

  return day === 0 ? 6 : day - 1
}

export function ProgressHeatmap({ days }: { days: Day[] }) {
  const max = Math.max(0, ...days.map((day) => day.reviews))
  const padding = days.length > 0 ? weekdayIndex(days[0]!.date) : 0
  const cells: (Day | null)[] = [...Array.from({ length: padding }, () => null), ...days]

  return (
    <div
      data-testid="progress-heatmap"
      role="img"
      aria-label="Reviews per day"
      className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto"
    >
      {cells.map((day, index) =>
        day ? (
          <span
            key={day.date}
            data-testid="heatmap-day"
            data-level={heatLevel(day.reviews, max)}
            title={`${day.date}: ${day.reviews} reviews`}
            className={`h-3 w-3 rounded-sm ${LEVEL_CLASSES[heatLevel(day.reviews, max)]}`}
          />
        ) : (
          <span key={`pad-${index}`} className="h-3 w-3" />
        ),
      )}
    </div>
  )
}
