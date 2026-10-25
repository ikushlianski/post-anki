import { useState } from 'react'
import { STYLE_NOTE_MAX_CHARS, type CardStyleNote } from '@post-anki/shared'

import {
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  TEXT_FIELD_CLASS,
} from '../knowledge-bit/knowledge-bit-review-classes'
import type { TriageSubject } from './card-triage.api'
import { SearchableSelect } from '../ui/searchable-select'

const GLOBAL_VALUE = '__all__'

export function StyleNoteRow({
  note,
  subjects,
  saving,
  error,
  onChange,
}: {
  note: CardStyleNote
  subjects: TriageSubject[]
  saving: boolean
  error: boolean
  onChange: (patch: { text?: string; enabled?: boolean; subjectId?: string | null }) => void
}) {
  const [draft, setDraft] = useState(note.text)
  const created = new Date(note.createdAt).toLocaleDateString()
  const dirty = draft.trim() !== note.text

  return (
    <li
      data-testid={`style-note-${note.id}`}
      className="space-y-2 rounded-md border border-neutral-200 bg-white p-3"
    >
      <input
        aria-label="Note text"
        data-testid={`style-note-text-${note.id}`}
        maxLength={STYLE_NOTE_MAX_CHARS}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className={TEXT_FIELD_CLASS}
      />
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid={`style-note-enabled-${note.id}`}
            checked={note.enabled}
            disabled={saving}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          On
        </label>
        <label className="flex items-center gap-1">
          Scope
          <SearchableSelect
            ariaLabel="Scope"
            testId={`style-note-scope-${note.id}`}
            options={[
              { id: GLOBAL_VALUE, label: 'All subjects' },
              ...subjects.map((subject) => ({ id: subject.id, label: subject.name })),
            ]}
            value={note.subjectId ?? GLOBAL_VALUE}
            disabled={saving}
            onChange={(id) => onChange({ subjectId: id === GLOBAL_VALUE ? null : id })}
            className="w-full min-w-40 cursor-pointer rounded-md border border-neutral-300 bg-white py-1 pl-2 pr-8"
          />
        </label>
        <span data-testid={`style-note-created-${note.id}`}>Created {created}</span>
        {dirty ? (
          <>
            <button
              type="button"
              data-testid={`style-note-save-${note.id}`}
              disabled={saving || draft.trim().length === 0}
              onClick={() => onChange({ text: draft.trim() })}
              className={PRIMARY_BUTTON_CLASS}
            >
              Save text
            </button>
            <button
              type="button"
              onClick={() => setDraft(note.text)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          Couldn't save this note. Try again.
        </p>
      ) : null}
    </li>
  )
}
