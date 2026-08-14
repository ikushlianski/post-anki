// visual-knowledge-map (issue #86), SCENARIO 1 — the List/Tree/Mind-map
// toggle. Controlled by its parent route (`subject.$subjectId.map.tsx`),
// which owns the actual `useState` and defaults it to 'list' — this keeps
// the toggle a plain, easily-testable presentational component while still
// letting the detail panel's "Manage in list view" link (SCENARIO 5) switch
// the view from a component nested deep inside a graphical mode. State is
// component-local to the page visit either way: no persisted preference, no
// URL param (spec.md's Decisions #3).
//
// #86 widened (mind-map/tree-hierarchy dual view) — widens from the
// original two-state 'list' | 'map' union to three states, splitting the
// single graphical "Map" option into distinct Tree (the pre-existing
// top-down layout) and Mind-map (new radial layout) tabs.
export type DomainMapView = 'list' | 'tree' | 'mindmap'

export function DomainMapViewToggle({
  view,
  onChange,
}: {
  view: DomainMapView
  onChange: (view: DomainMapView) => void
}) {
  return (
    <div
      data-testid="domain-map-view-toggle"
      role="tablist"
      className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-white p-1 text-sm"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        data-testid="domain-map-view-toggle-list"
        onClick={() => onChange('list')}
        className={`min-h-11 rounded-md px-3 ${
          view === 'list' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        List
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'tree'}
        data-testid="domain-map-view-toggle-tree"
        onClick={() => onChange('tree')}
        className={`min-h-11 rounded-md px-3 ${
          view === 'tree' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        Tree
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'mindmap'}
        data-testid="domain-map-view-toggle-mindmap"
        onClick={() => onChange('mindmap')}
        className={`min-h-11 rounded-md px-3 ${
          view === 'mindmap' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        Mind-map
      </button>
    </div>
  )
}
