import { z } from "zod";

export const KNOWLEDGE_ITEM_MODEL_IDS = [
  "openrouter/deepseek/deepseek-v4-flash",
  "openrouter/openai/gpt-oss-20b",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/mistralai/mistral-nemo",
  "openrouter/inclusionai/ling-3.0-flash-vl",
] as const;

export const knowledgeItemModelIdSchema = z.enum(KNOWLEDGE_ITEM_MODEL_IDS);

export type KnowledgeItemModelId = z.infer<typeof knowledgeItemModelIdSchema>;

export const DEFAULT_KNOWLEDGE_ITEM_MODEL_ID: KnowledgeItemModelId =
  "openrouter/deepseek/deepseek-v4-flash";

export const KNOWLEDGE_ITEM_MODELS_CHECKED_ON = "2026-10-11";

export interface KnowledgeItemModelOption {
  id: KnowledgeItemModelId;
  label: string;
  inputPerMillion: number;
  outputPerMillion: number;
  note: string;
}

export const KNOWLEDGE_ITEM_MODELS: Record<KnowledgeItemModelId, KnowledgeItemModelOption> = {
  "openrouter/deepseek/deepseek-v4-flash": {
    id: "openrouter/deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    inputPerMillion: 0.03,
    outputPerMillion: 1.28,
    note: "Current default for the cheap tier.",
  },
  "openrouter/openai/gpt-oss-20b": {
    id: "openrouter/openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    inputPerMillion: 0.018,
    outputPerMillion: 0.09,
    note: "Lowest output price of the five.",
  },
  "openrouter/openai/gpt-4o-mini": {
    id: "openrouter/openai/gpt-4o-mini",
    label: "GPT-4o mini",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    note: "Former balanced tier model.",
  },
  "openrouter/mistralai/mistral-nemo": {
    id: "openrouter/mistralai/mistral-nemo",
    label: "Mistral Nemo",
    inputPerMillion: 0.029,
    outputPerMillion: 0.03,
    note: "Not yet tested.",
  },
  "openrouter/inclusionai/ling-3.0-flash-vl": {
    id: "openrouter/inclusionai/ling-3.0-flash-vl",
    label: "Ling 3.0 Flash VL",
    inputPerMillion: 0.021,
    outputPerMillion: 0.0616,
    note: "Not yet tested.",
  },
};

export const KNOWLEDGE_ITEM_MODEL_OPTIONS: KnowledgeItemModelOption[] = KNOWLEDGE_ITEM_MODEL_IDS.map(
  (id) => KNOWLEDGE_ITEM_MODELS[id],
);
