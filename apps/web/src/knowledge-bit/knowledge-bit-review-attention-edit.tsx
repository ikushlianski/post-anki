import { useState } from 'react'

import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'

export const ATTENTION_TEXT_MAX_CHARS = 50_000

export function attentionTextProblem(text: string): string | null {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return 'Enter some text to retry with.'
  }

  if (trimmed.length > ATTENTION_TEXT_MAX_CHARS) {
    return 'The text is over 50,000 characters. Shorten it and try again.'
  }

  return null
}

export function KnowledgeBitReviewAttentionEdit({
  sourceId,
  initialText,
  onSubmit,
  onCancel,
}: {
  sourceId: string
  initialText: string
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)
  const [problem, setProblem] = useState<string | null>(null)
  const testId = `knowledge-bit-review-attention-${sourceId}`

  function submit() {
    const found = attentionTextProblem(text)

    setProblem(found)

    if (!found) {
      onSubmit(text.trim())
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-neutral-800">
        Note text
        <textarea
          data-testid={`${testId}-text`}
          value={text}
          rows={6}
          onChange={(event) => setText(event.target.value)}
          className={`mt-1 ${TEXT_FIELD_CLASS}`}
        />
      </label>
      {problem ? (
        <p role="alert" data-testid={`${testId}-problem`} className="text-sm text-red-700">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" data-testid={`${testId}-edit-submit`} onClick={submit} className={PRIMARY_BUTTON_CLASS}>
          Save text and retry
        </button>
        <button type="button" data-testid={`${testId}-edit-cancel`} onClick={onCancel} className={SECONDARY_BUTTON_CLASS}>
          Cancel
        </button>
      </div>
    </div>
  )
}
