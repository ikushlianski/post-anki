import { useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'

import { curriculaCollection, mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import type { Subject } from '../curriculum/model'

export function useLiveSubjects(): Subject[] | null {
  const query = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const rows = query.status === 'ready' ? query.data : undefined

  return useMemo(() => (rows ? rows.map(mapSubjectRow) : null), [rows])
}

export function useLiveCurriculumCount(subjectId: string): number | null {
  const query = useLiveQuery((q) => q.from({ curriculum: curriculaCollection }), [])

  if (query.status !== 'ready' || !query.data) {
    return null
  }

  return query.data.filter((row) => row.subject_id === subjectId).length
}
