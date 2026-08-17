import type { StudyMaterial } from '@post-anki/shared'

export function hasGeneratingMaterial(materials: StudyMaterial[]): boolean {
  return materials.some((material) => material.status === 'generating')
}

export function kindLabel(kind: StudyMaterial['kind']): string {
  return kind === 'worked_example' ? 'Worked example' : 'Analogy'
}
