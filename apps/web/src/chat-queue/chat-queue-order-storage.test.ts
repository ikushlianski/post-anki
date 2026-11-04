// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadChatQueueOrder, saveChatQueueOrder } from './chat-queue-order-storage'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('chat queue order storage', () => {
  it('should start with the longest-waiting card first when nothing is saved', () => {
    expect(loadChatQueueOrder()).toBe('oldest')
  })

  it('should bring back the order the user picked last time', () => {
    saveChatQueueOrder('newest')

    expect(loadChatQueueOrder()).toBe('newest')
  })

  it('should fall back to oldest first when the saved value is unknown', () => {
    window.localStorage.setItem('chat-queue-order', 'sideways')

    expect(loadChatQueueOrder()).toBe('oldest')
  })

  it('should keep working when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(loadChatQueueOrder()).toBe('oldest')
    expect(() => saveChatQueueOrder('newest')).not.toThrow()
  })
})
