import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { mergeDomainNodes } from './domain-map.api'

// domain-node-merge (issue #61) — same confirm-arm interaction as
// MergeSubjectButton (apps/web/src/subject/subject-section.tsx). The picker
// offers every OTHER node in the subject's tree, not just siblings — a
// near-duplicate can live in a completely different branch (the issue's own
// "Server Components" vs. "React Server Components" example) — flattened
// from the already-loaded root tree, labeled with its full path so two
// identically-named nodes in different branches stay distinguishable. The
// node itself and its own entire subtree are excluded client-side (defense
// in depth — the server's own `cycle` check is the real backstop).
interface FlatOption {
  id: string
  label: string
}

function collectSubtreeIds(node: DomainNodeTreeItem, out: Set<string>): void {
  out.add(node.id)

  for (const child of node.children) {
    collectSubtreeIds(child, out)
  }
}

function flattenWithPaths(
  nodes: DomainNodeTreeItem[],
  pathPrefix: string[],
  out: FlatOption[],
): void {
  for (const node of nodes) {
    const path = [...pathPrefix, node.name]
    out.push({ id: node.id, label: path.join(' > ') })
    flattenWithPaths(node.children, path, out)
  }
}

export function MergeDomainNodeButton({
  node,
  allNodes,
}: {
  node: DomainNodeTreeItem
  allNodes: DomainNodeTreeItem[]
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [targetNodeId, setTargetNodeId] = useState('')

  const excludedIds = new Set<string>()
  collectSubtreeIds(node, excludedIds)

  const options: FlatOption[] = []
  flattenWithPaths(allNodes, [], options)
  const validOptions = options.filter((option) => !excludedIds.has(option.id))

  async function confirm() {
    if (!targetNodeId) {
      return
    }

    setBusy(true)
    await mergeDomainNodes({ data: { targetDomainNodeId: targetNodeId, sourceDomainNodeId: node.id } })
    setBusy(false)
    await router.invalidate()
  }

  if (!armed) {
    return (
      <button
        type="button"
        data-testid={`domain-map-node-merge-button-${node.id}`}
        onClick={() => setArmed(true)}
        className="shrink-0 text-xs text-neutral-400 hover:text-indigo-600"
      >
        Merge into…
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <select
        data-testid={`domain-map-node-merge-target-select-${node.id}`}
        value={targetNodeId}
        onChange={(event) => setTargetNodeId(event.target.value)}
        className="rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs"
      >
        <option value="">select target…</option>
        {validOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || !targetNodeId}
        data-testid={`domain-map-node-merge-confirm-${node.id}`}
        onClick={confirm}
        className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        type="button"
        data-testid={`domain-map-node-merge-cancel-${node.id}`}
        onClick={() => setArmed(false)}
        className="text-neutral-400 hover:text-neutral-700"
      >
        cancel
      </button>
    </span>
  )
}
