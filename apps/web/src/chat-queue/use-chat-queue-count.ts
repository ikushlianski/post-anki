import { useCallback, useEffect, useRef, useState } from 'react'

import { PENDING_REVIEW_CHANGED_EVENT } from '../knowledge-bit/knowledge-bit-review-events'
import { getChatQueueCount } from './chat-queue.api'
import { useRefetchOnFocus } from './use-refetch-on-focus'

export type ChatQueueCount = { count: number | null; stale: boolean }

export function useChatQueueCount(): ChatQueueCount {
  const [count, setCount] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const activeRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const outcome = await getChatQueueCount()

      if (!activeRef.current) {
        return
      }

      if (outcome.ok) {
        setCount(outcome.data.count)
        setStale(false)
      } else {
        setStale(true)
      }
    } catch {
      if (activeRef.current) {
        setStale(true)
      }
    }
  }, [])

  useRefetchOnFocus(() => {
    void load()
  })

  useEffect(() => {
    activeRef.current = true
    void load()

    window.addEventListener(PENDING_REVIEW_CHANGED_EVENT, load)

    return () => {
      activeRef.current = false
      window.removeEventListener(PENDING_REVIEW_CHANGED_EVENT, load)
    }
  }, [load])

  return { count, stale }
}
