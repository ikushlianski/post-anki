import type { RejectedProposal } from './use-chat-proposals'

export function rejectedProposalMessage(front: string): string {
  return `I rejected your proposed card: ${front}.`
}

export function rejectedProposalMessageId(bitId: string, rejected: RejectedProposal): string {
  return `reject:${bitId}:${rejected.seq}:${rejected.index}`
}
