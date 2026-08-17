import { Link } from '@tanstack/react-router'

import type { WeeklyDigest } from '@post-anki/shared'

import { CONCERN_LABEL } from '../curriculum/concern-labels'
import { averageCoveragePercent, formatRetention, formatTimeToMastery } from './digest-format'
import { DigestStatTile } from './digest-stat-tile'

export interface WeeklyDigestPanelProps {
  digest: WeeklyDigest
}

export function WeeklyDigestPanel({ digest }: WeeklyDigestPanelProps) {
  const openConcerns = digest.concerns.filter((concern) => concern.open > 0)
  const avgCoverage = averageCoveragePercent(digest.coverage)

  return (
    <div data-testid="weekly-digest-panel" className="space-y-4">
      <p className="text-xs text-neutral-400">
        Trailing {digest.windowDays} days — a snapshot, opened only when you look. Nothing
        here is pushed or emailed.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DigestStatTile label="Time to mastery" value={formatTimeToMastery(digest.timeToMastery)} />
        <DigestStatTile label="Retention" value={formatRetention(digest.retention)} />
        <DigestStatTile
          label="Coverage"
          value={avgCoverage === null ? 'No Areas yet' : `${avgCoverage}% avg`}
        />
        <DigestStatTile
          label="Streak"
          value={`${digest.streak.currentStreak} day${digest.streak.currentStreak === 1 ? '' : 's'}`}
        />
      </div>

      <div data-testid="weekly-digest-concerns">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
          Open concerns
        </p>
        {openConcerns.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing open right now.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {openConcerns.map((concern) => (
              <li
                key={concern.concern}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {CONCERN_LABEL[concern.concern]} · {concern.open} open
              </li>
            ))}
          </ul>
        )}
        <Link to="/concerns" className="mt-2 inline-block text-xs text-neutral-500 hover:text-neutral-900">
          See all concerns →
        </Link>
      </div>
    </div>
  )
}
