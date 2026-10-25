import { useMemo } from 'react'

import { buildCategoryPickerOptions } from '@post-anki/core'
import type { SubjectCategory } from '../curriculum/model'
import { SearchableSelect } from '../ui/searchable-select'

const ROOT_ID = '__root__'

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
  const options = useMemo(
    () =>
      buildCategoryPickerOptions(categories, subjectId, subjectName).map((option) => ({
        id: option.nodeId ?? ROOT_ID,
        label: `${'· '.repeat(option.depth)}${option.label}${option.nodeId === defaultSelectedNodeId ? ' (here)' : ''}`,
      })),
    [categories, subjectId, subjectName, defaultSelectedNodeId],
  )

  return (
    <div data-testid="category-tree-picker">
      <SearchableSelect
        ariaLabel="Position in subject"
        options={options}
        value={value ?? ROOT_ID}
        onChange={(id) => onChange(id === '' || id === ROOT_ID ? null : id)}
        placeholder="Search a position…"
        testId="category-tree-picker-select"
      />
    </div>
  )
}
