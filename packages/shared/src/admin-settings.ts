import { z } from "zod";
import { modelTierSchema } from "./model-tier";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";

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

export const newCardsPerDayInputSchema = z.number().transform(clampNewCardsPerDay);

export const adminSettingsSchema = z.object({
  testToggle: z.boolean(),
  modelTier: modelTierSchema,
  knowledgeItemModelId: knowledgeItemModelIdSchema,
  newCardsPerDay: newCardsPerDaySchema,
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateAdminSettingsInput = z.object({
  testToggle: z.boolean().optional(),
  modelTier: modelTierSchema.optional(),
  knowledgeItemModelId: knowledgeItemModelIdSchema.optional(),
  newCardsPerDay: newCardsPerDayInputSchema.optional(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsInput>;
