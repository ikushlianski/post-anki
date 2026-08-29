import { useState } from 'react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { flattenDomainNodeNames } from '../domain-map/domain-tree'
import { resolveDomainMapping, triggerDomainMapping } from './curriculum-domain-mapping.api'
import type { CurriculumDomainNodeMapping, Depth } from './model'

const DEPTHS: Depth[] = ['aware', 'working', 'deep']

const DEPTH_LABEL: Record<Depth, string> = {
  aware: 'Awareness',
  working: 'Working',
  deep: 'Deep',
}

// decouple-curricula-from-domain-nodes (issue #84), SCENARIOS 1-4, 6, 11,
// 12. Renders inside the curriculum detail page's settings disclosure, which
// only mounts it once the subject's tree is known to carry a static taxonomy.
export function CurriculumDomainMappingPanel({
  curriculumId,
  tree,
  initialMappings,
}: {
  curriculumId: string
  tree: DomainNodeTreeItem[]
  initialMappings: CurriculumDomainNodeMapping[]
}) {
  const nodeNamesById = flattenDomainNodeNames(tree)
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
    <section data-testid="curriculum-domain-mapping-panel" className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        Taxonomy mapping
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="trigger-domain-mapping"
          disabled={triggering}
          onClick={trigger}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          {triggering ? 'Mapping…' : 'Map to taxonomy'}
        </button>
        {confirmation ? <span className="text-xs text-emerald-700">{confirmation}</span> : null}
      </div>

      {triggerError ? (
        <p data-testid="domain-mapping-trigger-error" className="text-xs text-red-600">
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
