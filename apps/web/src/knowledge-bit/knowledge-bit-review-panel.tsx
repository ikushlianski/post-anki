import { useCallback, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  approveKnowledgeBitForReview,
  editKnowledgeBitForReview,
  getPendingKnowledgeBitsForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import { applyBitEdit, applyVariantEdit, removeBit } from './knowledge-bit-review-sources'
import { KnowledgeBitReviewBulkBar } from './knowledge-bit-review-bulk-bar'
import { useBulkApproval } from './knowledge-bit-review-bulk-approval'
import { KnowledgeBitReviewEmptyState } from './knowledge-bit-review-empty-state'
import { KnowledgeBitReviewSourceGroup } from './knowledge-bit-review-source-group'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { useReviewKeyboard, type ReviewKeyAction } from './knowledge-bit-review-keyboard'
import {
  QUESTION_POLL_IDLE_LIMIT,
  hasBitAwaitingQuestions,
  mergeArrivedBits,
  mergeArrivedVariants,
  unseenBitIds,
  useQuestionPolling,
} from './knowledge-bit-review-polling'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

export function KnowledgeBitReviewPanel({
  initialSources,
}: {
  initialSources: PendingKnowledgeSourceForReview[]
}) {
  const [sources, setSources] = useState(initialSources)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [focusedBitId, setFocusedBitId] = useState<string>()
  const [idleStopped, setIdleStopped] = useState(false)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const editingBitIds = useRef(new Set<string>())
  // Every bit ever shown or decided here; a poll never re-adds one of these.
  const knownBitIds = useRef(
    new Set(initialSources.flatMap((source) => source.bits.map((bit) => bit.id))),
  )
  const quietPolls = useRef(0)

  const allBits = sources.flatMap((source) => source.bits)
  const focusPosition = allBits.findIndex((bit) => bit.id === focusedBitId)
  const activeIndex =
    focusPosition >= 0 ? focusPosition : Math.min(focusedIndex, allBits.length - 1)
  const focusedBit = allBits[activeIndex]
  const readyBits = allBits.filter((bit) => bit.variants.length > 0)

  if (focusPosition >= 0 && focusPosition !== focusedIndex) {
    setFocusedIndex(focusPosition)
  }

  function moveFocus(index: number) {
    setFocusedIndex(index)
    setFocusedBitId(allBits[index]?.id)
  }

  const refreshQuestions = useCallback(async () => {
    const fresh = await getPendingKnowledgeBitsForReview()
    const arrived = new Set(unseenBitIds(fresh, knownBitIds.current))
    const protectedBitIds = new Set([
      ...editingBitIds.current,
      ...Object.keys(rowErrors).filter((bitId) => rowErrors[bitId]),
    ])

    arrived.forEach((bitId) => knownBitIds.current.add(bitId))
    quietPolls.current = arrived.size > 0 ? 0 : quietPolls.current + 1
    setIdleStopped(quietPolls.current >= QUESTION_POLL_IDLE_LIMIT)
    setSources((prev) =>
      mergeArrivedBits(mergeArrivedVariants(prev, fresh, protectedBitIds), fresh, arrived),
    )
  }, [rowErrors])

  const pollingGaveUp = useQuestionPolling(
    hasBitAwaitingQuestions(sources) || !idleStopped,
    refreshQuestions,
  )

  const handleEditingChange = useCallback((bitId: string, editing: boolean) => {
    if (editing) {
      editingBitIds.current.add(bitId)
    } else {
      editingBitIds.current.delete(bitId)
    }
  }, [])

  const { claim: claimBit, release: releaseBit, isResolving: isBitResolving } =
    useResolvingSuggestions()
  const { claim: claimVariant, release: releaseVariant, isResolving: isVariantSaving } =
    useResolvingSuggestions()
  const { claim: claimBitEdit, release: releaseBitEdit, isResolving: isBitSaving } =
    useResolvingSuggestions()
  const bulk = useBulkApproval({
    sources,
    readyBits,
    setSources,
    knownBitIds,
    editingBitIds,
    claimBit,
    releaseBit,
  })

  function setRowError(bitId: string, message: string | null) {
    setRowErrors((prev) => ({ ...prev, [bitId]: message ?? '' }))
  }

  async function approve(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    setRowError(bitId, null)

    try {
      await approveKnowledgeBitForReview({ data: { bitId } })

      knownBitIds.current.add(bitId)
      setSources((prev) => removeBit(prev, bitId))
      notifyPendingReviewChanged()
    } catch {
      // Row stays listed on failure so the decision can be retried.
      setRowError(bitId, "Couldn't approve. Try again.")
    } finally {
      releaseBit(bitId)
    }
  }

  async function reject(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    setRowError(bitId, null)

    try {
      await rejectKnowledgeBitForReview({ data: { bitId } })

      knownBitIds.current.add(bitId)
      setSources((prev) => removeBit(prev, bitId))
      notifyPendingReviewChanged()
    } catch {
      // Same retry posture as approve above.
      setRowError(bitId, "Couldn't reject. Try again.")
    } finally {
      releaseBit(bitId)
    }
  }

  async function saveVariant(
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ): Promise<boolean> {
    if (!claimVariant(variantId)) {
      return false
    }

    try {
      const result = await editKnowledgeBitQuestionVariantForReview({
        data: { variantId, prompt, answer },
      })

      // The edit supersedes rather than mutates — the new variant id must replace the old one.
      setSources((prev) => applyVariantEdit(prev, bitId, variantId, result.variantId, prompt, answer))

      return true
    } catch {
      // Editor stays open on failure so the edit can be retried.
      return false
    } finally {
      releaseVariant(variantId)
    }
  }

  async function saveBit(bitId: string, body: string, background: string | null): Promise<boolean> {
    if (!claimBitEdit(bitId)) {
      return false
    }

    try {
      await editKnowledgeBitForReview({ data: { bitId, body, background } })

      // A body change clears the bit's variants (server regenerates); background-only keeps them.
      setSources((prev) => applyBitEdit(prev, bitId, body, background))

      return true
    } catch {
      // Editor stays open on failure so the edit can be retried.
      return false
    } finally {
      releaseBitEdit(bitId)
    }
  }

  function handleKey(action: ReviewKeyAction) {
    if (!focusedBit) {
      return
    }

    if (action === 'next') {
      moveFocus(Math.min(activeIndex + 1, allBits.length - 1))
    } else if (action === 'previous') {
      moveFocus(Math.max(activeIndex - 1, 0))
    } else if (editingBitIds.current.has(focusedBit.id) || isBitResolving(focusedBit.id)) {
      return
    } else if (action === 'reject') {
      void reject(focusedBit.id)
    } else if (action === 'approve') {
      if (focusedBit.variants.length > 0) {
        void approve(focusedBit.id)
      }
    } else {
      const source = sources.find((c) => c.bits.some((bit) => bit.id === focusedBit.id))

      if (source) {
        bulk.requestApproveSource(source.knowledgeSourceId)
      }
    }
  }

  useReviewKeyboard(handleKey)

  return (
    <div data-testid="knowledge-bit-review-panel" className="space-y-4">
      <KnowledgeBitReviewBulkBar
        readyCount={readyBits.length}
        bulkMessage={bulk.bulkMessage}
        isConfirming={bulk.isConfirmingAll}
        onRequestApproveAll={bulk.requestApproveAll}
        onConfirmApproveAll={bulk.confirmBulk}
        onCancelApproveAll={bulk.cancelBulk}
      />

      {sources.length === 0 ? (
        <KnowledgeBitReviewEmptyState />
      ) : (
        <ul className="space-y-4">
          {sources.map((source) => (
            <KnowledgeBitReviewSourceGroup
              key={source.knowledgeSourceId}
              source={source}
              focusedBitId={focusedBit?.id}
              pollingGaveUp={pollingGaveUp}
              rowErrors={rowErrors}
              isBitResolving={isBitResolving}
              isVariantSaving={isVariantSaving}
              isBitSaving={isBitSaving}
              isConfirmingBulk={bulk.confirmingSourceId === source.knowledgeSourceId}
              onRequestApproveSource={bulk.requestApproveSource}
              onConfirmBulk={bulk.confirmBulk}
              onCancelBulk={bulk.cancelBulk}
              onEditingChange={handleEditingChange}
              onApprove={approve}
              onReject={reject}
              onSaveVariant={saveVariant}
              onSaveBit={saveBit}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
