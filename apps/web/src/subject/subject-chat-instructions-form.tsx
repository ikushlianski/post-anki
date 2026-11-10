import { useState } from 'react'
import type { FormEvent } from 'react'

import { CHAT_INSTRUCTIONS_MAX_CHARS } from '@post-anki/shared'

export interface SubjectChatInstructionsFormProps {
  subjectId: string
  initialValue: string
  busy: boolean
  error: string | null
  onSubmit: (chatInstructions: string | null) => void
  onCancel: () => void
}

const INPUT_CLASS = 'rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500'

export function SubjectChatInstructionsForm({
  subjectId,
  initialValue,
  busy,
  error,
  onSubmit,
  onCancel,
}: SubjectChatInstructionsFormProps) {
  const [value, setValue] = useState(initialValue)
  const id = `subject-chat-${subjectId}`

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(value.trim() || null)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-2 p-2">
      <label htmlFor={`${id}-instructions`} className="text-xs text-neutral-600">
        Who the chat assistant should be for cards in this subject. Leave empty to use the parent subject's, if any.
      </label>
      <textarea
        id={`${id}-instructions`}
        rows={6}
        value={value}
        disabled={busy}
        maxLength={CHAT_INSTRUCTIONS_MAX_CHARS}
        data-testid={`${id}-instructions`}
        onChange={(event) => setValue(event.target.value)}
        className={INPUT_CLASS}
      />
      {error ? (
        <p role="alert" data-testid={`${id}-error`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-testid={`${id}-cancel`}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          data-testid={`${id}-confirm`}
          className="font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </form>
  )
}
