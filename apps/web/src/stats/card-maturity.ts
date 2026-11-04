import type { KnowledgeBitBrowserSubjectCounts } from '@post-anki/shared'

export interface CardMaturity {
  total: number
  mature: number
  learning: number
  new: number
}

export function cardMaturityOf(counts: KnowledgeBitBrowserSubjectCounts): CardMaturity {
  return counts.reduce<CardMaturity>(
    (sum, row) => ({
      total: sum.total + row.count,
      mature: sum.mature + row.matureCount,
      learning: sum.learning + row.learningCount,
      new: sum.new + row.newCount,
    }),
    { total: 0, mature: 0, learning: 0, new: 0 },
  )
}

export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}
