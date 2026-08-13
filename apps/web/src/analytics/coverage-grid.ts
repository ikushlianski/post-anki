import type { CoverageArea } from '@post-anki/shared'

export interface CoverageGrid {
  subjectNames: string[]
  areaNames: string[]
  cellsBySubjectAndArea: Record<string, Record<string, CoverageArea>>
}

export function buildCoverageGrid(areas: CoverageArea[]): CoverageGrid {
  const subjectNames = [...new Set(areas.map((area) => area.subjectName))].sort()
  const areaNames = [...new Set(areas.map((area) => area.name))].sort()
  const cellsBySubjectAndArea: Record<string, Record<string, CoverageArea>> = {}

  for (const area of areas) {
    cellsBySubjectAndArea[area.subjectName] ??= {}
    cellsBySubjectAndArea[area.subjectName][area.name] = area
  }

  return { subjectNames, areaNames, cellsBySubjectAndArea }
}
