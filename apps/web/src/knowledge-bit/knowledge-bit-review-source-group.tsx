import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'

const SOURCE_TEXT_PREVIEW_LENGTH = 400

export function KnowledgeBitReviewSourceGroup({
  source,
  focusedBitId,
  pollingGaveUp,
  rowErrors,
  isBitResolving,
  isVariantSaving,
  isBitSaving,
  onApproveMany,
  onEditingChange,
  onApprove,
  onReject,
  onSaveVariant,
  onSaveBit,
}: {
  source: PendingKnowledgeSourceForReview
  focusedBitId: string | undefined
  pollingGaveUp: boolean
  rowErrors: Record<string, string>
  isBitResolving: (bitId: string) => boolean
  isVariantSaving: (variantId: string) => boolean
  isBitSaving: (bitId: string) => boolean
  onApproveMany: (bits: PendingKnowledgeBitForReview[]) => void
  onEditingChange: (bitId: string, editing: boolean) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
}) {
  return (
    <li
      data-testid={`knowledge-bit-review-source-${source.knowledgeSourceId}`}
      className="rounded-lg border border-neutral-300 bg-neutral-50 p-3"
    >
      <details className="text-xs text-neutral-600">
        <summary className="cursor-pointer select-none">Source text</summary>
        <p className="mt-1 whitespace-pre-wrap">
          {source.sourceText
            ? source.sourceText.slice(0, SOURCE_TEXT_PREVIEW_LENGTH)
            : 'No source text available.'}
          {source.sourceText && source.sourceText.length > SOURCE_TEXT_PREVIEW_LENGTH ? '…' : ''}
        </p>
      </details>

      {source.bits.filter((bit) => bit.variants.length > 0).length > 1 ? (
        <button
          type="button"
          data-testid={`knowledge-bit-review-approve-source-${source.knowledgeSourceId}`}
          onClick={() => onApproveMany(source.bits)}
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
            isFocused={focusedBitId === bit.id}
            pollingGaveUp={pollingGaveUp}
            errorMessage={rowErrors[bit.id] || null}
            onEditingChange={onEditingChange}
            onApprove={onApprove}
            onReject={onReject}
            onSaveVariant={onSaveVariant}
            onSaveBit={onSaveBit}
          />
        ))}
      </ul>
    </li>
  )
}
