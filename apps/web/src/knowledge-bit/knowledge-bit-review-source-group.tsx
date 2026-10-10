import type {
  PendingKnowledgeBitForReview,
  PendingKnowledgeSourceForReview,
} from '@post-anki/shared'

import { KnowledgeBitReviewItem } from './knowledge-bit-review-item'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

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
      className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details className="min-w-0 text-xs text-neutral-600">
          <summary className="cursor-pointer select-none rounded-sm font-medium text-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
            Source text
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
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
            className={SECONDARY_BUTTON_CLASS}
          >
            Approve all from this source
          </button>
        ) : null}
      </div>

      <ul className="space-y-3">
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
