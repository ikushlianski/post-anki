import { useState } from 'react'

import { TodaySubjectCards } from './today-subject-cards'

export interface TodaySubjectRowProps {
  subjectId: string
  name: string
  count: number
  skipped: boolean
  onToggle: (subjectId: string, skipped: boolean) => void
}

export function TodaySubjectRow({ subjectId, name, count, skipped, onToggle }: TodaySubjectRowProps) {
  const [open, setOpen] = useState(false)

  return (
    <li
      data-testid={`today-subject-${subjectId}`}
      className={`rounded-lg border border-neutral-200 bg-white ${skipped ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={!skipped}
          aria-label={`Study ${name} today`}
          onChange={() => onToggle(subjectId, !skipped)}
          className="h-4 w-4"
        />
        <span className={`flex-1 font-medium ${skipped ? 'text-neutral-500' : ''}`}>{name}</span>
        <span
          data-testid={`today-subject-count-${subjectId}`}
          className={`text-sm tabular-nums ${skipped ? 'line-through' : 'font-semibold'}`}
        >
          {count}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} cards for ${name}`}
          onClick={() => setOpen((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100"
        >
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open ? <TodaySubjectCards subjectId={subjectId} /> : null}
    </li>
  )
}
