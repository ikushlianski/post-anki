import type { SessionStats } from './anki-review-session-stats'

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

export function AnkiReviewSummary({
  stats,
  onKeepReviewing,
}: {
  stats: SessionStats
  onKeepReviewing?: () => void
}) {
  const rows: [string, string | number][] = [
    ['Today', stats.totalGradedToday],
    ['Cards reviewed', stats.reviewed],
    ['Again', stats.byGrade.again],
    ['Hard', stats.byGrade.hard],
    ['Good', stats.byGrade.good],
    ['Easy', stats.byGrade.easy],
    ['Recalled', `${Math.round(stats.recalledShare * 100)}%`],
    ['New cards studied', stats.newStudied],
    ['Total time', seconds(stats.totalMs)],
    ['Average per card', seconds(stats.averageMs)],
    ['Suspended', stats.suspended],
    ['Buried', stats.buried],
    ['Edited', stats.edited],
    ['Leeches flagged', stats.leeches],
  ]

  if (stats.studyStreak > 1) {
    rows.splice(1, 0, ['Streak', `${stats.studyStreak} days`])
  }

  return (
    <section data-testid="anki-review-summary" className="mt-4 flex flex-col gap-2">
      <h2 className="text-lg font-medium">Session summary</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd data-testid={`anki-review-summary-${label.toLowerCase().replace(/ /g, '-')}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {onKeepReviewing && (
        <button
          type="button"
          data-testid="anki-review-keep-reviewing"
          onClick={onKeepReviewing}
          className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Keep reviewing
        </button>
      )}
    </section>
  )
}
