import { describe, expect, it } from 'vitest'

import { resolveSubjectMove } from './subject-tree-drag'

const tree = [
  { id: 'sales', children: [{ id: 'cold', children: [{ id: 'scripts', children: [] }] }] },
  { id: 'management', children: [] },
]

describe('resolveSubjectMove', () => {
  it('should nest a subject under the one it is dropped on', () => {
    expect(resolveSubjectMove(tree, 'cold', 'management')).toEqual({ parentId: 'management' })
  })

  it('should make a nested subject top-level when dropped on the top strip', () => {
    expect(resolveSubjectMove(tree, 'cold', 'subject-tree-root')).toEqual({ parentId: null })
  })

  it('should refuse to drop a subject inside its own branch', () => {
    expect(resolveSubjectMove(tree, 'sales', 'scripts')).toBeNull()
    expect(resolveSubjectMove(tree, 'sales', 'sales')).toBeNull()
  })

  it('should do nothing when the subject already sits under that parent', () => {
    expect(resolveSubjectMove(tree, 'cold', 'sales')).toBeNull()
    expect(resolveSubjectMove(tree, 'management', 'subject-tree-root')).toBeNull()
  })
})
