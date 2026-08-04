// visual-knowledge-map (issue #86), SCENARIO 1 — the List/Map toggle.
// Controlled by its parent route (`subject.$subjectId.map.tsx`), which owns
// the actual `useState` and defaults it to 'list' — this keeps the toggle a
// plain, easily-testable presentational component while still letting the
// detail panel's "Manage in list view" link (SCENARIO 5) switch the view
// from a component nested deep inside the Map side. State is component-local
// to the page visit either way: no persisted preference, no URL param
// (spec.md's Decisions #3).
export type DomainMapView = 'list' | 'map'

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
        aria-selected={view === 'map'}
        data-testid="domain-map-view-toggle-graph"
        onClick={() => onChange('map')}
        className={`min-h-11 rounded-md px-3 ${
          view === 'map' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        Map
      </button>
    </div>
  )
}
