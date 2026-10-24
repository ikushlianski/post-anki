import type { Badge } from '@post-anki/shared'

export function BadgeGrid({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) {
    return <p className="text-sm text-neutral-500">No badges yet.</p>
  }

  return (
    <ul data-testid="badge-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {badges.map((badge) => (
        <li
          key={badge.key}
          data-testid={`badge-${badge.key}`}
          data-unlocked={badge.unlocked}
          className={`rounded-lg border p-3 ${
            badge.unlocked
              ? 'border-indigo-200 bg-indigo-50 text-neutral-900'
              : 'border-neutral-200 bg-neutral-50 text-neutral-400'
          }`}
        >
          <p className="text-sm font-medium">{badge.name}</p>
          <p className="mt-0.5 text-xs">{badge.description}</p>
          <p className="mt-1 text-xs">
            {badge.unlocked
              ? 'Earned'
              : `${Math.min(badge.progress, badge.threshold)} of ${badge.threshold}`}
          </p>
        </li>
      ))}
    </ul>
  )
}
