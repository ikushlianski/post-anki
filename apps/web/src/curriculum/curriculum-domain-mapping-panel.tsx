import { useEffect, useState } from 'react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { getDomainMapForSubject } from '../domain-map/domain-map.api'
import { resolveDomainMapping, triggerDomainMapping } from './curriculum-domain-mapping.api'
import type { CurriculumDomainNodeMapping, Depth } from './model'

const DEPTHS: Depth[] = ['aware', 'working', 'deep']

const DEPTH_LABEL: Record<Depth, string> = {
  aware: 'Awareness',
  working: 'Working',
  deep: 'Deep',
}

function hasStaticTaxonomy(nodes: DomainNodeTreeItem[]): boolean {
  return nodes.some((node) => node.source === 'static_taxonomy' || hasStaticTaxonomy(node.children))
}

function flattenNodeNames(nodes: DomainNodeTreeItem[]): Record<string, string> {
  const names: Record<string, string> = {}

  for (const node of nodes) {
    names[node.id] = node.name
    Object.assign(names, flattenNodeNames(node.children))
  }

  return names
}

// decouple-curricula-from-domain-nodes (issue #84), SCENARIOS 1-4, 6, 11,
// 12. Renders on the curriculum detail page — only once we've confirmed the
// curriculum's own subject has a static taxonomy to map into (a subject
// with none has nothing this trigger could ever produce). Mirrors
// priority-review-panel.tsx's trigger/list/accept/reject shape, adding a
// per-suggestion depth-select (SCENARIO 4 — the value picked, not the AI's
// original suggestion, is what gets written on accept).
export function CurriculumDomainMappingPanel({
  curriculumId,
  subjectId,
  initialMappings,
}: {
  curriculumId: string
  subjectId: string
  initialMappings: CurriculumDomainNodeMapping[]
}) {
  const [taxonomyBacked, setTaxonomyBacked] = useState<boolean | null>(null)
  const [nodeNamesById, setNodeNamesById] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState(
    initialMappings.filter((mapping) => mapping.status === 'suggested'),
  )
  const [selectedDepth, setSelectedDepth] = useState<Record<string, Depth>>(() =>
    Object.fromEntries(
      initialMappings
        .filter((mapping) => mapping.status === 'suggested')
        .map((mapping) => [mapping.id, mapping.depth ?? 'working']),
    ),
  )
  const [triggering, setTriggering] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [resolvingIds, setResolvingIds] = useState<readonly string[]>([])
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getDomainMapForSubject({ data: subjectId }).then((tree) => {
      if (cancelled) {
        return
      }

      setTaxonomyBacked(hasStaticTaxonomy(tree))
      setNodeNamesById(flattenNodeNames(tree))
    })

    return () => {
      cancelled = true
    }
  }, [subjectId])

  if (taxonomyBacked !== true) {
    return null
  }

  async function trigger() {
    if (triggering) {
      return
    }

    setTriggering(true)
    setTriggerError(null)

    try {
      const fresh = await triggerDomainMapping({ data: curriculumId })

      setSuggestions((previous) => [...fresh, ...previous])
      setSelectedDepth((previous) => ({
        ...previous,
        ...Object.fromEntries(fresh.map((mapping) => [mapping.id, mapping.depth ?? 'working'])),
      }))
    } catch {
      setTriggerError('Mapping could not be completed — try again.')
    } finally {
      setTriggering(false)
    }
  }

  async function resolve(mapping: CurriculumDomainNodeMapping, decision: 'accept' | 'reject') {
    if (resolvingIds.includes(mapping.id)) {
      return
    }

    setResolvingIds((previous) => [...previous, mapping.id])

    try {
      await resolveDomainMapping({
        data: {
          mappingId: mapping.id,
          status: decision === 'accept' ? 'confirmed' : 'rejected',
          depth: decision === 'accept' ? selectedDepth[mapping.id] : undefined,
        },
      })

      setSuggestions((previous) => previous.filter((item) => item.id !== mapping.id))

      if (decision === 'accept') {
        const nodeName = nodeNamesById[mapping.domainNodeId] ?? mapping.domainNodeId
        setConfirmation(`Placed under ${nodeName}`)
        setTimeout(() => setConfirmation(null), 4000)
      }
    } catch {
      // Left in the list so the decision can be retried.
    } finally {
      setResolvingIds((previous) => previous.filter((id) => id !== mapping.id))
    }
  }

  return (
    <section data-testid="curriculum-domain-mapping-panel" className="mb-6 space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="trigger-domain-mapping"
          disabled={triggering}
          onClick={trigger}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {triggering ? 'Mapping…' : 'Map to taxonomy'}
        </button>
        {confirmation ? <span className="text-sm text-emerald-700">{confirmation}</span> : null}
      </div>

      {triggerError ? (
        <p data-testid="domain-mapping-trigger-error" className="text-sm text-red-600">
          {triggerError}
        </p>
      ) : null}

      {suggestions.length > 0 ? (
        <ul className="space-y-2">
          {suggestions.map((mapping) => (
            <li
              key={mapping.id}
              data-testid={`domain-mapping-suggestion-${mapping.id}`}
              className="rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {nodeNamesById[mapping.domainNodeId] ?? mapping.domainNodeId}
                </span>
                <select
                  data-testid={`domain-mapping-suggestion-depth-${mapping.id}`}
                  value={selectedDepth[mapping.id] ?? 'working'}
                  onChange={(event) =>
                    setSelectedDepth((previous) => ({
                      ...previous,
                      [mapping.id]: event.target.value as Depth,
                    }))
                  }
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                >
                  {DEPTHS.map((depth) => (
                    <option key={depth} value={depth}>
                      {DEPTH_LABEL[depth]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  data-testid={`domain-mapping-suggestion-accept-${mapping.id}`}
                  disabled={resolvingIds.includes(mapping.id)}
                  onClick={() => resolve(mapping, 'accept')}
                  className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`domain-mapping-suggestion-reject-${mapping.id}`}
                  disabled={resolvingIds.includes(mapping.id)}
                  onClick={() => resolve(mapping, 'reject')}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
