import { z } from "zod";
import { modelTierSchema } from "./model-tier";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";
import { fusionCostEstimateSchema, fusionModelIdsSchema } from "./fusion-settings";
import {
  desiredRetentionInputSchema,
  desiredRetentionSchema,
  stepsMinutesInputSchema,
  stepsMinutesSchema,
} from "./study-option-fields";

export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const MIN_NEW_CARDS_PER_DAY = 1;
export const MAX_NEW_CARDS_PER_DAY = 200;

export function clampNewCardsPerDay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_NEW_CARDS_PER_DAY;
  }

  return Math.min(MAX_NEW_CARDS_PER_DAY, Math.max(MIN_NEW_CARDS_PER_DAY, Math.round(value)));
}

export const newCardsPerDaySchema = z
  .number()
  .int()
  .min(MIN_NEW_CARDS_PER_DAY)
  .max(MAX_NEW_CARDS_PER_DAY);

export const DEFAULT_MIX_NEW_WITH_DUE = true;
export const DEFAULT_MAX_REVIEWS_PER_DAY = 200;
export const MAX_MAX_REVIEWS_PER_DAY = 9999;

export function clampMaxReviewsPerDay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_REVIEWS_PER_DAY;
  }

  return Math.min(MAX_MAX_REVIEWS_PER_DAY, Math.max(0, Math.round(value)));
}

export const maxReviewsPerDaySchema = z.number().int().min(0).max(MAX_MAX_REVIEWS_PER_DAY);

export const maxReviewsPerDayInputSchema = z.number().transform(clampMaxReviewsPerDay);

export const newCardsPerDayInputSchema = z.number().transform(clampNewCardsPerDay);

export const adminSettingsSchema = z.object({
  testToggle: z.boolean(),
  modelTier: modelTierSchema,
  knowledgeItemModelId: knowledgeItemModelIdSchema,
  newCardsPerDay: newCardsPerDaySchema,
  maxReviewsPerDay: maxReviewsPerDaySchema,
  mixNewWithDue: z.boolean(),
  learningStepsMinutes: stepsMinutesSchema,
  relearningStepsMinutes: stepsMinutesSchema,
  desiredRetention: desiredRetentionSchema,
  fusionEnabled: z.boolean(),
  fusionModelIds: fusionModelIdsSchema,
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const adminSettingsResponseSchema = adminSettingsSchema.extend({
  fusionEstimate: fusionCostEstimateSchema,
});

export type AdminSettingsResponse = z.infer<typeof adminSettingsResponseSchema>;

export const updateAdminSettingsInput = z.object({
  testToggle: z.boolean().optional(),
  modelTier: modelTierSchema.optional(),
  knowledgeItemModelId: knowledgeItemModelIdSchema.optional(),
  newCardsPerDay: newCardsPerDayInputSchema.optional(),
  maxReviewsPerDay: maxReviewsPerDayInputSchema.optional(),
  mixNewWithDue: z.boolean().optional(),
  learningStepsMinutes: stepsMinutesInputSchema.optional(),
  relearningStepsMinutes: stepsMinutesInputSchema.optional(),
  desiredRetention: desiredRetentionInputSchema.optional(),
  fusionEnabled: z.boolean().optional(),
  fusionModelIds: fusionModelIdsSchema.optional(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsInput>;
