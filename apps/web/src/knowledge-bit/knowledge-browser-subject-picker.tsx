import { useState } from 'react'

import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'

import { KnowledgeBrowserToolbarPopover } from './knowledge-browser-toolbar-popover'
import { filterSubjectPickerRows, toSubjectPickerRow } from './filter-subject-picker-rows'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export interface SubjectPickerOption {
  id: string
  label: string
}

export function KnowledgeBrowserSubjectPicker({
  subjectId,
  options,
  onChange,
}: {
  subjectId: string | null
  options: readonly SubjectPickerOption[]
  onChange: (subjectId: string | null) => void
}) {
  const current =
    subjectId === null
      ? 'All subjects'
      : subjectId === KNOWLEDGE_BIT_BROWSER_NO_SUBJECT
        ? 'No subject'
        : (options.find((option) => option.id === subjectId)?.label ?? 'Subject')

  const [query, setQuery] = useState('')
  const filtering = query.trim() !== ''
  const rows = filterSubjectPickerRows(
    [
      toSubjectPickerRow(null, 'All subjects'),
      toSubjectPickerRow(KNOWLEDGE_BIT_BROWSER_NO_SUBJECT, 'No subject'),
      ...options.map((option) => toSubjectPickerRow(option.id, option.label)),
    ],
    query,
  )

  return (
    <KnowledgeBrowserToolbarPopover
      buttonLabel="Subject"
      testId="knowledge-browser-subject-button"
      buttonClassName={`${SECONDARY_BUTTON_CLASS} max-w-[8.5rem] sm:max-w-[12rem]`}
      panelWidthClass="w-64"
      buttonContent={<span className="truncate">Subject: {current}</span>}
    >
      {(close) => (
      <>
      <input
        type="search"
        autoFocus
        value={query}
        aria-label="Search subjects"
        placeholder="Search subjects…"
        data-testid="subject-picker-search"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && rows.length === 1 && rows[0]) {
            event.preventDefault()
            onChange(rows[0].id)
            setQuery('')
            close()
          }
        }}
        className="mb-2 w-full rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
      />
      <ul role="listbox" aria-label="Subject" className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id ?? 'all'} role="option" aria-selected={row.id === subjectId}>
            <button
              type="button"
              data-testid={`subject-option-${row.id ?? 'all'}`}
              style={filtering ? undefined : { paddingLeft: `${0.5 + row.depth * 1}rem` }}
              className={`w-full rounded py-1.5 pr-2 text-left hover:bg-neutral-100 ${row.id === subjectId ? 'font-medium' : ''}`}
              onClick={() => {
                onChange(row.id)
                setQuery('')
                close()
              }}
            >
              {filtering ? row.path : row.label}
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="px-2 py-1 text-xs text-neutral-500">No subjects match.</p> : null}
      </>
      )}
    </KnowledgeBrowserToolbarPopover>
  )
}
