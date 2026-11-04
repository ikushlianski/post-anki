// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_QUEUE_MAX_MESSAGE_CHARS } from '@post-anki/shared'

import { clearChatDraft, loadChatDraft, saveChatDraft } from './chat-queue-draft-storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('chat draft storage', () => {
  it('should bring back the unsent text typed on the same card', () => {
    saveChatDraft('a', 'why is this true')

    expect(loadChatDraft('a')).toBe('why is this true')
    expect(window.localStorage.getItem('chat-queue-draft:a')).toBe('why is this true')
  })

  it('should keep drafts of different cards apart', () => {
    saveChatDraft('a', 'one')
    saveChatDraft('b', 'two')

    expect(loadChatDraft('a')).toBe('one')
    expect(loadChatDraft('b')).toBe('two')
  })

  it('should never store more than the message length limit', () => {
    saveChatDraft('a', 'x'.repeat(CHAT_QUEUE_MAX_MESSAGE_CHARS + 50))

    expect(loadChatDraft('a')).toHaveLength(CHAT_QUEUE_MAX_MESSAGE_CHARS)
  })

  it('should drop the stored draft when the text is emptied or cleared', () => {
    saveChatDraft('a', 'text')
    saveChatDraft('a', '')

    expect(loadChatDraft('a')).toBe('')

    saveChatDraft('a', 'text')
    clearChatDraft('a')

    expect(loadChatDraft('a')).toBe('')
  })

  it('should not break typing when storage refuses to work', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => saveChatDraft('a', 'x')).not.toThrow()
    expect(() => clearChatDraft('a')).not.toThrow()
    expect(loadChatDraft('a')).toBe('')
  })
})
