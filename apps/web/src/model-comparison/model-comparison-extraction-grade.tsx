import { useRef } from 'react'

import { AUTOSAVE_STATUS_TEXT, useAutoSave } from '../knowledge-bit/knowledge-bit-review-autosave'
import { ModelComparisonGradePicker } from './model-comparison-grade-picker'

export function ModelComparisonExtractionGrade({
  modelId,
  initialRating,
  initialNote,
  saveRating,
  saveNote,
}: {
  modelId: string
  initialRating: number | null
  initialNote: string | null
  saveRating: (rating: number) => Promise<boolean>
  saveNote: (note: string) => Promise<boolean>
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const startNote = initialNote ?? ''

  const status = useAutoSave({
    initial: { note: startNote },
    read: () => ({ note: noteRef.current?.value ?? startNote }),
    isValid: () => true,
    save: (fields) => saveNote(fields.note),
    onBusyChange: () => undefined,
  })

  return (
    <div className="space-y-2 pt-3" data-testid={`model-comparison-extraction-${modelId}`}>
      <ModelComparisonGradePicker
        label="How well was this excerpt split into cards?"
        initial={initialRating}
        onSelect={saveRating}
        testId={`model-comparison-extraction-${modelId}-rating`}
      />
      <textarea
        ref={noteRef}
        rows={2}
        defaultValue={startNote}
        placeholder="Optional note about the split"
        aria-label="Note about the split"
        data-testid={`model-comparison-extraction-${modelId}-note`}
        className="field-sizing-content min-h-[44px] w-full resize-y rounded-md bg-neutral-100/70 px-3 py-2 text-sm sm:min-h-0 text-neutral-900 placeholder:text-neutral-400 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300"
      />
      <p
        aria-live="polite"
        data-testid={`model-comparison-extraction-${modelId}-note-status`}
        className={`h-4 text-xs ${status === 'error' ? 'text-red-600' : 'text-neutral-400'}`}
      >
        {AUTOSAVE_STATUS_TEXT[status]}
      </p>
    </div>
  )
}
