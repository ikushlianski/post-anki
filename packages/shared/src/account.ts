import { z } from "zod";

export const ACCOUNT_NAME_MAX_LENGTH = 80;

export const accountNameSchema = z.string().trim().min(1).max(ACCOUNT_NAME_MAX_LENGTH);

export const accountSchema = z.object({
  email: z.string(),
  name: z.string(),
  lastSignInAt: z.string().nullable(),
});

export type Account = z.infer<typeof accountSchema>;

export const updateAccountInputSchema = z.object({ name: accountNameSchema }).strict();

export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
