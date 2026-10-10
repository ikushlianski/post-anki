import { z } from "zod";
import { modelTierSchema } from "./model-tier";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";

export const adminSettingsSchema = z.object({
  testToggle: z.boolean(),
  modelTier: modelTierSchema,
  knowledgeItemModelId: knowledgeItemModelIdSchema,
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateAdminSettingsInput = z.object({
  testToggle: z.boolean().optional(),
  modelTier: modelTierSchema.optional(),
  knowledgeItemModelId: knowledgeItemModelIdSchema.optional(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsInput>;
