import { useEffect, useState } from 'react'

import { browserTimeZone } from '../shared/browser-time-zone'
import { getOfflineStore } from './default-offline-store'
import { backoffDelayMs, flushQueuedGrades, onGradeEnqueued, resetParkedGrades } from './offline-grade-queue'
import type { OfflineReviewStore, SendGrade } from './offline-review-types'
import { refreshStoredPack } from './review-pack'
import { downloadReviewPack, sendQueuedGrade } from './send-queued-grade'

export const PACK_REFRESH_INTERVAL_MS = 6 * 60_000

export type SyncPhase = 'idle' | 'syncing' | 'scheduled'

export interface OfflineReviewSyncDeps {
  store?: OfflineReviewStore
  send?: SendGrade
  download?: (tz: string) => Promise<unknown>
}

export function useOfflineReviewSync({
  store = getOfflineStore(),
  send = sendQueuedGrade,
  download = downloadReviewPack,
}: OfflineReviewSyncDeps = {}): SyncPhase {
  const [phase, setPhase] = useState<SyncPhase>('idle')

  useEffect(() => {
    let active = true
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const sync = async () => {
      clearTimeout(retryTimer)

      if (!active || navigator.onLine === false) {
        setPhase('idle')

        return
      }

      setPhase('syncing')

      const result = await flushQueuedGrades(store, send).catch(() => null)

      if (!active) {
        return
      }

      if (!result || result.remaining > 0) {
        retryTimer = setTimeout(() => void sync(), backoffDelayMs(attempt))
        attempt += 1
        setPhase('scheduled')

        return
      }

      attempt = 0
      setPhase('idle')
    }

    const refreshPack = async () => {
      if (navigator.onLine !== false) {
        await refreshStoredPack(store, () => download(browserTimeZone()))
      }
    }

    const start = () => {
      void sync().then(refreshPack)
    }

    const onOnline = () => {
      attempt = 0
      start()
    }

    void resetParkedGrades(store).then(start)
    window.addEventListener('online', onOnline)

    const stopEnqueued = onGradeEnqueued(() => {
      attempt = 0
      void sync()
    })
    const interval = setInterval(() => void refreshPack(), PACK_REFRESH_INTERVAL_MS)

    return () => {
      active = false
      clearTimeout(retryTimer)
      clearInterval(interval)
      stopEnqueued()
      window.removeEventListener('online', onOnline)
    }
  }, [store, send, download])

  return phase
}
