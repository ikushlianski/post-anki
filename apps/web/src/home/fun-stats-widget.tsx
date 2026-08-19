import type { HomeFunStats } from '@post-anki/shared'

export interface FunStatsWidgetProps {
  stats: HomeFunStats
}

const TILES: { key: keyof HomeFunStats; label: string }[] = [
  { key: 'currentStreak', label: 'Day streak' },
  { key: 'longestStreak', label: 'Best streak' },
  { key: 'topicsMastered', label: 'Topics mastered' },
  { key: 'questionsAnswered', label: 'Questions answered' },
]

export function FunStatsWidget({ stats }: FunStatsWidgetProps) {
  return (
    <div
      data-testid="fun-stats-widget"
      className="card grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {TILES.map(({ key, label }) => (
        <div
          key={key}
          data-testid="fun-stats-widget-tile"
          className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-center"
        >
          <p className="text-2xl font-semibold text-orange-900">{stats[key]}</p>
          <p className="mt-0.5 text-xs text-orange-700">{label}</p>
        </div>
      ))}
    </div>
  )
}
