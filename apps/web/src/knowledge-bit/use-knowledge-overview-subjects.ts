import { useLiveQuery } from '@tanstack/react-db'
import { buildSubjectPathLabel } from '@post-anki/core'

import { mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import type { SearchableOption } from '../ui/searchable-select'

export function useKnowledgeOverviewSubjects() {
  const query = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const subjects = (query.data ?? []).map(mapSubjectRow)
  const options: SearchableOption[] = subjects
    .map((subject) => ({ id: subject.id, label: buildSubjectPathLabel(subject.id, subjects) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  function labelFor(subjectId: string | null): string {
    return options.find((option) => option.id === subjectId)?.label ?? ''
  }

  return { options, labelFor }
}
