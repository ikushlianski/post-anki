import { Link } from '@tanstack/react-router'

import type { LearningPath } from '@post-anki/shared'

import { pathStatusLabel } from './path-status-label'

export interface LearningPathListProps {
  paths: LearningPath[]
}

export function LearningPathList({ paths }: LearningPathListProps) {
  if (paths.length === 0) {
    return (
      <p
        data-testid="learning-path-list-empty"
        className="card-empty"
      >
        You haven't started a learning path yet.
      </p>
    )
  }

  return (
    <ul data-testid="learning-path-list" className="space-y-3">
      {paths.map((path) => (
        <li key={path.id} data-testid="learning-path-list-item">
          <Link
            to="/learning-paths/$pathId"
            params={{ pathId: path.id }}
            className="block rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-400"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-neutral-900">{path.name}</h3>
              <span className="badge-neutral text-[11px]">
                {pathStatusLabel(path.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">{path.targetRoleLabel}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
