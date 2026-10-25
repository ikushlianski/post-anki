import { z } from "zod";

export const webAuthStateSchema = z.enum(["unconfigured", "signed_out", "signed_in"]);

export type WebAuthState = z.infer<typeof webAuthStateSchema>;

export const webAuthCheckInputSchema = z.object({
  cookie: z.string().max(8192).default(""),
});

export type WebAuthCheckInput = z.infer<typeof webAuthCheckInputSchema>;

export const webAuthCheckResultSchema = z.object({
  state: webAuthStateSchema,
});

export type WebAuthCheckResult = z.infer<typeof webAuthCheckResultSchema>;
