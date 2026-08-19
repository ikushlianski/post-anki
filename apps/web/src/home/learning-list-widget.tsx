import { Link } from '@tanstack/react-router'

import type { LearningListItem } from '@post-anki/shared'

const UNRESOLVED_STATUSES: LearningListItem['status'][] = [
  'captured',
  'classifying',
  'classified',
]

const MAX_ITEMS = 5

export interface LearningListWidgetProps {
  items: LearningListItem[]
}

export function LearningListWidget({ items }: LearningListWidgetProps) {
  const unresolvedCount = items.filter((item) =>
    UNRESOLVED_STATUSES.includes(item.status),
  ).length

  const recentItems = [...items]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_ITEMS)

  return (
    <div
      data-testid="learning-list-widget"
      className="rounded-lg border border-neutral-200 bg-white p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-700">Learning list</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {unresolvedCount === 0
              ? 'Nothing waiting on you.'
              : `${unresolvedCount} item${unresolvedCount === 1 ? '' : 's'} still need a decision`}
          </p>
        </div>
        <Link
          to="/learning-list"
          data-testid="learning-list-widget-view-all"
          className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-900"
        >
          View all →
        </Link>
      </div>

      {recentItems.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Nothing captured yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {recentItems.map((item) => (
            <li
              key={item.id}
              data-testid="learning-list-widget-item"
              className="truncate rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
            >
              {item.title ?? item.url ?? 'Untitled capture'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
