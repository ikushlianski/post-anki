import { useCallback, useRef, useState } from 'react'
import type { PutTriageDecisionInput } from '@post-anki/shared'

import { deleteTriageDecision, putTriageDecision, type TriageOutcome } from './card-triage.api'

async function safely<T>(call: () => Promise<TriageOutcome<T>>): Promise<TriageOutcome<T>> {
  try {
    return (await call()) ?? { ok: false, error: 'unknown' }
  } catch {
    return { ok: false, error: 'unknown' }
  }
}

export interface DecisionSyncEntry {
  bitId: string
  body: PutTriageDecisionInput
}

export function useTriageDecisionSync(sessionId: string | null) {
  const chains = useRef(new Map<string, Promise<unknown>>())
  const synced = useRef(new Set<string>())
  const failed = useRef(new Set<string>())
  const generation = useRef(0)
  const versions = useRef(new Map<string, number>())
  const [failedCount, setFailedCount] = useState(0)

  const setFailed = useCallback((bitId: string, isFailed: boolean) => {
    if (isFailed) {
      failed.current.add(bitId)
    } else {
      failed.current.delete(bitId)
    }

    setFailedCount(failed.current.size)
  }, [])

  const bumpVersion = useCallback((bitId: string): number => {
    const next = (versions.current.get(bitId) ?? 0) + 1

    versions.current.set(bitId, next)

    return next
  }, [])

  const enqueue = useCallback(<T,>(bitId: string, task: () => Promise<T>): Promise<T> => {
    const previous = chains.current.get(bitId) ?? Promise.resolve()
    const next = previous.then(task, task)

    chains.current.set(bitId, next)

    return next
  }, [])

  const send = useCallback(
    (bitId: string, body: PutTriageDecisionInput): Promise<boolean> => {
      if (!sessionId) {
        return Promise.resolve(false)
      }

      const issuedIn = generation.current
      const version = bumpVersion(bitId)

      return enqueue(bitId, async () => {
        const outcome = await safely(() => putTriageDecision({ data: { sessionId, bitId, ...body } }))

        if (issuedIn !== generation.current) {
          return false
        }

        if (versions.current.get(bitId) === version) {
          if (outcome.ok) {
            synced.current.add(bitId)
          }

          setFailed(bitId, !outcome.ok)
        }

        return outcome.ok
      })
    },
    [sessionId, enqueue, setFailed, bumpVersion],
  )

  const remove = useCallback(
    (bitId: string): Promise<void> => {
      if (!sessionId) {
        return Promise.resolve()
      }

      const issuedIn = generation.current
      const version = bumpVersion(bitId)

      return enqueue(bitId, async () => {
        const call = () => safely(() => deleteTriageDecision({ data: { sessionId, bitId } }))
        let outcome = await call()

        if (!outcome.ok && outcome.status !== 404 && outcome.status !== 409) {
          outcome = await call()
        }

        if (issuedIn === generation.current && versions.current.get(bitId) === version) {
          synced.current.delete(bitId)
          setFailed(bitId, false)
        }
      })
    },
    [sessionId, enqueue, setFailed, bumpVersion],
  )

  const flush = useCallback(
    async (entries: DecisionSyncEntry[]): Promise<boolean> => {
      const results = await Promise.all(
        entries
          .filter((entry) => !synced.current.has(entry.bitId))
          .map((entry) => send(entry.bitId, entry.body)),
      )

      return results.every(Boolean)
    },
    [send],
  )

  const unsync = useCallback(
    (bitId: string) => {
      bumpVersion(bitId)
      synced.current.delete(bitId)
    },
    [bumpVersion],
  )

  const markSynced = useCallback((bitIds: string[]) => {
    bitIds.forEach((bitId) => synced.current.add(bitId))
  }, [])

  const settle = useCallback(async () => {
    await Promise.all([...chains.current.values()])
  }, [])

  const reset = useCallback(() => {
    generation.current += 1
    chains.current.clear()
    synced.current.clear()
    versions.current.clear()
    failed.current.clear()
    setFailedCount(0)
  }, [])

  const notice =
    failedCount > 0
      ? `${failedCount} ${failedCount === 1 ? 'decision' : 'decisions'} not saved to the server yet. Kept here and sent when you finish.`
      : null

  return { failedCount, notice, send, remove, flush, unsync, markSynced, settle, reset }
}
