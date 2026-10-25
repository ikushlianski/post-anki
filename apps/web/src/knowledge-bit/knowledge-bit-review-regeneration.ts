import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type {
  KnowledgeItemModelId,
  KnowledgeSourceRegenerationStatus,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import {
  getKnowledgeSourceRegenerationForReview,
  regenerateKnowledgeSourceForReview,
} from './knowledge-bit-review.api'
import { dropEmptySourcesExcept, markSourceRegenerating } from './knowledge-bit-review-sources'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

export const REGENERATION_POLL_INTERVAL_MS = 3000

export interface SourceRegenerationActions {
  onRequest: (sourceId: string) => void
  onCancel: (sourceId: string) => void
  onConfirm: (sourceId: string, modelId?: KnowledgeItemModelId) => void
  onRetry: (sourceId: string) => void
  onRetryWithText: (sourceId: string, text: string) => void
}

export type SourceRegenerationPhase = 'confirming' | 'starting' | 'running' | 'failed'

export interface SourceRegenerationState {
  phase: SourceRegenerationPhase
  modelId?: KnowledgeItemModelId
  message?: string
}

export type RegenerationStatuses = Record<string, KnowledgeSourceRegenerationStatus>

const START_FAILED_MESSAGE = "Couldn't start. Try again."
const RUN_FAILED_MESSAGE = "Couldn't regenerate. Try again."

export function useSourceRegeneration({
  sources,
  setSources,
  knownBitIds,
}: {
  sources: PendingKnowledgeSourceForReview[]
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  knownBitIds: MutableRefObject<Set<string>>
}) {
  const [states, setStates] = useState<Record<string, SourceRegenerationState>>({})
  const statesRef = useRef(states)
  const { claim, release } = useResolvingSuggestions()

  statesRef.current = states

  const setState = useCallback((sourceId: string, next: SourceRegenerationState | null) => {
    setStates((prev) => {
      const updated = { ...prev }

      if (next) {
        updated[sourceId] = next
      } else {
        delete updated[sourceId]
      }

      return updated
    })
  }, [])

  async function start(sourceId: string, modelId?: KnowledgeItemModelId, text?: string) {
    if (!claim(sourceId)) {
      return
    }

    setState(sourceId, { phase: 'starting', modelId })

    try {
      await regenerateKnowledgeSourceForReview({ data: { sourceId, modelId, text } })

      const gone = new Set(
        sources.find((source) => source.knowledgeSourceId === sourceId)?.bits.map((bit) => bit.id),
      )

      gone.forEach((bitId) => knownBitIds.current.add(bitId))
      setSources((prev) => markSourceRegenerating(prev, sourceId))
      setState(sourceId, { phase: 'running', modelId })
    } catch {
      setState(sourceId, { phase: 'failed', modelId, message: START_FAILED_MESSAGE })
    } finally {
      release(sourceId)
    }
  }

  const fetchStatuses = useCallback(async (): Promise<RegenerationStatuses> => {
    const runningIds = Object.keys(statesRef.current).filter(
      (id) => statesRef.current[id]?.phase === 'running',
    )

    const results = await Promise.all(
      runningIds.map((sourceId) =>
        getKnowledgeSourceRegenerationForReview({ data: { sourceId } })
          .then((status) => [sourceId, status] as const)
          .catch(() => null),
      ),
    )

    return Object.fromEntries(results.filter((entry) => entry !== null))
  }, [])

  const applyStatuses = useCallback(
    (statuses: RegenerationStatuses, _fresh?: unknown) => {
      const stillRunning = new Set(
        Object.keys(statesRef.current).filter(
          (id) => statesRef.current[id]?.phase !== 'confirming' && statuses[id]?.status !== 'done',
        ),
      )

      setStates((prev) => {
        const next = { ...prev }

        for (const [sourceId, status] of Object.entries(statuses)) {
          if (status.status === 'done') {
            delete next[sourceId]
          } else if (status.status === 'failed') {
            next[sourceId] = { ...next[sourceId], phase: 'failed', message: RUN_FAILED_MESSAGE }
          }
        }

        return next
      })
      setSources((prev) => dropEmptySourcesExcept(prev, stillRunning))
    },
    [setSources],
  )

  return {
    states,
    isRegenerating: Object.values(states).some((state) => state.phase === 'running'),
    actions: {
      onRequest: (sourceId: string) => setState(sourceId, { phase: 'confirming' }),
      onCancel: (sourceId: string) => setState(sourceId, null),
      onConfirm: (sourceId: string, modelId?: KnowledgeItemModelId) => start(sourceId, modelId),
      onRetry: (sourceId: string) => start(sourceId, statesRef.current[sourceId]?.modelId),
      onRetryWithText: (sourceId: string, text: string) => start(sourceId, undefined, text),
    },
    fetchStatuses,
    applyStatuses,
  }
}
