import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { askGlobalCardChat } from "../global-card-chat/global-card-chat.service.js";
import { hasKnowledgeWriteScope } from "./card-write-scope.js";

export const askMyCardsInputSchema = z.object({
  question: z.string().trim().min(1).max(4000).describe("A question to answer from the user's own cards"),
});

export const askMyCardsResultSchema = z.object({
  answer: z.string(),
  citedCards: z.array(z.object({ variantId: z.string(), front: z.string(), topicTitle: z.string() })),
  lookupFailed: z.boolean(),
});

export type AskMyCardsInput = z.infer<typeof askMyCardsInputSchema>;
export type AskMyCardsResult = z.infer<typeof askMyCardsResultSchema>;

export async function askMyCards(
  input: AskMyCardsInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<AskMyCardsResult | { error: "missing_scope" }> {
  if (!hasKnowledgeWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const result = await askGlobalCardChat({ message: input.question, allowGeneralKnowledge: false });

  return {
    answer: result.reply,
    citedCards: result.matchedCards.map((card) => ({
      variantId: card.variantId,
      front: card.prompt,
      topicTitle: card.topicTitle,
    })),
    lookupFailed: result.lookupFailed,
  };
}
