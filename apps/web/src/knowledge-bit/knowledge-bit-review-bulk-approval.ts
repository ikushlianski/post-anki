import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import { bulkApproveKnowledgeBitsForReview } from './knowledge-bit-review.api'
import { removeBits } from './knowledge-bit-review-sources'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { describeBulkApprovalResult } from './knowledge-bit-review-bulk-result'

// The scope waiting for the reviewer's confirmation; null when nothing is pending.
export type PendingBulk = { kind: 'all' } | { kind: 'source'; sourceId: string } | null

export function useBulkApproval({
  sources,
  readyBits,
  setSources,
  markApproved,
  knownBitIds,
  editingBitIds,
  claimBit,
  releaseBit,
}: {
  sources: PendingKnowledgeSourceForReview[]
  readyBits: PendingKnowledgeBitForReview[]
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  markApproved: (bitIds: string[]) => void
  knownBitIds: MutableRefObject<Set<string>>
  editingBitIds: MutableRefObject<Set<string>>
  claimBit: (bitId: string) => boolean
  releaseBit: (bitId: string) => void
}) {
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [pendingBulk, setPendingBulk] = useState<PendingBulk>(null)

  async function approveMany(bits: PendingKnowledgeBitForReview[]) {
    const claimed = bits
      .filter((bit) => bit.variants.length > 0 && !editingBitIds.current.has(bit.id))
      .map((bit) => bit.id)
      .filter((bitId) => claimBit(bitId))

    if (claimed.length === 0) {
      return
    }

    setBulkMessage(null)

    try {
      const result = await bulkApproveKnowledgeBitsForReview({
        data: { knowledgeBitIds: claimed },
      })

      const gone = new Set(
        result.skipped.filter((item) => item.reason !== 'no_variant').map((item) => item.id),
      )

      gone.forEach((bitId) => knownBitIds.current.add(bitId))
      markApproved(result.approved)
      setSources((prev) => removeBits(prev, gone))
      notifyPendingReviewChanged()
      setBulkMessage(describeBulkApprovalResult(result))
    } catch {
      setBulkMessage('Could not approve these suggestions. Try again.')
    } finally {
      claimed.forEach(releaseBit)
    }
  }

  function confirmBulk() {
    if (!pendingBulk) {
      return
    }

    const bits =
      pendingBulk.kind === 'all'
        ? readyBits
        : (sources.find((source) => source.knowledgeSourceId === pendingBulk.sourceId)?.bits ?? [])

    setPendingBulk(null)
    void approveMany(bits)
  }

  return {
    bulkMessage,
    pendingBulk,
    isConfirmingAll: pendingBulk?.kind === 'all',
    confirmingSourceId: pendingBulk?.kind === 'source' ? pendingBulk.sourceId : null,
    requestApproveAll: () => setPendingBulk({ kind: 'all' }),
    requestApproveSource: (sourceId: string) => setPendingBulk({ kind: 'source', sourceId }),
    cancelBulk: () => setPendingBulk(null),
    confirmBulk,
  }
}
