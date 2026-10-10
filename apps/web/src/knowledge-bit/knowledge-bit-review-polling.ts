import { useEffect, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

export const QUESTION_POLL_INTERVAL_MS = 8000
export const QUESTION_POLL_MAX_ATTEMPTS = 40

export function hasBitAwaitingQuestions(sources: PendingKnowledgeSourceForReview[]): boolean {
  return sources.some((source) => source.bits.some((bit) => bit.variants.length === 0))
}

// Only fills variants into bits that had none; edited or already-shown content is never replaced.
export function mergeArrivedVariants(
  current: PendingKnowledgeSourceForReview[],
  fresh: PendingKnowledgeSourceForReview[],
): PendingKnowledgeSourceForReview[] {
  const freshVariants = new Map(
    fresh.flatMap((source) => source.bits.map((bit) => [bit.id, bit.variants] as const)),
  )

  return current.map((source) => ({
    ...source,
    bits: source.bits.map((bit) => {
      const arrived = bit.variants.length === 0 ? freshVariants.get(bit.id) : undefined

      return arrived && arrived.length > 0 ? { ...bit, variants: arrived } : bit
    }),
  }))
}

// Returns true once the attempt budget is spent, so callers stop promising live updates.
export function useQuestionPolling(
  waiting: boolean,
  refresh: () => Promise<void>,
  intervalMs: number = QUESTION_POLL_INTERVAL_MS,
): boolean {
  const refreshRef = useRef(refresh)
  const [gaveUp, setGaveUp] = useState(false)

  refreshRef.current = refresh

  useEffect(() => {
    if (!waiting) {
      return
    }

    let attempts = 0

    const timer = setInterval(() => {
      attempts += 1

      if (attempts > QUESTION_POLL_MAX_ATTEMPTS) {
        clearInterval(timer)
        setGaveUp(true)
        return
      }

      void refreshRef.current().catch(() => undefined)
    }, intervalMs)

    return () => {
      clearInterval(timer)
      setGaveUp(false)
    }
  }, [waiting, intervalMs])

  return gaveUp
}
