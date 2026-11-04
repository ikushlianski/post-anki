import { formatUsd } from './ai-spend-chart'
import type { AiSpend, LearningStats } from './stats.types'

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p data-testid={testId} className="mt-1 text-xl font-semibold">
        {value}
      </p>
    </div>
  )
}

export function StatsTiles({
  learning,
  spend,
  monthSpendUsd,
}: {
  learning: LearningStats
  spend: AiSpend | null
  monthSpendUsd: number | null
}) {
  const spendLabel = monthSpendUsd === null || spend === null ? 'n/a' : formatUsd(monthSpendUsd)

  return (
    <div data-testid="stats-tiles" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile
        label="Streak (current / longest)"
        value={`${learning.streak.current} / ${learning.streak.longest} days`}
        testId="tile-streak"
      />
      <Tile label="Accuracy, last 7 days" value={learning.accuracy.last7 === null ? '–' : `${Math.round(learning.accuracy.last7 * 100)}%`} testId="tile-accuracy" />
      <Tile label="Reviews today" value={String(learning.today.reviews)} testId="tile-reviews-today" />
      <Tile label="AI spend this month (est.)" value={spendLabel} testId="tile-spend-month" />
    </div>
  )
}

export function monthToDateSpend(spend: AiSpend, now: Date = new Date()): number {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return spend.days
    .filter((day) => day.date.startsWith(prefix))
    .reduce((sum, day) => sum + day.cardsUsd + day.chatUsd + day.otherUsd, 0)
}
