import { Link } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'
import { domainMasteryStatus, domainPriorityDistance } from '@post-anki/core'

// visual-knowledge-map (issue #86), SCENARIO 5 — a read-only detail panel:
// name, description, exact percent, the same gap/superseded/priority-
// distance badges as the existing list view (same underlying data, no new
// backend field), curricula as links, and a "Manage in list view" escape
// hatch. Deliberately no action forms (spec.md's Decisions #2) — those stay
// exclusively in DomainMapTree, reached via "Manage in list view."
export function DomainMapGraphDetailPanel({
  node,
  onClose,
  onManageInListView,
}: {
  node: DomainNodeTreeItem
  onClose: () => void
  onManageInListView: () => void
}) {
  const status = domainMasteryStatus(node.percent)
  const priorityDistance = domainPriorityDistance(node.targetDepth, node.percent)

  return (
    <div
      data-testid="domain-map-graph-detail-panel"
      className="fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto rounded-t-lg border-t border-neutral-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-80 sm:rounded-lg sm:border"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{node.name}</h2>
        <button
          type="button"
          data-testid="domain-map-graph-detail-panel-close"
          onClick={onClose}
          className="min-h-11 min-w-11 text-xs text-neutral-500 hover:text-neutral-900"
        >
          Close
        </button>
      </div>

      {node.description ? (
        <p className="mt-1 text-xs text-neutral-500">{node.description}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="badge-neutral">
          {node.percent}%
        </span>
        {status === 'gap' ? (
          <span
            data-testid="domain-map-graph-detail-panel-gap-badge"
            className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700"
          >
            0% — gap
          </span>
        ) : null}
        {node.supersededAt ? (
          <span
            data-testid="domain-map-graph-detail-panel-superseded-badge"
            title={node.supersededReason ?? undefined}
            className="badge-amber"
          >
            possibly outdated
          </span>
        ) : null}
        {priorityDistance !== null ? (
          <span
            data-testid="domain-map-graph-detail-panel-priority-distance"
            className="badge-amber"
          >
            {priorityDistance} to target
          </span>
        ) : null}
      </div>

      {node.curricula.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {node.curricula.map((curriculum) => (
            <li key={curriculum.id}>
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: curriculum.id }}
                data-testid={`domain-map-graph-detail-panel-curriculum-${curriculum.id}`}
                className="text-sm text-neutral-700 hover:underline"
              >
                {curriculum.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-neutral-400">No curricula attached yet.</p>
      )}

      <button
        type="button"
        data-testid="domain-map-graph-detail-panel-manage-in-list"
        onClick={onManageInListView}
        className="mt-4 min-h-11 text-xs text-neutral-500 underline hover:text-neutral-900"
      >
        Manage in list view
      </button>
    </div>
  )
}
