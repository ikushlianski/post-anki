import { describe, expect, it } from 'vitest'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import { filterInbox, inboxSubjects, isInboxFilterActive } from './knowledge-bit-inbox-filter'

function item(id: string, overrides: Partial<InboxKnowledgeBit> = {}): InboxKnowledgeBit {
  return {
    id,
    body: `Fact ${id}`,
    background: null,
    exampleAiGeneratedAt: null,
    origin: 'extracted',
    subjectName: null,
    cardCount: 1,
    inboxAt: '2026-10-28T10:00:00.000Z',
    note: null,
    ...overrides,
  }
}

const items = [
  item('a', { body: 'Closures capture scope', subjectName: 'JavaScript' }),
  item('b', { body: 'Index scans', subjectName: 'Postgres' }),
  item('c', { body: 'Unfiled thing' }),
]

describe('inbox filter', () => {
  it('should list only subjects present in the Inbox, sorted', () => {
    expect(inboxSubjects(items)).toEqual(['JavaScript', 'Postgres'])
  })

  it('should match card body case-insensitively', () => {
    expect(filterInbox(items, { query: 'CLOSURES', subject: '' }).map((i) => i.id)).toEqual(['a'])
  })

  it('should match the subject name case-insensitively', () => {
    expect(filterInbox(items, { query: 'postgres', subject: '' }).map((i) => i.id)).toEqual(['b'])
  })

  it('should compose search with the subject filter', () => {
    expect(filterInbox(items, { query: 'scan', subject: 'JavaScript' })).toEqual([])
    expect(filterInbox(items, { query: 'scan', subject: 'Postgres' }).map((i) => i.id)).toEqual(['b'])
  })

  it('should ignore a selected subject that no longer exists', () => {
    expect(filterInbox(items, { query: '', subject: 'Gone' })).toHaveLength(3)
  })

  it('should report whether any filter is active', () => {
    expect(isInboxFilterActive({ query: ' ', subject: '' })).toBe(false)
    expect(isInboxFilterActive({ query: 'x', subject: '' })).toBe(true)
  })

  it('should include parent subjects and match their sub-subjects', () => {
    const nested = [
      item('x', { subjectName: 'Business › Sales › Cold sales' }),
      item('y', { subjectName: 'Business › Finance' }),
    ]

    expect(inboxSubjects(nested)).toContain('Business')
    expect(filterInbox(nested, { query: '', subject: 'Business › Sales' }).map((i) => i.id)).toEqual(['x'])
    expect(filterInbox(nested, { query: '', subject: 'Business' }).map((i) => i.id)).toEqual(['x', 'y'])
  })
})
