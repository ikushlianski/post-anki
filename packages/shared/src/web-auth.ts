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

export const deviceTokenInputSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
  label: z.string().trim().min(1).max(100),
});

export type DeviceTokenInput = z.infer<typeof deviceTokenInputSchema>;

export const deviceTokenResultSchema = z.object({
  token: z.string(),
  label: z.string(),
});

export type DeviceTokenResult = z.infer<typeof deviceTokenResultSchema>;
