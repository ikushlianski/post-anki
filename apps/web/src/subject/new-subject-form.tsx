import { useState } from 'react'

import { SECONDARY_BUTTON_CLASS, TEXT_FIELD_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import { SearchableSelect } from '../ui/searchable-select'
import type { SearchableOption } from '../ui/searchable-select'

interface NewSubjectFormProps {
  testIdPrefix: string
  options: readonly SearchableOption[]
  busy: boolean
  confirmLabel: string
  onSubmit: (input: { name: string; parentId: string | null }) => void
  onBack: () => void
}

export function NewSubjectForm({ testIdPrefix, options, busy, confirmLabel, onSubmit, onBack }: NewSubjectFormProps) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const trimmed = name.trim()

  function submit() {
    onSubmit({ name: trimmed, parentId: parentId || null })
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
