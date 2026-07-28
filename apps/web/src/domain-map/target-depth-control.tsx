import { useState } from 'react'
import type { DepthLevel } from '@post-anki/shared'

import { setDomainNodeTargetDepth } from './domain-map.api'

// domain-priority-review (issue #52), SCENARIO 3. Deliberately NOT
// apps/web/src/curriculum/depth-slider.tsx reused as-is — that component is
// typed against a web-local depthSchema = ['aware','working','deep'], a
// different enum from @post-anki/shared's depthLevelSchema =
// ['awareness','working','deep'] the domain-map API actually returns (see
// spec.md's Decisions #13). A single click sets the value (no confirmation
// modal — low-stakes, instantly reversible, same posture as DepthSlider).
// On success, the badge/control re-render straight from the mutation
// response — no toast, no full page re-fetch. On failure, the control
// reverts and a small inline error message appears next to it.

const DEPTHS: DepthLevel[] = ['awareness', 'working', 'deep']

const DEPTH_LABEL: Record<DepthLevel, string> = {
  awareness: 'Awareness',
  working: 'Working',
  deep: 'Deep',
}

export function TargetDepthControl({
  nodeId,
  targetDepth,
  onChanged,
}: {
  nodeId: string
  targetDepth: DepthLevel | null
  onChanged: (targetDepth: DepthLevel | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function select(depth: DepthLevel) {
    if (busy) {
      return
    }

    const previous = targetDepth
    setBusy(true)
    setError(null)

    try {
      const updated = await setDomainNodeTargetDepth({ data: { nodeId, targetDepth: depth } })
      onChanged(updated.targetDepth)
    } catch {
      onChanged(previous)
      setError('Could not save — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid={`domain-map-node-target-depth-${nodeId}`} className="flex items-center gap-1">
      {DEPTHS.map((depth) => (
        <button
          key={depth}
          type="button"
          disabled={busy}
          data-testid={`domain-map-node-target-depth-option-${nodeId}-${depth}`}
          onClick={() => select(depth)}
          className={
            targetDepth === depth
              ? 'rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white'
              : 'rounded-full px-2 py-0.5 text-[11px] text-neutral-400 hover:text-neutral-700 disabled:opacity-50'
          }
        >
          {DEPTH_LABEL[depth]}
        </button>
      ))}
      {error ? (
        <span className="text-[11px] text-red-600" data-testid={`domain-map-node-target-depth-error-${nodeId}`}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
