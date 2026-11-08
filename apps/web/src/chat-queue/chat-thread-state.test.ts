import { describe, expect, it } from 'vitest'

import {
  dropLastExchange,
  restoreDraft,
  settle,
  toChatLines,
  withProposalDecision,
  type ChatLine,
} from './chat-thread-state'

const lines: ChatLine[] = [
  { id: 'm1', isUser: true, text: 'q1', seq: 1 },
  { id: 'm2', isUser: false, text: 'a1', seq: 2 },
  { id: 'm3', isUser: true, text: 'q2', seq: 3 },
  { id: 'm4', isUser: false, text: 'a2', seq: 4 },
]

describe('chat thread state', () => {
  it('should remove only the last question and its answer when retrying', () => {
    expect(dropLastExchange(lines)).toEqual(lines.slice(0, 2))
  })

  it('should leave the thread untouched when nothing was asked yet', () => {
    const onlyReplies: ChatLine[] = [{ id: 'm1', isUser: false, text: 'hi' }]

    expect(dropLastExchange(onlyReplies)).toBe(onlyReplies)
  })

  it('should show server messages with the user flag set only for the learner', () => {
    expect(
      toChatLines([
        { seq: 1, role: 'user', text: 'q' },
        { seq: 2, role: 'assistant', text: 'a' },
      ]),
    ).toEqual([
      { id: 'm1', seq: 1, isUser: true, text: 'q' },
      { id: 'm2', seq: 2, isUser: false, text: 'a' },
    ])
  })

  it('should show stored proposals with their saved state when a thread is reloaded', () => {
    const proposal = { index: 0, kind: 'create' as const, front: 'F', back: 'B', status: 'accepted' as const, savedCardId: 'c1' }

    expect(toChatLines([{ seq: 2, role: 'assistant', text: 'a', proposals: [proposal] }])[0]?.proposals).toEqual([proposal])
  })

  it('should change only the decided proposal on the chosen reply', () => {
    const base = { kind: 'create' as const, front: 'F', back: 'B', status: 'pending' as const }
    const before: ChatLine[] = [
      { id: 'a', isUser: false, text: 'x', proposals: [{ ...base, index: 0 }, { ...base, index: 1 }] },
      { id: 'b', isUser: false, text: 'y', proposals: [{ ...base, index: 0 }] },
    ]

    const after = withProposalDecision(before, 'a', 1, { status: 'rejected' })

    expect(after[0]?.proposals?.map((p) => p.status)).toEqual(['pending', 'rejected'])
    expect(after[1]).toBe(before[1])
  })

  it('should put a failed question back in the box without losing what was typed since', () => {
    expect(restoreDraft('new', 'old', true)).toBe('old\n\nnew')
    expect(restoreDraft('  ', 'old', true)).toBe('old')
    expect(restoreDraft('new', 'old', false)).toBe('old')
  })

  it('should turn a thrown network error into a failed outcome', async () => {
    const outcome = await settle(() => Promise.reject(new Error('boom')))

    expect(outcome).toEqual({ ok: false, failure: 'other' })
  })
})
