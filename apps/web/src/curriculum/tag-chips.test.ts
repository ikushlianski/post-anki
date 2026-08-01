import { describe, expect, it } from 'vitest'

import type { TagChip } from './model'
import { visibleTagChips } from './tag-chips'

function chip(assignmentId: string, id = `tag-${assignmentId}`): TagChip {
  return { id, name: id, normalizedName: id, assignmentId }
}

describe('visibleTagChips', () => {
  it('shows a seeded chip that the loaded data does not know about yet', () => {
    expect(visibleTagChips([], [chip('a1')], [])).toEqual([chip('a1')])
  })

  it('does not duplicate a chip once the loaded data catches up', () => {
    expect(visibleTagChips([chip('a1')], [chip('a1')], [])).toEqual([chip('a1')])
  })

  it('keeps a seeded chip when a stale reload comes back without it', () => {
    expect(visibleTagChips([chip('a1')], [chip('a2')], [])).toEqual([chip('a1'), chip('a2')])
  })

  it('hides a removed chip while the loaded data still lists it', () => {
    expect(visibleTagChips([chip('a1'), chip('a2')], [], ['a1'])).toEqual([chip('a2')])
  })

  it('never resurrects a removed chip from the seeded list', () => {
    expect(visibleTagChips([], [chip('a1')], ['a1'])).toEqual([])
  })

  it('preserves the loaded order and appends seeded chips after it', () => {
    expect(visibleTagChips([chip('a1'), chip('a2')], [chip('a3')], [])).toEqual([
      chip('a1'),
      chip('a2'),
      chip('a3'),
    ])
  })

  it('collapses a repeat assignment of the same tag into one chip', () => {
    expect(visibleTagChips([], [chip('a1'), chip('a1')], [])).toEqual([chip('a1')])
  })
})
