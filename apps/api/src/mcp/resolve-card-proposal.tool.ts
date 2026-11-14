import { z } from "zod";
import { chatQueueProposalSchema } from "@post-anki/shared";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import {
  decideChatQueueProposal,
  type ProposalDecisionFailure,
} from "../knowledge-bit/knowledge-bit-chat-queue-proposal.service.js";
import {
  rewordChatQueueProposal,
  type ProposalRewordFailure,
} from "../knowledge-bit/knowledge-bit-chat-queue-proposal-reword.service.js";
import { hasCardWriteScope } from "./card-write-scope.js";

export const resolveCardProposalInputSchema = z.object({
  cardId: z.string().min(1).describe("Knowledge bit id of the chat"),
  messageSeq: z.number().int().min(1).describe("replySeq returned by chat_about_card"),
  proposalIndex: z.number().int().min(0).describe("Proposal index from chat_about_card"),
  action: z.enum(["accept", "reject", "reword"]).describe("reword asks the AI for a new wording; the proposal stays pending"),
});

export const resolveCardProposalResultSchema = z.object({
  action: z.enum(["accept", "reject", "reword"]),
  status: z.enum(["accepted", "rejected", "pending"]),
  savedCardId: z.string().optional().describe("Id of the card saved by accept"),
  proposal: chatQueueProposalSchema.optional().describe("The reworded proposal (reword only)"),
});

export type ResolveCardProposalInput = z.infer<typeof resolveCardProposalInputSchema>;
export type ResolveCardProposalResult = z.infer<typeof resolveCardProposalResultSchema>;

export type ResolveCardProposalOutcome =
  | ResolveCardProposalResult
  | { error: "missing_scope" | ProposalDecisionFailure | ProposalRewordFailure };

export async function resolveCardProposal(
  input: ResolveCardProposalInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<ResolveCardProposalOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  if (input.action === "reword") {
    const reworded = await rewordChatQueueProposal(input.cardId, input.messageSeq, input.proposalIndex);

    return reworded.ok
      ? { action: "reword", status: "pending", proposal: reworded.proposal }
      : { error: reworded.error };
  }

  const decided = await decideChatQueueProposal(input.cardId, input.messageSeq, input.proposalIndex, input.action);

  if (!decided.ok) {
    return { error: decided.error };
  }

  return {
    action: input.action,
    status: decided.value.status,
    ...(decided.value.savedCardId ? { savedCardId: decided.value.savedCardId } : {}),
  };
}
