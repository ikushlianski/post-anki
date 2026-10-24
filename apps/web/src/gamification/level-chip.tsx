import { useGamificationProfile } from './gamification-profile.query'
import { levelProgress } from './level-progress'

export function LevelChip() {
  const profile = useGamificationProfile()
  const player = profile.data?.player

  if (!player) {
    return null
  }

  const { remaining, percent } = levelProgress(player)

  return (
    <div
      data-testid="level-chip"
      className="mb-4 flex items-center gap-3 text-sm text-neutral-600"
    >
      <span className="font-medium text-neutral-900">Level {player.level}</span>
      <div
        role="progressbar"
        aria-label="Progress to next level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200"
      >
        <div className="h-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </div>
      <span>
        {player.totalPoints === 0
          ? 'Your first points arrive with your first review'
          : `${remaining} points to level ${player.level + 1}`}
      </span>
    </div>
  )
}
