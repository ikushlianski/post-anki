import { useEffect, useRef } from 'react'
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

export function useQuestionPolling(
  waiting: boolean,
  refresh: () => Promise<void>,
  intervalMs: number = QUESTION_POLL_INTERVAL_MS,
): void {
  const refreshRef = useRef(refresh)

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
        return
      }

      void refreshRef.current().catch(() => undefined)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [waiting, intervalMs])
}
