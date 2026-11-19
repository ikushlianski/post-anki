// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadRecentMoveTargets, recordRecentMoveTarget } from './recent-move-targets'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recent move targets', () => {
  it('should list the most recently chosen deck first without repeating it', () => {
    recordRecentMoveTarget('a')
    recordRecentMoveTarget('b')
    recordRecentMoveTarget('a')

    expect(loadRecentMoveTargets()).toEqual(['a', 'b'])
  })

  it('should remember only the five latest decks', () => {
    for (const id of ['1', '2', '3', '4', '5', '6']) recordRecentMoveTarget(id)

    expect(loadRecentMoveTargets()).toEqual(['6', '5', '4', '3', '2'])
  })

  it('should show no recent decks when the stored list is damaged', () => {
    localStorage.setItem('post-anki.review.recent-move-targets', '{oops')

    expect(loadRecentMoveTargets()).toEqual([])
  })

  it('should keep working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => recordRecentMoveTarget('a')).not.toThrow()
  })
})
