import type http from "node:http";
import { ALL_SCOPES } from "../api-token/api-token.scopes.js";

export type RequestCredentialKind = "shared_secret" | "device_token" | "session_token" | "none";

export interface RequestAuthContext {
  kind: RequestCredentialKind;
  scopes: readonly string[];
}

export const NO_AUTH_CONTEXT: RequestAuthContext = { kind: "none", scopes: [] };

const contexts = new WeakMap<http.IncomingMessage, RequestAuthContext>();

export function setRequestAuthContext(req: http.IncomingMessage, context: RequestAuthContext): void {
  contexts.set(req, context);
}

export function getRequestAuthContext(req: http.IncomingMessage): RequestAuthContext {
  return contexts.get(req) ?? NO_AUTH_CONTEXT;
}

export function fullAccessContext(kind: "shared_secret" | "session_token"): RequestAuthContext {
  return { kind, scopes: [ALL_SCOPES] };
}
