import { describe, expect, it } from 'vitest'

import { selectBusiestSubjects } from './select-busiest-subjects'

const counts = (rows: Array<[string, number, number]>) => ({
  subjects: rows.map(([subjectId, dueCount, newCount]) => ({ subjectId, dueCount, newCount })),
  unsorted: { dueCount: 0, newCount: 0 },
  newRemainingToday: 10,
})

describe('selectBusiestSubjects', () => {
  it('should list at most six subjects with cards due, busiest first', () => {
    const subjects = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Subject ${i}`, parentId: null }))
    const result = selectBusiestSubjects(subjects, counts(subjects.map((s, i) => [s.id, i + 1, 0])))

    expect(result.map((row) => row.subjectId)).toEqual(['s7', 's6', 's5', 's4', 's3', 's2'])
  })

  it('should hide subjects with nothing due', () => {
    const subjects = [
      { id: 'a', name: 'A', parentId: null },
      { id: 'b', name: 'B', parentId: null },
    ]

    expect(selectBusiestSubjects(subjects, counts([['a', 0, 3], ['b', 2, 0]])).map((row) => row.subjectId)).toEqual(['b'])
  })

  it('should list only top-level subjects so a parent and its child never overlap', () => {
    const subjects = [
      { id: 'parent', name: 'Parent', parentId: null },
      { id: 'child', name: 'Child', parentId: 'parent' },
    ]

    expect(selectBusiestSubjects(subjects, counts([['parent', 5, 0], ['child', 5, 0]])).map((row) => row.subjectId)).toEqual(['parent'])
  })

  it('should order equally busy subjects by name', () => {
    const subjects = [
      { id: 'z', name: 'Zoology', parentId: null },
      { id: 'a', name: 'Algebra', parentId: null },
    ]

    expect(selectBusiestSubjects(subjects, counts([['z', 3, 0], ['a', 3, 0]])).map((row) => row.name)).toEqual(['Algebra', 'Zoology'])
  })
})
