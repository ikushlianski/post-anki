import { useEffect, useRef, useState } from 'react'
import type { CreateKnowledgeItemInput, PendingKnowledgeBitForReview } from '@post-anki/shared'
import { draftNote } from './knowledge-bit-review-note-edit'
import type { ManualDraft } from './knowledge-bit-review-manual-drafts'

const FIELD_MAX_CHARS = 300
const CREATE_DEBOUNCE_MS = 2000
const CLOZE_HINT =
  'Wrap each gap like {{c1::answer}} or {{c1::answer::hint}}. Each number becomes its own card.'

type CardMode = 'basic' | 'cloze'

interface Props {
  draft: ManualDraft
  bit: PendingKnowledgeBitForReview | undefined
  isResolving: boolean
  errorMessage: string | null
  onCreate: (input: CreateKnowledgeItemInput) => Promise<boolean>
  onCancel: () => void
  onEditingChange: (editing: boolean) => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
  onSaveVariant: (bitId: string, variantId: string, prompt: string, answer: string) => Promise<boolean>
  onSaveBit: (bitId: string, body: string, background: string | null) => Promise<boolean>
  onSaveNote: (variantId: string, text: string) => Promise<boolean>
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
  onSaveNote,
}: Props) {
  const { id: draftId } = draft

  const [front, setFront] = useState(() => bit?.variants[0]?.prompt ?? '')
  const [back, setBack] = useState(() => bit?.variants[0]?.answer ?? '')
  const [example, setExample] = useState(() => bit?.background ?? '')
  const [mode, setMode] = useState<CardMode>(() =>
    bit?.variants[0]?.kind === 'cloze' ? 'cloze' : 'basic',
  )
  const [note, setNote] = useState(() => bit?.variants[0]?.sentence ?? '')
  const savedNoteRef = useRef(note.trim())
  const createdRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const frontTooLong = front.length > FIELD_MAX_CHARS
  const isCloze = mode === 'cloze'
  const clozeDraft = draftNote('cloze', note)
  const hasNote = note.trim().length > 0
  const readyToCreate = isCloze
    ? hasNote && clozeDraft.problem === null
    : front.trim().length > 0 && back.trim().length > 0 && !frontTooLong

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
      const trimmedExample = example.trim() || undefined
      const success = await onCreate(
        isCloze
          ? { note: note.trim(), example: trimmedExample }
          : { front: front.trim(), back: back.trim(), example: trimmedExample },
      )

      if (success) {
        savedNoteRef.current = note.trim()
      } else {
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
    if (!bit || isCloze) {
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
    const variant = bit?.variants[0]

    if (!bit || !variant || !isCloze || clozeDraft.problem !== null) {
      return
    }

    const trimmed = note.trim()

    if (trimmed !== savedNoteRef.current) {
      savedNoteRef.current = trimmed
      void onSaveNote(variant.id, trimmed)
    }
  }, [note])

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
      {!bit && (
        <div>
          <button
            type="button"
            data-testid={`knowledge-bit-review-draft-mode-basic-${draftId}`}
            aria-pressed={!isCloze}
            onClick={() => setMode('basic')}
          >
            Front/Back
          </button>
          <button
            type="button"
            data-testid={`knowledge-bit-review-draft-mode-cloze-${draftId}`}
            aria-pressed={isCloze}
            onClick={() => setMode('cloze')}
          >
            Cloze
          </button>
        </div>
      )}
      {isCloze ? (
        <>
          <textarea
            data-testid={`knowledge-bit-review-draft-note-${draftId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note with gaps"
          />
          <p>{CLOZE_HINT}</p>
          {hasNote && clozeDraft.problem && (
            <span data-testid={`knowledge-bit-review-draft-problem-${draftId}`}>
              {clozeDraft.problem}
            </span>
          )}
          {hasNote && !clozeDraft.problem && (
            <ul data-testid={`knowledge-bit-review-draft-preview-${draftId}`}>
              {clozeDraft.previews.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
      <textarea
        data-testid={`knowledge-bit-review-draft-example-${draftId}`}
        value={example}
        onChange={(e) => setExample(e.target.value)}
        placeholder="Example (optional)"
      />

      {!isCloze && frontTooLong && (
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
