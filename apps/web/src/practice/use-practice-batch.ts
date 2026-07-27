import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { eq, useLiveQuery } from '@tanstack/react-db'

import type { Pack, Phrase, PracticeLevel } from '@post-anki/shared'

import { generatePhraseBatch } from './practice.api'
import { mapPhraseRow, phrasesCollection, reconcilePhrases } from './practice.collection'
import { BATCH_SIZE } from './practice.constants'

export function usePracticeBatch(
  subjectId: string,
  level: PracticeLevel | undefined,
  pack: Pack | undefined,
) {
  const [currentBatchId, setCurrentBatchId] = useState<string>()
  const [nextBatchId, setNextBatchId] = useState<string>()
  // Phrases seeded directly from a generate-batch mutation response, keyed by
  // batchId — written the instant either generate call site resolves, so the
  // batch renders immediately instead of waiting on Electric to redeliver the
  // same rows. Reconciled with Electric's live query (below) rather than
  // replaced by it, so a slow-but-eventually-working Electric connection
  // still converges on the same synced data once it catches up.
  const [seededPhrasesByBatchId, setSeededPhrasesByBatchId] = useState<Record<string, Phrase[]>>({})
  const isRequestingFirstBatchRef = useRef(false)
  const isPrefetchingRef = useRef(false)
  // Tracks the `level:pack` key of the most recent FAILED first-batch attempt. Guards against
  // an unbounded retry storm: isRequestingFirstBatchRef only prevents re-entry while a request
  // is in flight, but a FAILED request clears that ref in .finally(), leaving nothing to stop
  // an effect re-fire (for any reason — this hook doesn't need to know why) from immediately
  // retrying the same doomed call. Confirmed via a real repro: a missing-stub failure produced
  // ~19 retries/second, sustained for minutes, once the same level/pack kept failing. Cleared
  // on success and whenever level/pack actually changes, so a genuine retry (switch away and
  // back, or a transient error that would succeed on retry) is never permanently blocked.
  const lastFailedKeyRef = useRef<string | undefined>(undefined)
  // Requests still in flight for a level/pack we've since moved away from.
  // Aborted the moment level/pack changes (below) so a stale in-flight
  // generate call can never land after the fact and claim a batch/stub slot
  // that belongs to the new level/pack's own call.
  const inFlightControllersRef = useRef(new Set<AbortController>())
  // The `level:pack` key this effect last actually reset for. Now that
  // level/pack can be non-undefined from the very first render (seeded via
  // usePracticeSettings' initialSettings), this effect can be invoked more
  // than once for the SAME level/pack pair before its own generate call has
  // settled (e.g. a dev-mode remount of this subtree) — without this guard,
  // a same-key re-invocation would abort the still-in-flight first-batch
  // request and never re-fire it (isRequestingFirstBatchRef stays true until
  // the aborted promise's .finally() runs, so the very next effect pass sees
  // a request "in flight" and skips), leaving the page stuck on
  // "Generating…" forever. Comparing against the last key this effect
  // genuinely reset for makes the reset idempotent for repeat invocations,
  // while still firing correctly on an actual level/pack change.
  const lastResetKeyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const key = level && pack ? `${level}:${pack}` : undefined

    if (lastResetKeyRef.current === key) return
    lastResetKeyRef.current = key

    for (const controller of inFlightControllersRef.current) controller.abort()
    inFlightControllersRef.current.clear()
    lastFailedKeyRef.current = undefined
    setCurrentBatchId(undefined)
    setNextBatchId(undefined)
    setSeededPhrasesByBatchId({})
  }, [level, pack])

  useEffect(() => {
    // level/pack are undefined until the settings row has synced at least
    // once — never fire a generate call against a guessed default that might
    // not match what's actually persisted.
    if (!level || !pack || currentBatchId || isRequestingFirstBatchRef.current) return
    const key = `${level}:${pack}`
    if (lastFailedKeyRef.current === key) return
    isRequestingFirstBatchRef.current = true
    const controller = new AbortController()
    inFlightControllersRef.current.add(controller)
    generatePhraseBatch({ data: subjectId, signal: controller.signal })
      .then(({ batchId, phrases }) => {
        // Seed BEFORE flipping currentBatchId, so the very first render that
        // has a batchId already has phrases to reconcile against — never a
        // render with a batchId but nothing to show yet.
        setSeededPhrasesByBatchId((prev) => ({ ...prev, [batchId]: phrases }))
        setCurrentBatchId(batchId)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        lastFailedKeyRef.current = key
        console.error('Failed to generate first batch', error)
      })
      .finally(() => {
        isRequestingFirstBatchRef.current = false
        inFlightControllersRef.current.delete(controller)
      })
  }, [subjectId, level, pack, currentBatchId])

  const { data: phrasesInBatch } = useLiveQuery(
    (q) =>
      q
        .from({ phrase: phrasesCollection })
        .where(({ phrase }) => eq(phrase.batch_id, currentBatchId ?? '')),
    [currentBatchId],
  )

  const phrases = useMemo(() => {
    const seeded = currentBatchId ? (seededPhrasesByBatchId[currentBatchId] ?? []) : []
    const live = [...(phrasesInBatch ?? [])].map(mapPhraseRow)

    return reconcilePhrases(seeded, live)
  }, [seededPhrasesByBatchId, currentBatchId, phrasesInBatch])

  const prefetchNextBatch = useCallback(() => {
    if (!level || !pack || nextBatchId || isPrefetchingRef.current) return
    isPrefetchingRef.current = true
    const controller = new AbortController()
    inFlightControllersRef.current.add(controller)
    generatePhraseBatch({ data: subjectId, signal: controller.signal })
      .then(({ batchId, phrases }) => {
        setSeededPhrasesByBatchId((prev) => ({ ...prev, [batchId]: phrases }))
        setNextBatchId(batchId)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        console.error('Failed to prefetch next batch', error)
      })
      .finally(() => {
        isPrefetchingRef.current = false
        inFlightControllersRef.current.delete(controller)
      })
  }, [subjectId, level, pack, nextBatchId])

  const advanceToNextBatch = useCallback(() => {
    if (!nextBatchId) return
    setCurrentBatchId(nextBatchId)
    setNextBatchId(undefined)
  }, [nextBatchId])

  return {
    batchId: currentBatchId,
    phrases,
    isBatchReady: Boolean(currentBatchId) && phrases.length >= BATCH_SIZE,
    isNextBatchReady: Boolean(nextBatchId),
    prefetchNextBatch,
    advanceToNextBatch,
  }
}
