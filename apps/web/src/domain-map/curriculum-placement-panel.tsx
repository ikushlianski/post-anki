import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { changeCurriculumPlacement, getDomainMapForSubject } from './domain-map.api'

interface FlatOption {
  id: string
  label: string
  depth: number
}

function flatten(nodes: DomainNodeTreeItem[], depth = 0): FlatOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.name, depth },
    ...flatten(node.children, depth + 1),
  ])
}

function findPath(
  nodes: DomainNodeTreeItem[],
  nodeId: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const nextTrail = [...trail, node.name]

    if (node.id === nodeId) {
      return nextTrail
    }

    const found = findPath(node.children, nodeId, nextTrail)

    if (found) {
      return found
    }
  }

  return null
}

// Renders on the curriculum's own detail page (SCENARIO 5's "the created
// curriculum's own page/settings shows curriculum-placement text plus a
// change-placement-select control", SCENARIO 9's re-pointing UI). Only
// renders once the subject's domain map has at least one node — a subject
// with no tree at all (the other 7 non-gated subjects) has nothing to place
// into, matching this plan's cost-gating story on the read side too.
export function CurriculumPlacementPanel({
  curriculumId,
  subjectId,
  domainNodeId,
}: {
  curriculumId: string
  subjectId: string
  domainNodeId: string | null
}) {
  const router = useRouter()
  const [tree, setTree] = useState<DomainNodeTreeItem[] | null>(null)
  const [selected, setSelected] = useState<string>(domainNodeId ?? '')
  const [busy, setBusy] = useState(false)
  // Seeded from the mutation's own response rather than relying solely on
  // router.invalidate() re-fetching the parent route's query in time — same
  // "use the mutation response directly, treat invalidation as a live-update
  // layer on top" fix shape as batch-practice-electric-fallback used
  // elsewhere in this app for the identical class of race.
  const [committedDomainNodeId, setCommittedDomainNodeId] = useState<string | null>(domainNodeId)

  useEffect(() => {
    let cancelled = false

    getDomainMapForSubject({ data: subjectId }).then((result) => {
      if (!cancelled) {
        setTree(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [subjectId])

  useEffect(() => {
    setSelected(domainNodeId ?? '')
    setCommittedDomainNodeId(domainNodeId)
  }, [domainNodeId])

  if (tree === null) {
    return null
  }

  const options = flatten(tree)

  if (options.length === 0) {
    return null
  }

  const path = committedDomainNodeId ? findPath(tree, committedDomainNodeId) : null

  async function submit() {
    setBusy(true)
    const updated = await changeCurriculumPlacement({
      data: { curriculumId, domainNodeId: selected === '' ? null : selected },
    })
    setCommittedDomainNodeId(updated.domainNodeId)
    setBusy(false)
    await router.invalidate()
  }

  return (
    <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
      <p data-testid="curriculum-placement" className="text-neutral-600">
        {path ? `Placed under ${path.join(' > ')}` : 'Not placed in the domain map yet'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <select
          data-testid="change-placement-select"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">— unplaced —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {'— '.repeat(option.depth)}
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="change-placement-submit"
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Change placement
        </button>
      </div>
    </div>
  )
}
