import type {
  AskGlobalCardChatInput,
  AskGlobalCardChatResult,
  CardMatchResult,
} from "@post-anki/shared";
import { formatTranscript } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { findTopMatchingCards } from "../cards/cards-retrieval.orchestrator.js";

const FALLBACK_REPLY = "I couldn't reach the tutor right now — try again.";
const TOP_K_CARDS = 5;

function cardsBlock(cards: CardMatchResult[]): string {
  if (cards.length === 0) {
    return "The learner has no cards matching this question.";
  }

  const lines = cards.map((c) => `- Q: ${c.prompt}\n  A: ${c.answer}`);

  return ["Cards from the learner's own deck:", ...lines].join("\n");
}

function buildPrompt(input: AskGlobalCardChatInput, cards: CardMatchResult[]): string {
  const history = formatTranscript(input.transcript ?? [], { assistantLabel: "Tutor" });

  return [cardsBlock(cards), history ? `Conversation so far:\n${history}` : null, `Learner: ${input.message}`]
    .filter((section): section is string => Boolean(section))
    .join("\n\n");
}

export async function askGlobalCardChat(
  input: AskGlobalCardChatInput,
): Promise<AskGlobalCardChatResult> {
  const matchedCards = await findTopMatchingCards(input.message, TOP_K_CARDS);
  const prompt = buildPrompt(input, matchedCards);
  const matchedCardIds = matchedCards.map((c) => c.variantId);

  const agent = getMastra().getAgent(AGENT_KEYS.globalCardChat);
  const requestContext = new RequestContext([
    ["allowGeneralKnowledge", input.allowGeneralKnowledge ?? false],
  ]);

  try {
    const result = await generateWithRetry(
      "global_card_chat_reply",
      null,
      AGENT_KEYS.globalCardChat,
      () => agent.generate(prompt, { requestContext }),
    );

    const reply = result.text?.trim();

    if (reply) {
      return { reply, matchedCardIds };
    }
  } catch (err) {
    log.error({ err }, "global_card_chat_failed");
  }

  return { reply: FALLBACK_REPLY, matchedCardIds };
}
