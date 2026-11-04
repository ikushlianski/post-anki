import { describe, expect, it } from 'vitest'

import { chatQueueFailureFromApi, chatQueueFailureMessage } from './chat-queue-failure'

describe('chat queue failures', () => {
  it('should map stable server codes to the matching failure', () => {
    expect(chatQueueFailureFromApi(429, 'cap_reached')).toBe('cap_reached')
    expect(chatQueueFailureFromApi(423, 'budget_paused')).toBe('budget_paused')
    expect(chatQueueFailureFromApi(409, 'in_flight')).toBe('in_flight')
    expect(chatQueueFailureFromApi(409, 'not_in_chat')).toBe('not_in_chat')
    expect(chatQueueFailureFromApi(502, 'model_failed')).toBe('model_failed')
  })

  it('should fall back to the status when no code is sent', () => {
    expect(chatQueueFailureFromApi(404, undefined)).toBe('not_found')
    expect(chatQueueFailureFromApi(500, undefined)).toBe('other')
  })

  it('should tell the user no question was used when the model fails', () => {
    expect(chatQueueFailureMessage('model_failed')).toContain('no question was used')
  })
})
