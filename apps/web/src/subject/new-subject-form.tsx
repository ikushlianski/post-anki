import { useState } from 'react'

import type { ComplexityLevel } from '@post-anki/shared'

import { SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import { ComplexityLevelPicker, complexityInput, type ComplexityChoice } from './complexity-level-picker'
import { SearchableSelect } from '../ui/searchable-select'
import type { SearchableOption } from '../ui/searchable-select'

interface NewSubjectFormProps {
  testIdPrefix: string
  options: readonly SearchableOption[]
  busy: boolean
  confirmLabel: string
  onSubmit: (input: { name: string; parentId: string | null; complexityLevel?: ComplexityLevel }) => void
  onBack: () => void
}

export function NewSubjectForm({ testIdPrefix, options, busy, confirmLabel, onSubmit, onBack }: NewSubjectFormProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [complexity, setComplexity] = useState<ComplexityChoice | null>(null)
  const picked = complexity ?? (parentId ? 'inherit' : 'normal')
  const shownComplexity = !parentId && picked === 'inherit' ? 'normal' : picked
  const trimmed = name.trim()

  function submit() {
    onSubmit({
      name: trimmed,
      parentId: parentId || null,
      ...complexityInput(shownComplexity, parentId !== ''),
    })
  }

  return (
    <>
      <input
        aria-label="New subject name"
        data-testid={`${testIdPrefix}-new-name`}
        value={name}
        maxLength={60}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') {
            return
          }

          event.preventDefault()

          if (trimmed.length > 0 && !busy) {
            submit()
          }
        }}
        className={TEXT_FIELD_CLASS}
      />
      <SearchableSelect
        ariaLabel="Parent subject"
        testId={`${testIdPrefix}-parent`}
        options={options}
        value={parentId}
        onChange={setParentId}
        placeholder="Top level (no parent)"
        clearable
      />
      <ComplexityLevelPicker
        value={shownComplexity}
        onChange={setComplexity}
        allowInherit={parentId !== ''}
        disabled={busy}
        testId={`${testIdPrefix}-complexity`}
      />
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`${testIdPrefix}-create`}
          disabled={busy || trimmed.length === 0}
          onClick={submit}
          className={SECONDARY_BUTTON_CLASS}
        >
          {busy ? 'Saving…' : confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
      </div>
    </>
  )
}
