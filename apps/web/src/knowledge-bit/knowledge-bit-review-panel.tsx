import { useCallback, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  editKnowledgeBitForReview,
  getPendingKnowledgeBitsForReview,
  editKnowledgeBitQuestionVariantForReview,
} from './knowledge-bit-review.api'
import { applyBitEdit, applyVariantEdit } from './knowledge-bit-review-sources'
import { KnowledgeBitReviewWhyStrip } from './knowledge-bit-review-why-strip'
import { KnowledgeBitReviewBulkBar } from './knowledge-bit-review-bulk-bar'
import { useBulkApproval } from './knowledge-bit-review-bulk-approval'
import {
  REGENERATION_POLL_INTERVAL_MS,
  useSourceRegeneration,
} from './knowledge-bit-review-regeneration'
import { KnowledgeBitReviewEmptyState } from './knowledge-bit-review-empty-state'
import { KnowledgeBitReviewSourceGroup } from './knowledge-bit-review-source-group'
import {
  useReviewKeyboard,
  variantIndexOf,
  type ReviewKeyAction,
} from './knowledge-bit-review-keyboard'
import {
  QUESTION_POLL_IDLE_LIMIT,
  hasBitAwaitingQuestions,
  mergeArrivedBits,
  mergeArrivedVariants,
  REGENERATION_POLL_MAX_ATTEMPTS,
  unseenBitIds,
  useQuestionPolling,
} from './knowledge-bit-review-polling'
import { useReviewDecisions } from './use-review-decisions'
import { useReviewTriage } from './use-review-triage'
import { useReviewGrading } from './use-review-grading'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'
import { TriageSessionSection } from '../card-triage/triage-session-section'
import { useTriageSession } from '../card-triage/use-triage-session'

function singleSubjectId(pending: PendingKnowledgeSourceForReview[]): string | null {
  const ids = new Set(
    pending.filter((source) => source.bits.length > 0).map((source) => source.subjectId ?? null),
  )
  const [only] = ids

  return ids.size === 1 ? (only ?? null) : null
}

export function KnowledgeBitReviewPanel({
  initialSources,
}: {
  initialSources: PendingKnowledgeSourceForReview[]
}) {
  const [sources, setSources] = useState(initialSources)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [focusedBitId, setFocusedBitId] = useState<string>()
  const [idleStopped, setIdleStopped] = useState(false)
  const editingBitIds = useRef(new Set<string>())
  const knownBitIds = useRef(
    new Set(initialSources.flatMap((source) => source.bits.map((bit) => bit.id))),
  )
  const quietPolls = useRef(0)
  const regeneration = useSourceRegeneration({ sources, setSources, knownBitIds })
  const { fetchStatuses, applyStatuses } = regeneration

  const { claim: claimBit, release: releaseBit, isResolving: isBitResolving } =
    useResolvingSuggestions()
  const { claim: claimVariant, release: releaseVariant } = useResolvingSuggestions()
  const { claim: claimBitEdit, release: releaseBitEdit } = useResolvingSuggestions()
  const { decisions, rowErrors, approve, keepVariants, reject, undo, undoLast, markApproved } = useReviewDecisions({
    knownBitIds,
    claimBit,
    releaseBit,
  })
  const triage = useReviewTriage({
    findBit: (bitId) => sources.flatMap((source) => source.bits).find((bit) => bit.id === bitId),
    approve,
    keepVariants,
  })
  const { why, openGrade } = useReviewGrading({ sources, decisions })
  const pendingSources = sources.map((source) => ({
    ...source,
    bits: source.bits.filter((bit) => !decisions[bit.id]),
  }))
  const triageSession = useTriageSession({
    decisions,
    subjectId: singleSubjectId(pendingSources),
  })
  const allBits = pendingSources.flatMap((source) => source.bits)
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
    const statuses = await fetchStatuses()
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
    applyStatuses(statuses)
  }, [rowErrors, fetchStatuses, applyStatuses])

  const pollingGaveUp = useQuestionPolling(
    hasBitAwaitingQuestions(pendingSources) || !idleStopped || regeneration.isRegenerating,
    refreshQuestions,
    regeneration.isRegenerating ? REGENERATION_POLL_INTERVAL_MS : undefined,
    regeneration.isRegenerating ? REGENERATION_POLL_MAX_ATTEMPTS : undefined,
  )

  const handleEditingChange = useCallback((bitId: string, editing: boolean) => {
    if (editing) {
      editingBitIds.current.add(bitId)
    } else {
      editingBitIds.current.delete(bitId)
    }
  }, [])

  const bulk = useBulkApproval({
    sources: pendingSources,
    readyBits,
    setSources,
    markApproved,
    knownBitIds,
    editingBitIds,
    claimBit,
    releaseBit,
  })

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

      setSources((prev) => applyVariantEdit(prev, bitId, variantId, result.variantId, prompt, answer))

      return true
    } catch {
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

      setSources((prev) => applyBitEdit(prev, bitId, body, background))

      return true
    } catch {
      return false
    } finally {
      releaseBitEdit(bitId)
    }
  }

  function handleKey(action: ReviewKeyAction) {
    if (action === 'undo') {
      void undoLast()

      return
    }

    if (!focusedBit) {
      return
    }

    const variantIndex = variantIndexOf(action)

    if (action === 'next') {
      moveFocus(Math.min(activeIndex + 1, allBits.length - 1))
    } else if (action === 'previous') {
      moveFocus(Math.max(activeIndex - 1, 0))
    } else if (editingBitIds.current.has(focusedBit.id) || isBitResolving(focusedBit.id)) {
      return
    } else if (variantIndex !== null) {
      triage.onToggle?.(focusedBit.id, variantIndex)
    } else if (action === 'reject') {
      void reject(focusedBit.id)
    } else if (action === 'approve' || action === 'keep') {
      triage.onKeep?.(focusedBit.id)
    } else {
      const source = pendingSources.find((c) => c.bits.some((bit) => bit.id === focusedBit.id))

      if (source) {
        bulk.requestApproveSource(source.knowledgeSourceId)
      }
    }
  }

  useReviewKeyboard(handleKey)

  return (
    <div data-testid="knowledge-bit-review-panel" className="space-y-4">
      {hasBitAwaitingQuestions(pendingSources) && !pollingGaveUp ? (
        <p data-testid="knowledge-bit-review-progress" className="text-sm text-neutral-600">
          Writing cards… {readyBits.length} of {allBits.length} ready
        </p>
      ) : null}

      <TriageSessionSection session={triageSession} />

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
              decisions={decisions}
              pollingGaveUp={pollingGaveUp}
              rowErrors={rowErrors}
              isBitResolving={isBitResolving}
              isConfirmingBulk={bulk.confirmingSourceId === source.knowledgeSourceId}
              triage={triage}
              regeneration={regeneration.states[source.knowledgeSourceId]}
              regenerationActions={regeneration.actions}
              onRequestApproveSource={bulk.requestApproveSource}
              onConfirmBulk={bulk.confirmBulk}
              onCancelBulk={bulk.cancelBulk}
              onEditingChange={handleEditingChange}
              onApprove={approve}
              onReject={reject}
              onUndo={undo}
              onGrade={openGrade}
              hideGrading={triageSession.isOpen}
              onSaveVariant={saveVariant}
              onSaveBit={saveBit}
            />
          ))}
        </ul>
      )}

      {triageSession.isOpen ? null : <KnowledgeBitReviewWhyStrip why={why} />}
    </div>
  )
}
