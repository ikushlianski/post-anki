import type { ModelTier } from "@post-anki/shared";

const TIER_TO_MODEL_ID: Record<ModelTier, string> = {
  cheap: "openrouter/deepseek/deepseek-v4-flash-latest",
  balanced: "openrouter/openai/gpt-4o-mini",
  premium: "openrouter/deepseek/deepseek-v4-pro",
};

export function tierToModelId(tier: ModelTier): string {
  return TIER_TO_MODEL_ID[tier];
}

export interface ResolveModelTierInput {
  curriculumModelTier: ModelTier | null;
  subjectModelTier: ModelTier | null;
  globalModelTier: ModelTier;
}

export function resolveModelTier(input: ResolveModelTierInput): ModelTier {
  return input.curriculumModelTier ?? input.subjectModelTier ?? input.globalModelTier;
}
