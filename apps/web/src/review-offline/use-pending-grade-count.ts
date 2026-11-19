import { useEffect, useState } from 'react'

import { getOfflineStore } from './default-offline-store'
import { flightFor } from './offline-flight'
import { onQueuedGradesChanged } from './offline-grade-queue'
import { isParkedGrade, type OfflineReviewStore } from './offline-review-types'

export interface PendingGradeCounts {
  waiting: number
  failed: number
  memoryOnly: boolean
}

const NONE: PendingGradeCounts = { waiting: 0, failed: 0, memoryOnly: false }

export function usePendingGradeCount(store: OfflineReviewStore = getOfflineStore()): PendingGradeCounts {
  const [counts, setCounts] = useState(NONE)

  useEffect(() => {
    let active = true
    const refresh = () => {
      void store
        .listGrades()
        .then((grades) => {
          const failed = grades.filter(isParkedGrade).length

          if (active) {
            setCounts({ waiting: grades.length - failed, failed, memoryOnly: flightFor(store).memoryOnly })
          }
        })
        .catch(() => undefined)
    }

    refresh()

    const stop = onQueuedGradesChanged(refresh)

    return () => {
      active = false
      stop()
    }
  }, [store])

  return counts
}
