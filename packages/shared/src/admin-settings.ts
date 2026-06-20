import { z } from "zod";

export const adminSettingsSchema = z.object({
  testToggle: z.boolean(),
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

export const updateAdminSettingsInput = z.object({
  testToggle: z.boolean(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsInput>;
