import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { changeCurriculumPlacement } from './domain-map.api'
import { findDomainPath, flattenDomainOptions } from './domain-tree'
import { SearchableSelect } from '../ui/searchable-select'

// Renders inside the curriculum detail page's settings disclosure. The
// subject's domain tree is fetched once by that parent and handed down, so a
// subject with no tree never reaches this panel at all.
export function CurriculumPlacementPanel({
  curriculumId,
  tree,
  domainNodeId,
}: {
  curriculumId: string
  tree: DomainNodeTreeItem[]
  domainNodeId: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>(domainNodeId ?? '')
  const [busy, setBusy] = useState(false)
  // Seeded from the mutation's own response rather than relying solely on
  // router.invalidate() re-fetching the parent route's query in time.
  const [committedDomainNodeId, setCommittedDomainNodeId] = useState<string | null>(domainNodeId)

  useEffect(() => {
    setSelected(domainNodeId ?? '')
    setCommittedDomainNodeId(domainNodeId)
  }, [domainNodeId])

  const options = flattenDomainOptions(tree)

  if (options.length === 0) {
    return null
  }

  const path = committedDomainNodeId ? findDomainPath(tree, committedDomainNodeId) : null

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
    <div className="text-sm">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Placement
      </p>
      <p data-testid="curriculum-placement" className="text-xs text-neutral-500">
        {path ? `Placed under ${path.join(' > ')}` : 'Not placed in the domain map yet'}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <SearchableSelect
          ariaLabel="Placement in the domain map"
          testId="change-placement-select"
          options={options.map((option) => ({
            id: option.id,
            label: `${'— '.repeat(option.depth)}${option.label}`,
          }))}
          value={selected}
          onChange={setSelected}
          clearable
          placeholder="— unplaced —"
          className="w-full min-w-48 cursor-pointer rounded-md border border-neutral-300 bg-white py-1 pl-2 pr-8 text-xs"
        />
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
