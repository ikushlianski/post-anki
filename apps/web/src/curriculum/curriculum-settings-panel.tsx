import { useEffect, useState } from 'react'
import type { DomainNodeTreeItem, ModelTier } from '@post-anki/shared'

import { getDomainMapForSubject } from '../domain-map/domain-map.api'
import {
  findDomainPath,
  flattenDomainOptions,
  hasStaticTaxonomy,
} from '../domain-map/domain-tree'
import { CurriculumPlacementPanel } from '../domain-map/curriculum-placement-panel'
import { CurriculumDomainMappingPanel } from './curriculum-domain-mapping-panel'
import { AdaptiveSettings, adaptiveSettingsSummary } from './adaptive-settings'
import type { Curriculum, CurriculumDomainNodeMapping } from './model'

export function CurriculumSettingsPanel({
  curriculum,
  domainMappings,
  inheritedModelTier,
  showAdaptive,
}: {
  curriculum: Curriculum
  domainMappings: CurriculumDomainNodeMapping[]
  inheritedModelTier: ModelTier
  showAdaptive: boolean
}) {
  const [tree, setTree] = useState<DomainNodeTreeItem[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    getDomainMapForSubject({ data: curriculum.subjectId }).then((result) => {
      if (!cancelled) {
        setTree(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [curriculum.subjectId])

  const placeable = tree !== null && flattenDomainOptions(tree).length > 0
  const mappable = tree !== null && hasStaticTaxonomy(tree)

  if (!placeable && !mappable && !showAdaptive) {
    return null
  }

  const placementPath =
    tree && curriculum.domainNodeId ? findDomainPath(tree, curriculum.domainNodeId) : null
  const summary = [
    placeable ? (placementPath ? placementPath.join(' > ') : 'unplaced') : null,
    showAdaptive ? adaptiveSettingsSummary(curriculum) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (!open) {
    return (
      <button
        type="button"
        data-testid="curriculum-settings-toggle"
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left text-xs text-neutral-400 hover:border-neutral-200 hover:text-neutral-700"
      >
        <span className="shrink-0">⚙ Settings</span>
        <span className="min-w-0 truncate">{summary}</span>
      </button>
    )
  }

  return (
    <div
      data-testid="curriculum-settings-panel"
      className="mb-6 space-y-4 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Settings</h2>
        <button
          type="button"
          data-testid="curriculum-settings-close"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-700"
        >
          Close
        </button>
      </div>

      {placeable && tree ? (
        <CurriculumPlacementPanel
          curriculumId={curriculum.id}
          tree={tree}
          domainNodeId={curriculum.domainNodeId}
        />
      ) : null}

      {mappable && tree ? (
        <CurriculumDomainMappingPanel
          curriculumId={curriculum.id}
          tree={tree}
          initialMappings={domainMappings}
        />
      ) : null}

      {showAdaptive ? (
        <AdaptiveSettings curriculum={curriculum} inheritedModelTier={inheritedModelTier} />
      ) : null}
    </div>
  )
}
