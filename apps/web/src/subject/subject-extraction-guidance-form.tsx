import { useState } from 'react'
import type { FormEvent } from 'react'

import {
  EXTRACTION_EXAMPLES_MAX_COUNT,
  EXTRACTION_EXAMPLE_FIELD_MAX_CHARS,
  EXTRACTION_INSTRUCTIONS_MAX_CHARS,
  type ExtractionExample,
} from '@post-anki/shared'

export interface ExtractionGuidanceDraft {
  extractionInstructions: string | null
  extractionExamples: ExtractionExample[] | null
}

export interface SubjectExtractionGuidanceFormProps {
  subjectId: string
  initialInstructions: string
  initialExamples: ExtractionExample[]
  busy: boolean
  error: string | null
  onSubmit: (draft: ExtractionGuidanceDraft) => void
  onCancel: () => void
}

interface ExampleRow {
  front: string
  back: string
  example: string
}

const INPUT_CLASS = 'rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500'

export function toDraft(instructions: string, rows: ExampleRow[]): ExtractionGuidanceDraft {
  const examples = rows
    .map((row) => ({ front: row.front.trim(), back: row.back.trim(), example: row.example.trim() }))
    .filter((row) => row.front && row.back)
    .map(({ front, back, example }) => (example ? { front, back, example } : { front, back }))

  return {
    extractionInstructions: instructions.trim() || null,
    extractionExamples: examples.length > 0 ? examples : null,
  }
}

export function SubjectExtractionGuidanceForm({
  subjectId,
  initialInstructions,
  initialExamples,
  busy,
  error,
  onSubmit,
  onCancel,
}: SubjectExtractionGuidanceFormProps) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [rows, setRows] = useState<ExampleRow[]>(
    initialExamples.map((e) => ({ front: e.front, back: e.back, example: e.example ?? '' })),
  )
  const id = `subject-guidance-${subjectId}`

  function updateRow(index: number, patch: Partial<ExampleRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(toDraft(instructions, rows))
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-2 p-2">
      <label htmlFor={`${id}-instructions`} className="text-xs text-neutral-600">
        Extra instructions for cards in this subject. Leave empty to use the parent subject's, if any.
      </label>
      <textarea
        id={`${id}-instructions`}
        rows={4}
        value={instructions}
        disabled={busy}
        maxLength={EXTRACTION_INSTRUCTIONS_MAX_CHARS}
        data-testid={`${id}-instructions`}
        onChange={(event) => setInstructions(event.target.value)}
        className={INPUT_CLASS}
      />
      <p className="text-xs text-neutral-600">Example cards (optional, up to {EXTRACTION_EXAMPLES_MAX_COUNT}).</p>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-1 rounded border border-neutral-200 p-1">
          {(['front', 'back', 'example'] as const).map((field) => (
            <input
              key={field}
              value={row[field]}
              disabled={busy}
              maxLength={EXTRACTION_EXAMPLE_FIELD_MAX_CHARS}
              placeholder={field === 'example' ? 'example (optional)' : field}
              aria-label={`Example ${index + 1} ${field}`}
              data-testid={`${id}-example-${index}-${field}`}
              onChange={(event) => updateRow(index, { [field]: event.target.value })}
              className={INPUT_CLASS}
            />
          ))}
          <button
            type="button"
            disabled={busy}
            data-testid={`${id}-example-${index}-remove`}
            onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            className="self-end text-xs text-neutral-500 hover:text-neutral-900"
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < EXTRACTION_EXAMPLES_MAX_COUNT ? (
        <button
          type="button"
          disabled={busy}
          data-testid={`${id}-add-example`}
          onClick={() => setRows((current) => [...current, { front: '', back: '', example: '' }])}
          className="self-start text-xs text-indigo-600 hover:text-indigo-700"
        >
          Add example
        </button>
      ) : null}
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
