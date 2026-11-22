import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { browserTimeZone } from '../shared/browser-time-zone'
import { getOfflineStore } from '../review-offline/default-offline-store'
import { refreshStoredPack } from '../review-offline/review-pack'
import { downloadReviewPack } from '../review-offline/send-queued-grade'
import { getSubjectDaySkips, setSubjectDaySkip } from './subject-day-skips.api'
import type { SubjectDaySkips } from '@post-anki/shared'

export const SUBJECT_DAY_SKIPS_KEY = ['subject-day-skips'] as const

const COUNTS_KEY = ['subjects', 'review-due-counts'] as const
const QUEUE_KEY = ['anki-review-queue'] as const

export function useSubjectDaySkips(): ReadonlySet<string> {
  const query = useQuery({
    queryKey: SUBJECT_DAY_SKIPS_KEY,
    queryFn: () => getSubjectDaySkips({ data: { tz: browserTimeZone() } }),
  })

  return useMemo(() => new Set(query.data?.subjectIds ?? []), [query.data])
}

export function useToggleSubjectDaySkip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { subjectId: string; skipped: boolean }) =>
      setSubjectDaySkip({ data: { ...input, tz: browserTimeZone() } }),
    onMutate: async ({ subjectId, skipped }) => {
      await queryClient.cancelQueries({ queryKey: SUBJECT_DAY_SKIPS_KEY })

      const previous = queryClient.getQueryData<SubjectDaySkips>(SUBJECT_DAY_SKIPS_KEY)
      const ids = new Set(previous?.subjectIds ?? [])

      if (skipped) {
        ids.add(subjectId)
      } else {
        ids.delete(subjectId)
      }

      queryClient.setQueryData<SubjectDaySkips>(SUBJECT_DAY_SKIPS_KEY, {
        dayKey: previous?.dayKey ?? '',
        subjectIds: [...ids],
      })

      return { previous }
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(SUBJECT_DAY_SKIPS_KEY, context?.previous)
    },
    onSuccess: (skips) => {
      queryClient.setQueryData(SUBJECT_DAY_SKIPS_KEY, skips)
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SUBJECT_DAY_SKIPS_KEY }),
        queryClient.invalidateQueries({ queryKey: QUEUE_KEY }),
        queryClient.invalidateQueries({ queryKey: COUNTS_KEY }),
        refreshStoredPack(getOfflineStore(), () => downloadReviewPack(browserTimeZone())),
      ])
    },
  })
}
