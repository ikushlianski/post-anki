import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { hasScope } from "../api-token/api-token.scopes.js";

export function hasCardWriteScope(auth: Pick<RequestAuthContext, "scopes">): boolean {
  return hasScope(auth.scopes, "cards:write");
}

export function hasKnowledgeWriteScope(auth: Pick<RequestAuthContext, "scopes">): boolean {
  return hasScope(auth.scopes, "knowledge:write");
}
