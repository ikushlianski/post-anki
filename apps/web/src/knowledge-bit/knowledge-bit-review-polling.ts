import { useEffect, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

export const QUESTION_POLL_INTERVAL_MS = 8000
export const QUESTION_POLL_MAX_ATTEMPTS = 40
export const REGENERATION_POLL_MAX_ATTEMPTS = 200
export const QUESTION_POLL_IDLE_LIMIT = 15

export function hasBitAwaitingQuestions(sources: PendingKnowledgeSourceForReview[]): boolean {
  return sources.some((source) => source.bits.some((bit) => bit.variants.length === 0))
}

export function unseenBitIds(
  fresh: PendingKnowledgeSourceForReview[],
  known: ReadonlySet<string>,
): string[] {
  return fresh.flatMap((source) => source.bits.map((bit) => bit.id)).filter((id) => !known.has(id))
}

// Only fills variants into bits that had none; edited, focused or errored content is never replaced.
export function mergeArrivedVariants(
  current: PendingKnowledgeSourceForReview[],
  fresh: PendingKnowledgeSourceForReview[],
  protectedBitIds: ReadonlySet<string> = new Set(),
): PendingKnowledgeSourceForReview[] {
  const freshVariants = new Map(
    fresh.flatMap((source) => source.bits.map((bit) => [bit.id, bit.variants] as const)),
  )

  return current.map((source) => ({
    ...source,
    bits: source.bits.map((bit) => {
      const arrived =
        bit.variants.length === 0 && !protectedBitIds.has(bit.id)
          ? freshVariants.get(bit.id)
          : undefined

      return arrived && arrived.length > 0 ? { ...bit, variants: arrived } : bit
    }),
  }))
}

// Appends new bits at the end so bits already on screen keep their positions.
export function mergeArrivedBits(
  current: PendingKnowledgeSourceForReview[],
  fresh: PendingKnowledgeSourceForReview[],
  arrivedBitIds: ReadonlySet<string>,
): PendingKnowledgeSourceForReview[] {
  const merged = current.map((source) => ({ ...source, bits: [...source.bits] }))

  for (const source of fresh) {
    const arrived = source.bits.filter((bit) => arrivedBitIds.has(bit.id))

    if (arrived.length === 0) {
      continue
    }

    const target = merged.find((item) => item.knowledgeSourceId === source.knowledgeSourceId)

    if (target) {
      target.bits.push(...arrived)
    } else {
      merged.push({ ...source, bits: arrived })
    }
  }

  return merged
}

// Returns true once the attempt budget is spent, so callers stop promising live updates.
export function useQuestionPolling(
  waiting: boolean,
  refresh: () => Promise<void>,
  intervalMs: number = QUESTION_POLL_INTERVAL_MS,
  maxAttempts: number = QUESTION_POLL_MAX_ATTEMPTS,
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

      if (attempts > maxAttempts) {
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
  }, [waiting, intervalMs, maxAttempts])

  return gaveUp
}
