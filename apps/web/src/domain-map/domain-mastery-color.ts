import type { DomainMasteryStatus } from '@post-anki/core'

// visual-knowledge-map (issue #86), SCENARIO 2 — presentation-only mapping
// from domainMasteryStatus (issue #85's one business-meaningful signal, gap
// vs. progress) plus the raw percent to a Tailwind fill class for the graph
// node. Not a core deriver (spec.md's Decisions #1): this is which shade of
// green to paint, not a business rule — follows domain-map-tree.tsx's own
// existing precedent of inlining Tailwind color classes in the component
// rather than returning colors from packages/core.
//
// The percent === 0 vs. percent > 0 split is a hard boundary, not a smooth
// gradient through zero — reuses the SAME rose family the existing list
// view's gap badge already uses (domain-map-tree.tsx), so "gap" reads
// identically in both views.
const GAP_CLASS = 'bg-red-50 text-red-700 border-red-300'

// Five discrete steps on a green gradient, palest at just-above-0% to
// solid/darkest at 100%, so a fully-mastered node and a barely-started node
// both read as clearly "progress" (never confused with a gap) while still
// being visually distinct from each other.
const PROGRESS_CLASSES = [
  'bg-emerald-50 text-emerald-800 border-emerald-200',
  'bg-emerald-200 text-emerald-900 border-emerald-400',
  'bg-emerald-400 text-emerald-950 border-emerald-600',
  'bg-emerald-500 text-white border-emerald-700',
  'bg-emerald-700 text-white border-emerald-900',
] as const

export function domainMasteryColor(status: DomainMasteryStatus, percent: number): string {
  if (status === 'gap' || percent <= 0) {
    return GAP_CLASS
  }

  if (percent <= 25) {
    return PROGRESS_CLASSES[0]
  }

  if (percent <= 50) {
    return PROGRESS_CLASSES[1]
  }

  if (percent <= 75) {
    return PROGRESS_CLASSES[2]
  }

  if (percent < 100) {
    return PROGRESS_CLASSES[3]
  }

  return PROGRESS_CLASSES[4]
}
