import { z } from "zod";

export const API_TOKEN_SCOPES = ["knowledge:write"] as const;

export const ALL_SCOPES = "*";

export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

export function hasScope(scopes: readonly string[], scope: ApiTokenScope): boolean {
  return scopes.includes(ALL_SCOPES) || scopes.includes(scope);
}

export function parseScopeList(raw: string): ApiTokenScope[] {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return z.array(apiTokenScopeSchema).parse(parts);
}
