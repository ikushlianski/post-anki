import type { KnowledgeBitOverviewItem } from '@post-anki/shared'

export function overviewItem(
  index: number,
  overrides: Partial<KnowledgeBitOverviewItem> = {},
): KnowledgeBitOverviewItem {
  return {
    knowledgeBitId: `bit-${index}`,
    question: `Question ${index}?`,
    answer: `Answer ${index}`,
    subjectId: 'subject-net',
    state: 'review',
    dueAt: '2026-10-20T00:00:00.000Z',
    lapses: 0,
    sourceLinks: [],
    ...overrides,
  }
}

export const overviewSubjects = [
  { id: 'subject-cs', name: 'Computer science', parentId: null },
  { id: 'subject-net', name: 'Networking', parentId: 'subject-cs' },
]
