import { useCallback, useEffect, useRef, useState } from 'react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'

import { AiLabelBadge } from './ai-label-badge'
import { TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'
import { KnowledgeBitReviewExampleField } from './knowledge-bit-review-card-fields'
import { KnowledgeBitReviewVariantList } from './knowledge-bit-review-variant-list'

const ACTION_CLASS =
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'

interface KnowledgeBitFocusCardProps {
  bit: PendingKnowledgeBitForReview
  subjectName: string | null
  sourceText: string | null
  isResolving: boolean
  pollingGaveUp?: boolean
  errorMessage?: string | null
  note?: string
  onNoteChange?: (note: string) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
  onEditingChange?: (bitId: string, editing: boolean) => void
  onSaveVariant: (
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
}

function FocusCardBody({
  bit,
  subjectName,
  sourceText,
  isResolving,
  pollingGaveUp = false,
  errorMessage = null,
  note = '',
  onNoteChange,
  onApprove,
  onReject,
  onEditingChange,
  onSaveVariant,
  onSaveBit,
}: KnowledgeBitFocusCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())

  const setBusy = useCallback((key: string, busy: boolean) => {
    setBusyKeys((prev) => {
      if (prev.has(key) === busy) {
        return prev
      }

      const next = new Set(prev)

      if (busy) {
        next.add(key)
      } else {
        next.delete(key)
      }

      return next
    })
  }, [])

  const hasUnsavedEdits = busyKeys.size > 0
  const hasNoVariants = bit.variants.length === 0
  const actionsDisabled = isResolving || hasUnsavedEdits
  const approveDisabled = actionsDisabled || hasNoVariants

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    onEditingChange?.(bit.id, hasUnsavedEdits)

    return () => onEditingChange?.(bit.id, false)
  }, [bit.id, hasUnsavedEdits, onEditingChange])

  return (
    <article
      data-testid={`knowledge-bit-focus-card-${bit.id}`}
      className="mx-auto flex min-h-full w-full max-w-2xl flex-col"
    >
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="space-y-2">
          <p
            data-testid="knowledge-bit-focus-subject"
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            {subjectName ?? 'No subject'}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            data-testid="knowledge-bit-focus-statement"
            className="text-lg font-semibold leading-snug text-neutral-900 outline-none"
          >
            {bit.body}
          </h2>
          <AiLabelBadge
            isAiGenerated={bit.isAiGenerated}
            sourceLinks={bit.sourceLinks}
            testIdSuffix={`-${bit.id}`}
          />
          {sourceText ? (
            <details data-testid="knowledge-bit-focus-source" className="text-sm text-neutral-600">
              <summary className="min-h-11 cursor-pointer py-2 text-xs font-medium">
                Where this came from
              </summary>
              <p className="whitespace-pre-wrap rounded-md bg-white p-3">{sourceText}</p>
            </details>
          ) : null}
        </div>

        <KnowledgeBitReviewVariantList
          bitId={bit.id}
          variants={bit.variants}
          pollingGaveUp={pollingGaveUp}
          defaultOpen
          onSave={(variantId, prompt, answer) => onSaveVariant(bit.id, variantId, prompt, answer)}
          onBusyChange={setBusy}
        />

        {hasNoVariants ? null : (
          <KnowledgeBitReviewExampleField
            bitId={bit.id}
            example={bit.background ?? ''}
            onSave={(example) => onSaveBit(bit.id, bit.body, example)}
            onBusyChange={(busy) => setBusy('example', busy)}
          />
        )}

        {onNoteChange ? (
          <label className="block space-y-1 text-sm text-neutral-700">
            <span className="text-xs font-medium text-neutral-600">Note (optional)</span>
            <textarea
              data-testid="knowledge-bit-focus-note"
              value={note}
              maxLength={500}
              rows={2}
              placeholder="Why approve or reject? Helps future cards."
              onChange={(event) => onNoteChange(event.target.value)}
              className={TEXT_FIELD_CLASS}
            />
          </label>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            data-testid={`knowledge-bit-review-error-${bit.id}`}
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex gap-3 border-t border-neutral-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          data-testid={`knowledge-bit-focus-reject-${bit.id}`}
          disabled={actionsDisabled}
          onClick={() => onReject(bit.id)}
          className={`${ACTION_CLASS} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`}
        >
          <span aria-hidden="true" className="hidden text-neutral-500 sm:inline">←</span>
          Reject
        </button>
        <button
          type="button"
          data-testid={`knowledge-bit-focus-approve-${bit.id}`}
          disabled={approveDisabled}
          onClick={() => onApprove(bit.id)}
          className={`${ACTION_CLASS} bg-neutral-900 text-white hover:bg-neutral-800`}
        >
          Approve
          <span aria-hidden="true" className="hidden text-neutral-300 sm:inline">→</span>
        </button>
      </div>
    </article>
  )
}

export function KnowledgeBitFocusCard(props: KnowledgeBitFocusCardProps) {
  return <FocusCardBody key={props.bit.id} {...props} />
}
