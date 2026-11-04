import type { NothingExtractedWeek } from '@post-anki/shared'

const WIDTH = 240
const HEIGHT = 48
const GAP = 4

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

function describe(week: NothingExtractedWeek): string {
  return week.processed === 0
    ? `Week of ${week.weekStart}: no notes processed`
    : `Week of ${week.weekStart}: ${week.nothingExtracted} of ${week.processed} notes gave no cards (${percent(week.rate)})`
}

export function NothingExtractedWeeklyBars({ weekly }: { weekly: NothingExtractedWeek[] }) {
  const active = weekly.filter((week) => week.processed > 0)

  if (active.length === 0) {
    return (
      <p data-testid="nothing-extracted-empty" className="text-sm text-neutral-500">
        No notes processed in the last 12 weeks
      </p>
    )
  }

  const barWidth = (WIDTH - GAP * (weekly.length - 1)) / weekly.length
  const latest = active[active.length - 1]

  return (
    <div data-testid="nothing-extracted-trend">
      <p data-testid="nothing-extracted-label" className="mb-2 text-sm text-neutral-600">
        Latest week with notes: {percent(latest.rate)} gave no cards ({latest.nothingExtracted} of {latest.processed})
      </p>
      <svg
        role="img"
        aria-label={`Share of notes that gave no cards per week over the last ${weekly.length} weeks, oldest first. ${weekly.map(describe).join('. ')}`}
        viewBox={`0 0 ${WIDTH} ${HEIGHT + 2}`}
        className="h-12 w-60"
      >
        <line x1={0} x2={WIDTH} y1={HEIGHT} y2={HEIGHT} className="stroke-neutral-300" />
        {weekly.map((week, index) => (
          <rect
            key={week.weekStart}
            x={index * (barWidth + GAP)}
            y={HEIGHT - week.rate * HEIGHT}
            width={barWidth}
            height={week.rate * HEIGHT}
            className="fill-neutral-800"
          />
        ))}
      </svg>
    </div>
  )
}
