import { useId, useRef, useState } from 'react'

import { useAutoSave } from './knowledge-bit-review-autosave'
import { BORDERLESS_FIELD_CLASS, StatusLine } from './knowledge-bit-review-card-fields'
import { draftNote, type NoteEditTarget } from './knowledge-bit-review-note-edit'

const HINTS = {
  cloze: 'Wrap each gap like {{c1::answer}} or {{c1::answer::hint}}. Each number becomes its own card.',
  list: 'Title on the first line, then one step per line (3 to 8 steps). Each step becomes its own cards.',
}

export function KnowledgeBitReviewNoteField({
  bitId,
  target,
  onSave,
  onBusyChange,
}: {
  bitId: string
  target: NoteEditTarget
  onSave: (text: string) => Promise<boolean>
  onBusyChange: (busy: boolean) => void
}) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(target.text)
  const { mode } = target
  const draft = draftNote(mode, text)

  const status = useAutoSave({
    initial: { text: target.text },
    read: () => ({ text: ref.current?.value ?? text }),
    isValid: (fields) => draftNote(mode, fields.text).problem === null,
    save: (fields) => onSave(fields.text.trim()),
    onBusyChange,
  })

  return (
    <div data-testid={`knowledge-bit-review-note-${bitId}`} className="space-y-2">
      <div className="space-y-1">
        <label htmlFor={id} className="text-xs font-medium text-neutral-500">
          {mode === 'list' ? 'Ordered list' : 'Note with gaps'}
        </label>
        <textarea
          id={id}
          ref={ref}
          data-testid={`knowledge-bit-review-edit-note-${bitId}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={mode === 'list' ? 5 : 3}
          className={`${BORDERLESS_FIELD_CLASS} font-semibold`}
        />
      </div>
      <p className="text-xs text-neutral-500">{HINTS[mode]}</p>
      {draft.problem ? (
        <p data-testid={`knowledge-bit-review-note-problem-${bitId}`} className="text-xs text-red-600">
          {draft.problem}
        </p>
      ) : (
        <ul data-testid={`knowledge-bit-review-note-preview-${bitId}`} className="space-y-0.5 text-xs text-neutral-600">
          {draft.previews.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      <StatusLine status={status} testId={`knowledge-bit-review-note-status-${bitId}`} />
    </div>
  )
}
