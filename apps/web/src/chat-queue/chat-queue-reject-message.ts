import type { RejectedProposal } from './use-chat-proposals'

export function rejectedProposalMessage(front: string, feedback: string): string {
  return `I rejected your proposed card: ${front}. What is wrong: ${feedback}`
}

export function rejectedProposalMessageId(bitId: string, rejected: RejectedProposal): string {
  return `reject:${bitId}:${rejected.seq}:${rejected.index}`
}
