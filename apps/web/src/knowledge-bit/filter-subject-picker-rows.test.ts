import { describe, expect, it } from 'vitest'

import { filterSubjectPickerRows, toSubjectPickerRow } from './filter-subject-picker-rows'

const ROWS = [
  toSubjectPickerRow('a', 'Math'),
  toSubjectPickerRow('b', 'Math › Algebra'),
  toSubjectPickerRow('c', 'History › Algebraic Ideas'),
  toSubjectPickerRow('d', 'History'),
]

describe('filterSubjectPickerRows', () => {
  it('should keep every subject when the search is blank', () => {
    expect(filterSubjectPickerRows(ROWS, '  ')).toHaveLength(4)
  })

  it('should match subjects and sub-subjects by name ignoring case', () => {
    expect(filterSubjectPickerRows(ROWS, 'ALGEBRA').map((row) => row.id)).toEqual(['b', 'c'])
  })

  it('should keep the parent path on a matching sub-subject', () => {
    expect(filterSubjectPickerRows(ROWS, 'algebra')[0]?.path).toBe('Math › Algebra')
  })
})
