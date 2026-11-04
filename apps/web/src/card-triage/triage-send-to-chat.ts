import { moveKnowledgeBitToChatQueueForReview } from '../knowledge-bit/knowledge-bit-chat-move.api'
import { restoreRejectedKnowledgeBit } from '../knowledge-bit/rejected-knowledge-bits.api'

export async function sendRejectedDecisionToChat(bitId: string): Promise<boolean> {
  try {
    const restored = await restoreRejectedKnowledgeBit({ data: { bitId } })

    if (!restored.ok && restored.reason !== 'not_rejected') {
      return false
    }

    await moveKnowledgeBitToChatQueueForReview({ data: { bitId } })

    return true
  } catch {
    return false
  }
}
