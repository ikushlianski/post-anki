import { useQuery } from '@tanstack/react-query'

import { getSubjectStudyOptions } from './subject-study-options.api'

const STALE_MS = 30_000

export function useSubjectHinting(subjectId: string | null): boolean {
  const query = useQuery({
    queryKey: ['subject-study-options', subjectId],
    queryFn: () => getSubjectStudyOptions({ data: subjectId ?? '' }),
    enabled: subjectId !== null,
    staleTime: STALE_MS,
  })

  return query.data?.own.hintingEnabled ?? true
}
