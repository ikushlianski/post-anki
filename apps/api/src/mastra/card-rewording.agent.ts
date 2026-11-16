import { Agent } from "@mastra/core/agent";
import { CARD_REWORDING_MODEL_ID } from "../card-rewording/card-rewording.config.js";
import {
  buildCardRewordingPrompt,
  CARD_REWORDING_INSTRUCTIONS,
  cardRewordingOutputSchema,
  type CardRewordingInput,
  type CardRewordingOutput,
} from "../card-rewording/card-rewording.prompt.js";
import { loadEnv } from "../shared/env.js";
import { generateWithRetry } from "./generate-with-retry.js";
import { AGENT_KEYS, getMastra } from "./mastra.js";
import { resolveAgentModel } from "./model.js";

export const CARD_REWORDING_OPERATION = "card_rewording";

export function createCardRewordingAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "card-rewording",
    name: "Card Rewording",
    instructions: CARD_REWORDING_INSTRUCTIONS,
    model: resolveAgentModel(CARD_REWORDING_MODEL_ID, env.OPENROUTER_BASE_URL),
  });
}

export async function runCardRewording(
  card: CardRewordingInput,
  knowledgeBitId: string,
): Promise<CardRewordingOutput> {
  const agent = getMastra().getAgent(AGENT_KEYS.cardRewording);
  const result = await generateWithRetry(
    CARD_REWORDING_OPERATION,
    null,
    AGENT_KEYS.cardRewording,
    () => agent.generate(buildCardRewordingPrompt(card), { structuredOutput: { schema: cardRewordingOutputSchema } }),
    { modelId: CARD_REWORDING_MODEL_ID, knowledgeBitId },
  );
  const parsed = cardRewordingOutputSchema.safeParse(result.object);

  if (!parsed.success) {
    throw new Error(`card_rewording_invalid_output: ${parsed.error.message}`);
  }

  return parsed.data;
}
