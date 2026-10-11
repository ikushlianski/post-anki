import { useId, useRef } from 'react'
import type { PendingKnowledgeBitQuestionVariant } from '@post-anki/shared'

import { AUTOSAVE_STATUS_TEXT, useAutoSave } from './knowledge-bit-review-autosave'

export const BORDERLESS_FIELD_CLASS =
  'field-sizing-content w-full resize-none rounded-md bg-neutral-100/70 px-3 py-2 text-sm leading-relaxed text-neutral-900 placeholder:text-neutral-400 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300'

export function ReviewField({
  id,
  label,
  testId,
  defaultValue,
  placeholder,
  fieldRef,
  strong = false,
}: {
  id: string
  label: string
  testId: string
  defaultValue: string
  placeholder?: string
  fieldRef: React.Ref<HTMLTextAreaElement>
  strong?: boolean
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-500">
        {label}
      </label>
      <textarea
        id={id}
        ref={fieldRef}
        data-testid={testId}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={1}
        className={`${BORDERLESS_FIELD_CLASS} ${strong ? 'font-semibold' : ''}`}
      />
    </div>
  )
}

export function StatusLine({ status, testId }: { status: keyof typeof AUTOSAVE_STATUS_TEXT; testId: string }) {
  return (
    <p
      aria-live="polite"
      data-testid={testId}
      className={`h-4 text-xs ${status === 'error' ? 'text-red-600' : 'text-neutral-400'}`}
    >
      {AUTOSAVE_STATUS_TEXT[status]}
    </p>
  )
}

export function KnowledgeBitReviewCardFields({
  variant,
  onSave,
  onBusyChange,
}: {
  variant: PendingKnowledgeBitQuestionVariant
  onSave: (variantId: string, prompt: string, answer: string) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}) {
  const promptId = useId()
  const answerId = useId()
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const answerRef = useRef<HTMLTextAreaElement>(null)
  const variantId = useRef(variant.id)

  variantId.current = variant.id

  const status = useAutoSave({
    initial: { prompt: variant.prompt, answer: variant.answer },
    read: () => ({
      prompt: promptRef.current?.value ?? variant.prompt,
      answer: answerRef.current?.value ?? variant.answer,
    }),
    isValid: (fields) => fields.prompt.trim().length > 0 && fields.answer.trim().length > 0,
    save: (fields) => onSave(variantId.current, fields.prompt.trim(), fields.answer.trim()),
    onBusyChange,
  })

  return (
    <div data-testid={`knowledge-bit-review-variant-${variant.id}`} className="space-y-3">
      <ReviewField
        id={promptId}
        label="Front"
        testId={`knowledge-bit-review-edit-prompt-${variant.id}`}
        defaultValue={variant.prompt}
        fieldRef={promptRef}
        strong
      />
      <ReviewField
        id={answerId}
        label="Back"
        testId={`knowledge-bit-review-edit-answer-${variant.id}`}
        defaultValue={variant.answer}
        fieldRef={answerRef}
      />
      <StatusLine status={status} testId={`knowledge-bit-review-autosave-status-${variant.id}`} />
    </div>
  )
}

export function KnowledgeBitReviewExampleField({
  bitId,
  example,
  onSave,
  onBusyChange,
}: {
  bitId: string
  example: string
  onSave: (example: string | null) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)

  const status = useAutoSave({
    initial: { example },
    read: () => ({ example: ref.current?.value ?? example }),
    isValid: () => true,
    save: (fields) => onSave(fields.example.trim().length > 0 ? fields.example.trim() : null),
    onBusyChange,
  })

  return (
    <div className="space-y-1">
      <ReviewField
        id={id}
        label="Example"
        testId={`knowledge-bit-review-edit-example-${bitId}`}
        defaultValue={example}
        placeholder="Optional: an example that helps to remember it"
        fieldRef={ref}
      />
      <StatusLine status={status} testId={`knowledge-bit-review-example-status-${bitId}`} />
    </div>
  )
}
