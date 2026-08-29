import { useMemo, useState } from 'react'

import { buildCategoryPickerOptions } from '@post-anki/core'
import type { SubjectCategory } from '../curriculum/model'

// subject-category-nesting — a searchable dropdown over ONE subject's own
// tree (the subject root itself plus every category under it), never
// another subject's tree (buildCategoryPickerOptions filters to
// `subjectId`). Pre-seeds to `defaultSelectedNodeId` (wherever the user
// currently is), but still lets them pick anywhere else in the same
// subject via the search box.
export function CategoryTreePicker({
  subjectId,
  subjectName,
  categories,
  defaultSelectedNodeId = null,
  value,
  onChange,
}: {
  subjectId: string
  subjectName: string
  categories: SubjectCategory[]
  defaultSelectedNodeId?: string | null
  value: string | null
  onChange: (nodeId: string | null) => void
}) {
  const [query, setQuery] = useState('')

  const options = useMemo(
    () => buildCategoryPickerOptions(categories, subjectId, subjectName),
    [categories, subjectId, subjectName],
  )

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()

    if (!trimmed) {
      return options
    }

    return options.filter((option) => option.label.toLowerCase().includes(trimmed))
  }, [options, query])

  const selected = options.find((option) => option.nodeId === value)

  return (
    <div data-testid="category-tree-picker" className="space-y-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={selected ? selected.label : 'Search a position…'}
        data-testid="category-tree-picker-search"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        data-testid="category-tree-picker-select"
        size={Math.min(6, Math.max(2, filtered.length))}
        className="w-full rounded-md border border-neutral-200 bg-white text-sm outline-none"
      >
        {filtered.map((option) => (
          <option key={option.nodeId ?? '__root__'} value={option.nodeId ?? ''}>
            {'  '.repeat(option.depth)}
            {option.label}
            {option.nodeId === defaultSelectedNodeId ? ' (here)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
