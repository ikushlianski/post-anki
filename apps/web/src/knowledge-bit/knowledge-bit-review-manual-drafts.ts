import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type {
  CreateManualKnowledgeItemInput,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import { createManualKnowledgeItemForReview } from './knowledge-bit-review.api'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { addManualBit } from './knowledge-bit-review-sources'

export interface ManualDraft {
  id: string
  sourceId: string
  bitId: string | null
  focusTick: number
}

const CREATE_FAILED_MESSAGE = "Couldn't add the card. Try again."

export function useManualDrafts({
  sources,
  setSources,
  knownBitIds,
}: {
  sources: PendingKnowledgeSourceForReview[]
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  knownBitIds: MutableRefObject<Set<string>>
}) {
  const [drafts, setDrafts] = useState<ManualDraft[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const nextId = useRef(0)
  const liveBitIds = new Set(sources.flatMap((source) => source.bits.map((bit) => bit.id)))
  const hasGoneDrafts = drafts.some((draft) => draft.bitId !== null && !liveBitIds.has(draft.bitId))

  useEffect(() => {
    if (hasGoneDrafts) {
      setDrafts((prev) =>
        prev.filter((draft) => draft.bitId === null || liveBitIds.has(draft.bitId)),
      )
    }
  })

  function add(sourceId: string) {
    const id = `draft-${++nextId.current}`

    setDrafts((prev) =>
      prev.some((draft) => draft.sourceId === sourceId && draft.bitId === null)
        ? prev.map((draft) =>
            draft.sourceId === sourceId && draft.bitId === null
              ? { ...draft, focusTick: draft.focusTick + 1 }
              : draft,
          )
        : [...prev, { id, sourceId, bitId: null, focusTick: 0 }],
    )
  }

  function cancel(draftId: string) {
    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId))
    setErrors((prev) => ({ ...prev, [draftId]: '' }))
  }

  async function create(
    draft: ManualDraft,
    input: CreateManualKnowledgeItemInput,
  ): Promise<boolean> {
    setErrors((prev) => ({ ...prev, [draft.id]: '' }))

    try {
      const bit = await createManualKnowledgeItemForReview({
        data: { sourceId: draft.sourceId, ...input },
      })

      knownBitIds.current.add(bit.id)
      setSources((prev) => addManualBit(prev, draft.sourceId, bit))
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, bitId: bit.id } : d)))
      notifyPendingReviewChanged()

      return true
    } catch {
      setErrors((prev) => ({ ...prev, [draft.id]: CREATE_FAILED_MESSAGE }))

      return false
    }
  }

  return {
    draftsFor: (sourceId: string) => drafts.filter((draft) => draft.sourceId === sourceId),
    ownedBitIds: new Set(drafts.flatMap((draft) => (draft.bitId ? [draft.bitId] : []))),
    errorFor: (draftId: string): string | null => errors[draftId] || null,
    add,
    cancel,
    create,
  }
}

export type ManualItems = ReturnType<typeof useManualDrafts>
