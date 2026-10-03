import { useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  approveKnowledgeBitForReview,
  editKnowledgeBitForReview,
  editKnowledgeBitQuestionVariantForReview,
  rejectKnowledgeBitForReview,
} from './knowledge-bit-review.api'
import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

const SOURCE_TEXT_PREVIEW_LENGTH = 400

function removeBit(
  sources: PendingKnowledgeSourceForReview[],
  bitId: string,
): PendingKnowledgeSourceForReview[] {
  return sources
    .map((source) => ({ ...source, bits: source.bits.filter((bit) => bit.id !== bitId) }))
    .filter((source) => source.bits.length > 0)
}

export function KnowledgeBitReviewPanel({
  initialSources,
}: {
  initialSources: PendingKnowledgeSourceForReview[]
}) {
  const [sources, setSources] = useState(initialSources)

  const { claim: claimBit, release: releaseBit, isResolving: isBitResolving } =
    useResolvingSuggestions()
  const { claim: claimVariant, release: releaseVariant, isResolving: isVariantSaving } =
    useResolvingSuggestions()
  const { claim: claimBitEdit, release: releaseBitEdit, isResolving: isBitSaving } =
    useResolvingSuggestions()

  async function approve(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    try {
      await approveKnowledgeBitForReview({ data: { bitId } })

      setSources((prev) => removeBit(prev, bitId))
    } catch {
      // Row stays listed on failure so the decision can be retried.
    } finally {
      releaseBit(bitId)
    }
  }

  async function reject(bitId: string) {
    if (!claimBit(bitId)) {
      return
    }

    try {
      await rejectKnowledgeBitForReview({ data: { bitId } })

      setSources((prev) => removeBit(prev, bitId))
    } catch {
      // Same retry posture as approve above.
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

      // The edit supersedes rather than mutates — the server hands back a new
      // variant id, which must replace the old one in local state or a
      // second edit (or a re-edit after a typo) would PATCH an id that's
      // already superseded and get a 404.
      setSources((prev) =>
        prev.map((source) => ({
          ...source,
          bits: source.bits.map((bit) =>
            bit.id !== bitId
              ? bit
              : {
                  ...bit,
                  variants: bit.variants.map((variant) =>
                    variant.id !== variantId
                      ? variant
                      : { ...variant, id: result.variantId, prompt, answer },
                  ),
                },
          ),
        })),
      )

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

      // A real body change makes the server delete the bit's existing question
      // variants and re-arm generation for fresh ones (same cascade
      // updateKnowledgeBitBody always ran) — so the stale prompt/answer pairs
      // must be cleared here too, or the screen keeps showing already-deleted
      // content as if it were still current and approvable. A background-only
      // edit (body unchanged) never triggers that cascade, so variants are kept.
      setSources((prev) =>
        prev.map((source) => ({
          ...source,
          bits: source.bits.map((bit) =>
            bit.id !== bitId
              ? bit
              : { ...bit, body, background, variants: bit.body === body ? bit.variants : [] },
          ),
        })),
      )

      return true
    } catch {
      // Editor stays open on failure so the edit can be retried.
      return false
    } finally {
      releaseBitEdit(bitId)
    }
  }

  return (
    <div data-testid="knowledge-bit-review-panel" className="space-y-4">
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

              <ul className="mt-3 space-y-3">
                {source.bits.map((bit) => (
                  <KnowledgeBitReviewItem
                    key={bit.id}
                    bit={bit}
                    isResolving={isBitResolving(bit.id)}
                    isSavingVariant={isVariantSaving}
                    isSavingBit={isBitSaving}
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
