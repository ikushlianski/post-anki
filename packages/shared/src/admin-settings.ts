import { z } from "zod";
import { modelTierSchema } from "./model-tier";

export const adminSettingsSchema = z.object({
  testToggle: z.boolean(),
  modelTier: modelTierSchema,
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateAdminSettingsInput = z.object({
  testToggle: z.boolean().optional(),
  modelTier: modelTierSchema.optional(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsInput>;
