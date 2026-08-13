import type { StudyMaterial } from '@post-anki/shared'

import { StudyMaterialItem } from './study-material-item'

export function StudyMaterialHistory({ materials }: { materials: StudyMaterial[] }) {
  if (materials.length === 0) {
    return (
      <p
        data-testid="study-material-empty"
        className="rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-center text-sm text-neutral-500"
      >
        Nothing generated for this topic yet. Ask for one below.
      </p>
    )
  }

  return (
    <ul data-testid="study-material-history" className="space-y-3">
      {materials.map((material) => (
        <StudyMaterialItem key={material.id} material={material} />
      ))}
    </ul>
  )
}
