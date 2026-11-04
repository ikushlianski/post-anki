import { beforeEach, describe, expect, it, vi } from 'vitest'

import { moveKnowledgeBitToChatQueueForReview } from '../knowledge-bit/knowledge-bit-chat-move.api'
import { restoreRejectedKnowledgeBit } from '../knowledge-bit/rejected-knowledge-bits.api'
import { sendRejectedDecisionToChat } from './triage-send-to-chat'

vi.mock('../knowledge-bit/knowledge-bit-chat-move.api', () => ({
  moveKnowledgeBitToChatQueueForReview: vi.fn(),
}))
vi.mock('../knowledge-bit/rejected-knowledge-bits.api', () => ({
  restoreRejectedKnowledgeBit: vi.fn(),
}))

describe('sendRejectedDecisionToChat', () => {
  beforeEach(() => {
    vi.mocked(restoreRejectedKnowledgeBit).mockResolvedValue({ ok: true })
    vi.mocked(moveKnowledgeBitToChatQueueForReview).mockReset()
  })

  it('should restore the rejected card and then queue it for Chat', async () => {
    expect(await sendRejectedDecisionToChat('b1')).toBe(true)
    expect(moveKnowledgeBitToChatQueueForReview).toHaveBeenCalledWith({ data: { bitId: 'b1' } })
  })

  it('should not queue the card when the restore fails', async () => {
    vi.mocked(restoreRejectedKnowledgeBit).mockResolvedValue({ ok: false, reason: 'failed' })

    expect(await sendRejectedDecisionToChat('b1')).toBe(false)
    expect(moveKnowledgeBitToChatQueueForReview).not.toHaveBeenCalled()
  })

  it('should report failure when the Chat move throws', async () => {
    vi.mocked(moveKnowledgeBitToChatQueueForReview).mockRejectedValue(new Error('boom'))

    expect(await sendRejectedDecisionToChat('b1')).toBe(false)
  })
})
