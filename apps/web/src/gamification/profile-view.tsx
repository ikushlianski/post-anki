import type { GamificationProfile } from '@post-anki/shared'

import { BadgeGrid } from './badge-grid'
import { levelProgress } from './level-progress'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function ProfileView({ profile }: { profile: GamificationProfile }) {
  const { player } = profile
  const { remaining, percent } = levelProgress(player)
  const stats: [string, string][] = [
    ['Points today', String(profile.todayPoints)],
    ['Total points', String(player.totalPoints)],
    ['Current streak', plural(profile.streak.current, 'day')],
    ['Longest streak', plural(profile.streak.longest, 'day')],
    ['Cards well learned', String(profile.masteredCards)],
  ]

  return (
    <div className="flex flex-col gap-8">
      <section data-testid="profile-level" className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Level {player.level}</h2>
        <div
          role="progressbar"
          aria-label="Progress to next level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-neutral-200"
        >
          <div className="h-full bg-indigo-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm text-neutral-500">
          {player.totalPoints === 0
            ? 'You are at the start. Points and badges show up as you review.'
            : `${remaining} points to level ${player.level + 1}`}
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {stats.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd data-testid={`profile-${label.toLowerCase().replace(/ /g, '-')}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Badges</h2>
        <BadgeGrid badges={profile.badges} />
      </section>
    </div>
  )
}
