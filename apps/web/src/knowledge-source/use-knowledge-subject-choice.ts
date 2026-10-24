import { useState } from 'react'
import { buildSubjectPathLabel, collectSubjectSubtreeIds } from '@post-anki/core'
import type { SubjectHierarchyRow } from '@post-anki/core'

import type { SubjectComboboxOption } from '../ui/subject-combobox'

export interface KnowledgeSubjectChoice {
  options: SubjectComboboxOption[]
  selectedSubjectId: string
  selectedLabel: string | undefined
  parentHintName: string | null
  allowParents: boolean
  setAllowParents: (allow: boolean) => void
  chooseSubject: (subjectId: string) => void
}

export function useKnowledgeSubjectChoice(
  subjects: SubjectHierarchyRow[],
  initialSubjectId?: string,
): KnowledgeSubjectChoice {
  const [allowParents, setAllowParents] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)

  const existingIds = new Set(subjects.map((subject) => subject.id))
  const parentIds = new Set(
    subjects
      .filter((subject) => subject.parentId !== null && subject.parentId !== subject.id)
      .map((subject) => subject.parentId)
      .filter((parentId): parentId is string => parentId !== null && existingIds.has(parentId)),
  )
  const initialIsParent = initialSubjectId !== undefined && parentIds.has(initialSubjectId)
  const preferredIds = new Set(
    initialIsParent && initialSubjectId !== undefined
      ? collectSubjectSubtreeIds(initialSubjectId, subjects).filter((id) => !parentIds.has(id))
      : [],
  )

  const options = subjects
    .filter((subject) => allowParents || !parentIds.has(subject.id))
    .map((subject) => ({ id: subject.id, label: buildSubjectPathLabel(subject.id, subjects) }))
    .sort(
      (a, b) =>
        Number(preferredIds.has(b.id)) - Number(preferredIds.has(a.id)) || a.label.localeCompare(b.label),
    )

  const candidate = chosen ?? (initialSubjectId !== undefined && !initialIsParent ? initialSubjectId : '')
  const selectedSubjectId = options.some((option) => option.id === candidate) ? candidate : ''
  const selectedLabel = options.find((option) => option.id === selectedSubjectId)?.label
  const parentHintName =
    initialIsParent && selectedSubjectId === ''
      ? (subjects.find((subject) => subject.id === initialSubjectId)?.name ?? null)
      : null

  return {
    options,
    selectedSubjectId,
    selectedLabel,
    parentHintName,
    allowParents,
    setAllowParents,
    chooseSubject: setChosen,
  }
}
