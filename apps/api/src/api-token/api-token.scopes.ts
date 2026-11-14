import { z } from "zod";
import { API_TOKEN_SCOPES, apiTokenScopeSchema, type ApiTokenScope } from "@post-anki/shared";

export { API_TOKEN_SCOPES, apiTokenScopeSchema, type ApiTokenScope };

export const ALL_SCOPES = "*";

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
