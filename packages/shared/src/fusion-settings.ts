import { z } from "zod";
import { knowledgeItemModelIdSchema, type KnowledgeItemModelId } from "./knowledge-item-model";

export const FUSION_MIN_MODELS = 2;
export const FUSION_MAX_MODELS = 5;
export const DEFAULT_FUSION_ENABLED = false;
export const DEFAULT_FUSION_MODEL_IDS: KnowledgeItemModelId[] = [];

export const fusionModelIdsSchema = z.array(knowledgeItemModelIdSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  { message: "Fusion models must be distinct" },
);

export const fusionSettingsSchema = z
  .object({
    fusionEnabled: z.boolean(),
    fusionModelIds: fusionModelIdsSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.fusionEnabled) {
      return;
    }

    const count = value.fusionModelIds.length;

    if (count < FUSION_MIN_MODELS || count > FUSION_MAX_MODELS) {
      ctx.addIssue({
        code: "custom",
        path: ["fusionModelIds"],
        message: `Fusion mode needs ${FUSION_MIN_MODELS} to ${FUSION_MAX_MODELS} models`,
      });
    }
  });

export type FusionSettings = z.infer<typeof fusionSettingsSchema>;

export const fusionCostEstimateSchema = z.object({
  perModel: z.array(
    z.object({ modelId: knowledgeItemModelIdSchema, estimatedCostUsd: z.number() }),
  ),
  totalEstimatedCostUsd: z.number(),
});

export type FusionCostEstimate = z.infer<typeof fusionCostEstimateSchema>;
