import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'

import { getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { browserTimeZone } from '../shared/browser-time-zone'

export type SubjectTodayCounts =
  | { status: 'ready'; byId: ReadonlyMap<string, number> }
  | { status: 'unavailable' }

export function useSubjectTodayCounts(): SubjectTodayCounts {
  const query = useQuery({
    queryKey: ['subjects', 'review-due-counts', 'today'],
    queryFn: () => getSubjectReviewDueCounts({ data: { tz: browserTimeZone() } }),
  })

  return useMemo(() => {
    if (!query.data) {
      return { status: 'unavailable' }
    }

    const byId = new Map(query.data.subjects.map((row) => [row.subjectId, row.todayCount ?? 0]))

    byId.set(KNOWLEDGE_BIT_BROWSER_NO_SUBJECT, query.data.unsorted.todayCount ?? 0)

    return { status: 'ready', byId }
  }, [query.data])
}
