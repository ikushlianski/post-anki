import { getAuth } from "./auth.js";

export type CredentialKind = "shared_secret" | "device_token" | "session_token" | "none";

const BEARER_PREFIX = "Bearer ";
const DEVICE_TOKEN_PREFIX = "pat_";
const NATIVE_AUTH_ROUTES = new Set(["POST /api/auth/sign-in/email", "POST /api/auth/sign-out", "GET /api/auth/get-session"]);

export function classifyCredential(header: string | undefined, sharedSecret: string | undefined): CredentialKind {
  if (!header?.startsWith(BEARER_PREFIX) || header.length === BEARER_PREFIX.length) {
    return "none";
  }

  if (sharedSecret !== undefined && header === `${BEARER_PREFIX}${sharedSecret}`) {
    return "shared_secret";
  }

  return header.startsWith(`${BEARER_PREFIX}${DEVICE_TOKEN_PREFIX}`) ? "device_token" : "session_token";
}

export function isNativeAuthRoute(method: string, path: string): boolean {
  return NATIVE_AUTH_ROUTES.has(`${method} ${path}`);
}

export async function hasValidSessionToken(header: string): Promise<boolean> {
  try {
    const session = await getAuth().api.getSession({ headers: new Headers({ authorization: header }) });

    return session !== null;
  } catch {
    return false;
  }
}
