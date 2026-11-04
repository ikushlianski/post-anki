import { useState, type Dispatch, type SetStateAction } from 'react'
import type { PendingKnowledgeBitForReview, PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  editKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import { generateKnowledgeBitExampleForReview } from './knowledge-bit-inbox.api'
import { exampleErrorMessage } from './knowledge-bit-example-messages'
import { applyBitExample } from './knowledge-bit-review-sources'

const CONFIRM_OVERWRITE = 'Replace the example you wrote with an AI example?'

export interface BitExampleState {
  error: string | null
  left: number | null
  version: number
}

const EMPTY_STATE: BitExampleState = { error: null, left: null, version: 0 }

export function useBitExample({
  claimBit,
  releaseBit,
  setSources,
  onGenerated,
}: {
  claimBit: (bitId: string) => boolean
  releaseBit: (bitId: string) => void
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  onGenerated: (bit: PendingKnowledgeBitForReview, previous: string | null) => void
}) {
  const [states, setStates] = useState<Record<string, BitExampleState>>({})

  function patch(bitId: string, change: Partial<BitExampleState>) {
    setStates((prev) => ({ ...prev, [bitId]: { ...(prev[bitId] ?? EMPTY_STATE), ...change } }))
  }

  function bump(bitId: string, change: Partial<BitExampleState>) {
    setStates((prev) => {
      const current = prev[bitId] ?? EMPTY_STATE

      return { ...prev, [bitId]: { ...current, ...change, version: current.version + 1 } }
    })
  }

  async function generate(bit: PendingKnowledgeBitForReview): Promise<boolean> {
    if (states[bit.id]?.left === 0) {
      return false
    }

    const hasHumanText = Boolean(bit.background?.trim()) && !bit.exampleAiGeneratedAt

    if (hasHumanText && !window.confirm(CONFIRM_OVERWRITE)) {
      return false
    }

    if (!claimBit(bit.id)) {
      return false
    }

    patch(bit.id, { error: null })

    try {
      let outcome = await generateKnowledgeBitExampleForReview({
        data: { bitId: bit.id, overwrite: hasHumanText },
      })

      if (!outcome.ok && outcome.error === 'example_exists' && window.confirm(CONFIRM_OVERWRITE)) {
        outcome = await generateKnowledgeBitExampleForReview({
          data: { bitId: bit.id, overwrite: true },
        })
      }

      if (!outcome.ok) {
        patch(bit.id, {
          error: exampleErrorMessage(outcome.error),
          ...(outcome.error === 'limit_reached' ? { left: 0 } : {}),
        })

        return false
      }

      setSources((prev) =>
        applyBitExample(prev, bit.id, outcome.data.example, outcome.data.exampleAiGeneratedAt),
      )
      bump(bit.id, { left: outcome.data.generationsLeft })
      onGenerated(bit, outcome.data.previousExample)

      return true
    } catch {
      patch(bit.id, { error: exampleErrorMessage('generation_failed') })

      return false
    } finally {
      releaseBit(bit.id)
    }
  }

  async function restore(bitId: string, body: string, previous: string | null): Promise<boolean> {
    if (!claimBit(bitId)) {
      return false
    }

    try {
      await editKnowledgeBitForReview({ data: { bitId, body, background: previous } })
      setSources((prev) => applyBitExample(prev, bitId, previous, null))
      bump(bitId, { error: null })

      return true
    } catch {
      patch(bitId, { error: "Couldn't undo. Try again." })

      return false
    } finally {
      releaseBit(bitId)
    }
  }

  return { exampleStates: states, generate, restore }
}
