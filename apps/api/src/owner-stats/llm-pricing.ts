import { KNOWLEDGE_ITEM_MODELS, type KnowledgeItemModelId } from "@post-anki/shared";

export interface PriceEntry {
  effectiveFrom: string;
  in: number;
  out: number;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

const EPOCH = "1970-01-01";

const SHARED_HISTORY = Object.fromEntries(
  Object.values(KNOWLEDGE_ITEM_MODELS).map((model) => [
    model.id,
    [{ effectiveFrom: EPOCH, in: model.inputPerMillion, out: model.outputPerMillion }],
  ]),
) as Record<KnowledgeItemModelId, PriceEntry[]>;

export const PRICE_HISTORY: Record<string, PriceEntry[]> = {
  ...SHARED_HISTORY,
  "openrouter/deepseek/deepseek-v4-flash": [{ effectiveFrom: EPOCH, in: 0.3, out: 0.3 }],
  "openrouter/deepseek/deepseek-v4-pro": [{ effectiveFrom: EPOCH, in: 2, out: 2 }],
};

export const AGENT_DEFAULT_MODEL: Record<string, string> = {
  articleSummary: "openrouter/deepseek/deepseek-v4-flash",
  bizEducationClassifier: "openrouter/deepseek/deepseek-v4-flash",
  tagAutoAssign: "openrouter/deepseek/deepseek-v4-flash",
  knowledgeBitTagger: "openrouter/deepseek/deepseek-v4-flash",
  subjectSuggestionGrader: "openrouter/deepseek/deepseek-v4-flash",
  knowledgeBitAnswerGrader: "openrouter/deepseek/deepseek-v4-flash",
  knowledgeBitFollowupGenerator: "openrouter/deepseek/deepseek-v4-flash",
  cardStyleNotesDistiller: "openrouter/deepseek/deepseek-v4-flash",
  knowledgeSourceSubjectChecker: "openrouter/deepseek/deepseek-v4-flash",
  cardDedupEscalation: "openrouter/deepseek/deepseek-v4-flash",
  subjectAssignmentEscalation: "openrouter/openai/gpt-4o-mini",
};

export function resolveModelId(modelId: string | null, agentKey: string): string | null {
  return modelId ?? AGENT_DEFAULT_MODEL[agentKey] ?? null;
}

export function priceFor(modelId: string, at: Date): ModelPrice | null {
  const history = PRICE_HISTORY[modelId];

  if (!history) {
    return null;
  }

  const day = at.toISOString().slice(0, 10);
  const applicable = history
    .filter((entry) => entry.effectiveFrom <= day)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  return applicable ? { inputPerMillion: applicable.in, outputPerMillion: applicable.out } : null;
}

export function costUsd(price: ModelPrice, promptTokens: number, completionTokens: number): number {
  return (promptTokens * price.inputPerMillion + completionTokens * price.outputPerMillion) / 1e6;
}
