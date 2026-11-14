import { z } from "zod";

export const API_TOKEN_SCOPES = ["knowledge:write", "cards:write"] as const;

export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

export const API_TOKEN_NAME_MAX_LENGTH = 80;

export const createApiTokenInputSchema = z
  .object({
    name: z.string().trim().min(1).max(API_TOKEN_NAME_MAX_LENGTH),
    scopes: z
      .array(apiTokenScopeSchema)
      .max(API_TOKEN_SCOPES.length)
      .default(["knowledge:write"])
      .transform((scopes) => [...new Set(scopes)]),
  })
  .strict();

export type CreateApiTokenInput = z.input<typeof createApiTokenInputSchema>;

export const apiTokenSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});

export type ApiTokenSummary = z.infer<typeof apiTokenSummarySchema>;

export const createdApiTokenSchema = apiTokenSummarySchema.extend({ token: z.string() });

export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

export const listApiTokensResponseSchema = z.object({ tokens: z.array(apiTokenSummarySchema) });

export type ListApiTokensResponse = z.infer<typeof listApiTokensResponseSchema>;
