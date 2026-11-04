import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { listSubjectCardCounts } from '../subject/subject.api'

export function useSubjectCardCounts(): ReadonlyMap<string, number> {
  const query = useQuery({
    queryKey: ['subjects', 'card-counts'],
    queryFn: () => listSubjectCardCounts(),
  })

  return useMemo(
    () => new Map((query.data ?? []).map((row) => [row.subjectId, row.cardCount])),
    [query.data],
  )
}
