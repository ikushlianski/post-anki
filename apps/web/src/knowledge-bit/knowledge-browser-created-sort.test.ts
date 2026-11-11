import { describe, expect, it } from 'vitest'
import type { KnowledgeBitBrowserItem } from '@post-anki/shared'

import { nextCreatedSort, sortByCreated } from './knowledge-browser-created-sort'

function row(id: string, addedAt: string): KnowledgeBitBrowserItem {
  return {
    knowledgeBitId: id,
    phrasings: [],
    answer: '',
    origin: 'manual',
    addedAt,
    sourcePieceCount: 1,
  }
}

const rows = [
  row('mid', '2026-03-04T12:00:00.000Z'),
  row('new', '2026-03-05T09:30:00.000Z'),
  row('old', '2026-03-01T08:00:00.000Z'),
]

describe('sortByCreated', () => {
  it('should list the newest card first when sorted newest first', () => {
    expect(sortByCreated(rows, 'desc').map((r) => r.knowledgeBitId)).toEqual(['new', 'mid', 'old'])
  })

  it('should list the oldest card first when sorted oldest first', () => {
    expect(sortByCreated(rows, 'asc').map((r) => r.knowledgeBitId)).toEqual(['old', 'mid', 'new'])
  })

  it('should keep the server order when no sort is chosen', () => {
    expect(sortByCreated(rows, null)).toBe(rows)
  })

  it('should flip between newest and oldest on each click', () => {
    expect(nextCreatedSort(null)).toBe('desc')
    expect(nextCreatedSort('desc')).toBe('asc')
    expect(nextCreatedSort('asc')).toBe('desc')
  })
})
