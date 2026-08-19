import { z } from "zod";

export const modelTierSchema = z.enum(["cheap", "balanced", "premium"]);

export type ModelTier = z.infer<typeof modelTierSchema>;

export const MODEL_TIER_LABEL: Record<ModelTier, string> = {
  cheap: "Cheap",
  balanced: "Balanced",
  premium: "Premium",
};
