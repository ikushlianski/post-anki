import { z } from "zod";

export const KNOWLEDGE_ITEM_MODEL_IDS = [
  "openrouter/openai/gpt-6-luna",
  "openrouter/anthropic/claude-haiku-5.5",
  "openrouter/google/gemma-4-31b-it",
  "openrouter/openai/gpt-oss-120b",
  "openrouter/mistralai/mistral-small-3.2-24b-instruct",
  "openrouter/meta-llama/llama-3.3-70b-instruct",
  "openrouter/openai/gpt-5-mini",
  "openrouter/google/gemini-3.1-flash-lite",
  "openrouter/openai/gpt-4o-mini",
  "openrouter/openai/gpt-4.1-nano",
  "openrouter/google/gemini-2.5-flash-lite",
] as const;

export const knowledgeItemModelIdSchema = z.enum(KNOWLEDGE_ITEM_MODEL_IDS);

export type KnowledgeItemModelId = z.infer<typeof knowledgeItemModelIdSchema>;

export const DEFAULT_KNOWLEDGE_ITEM_MODEL_ID: KnowledgeItemModelId =
  "openrouter/anthropic/claude-haiku-5.5";

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
  "openrouter/openai/gpt-6-luna": {
    id: "openrouter/openai/gpt-6-luna",
    label: "GPT-6 Luna",
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    expiresOn: null,
    note: "Best Russian coverage among cheap models, clean English. New model, behavior may change.",
  },
  "openrouter/anthropic/claude-haiku-5.5": {
    id: "openrouter/anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
    expiresOn: null,
    note: "Most precise wording, reliable schema. Fewer Russian items.",
  },
  "openrouter/google/gemma-4-31b-it": {
    id: "openrouter/google/gemma-4-31b-it",
    label: "Gemma 4 31B",
    inputPerMillion: 0.09,
    outputPerMillion: 0.34,
    expiresOn: null,
    note: "Cheapest reliable. Russian coverage is thinner, some cards drop.",
  },
  "openrouter/openai/gpt-oss-120b": {
    id: "openrouter/openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    inputPerMillion: 0.037,
    outputPerMillion: 0.17,
    expiresOn: null,
    note: "Cheapest input. Quality depends on the provider, one English timeout seen.",
  },
  "openrouter/mistralai/mistral-small-3.2-24b-instruct": {
    id: "openrouter/mistralai/mistral-small-3.2-24b-instruct",
    label: "Mistral Small 3.2 24B",
    inputPerMillion: 0.094,
    outputPerMillion: 0.25,
    expiresOn: null,
    note: "European vendor, cheap. One weak English run.",
  },
  "openrouter/meta-llama/llama-3.3-70b-instruct": {
    id: "openrouter/meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    inputPerMillion: 0.22,
    outputPerMillion: 0.5,
    expiresOn: null,
    note: "Mature, strong English. Price varies by provider.",
  },
  "openrouter/openai/gpt-5-mini": {
    id: "openrouter/openai/gpt-5-mini",
    label: "GPT-5 Mini",
    inputPerMillion: 0.25,
    outputPerMillion: 2.0,
    expiresOn: null,
    note: "Maximum coverage in both languages, about 8x the cost of Luna per text.",
  },
  "openrouter/google/gemini-3.1-flash-lite": {
    id: "openrouter/google/gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    inputPerMillion: 0.25,
    outputPerMillion: 1.5,
    expiresOn: null,
    note: "Reliable English. Weak Russian coverage.",
  },
  "openrouter/openai/gpt-4o-mini": {
    id: "openrouter/openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    expiresOn: null,
    note: "Widely used and stable. Weaker on Russian.",
  },
  "openrouter/openai/gpt-4.1-nano": {
    id: "openrouter/openai/gpt-4.1-nano",
    label: "GPT-4.1 Nano",
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    expiresOn: null,
    note: "Budget option. Unstable on English.",
  },
  "openrouter/google/gemini-2.5-flash-lite": {
    id: "openrouter/google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    expiresOn: "2026-10-20",
    note: "Good results but OpenRouter retires it on 2026-10-20. Remove it by then.",
  },
};

export const KNOWLEDGE_ITEM_MODEL_OPTIONS: KnowledgeItemModelOption[] = KNOWLEDGE_ITEM_MODEL_IDS.map(
  (id) => KNOWLEDGE_ITEM_MODELS[id],
);

function formatPrice(value: number): string {
  return value >= 0.1 ? value.toFixed(2) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatKnowledgeItemModelPrice(option: Pick<KnowledgeItemModelOption, "inputPerMillion" | "outputPerMillion">): string {
  return `$${formatPrice(option.inputPerMillion)} in / $${formatPrice(option.outputPerMillion)} out per 1M`;
}

export function resolveKnowledgeItemModelId(candidate: string | null | undefined): KnowledgeItemModelId {
  const parsed = knowledgeItemModelIdSchema.safeParse(candidate);

  return parsed.success ? parsed.data : DEFAULT_KNOWLEDGE_ITEM_MODEL_ID;
}

export function resolveUsableKnowledgeItemModelId(
  candidate: string | null | undefined,
  today: Date = new Date(),
): KnowledgeItemModelId | null {
  const parsed = knowledgeItemModelIdSchema.safeParse(candidate);

  if (!parsed.success) {
    return null;
  }

  const { expiresOn } = KNOWLEDGE_ITEM_MODELS[parsed.data];

  if (expiresOn !== null && new Date(`${expiresOn}T00:00:00Z`) <= today) {
    return null;
  }

  return parsed.data;
}
