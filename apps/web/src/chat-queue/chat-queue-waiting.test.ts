import { describe, expect, it } from 'vitest'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { chatWaitingDays, formatChatWaiting, sortChatQueue, staleChatIds } from './chat-queue-waiting'

const NOW = new Date('2026-10-28T12:00:00.000Z')

function item(id: string, chatAt: string): ChatQueueKnowledgeBit {
  return {
    id,
    body: id,
    background: null,
    origin: 'extracted',
    subjectName: null,
    chatAt,
    turnsLeft: 8,
    snoozedUntil: null,
  }
}

describe('chat waiting days', () => {
  it('should count only fully elapsed days', () => {
    expect(chatWaitingDays('2026-10-26T13:00:00.000Z', NOW)).toBe(1)
    expect(chatWaitingDays('2026-10-25T12:00:00.000Z', NOW)).toBe(3)
  })

  it('should show zero for a card parked today or dated in the future', () => {
    expect(chatWaitingDays('2026-10-28T01:00:00.000Z', NOW)).toBe(0)
    expect(chatWaitingDays('2026-11-02T00:00:00.000Z', NOW)).toBe(0)
  })

  it('should word the wait as today, 1 day or N days', () => {
    expect(formatChatWaiting(0)).toBe('waiting today')
    expect(formatChatWaiting(1)).toBe('waiting 1 day')
    expect(formatChatWaiting(5)).toBe('waiting 5 days')
  })
})

describe('chat queue order', () => {
  const items = [
    item('mid', '2026-10-26T00:00:00.000Z'),
    item('new', '2026-10-28T00:00:00.000Z'),
    item('old', '2026-10-20T00:00:00.000Z'),
  ]

  it('should put the longest-waiting card first when sorting oldest first', () => {
    expect(sortChatQueue(items, 'oldest').map((i) => i.id)).toEqual(['old', 'mid', 'new'])
  })

  it('should put the newest card first when sorting newest first', () => {
    expect(sortChatQueue(items, 'newest').map((i) => i.id)).toEqual(['new', 'mid', 'old'])
  })

  it('should not change the list it was given', () => {
    sortChatQueue(items, 'oldest')

    expect(items.map((i) => i.id)).toEqual(['mid', 'new', 'old'])
  })
})

describe('staleChatIds', () => {
  it('should return only cards that have waited more than 14 full days', () => {
    const items = [
      item('old', '2026-10-01T12:00:00.000Z'),
      item('edge', '2026-10-14T12:00:00.000Z'),
      item('fresh', '2026-10-27T12:00:00.000Z'),
    ]

    expect(staleChatIds(items, NOW)).toEqual(['old'])
  })

  it('should return nothing when no card is stale', () => {
    expect(staleChatIds([item('a', '2026-10-27T12:00:00.000Z')], NOW)).toEqual([])
  })
})
