import { useEffect, useRef, useState } from 'react'
import type { PendingKnowledgeBitForReview } from '@post-anki/shared'
import type { ManualDraft } from './knowledge-bit-review-manual-drafts'

const FIELD_MAX_CHARS = 300
const CREATE_DEBOUNCE_MS = 2000

interface Props {
  draft: ManualDraft
  bit: PendingKnowledgeBitForReview | undefined
  isResolving: boolean
  errorMessage: string | null
  onCreate: (input: { front: string; back: string; example?: string }) => Promise<boolean>
  onCancel: () => void
  onEditingChange: (editing: boolean) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
  onSaveVariant: (bitId: string, variantId: string, prompt: string, answer: string) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
}

export function KnowledgeBitReviewDraftCard({
  draft,
  bit,
  isResolving,
  errorMessage,
  onCreate,
  onCancel,
  onApprove,
  onReject,
  onSaveVariant,
  onSaveBit,
}: Props) {
  const { id: draftId } = draft

  const [front, setFront] = useState(() => bit?.variants[0]?.prompt ?? '')
  const [back, setBack] = useState(() => bit?.variants[0]?.answer ?? '')
  const [example, setExample] = useState(() => bit?.background ?? '')
  const createdRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const frontTooLong = front.length > FIELD_MAX_CHARS
  const readyToCreate = front.trim().length > 0 && back.trim().length > 0 && !frontTooLong

  useEffect(() => {
    if (bit || createdRef.current) {
      return
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!readyToCreate) {
      return
    }

    debounceRef.current = setTimeout(async () => {
      if (createdRef.current) {
        return
      }

      createdRef.current = true
      const success = await onCreate({
        front: front.trim(),
        back: back.trim(),
        example: example.trim() || undefined,
      })

      if (!success) {
        createdRef.current = false
      }
    }, CREATE_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  })

  useEffect(() => {
    if (!bit) {
      return
    }

    const savedFront = bit.variants[0]?.prompt
    const savedBack = bit.variants[0]?.answer

    if (front.trim() !== savedFront || back.trim() !== savedBack) {
      const variant = bit.variants[0]

      if (variant) {
        void onSaveVariant(bit.id, variant.id, front.trim(), back.trim())
      }
    }
  }, [front, back])

  useEffect(() => {
    if (!bit) {
      return
    }

    const saved = bit.background ?? ''

    if (example.trim() !== saved) {
      void onSaveBit(bit.id, bit.body, example.trim() || null)
    }
  }, [example])

  return (
    <li>
      <input
        data-testid={`knowledge-bit-review-draft-front-${draftId}`}
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Front"
      />
      <input
        data-testid={`knowledge-bit-review-draft-back-${draftId}`}
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Back"
      />
      <textarea
        data-testid={`knowledge-bit-review-draft-example-${draftId}`}
        value={example}
        onChange={(e) => setExample(e.target.value)}
        placeholder="Example (optional)"
      />

      {frontTooLong && (
        <span data-testid={`knowledge-bit-review-draft-limit-${draftId}`}>
          Front is over {FIELD_MAX_CHARS} characters
        </span>
      )}

      {errorMessage && <span>{errorMessage}</span>}

      {!bit && (
        <button
          data-testid={`knowledge-bit-review-draft-cancel-${draftId}`}
          onClick={onCancel}
          disabled={isResolving}
        >
          Cancel
        </button>
      )}

      {bit && (
        <>
          <button
            data-testid={`knowledge-bit-review-approve-${bit.id}`}
            onClick={() => onApprove(bit.id)}
            disabled={isResolving}
          >
            Approve
          </button>
          <button
            data-testid={`knowledge-bit-review-reject-${bit.id}`}
            onClick={() => onReject(bit.id)}
            disabled={isResolving}
          >
            Reject
          </button>
        </>
      )}
    </li>
  )
}
