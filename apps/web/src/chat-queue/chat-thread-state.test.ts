import { describe, expect, it } from 'vitest'

import {
  dropLastExchange,
  restoreDraft,
  settle,
  toChatLines,
  withReplySeq,
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

  it('should attach the latest assistant sequence number to the fresh reply line', () => {
    const fresh: ChatLine[] = [{ id: 'a-x', isUser: false, text: 'a' }]

    expect(
      withReplySeq(fresh, 'a-x', [
        { seq: 1, role: 'user', text: 'q' },
        { seq: 2, role: 'assistant', text: 'a' },
      ]),
    ).toEqual([{ id: 'a-x', isUser: false, text: 'a', seq: 2 }])
  })

  it('should keep lines as they are when the server has no assistant reply', () => {
    const fresh: ChatLine[] = [{ id: 'a-x', isUser: false, text: 'a' }]

    expect(withReplySeq(fresh, 'a-x', [{ seq: 1, role: 'user', text: 'q' }])).toBe(fresh)
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
