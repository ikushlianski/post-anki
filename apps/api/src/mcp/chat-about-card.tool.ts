import { randomUUID } from "node:crypto";
import { z } from "zod";
import { chatQueueProposalListSchema, type ChatQueueProposal } from "@post-anki/shared";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { createChatQueueWebTools } from "../knowledge-bit/knowledge-bit-chat-queue-web-tools.js";
import { loadChatCardContext } from "../knowledge-bit/knowledge-bit-chat-queue.repo.js";
import { sendChatQueueMessage, type ChatQueueFailure } from "../knowledge-bit/knowledge-bit-chat-queue.service.js";
import { hasKnowledgeWriteScope } from "./card-write-scope.js";

export const chatAboutCardInputSchema = z.object({
  cardId: z.string().min(1).describe("Knowledge bit id to discuss"),
  message: z.string().trim().min(1).max(4000).describe("What to ask or how to improve the card"),
  clientMessageId: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("Reuse the same id when retrying so the reply is replayed, not duplicated"),
});

export const chatAboutCardResultSchema = z.object({
  reply: z.string(),
  replySeq: z.number().int().describe("Message number of this reply; pass as messageSeq to resolve_card_proposal"),
  proposals: chatQueueProposalListSchema,
  turnsLeft: z.number().int(),
  capReached: z.boolean(),
});

export type ChatAboutCardInput = z.infer<typeof chatAboutCardInputSchema>;
export type ChatAboutCardResult = z.infer<typeof chatAboutCardResultSchema>;

export type ChatAboutCardOutcome = ChatAboutCardResult | { error: "missing_scope" } | { error: ChatQueueFailure };

export async function chatAboutCard(
  input: ChatAboutCardInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<ChatAboutCardOutcome> {
  if (!hasKnowledgeWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const card = await loadChatCardContext(input.cardId);
  const webTools = createChatQueueWebTools(input.cardId, card?.sourceUrl);
  const result = await sendChatQueueMessage(
    input.cardId,
    { clientMessageId: input.clientMessageId ?? randomUUID(), message: input.message },
    { webTools: webTools.deps, getWebUsage: webTools.getUsage },
  );

  if (!result.ok) {
    return { error: result.error };
  }

  const proposals: ChatQueueProposal[] = result.value.proposals ?? [];

  return {
    reply: result.value.reply,
    replySeq: result.value.replySeq,
    proposals,
    turnsLeft: result.value.turnsLeft,
    capReached: result.value.capReached,
  };
}
