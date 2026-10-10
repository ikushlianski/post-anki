import { useCallback, useRef, useState } from 'react'
import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import {
  approveKnowledgeBitForReview,
  bulkApproveKnowledgeBitsForReview,
  editKnowledgeBitForReview,
  getPendingKnowledgeBitsForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import {
  applyBitEdit,
  applyVariantEdit,
  removeBit,
  removeBits,
} from './knowledge-bit-review-sources'
import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'
import { notifyPendingReviewChanged } from './knowledge-bit-review-events'
import { useReviewKeyboard, type ReviewKeyAction } from './knowledge-bit-review-keyboard'
import {
  hasBitAwaitingQuestions,
  mergeArrivedVariants,
  useQuestionPolling,
} from './knowledge-bit-review-polling'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

const SOURCE_TEXT_PREVIEW_LENGTH = 400

export function KnowledgeBitReviewPanel({
  initialSources,
}: {
  initialSources: PendingKnowledgeSourceForReview[]
}) {
  const [sources, setSources] = useState(initialSources)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const editingBitIds = useRef(new Set<string>())

  const allBits = sources.flatMap((source) => source.bits)
  const focusedBit = allBits[Math.min(focusedIndex, allBits.length - 1)]
  const readyBits = allBits.filter((bit) => bit.variants.length > 0)

  const refreshQuestions = useCallback(async () => {
    const fresh = await getPendingKnowledgeBitsForReview()

    setSources((prev) => mergeArrivedVariants(prev, fresh))
  }, [])

  const pollingGaveUp = useQuestionPolling(hasBitAwaitingQuestions(sources), refreshQuestions)

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

      setSources((prev) => removeBit(prev, bitId))
      notifyPendingReviewChanged()
    } catch {
      // Row stays listed on failure so the decision can be retried.
      setRowError(bitId, "Couldn't approve. Try again.")
    } finally {
      releaseBit(bitId)
    }
  }

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

      const gone = new Set([
        ...result.approved,
        ...result.skipped.filter((item) => item.reason !== 'no_variant').map((item) => item.id),
      ])

      setSources((prev) => removeBits(prev, gone))
      notifyPendingReviewChanged()

      if (result.skipped.length > 0) {
        setBulkMessage(
          `Approved ${result.approved.length}, skipped ${result.skipped.length} that could not be approved.`,
        )
      }
    } catch {
      setBulkMessage('Could not approve these suggestions. Try again.')
    } finally {
      claimed.forEach(releaseBit)
    }
  }

  async function reject(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    setRowError(bitId, null)

    try {
      await rejectKnowledgeBitForReview({ data: { bitId } })

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

    const at = allBits.indexOf(focusedBit)

    if (action === 'next') {
      setFocusedIndex(Math.min(at + 1, allBits.length - 1))
    } else if (action === 'previous') {
      setFocusedIndex(Math.max(at - 1, 0))
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

      void approveMany(source?.bits ?? [])
    }
  }

  useReviewKeyboard(handleKey)

  return (
    <div data-testid="knowledge-bit-review-panel" className="space-y-4">
      {readyBits.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="knowledge-bit-review-approve-all"
            onClick={() => approveMany(readyBits)}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
          >
            Approve all ready ({readyBits.length})
          </button>
          <span className="text-xs text-neutral-400">
            Keys: j/k move, a approve, r reject, Shift+A approve all from source
          </span>
        </div>
      ) : null}

      {bulkMessage ? (
        <p data-testid="knowledge-bit-review-bulk-message" className="text-xs text-neutral-600">
          {bulkMessage}
        </p>
      ) : null}

      {sources.length === 0 ? (
        <p data-testid="knowledge-bit-review-empty-state" className="text-sm text-neutral-500">
          No pending knowledge bits.
        </p>
      ) : (
        <ul className="space-y-4">
          {sources.map((source) => (
            <li
              key={source.knowledgeSourceId}
              data-testid={`knowledge-bit-review-source-${source.knowledgeSourceId}`}
              className="rounded-lg border border-neutral-300 bg-neutral-50 p-3"
            >
              <details className="text-xs text-neutral-600">
                <summary className="cursor-pointer select-none">Source text</summary>
                <p className="mt-1 whitespace-pre-wrap">
                  {source.sourceText
                    ? source.sourceText.slice(0, SOURCE_TEXT_PREVIEW_LENGTH)
                    : 'No source text available.'}
                  {source.sourceText && source.sourceText.length > SOURCE_TEXT_PREVIEW_LENGTH
                    ? '…'
                    : ''}
                </p>
              </details>

              {source.bits.filter((bit) => bit.variants.length > 0).length > 1 ? (
                <button
                  type="button"
                  data-testid={`knowledge-bit-review-approve-source-${source.knowledgeSourceId}`}
                  onClick={() => approveMany(source.bits)}
                  className="mt-2 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
                >
                  Approve all from this source
                </button>
              ) : null}

              <ul className="mt-3 space-y-3">
                {source.bits.map((bit) => (
                  <KnowledgeBitReviewItem
                    key={bit.id}
                    bit={bit}
                    isResolving={isBitResolving(bit.id)}
                    isSavingVariant={isVariantSaving}
                    isSavingBit={isBitSaving}
                    isFocused={focusedBit?.id === bit.id}
                    pollingGaveUp={pollingGaveUp}
                    errorMessage={rowErrors[bit.id] || null}
                    onEditingChange={handleEditingChange}
                    onApprove={approve}
                    onReject={reject}
                    onSaveVariant={saveVariant}
                    onSaveBit={saveBit}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
