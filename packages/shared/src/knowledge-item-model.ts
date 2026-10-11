import { z } from "zod";

export const KNOWLEDGE_ITEM_MODEL_IDS = [
  "openrouter/google/gemma-4-31b-it",
  "openrouter/google/gemini-2.5-flash-lite",
  "openrouter/mistralai/mistral-small-24b-instruct-2501",
  "openrouter/google/gemma-3-12b-it",
  "openrouter/anthropic/claude-haiku-5.5",
] as const;

export const knowledgeItemModelIdSchema = z.enum(KNOWLEDGE_ITEM_MODEL_IDS);

export type KnowledgeItemModelId = z.infer<typeof knowledgeItemModelIdSchema>;

export const DEFAULT_KNOWLEDGE_ITEM_MODEL_ID: KnowledgeItemModelId =
  "openrouter/google/gemma-4-31b-it";

export const KNOWLEDGE_ITEM_MODELS_CHECKED_ON = "2026-10-11";

export interface KnowledgeItemModelOption {
  id: KnowledgeItemModelId;
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
  expiresOn: string | null;
  note: string;
}

export const KNOWLEDGE_ITEM_MODELS: Record<KnowledgeItemModelId, KnowledgeItemModelOption> = {
  "openrouter/google/gemma-4-31b-it": {
    id: "openrouter/google/gemma-4-31b-it",
    label: "Gemma 4 31B",
    inputPerMillion: 0.09,
    outputPerMillion: 0.34,
    expiresOn: null,
    note: "Default. Best quality per price in the benchmark, about 0.4 s. One run said \"according to the text\".",
  },
  "openrouter/google/gemini-2.5-flash-lite": {
    id: "openrouter/google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    expiresOn: "2026-10-20",
    note: "About 0.8 s. Clean, self-contained items; one statement is a little too general.",
  },
  "openrouter/mistralai/mistral-small-24b-instruct-2501": {
    id: "openrouter/mistralai/mistral-small-24b-instruct-2501",
    label: "Mistral Small 24B",
    inputPerMillion: 0.05,
    outputPerMillion: 0.08,
    expiresOn: null,
    note: "Cheapest, about 0.2 s. Some questions are vague.",
  },
  "openrouter/google/gemma-3-12b-it": {
    id: "openrouter/google/gemma-3-12b-it",
    label: "Gemma 3 12B",
    inputPerMillion: 0.05,
    outputPerMillion: 0.15,
    expiresOn: null,
    note: "Faithful, about 0.4 s. Splits into fewer items than the others.",
  },
  "openrouter/anthropic/claude-haiku-5.5": {
    id: "openrouter/anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5 (premium)",
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    expiresOn: null,
    note: "Most faithful, about 1.5 s, costs more. Two questions say \"according to the text\".",
  },
};

export const KNOWLEDGE_ITEM_MODEL_OPTIONS: KnowledgeItemModelOption[] = KNOWLEDGE_ITEM_MODEL_IDS.map(
  (id) => KNOWLEDGE_ITEM_MODELS[id],
);
