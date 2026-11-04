import type { SubjectReviewDueCounts } from '@post-anki/shared'

export interface BusiestSubject {
  subjectId: string
  name: string
  dueCount: number
  newCount: number
}

export const BUSIEST_SUBJECTS_LIMIT = 6

export function selectBusiestSubjects(
  subjects: ReadonlyArray<{ id: string; name: string; parentId?: string | null }>,
  counts: SubjectReviewDueCounts,
  limit: number = BUSIEST_SUBJECTS_LIMIT,
): BusiestSubject[] {
  const countsById = new Map(counts.subjects.map((row) => [row.subjectId, row]))

  return subjects
    .filter((subject) => !subject.parentId)
    .flatMap((subject) => {
      const row = countsById.get(subject.id)

      return row && row.dueCount > 0
        ? [{ subjectId: subject.id, name: subject.name, dueCount: row.dueCount, newCount: row.newCount }]
        : []
    })
    .sort((a, b) => b.dueCount - a.dueCount || a.name.localeCompare(b.name))
    .slice(0, limit)
}
