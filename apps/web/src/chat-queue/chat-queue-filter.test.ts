import { describe, expect, it } from 'vitest'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { chatQueueSubjects, filterChatQueue, isChatQueueFilterActive } from './chat-queue-filter'

function item(id: string, body: string, subjectName: string | null, background: string | null = null) {
  return {
    id,
    body,
    background,
    origin: 'extracted',
    subjectName,
    chatAt: '2026-10-28T10:00:00.000Z',
    turnsLeft: 8,
    snoozedUntil: null,
  } satisfies ChatQueueKnowledgeBit
}

const items = [
  item('a', 'Capital of France is Paris', 'Geography'),
  item('b', 'Mitochondria make ATP', 'Biology', 'Powerhouse of the CELL'),
  item('c', 'Untagged fact', null),
]

describe('chat queue filter', () => {
  it('should find a card regardless of letter case', () => {
    const result = filterChatQueue(items, { query: 'PARIS', subject: '' })

    expect(result.map((i) => i.id)).toEqual(['a'])
  })

  it('should match text in the card background too', () => {
    expect(filterChatQueue(items, { query: 'cell', subject: '' }).map((i) => i.id)).toEqual(['b'])
  })

  it('should only show cards of the chosen subject combined with the search', () => {
    expect(filterChatQueue(items, { query: '', subject: 'Biology' }).map((i) => i.id)).toEqual(['b'])
    expect(filterChatQueue(items, { query: 'paris', subject: 'Biology' })).toEqual([])
  })

  it('should show every card when the chosen subject has left the queue', () => {
    expect(filterChatQueue(items, { query: '', subject: 'History' }).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('should list each subject once, sorted, skipping untagged cards', () => {
    expect(chatQueueSubjects([...items, item('d', 'x', 'Biology')])).toEqual(['Biology', 'Geography'])
  })

  it('should treat a blank search with no subject as inactive', () => {
    expect(isChatQueueFilterActive({ query: '  ', subject: '' })).toBe(false)
    expect(isChatQueueFilterActive({ query: '', subject: 'Biology' })).toBe(true)
  })

  it('should include parent subjects and match their sub-subjects', () => {
    const nested = [
      item('x', 'Cold call script', 'Business › Sales › Cold sales'),
      item('y', 'Pricing', 'Business › Finance'),
    ]

    expect(chatQueueSubjects(nested)).toContain('Business')
    expect(filterChatQueue(nested, { query: '', subject: 'Business › Sales' }).map((i) => i.id)).toEqual(['x'])
    expect(filterChatQueue(nested, { query: '', subject: 'Business' }).map((i) => i.id)).toEqual(['x', 'y'])
  })
})
