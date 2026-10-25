import { KNOWLEDGE_BIT_BROWSER_NO_SUBJECT } from '@post-anki/shared'

import { KnowledgeBrowserToolbarPopover } from './knowledge-browser-toolbar-popover'
import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

export interface SubjectPickerOption {
  id: string
  label: string
}

const PATH_SEPARATOR = ' › '

function depthOf(label: string): number {
  return label.split(PATH_SEPARATOR).length - 1
}

function leafOf(label: string): string {
  return label.split(PATH_SEPARATOR).pop() ?? label
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

  const rows: { id: string | null; label: string; depth: number }[] = [
    { id: null, label: 'All subjects', depth: 0 },
    { id: KNOWLEDGE_BIT_BROWSER_NO_SUBJECT, label: 'No subject', depth: 0 },
    ...options.map((option) => ({ id: option.id, label: leafOf(option.label), depth: depthOf(option.label) })),
  ]

  return (
    <KnowledgeBrowserToolbarPopover
      buttonLabel="Subject"
      testId="knowledge-browser-subject-button"
      buttonClassName={`${SECONDARY_BUTTON_CLASS} max-w-[8.5rem] sm:max-w-[12rem]`}
      panelWidthClass="w-64"
      buttonContent={<span className="truncate">Subject: {current}</span>}
    >
      {(close) => (
      <ul role="listbox" aria-label="Subject" className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id ?? 'all'} role="option" aria-selected={row.id === subjectId}>
            <button
              type="button"
              data-testid={`subject-option-${row.id ?? 'all'}`}
              style={{ paddingLeft: `${0.5 + row.depth * 1}rem` }}
              className={`w-full rounded py-1.5 pr-2 text-left hover:bg-neutral-100 ${row.id === subjectId ? 'font-medium' : ''}`}
              onClick={() => {
                onChange(row.id)
                close()
              }}
            >
              {row.label}
            </button>
          </li>
        ))}
      </ul>
      )}
    </KnowledgeBrowserToolbarPopover>
  )
}
