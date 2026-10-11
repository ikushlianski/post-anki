import { z } from "zod";

export const KNOWLEDGE_ITEM_MODEL_IDS = [
  "openrouter/google/gemini-2.5-flash-lite",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/mistralai/mistral-small-24b-instruct-2501",
  "openrouter/google/gemma-3-12b-it",
  "openrouter/openai/gpt-4.1-nano",
] as const;

export const knowledgeItemModelIdSchema = z.enum(KNOWLEDGE_ITEM_MODEL_IDS);

export type KnowledgeItemModelId = z.infer<typeof knowledgeItemModelIdSchema>;

export const DEFAULT_KNOWLEDGE_ITEM_MODEL_ID: KnowledgeItemModelId =
  "openrouter/google/gemini-2.5-flash-lite";

export const KNOWLEDGE_ITEM_MODELS_CHECKED_ON = "2026-10-11";

export interface KnowledgeItemModelOption {
  id: KnowledgeItemModelId;
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
  note: string;
}

export const KNOWLEDGE_ITEM_MODELS: Record<KnowledgeItemModelId, KnowledgeItemModelOption> = {
  "openrouter/google/gemini-2.5-flash-lite": {
    id: "openrouter/google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    note: "Default. 1.4 s on the Russian test, clean self-contained items.",
  },
  "openrouter/openai/gpt-4o-mini": {
    id: "openrouter/openai/gpt-4o-mini",
    label: "GPT-4o mini",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    note: "2.5 s, kept Russian, one vague item.",
  },
  "openrouter/mistralai/mistral-small-24b-instruct-2501": {
    id: "openrouter/mistralai/mistral-small-24b-instruct-2501",
    label: "Mistral Small 24B",
    inputPerMillion: 0.05,
    outputPerMillion: 0.08,
    note: "Cheapest that kept Russian; some items lean on earlier ones.",
  },
  "openrouter/google/gemma-3-12b-it": {
    id: "openrouter/google/gemma-3-12b-it",
    label: "Gemma 3 12B",
    inputPerMillion: 0.05,
    outputPerMillion: 0.15,
    note: "Good Russian, but splits into too many items.",
  },
  "openrouter/openai/gpt-4.1-nano": {
    id: "openrouter/openai/gpt-4.1-nano",
    label: "GPT-4.1 nano",
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    note: "Fast, but dropped and bent some points on Russian.",
  },
};

export const KNOWLEDGE_ITEM_MODEL_OPTIONS: KnowledgeItemModelOption[] = KNOWLEDGE_ITEM_MODEL_IDS.map(
  (id) => KNOWLEDGE_ITEM_MODELS[id],
);
