import { useState } from 'react'

import { OVERFLOW_MENU_ITEM_CLASS } from '../ui/overflow-menu'
import { MOVE_FILTER_THRESHOLD, filterMoveOptions, type MoveOption } from './subject-menu-model'

export interface SubjectMovePickerTestIds {
  top: string
  target: (parentId: string) => string
  filter?: string
  error?: string
  cancel?: string
}

export interface SubjectMovePickerProps {
  options: MoveOption[]
  currentParentId: string | null
  busy: boolean
  error: string | null
  emptyNotice: string
  testIds: SubjectMovePickerTestIds
  onMove: (parentId: string | null) => void
  onCancel: () => void
}

const INDENT_STEP_REM = 0.75

export function SubjectMovePicker({
  options,
  currentParentId,
  busy,
  error,
  emptyNotice,
  testIds,
  onMove,
  onCancel,
}: SubjectMovePickerProps) {
  const [query, setQuery] = useState('')
  const filtering = query.trim() !== ''
  const visible = filterMoveOptions(options, query)
  const isTopCurrent = currentParentId === null

  return (
    <div className="flex max-h-72 flex-col gap-1 p-1">
      <p className="px-3 py-1 text-xs text-neutral-500">Move under…</p>

      {options.length > MOVE_FILTER_THRESHOLD ? (
        <input
          type="search"
          value={query}
          disabled={busy}
          aria-label="Filter subjects"
          placeholder="Filter subjects"
          data-testid={testIds.filter}
          onChange={(event) => setQuery(event.target.value)}
          className="mx-2 rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
        />
      ) : null}

      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        <button
          type="button"
          disabled={busy || isTopCurrent}
          data-testid={testIds.top}
          onClick={() => onMove(null)}
          className={OVERFLOW_MENU_ITEM_CLASS}
        >
          {isTopCurrent ? 'Top level (current)' : 'Top level'}
        </button>

        {visible.map((option) => (
          <button
            key={option.parentId}
            type="button"
            disabled={busy || option.isCurrent}
            data-testid={testIds.target(option.parentId)}
            onClick={() => onMove(option.parentId)}
            style={filtering ? undefined : { paddingLeft: `${0.75 + option.depth * INDENT_STEP_REM}rem` }}
            className={OVERFLOW_MENU_ITEM_CLASS}
          >
            {filtering ? option.path : option.name}
            {option.isCurrent ? ' (current)' : ''}
          </button>
        ))}

        {visible.length === 0 ? (
          <p className="px-3 py-1 text-xs text-neutral-500">
            {filtering ? `No subjects match “${query.trim()}”.` : emptyNotice}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" data-testid={testIds.error} className="px-3 text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end px-3 pt-1 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-testid={testIds.cancel}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
