import { randomBytes } from "node:crypto";
import type { DeviceTokenInput } from "@post-anki/shared";
import { hashApiToken } from "../api-token/api-token.hash.js";
import { insertApiToken } from "../api-token/api-token.repo.js";
import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";
import { CLIENT_IP_HEADER, getAuth } from "./auth.js";

const DEFAULT_ORIGIN = "http://localhost:5540";
const SESSION_TOKEN_HEADER = "set-auth-token";

export type DeviceTokenOutcome =
  | { kind: "created"; token: string; label: string }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited"; retryAfter: string | null };

export interface DeviceTokenDeps {
  authHandler: (request: Request) => Promise<Response>;
  insertToken: typeof insertApiToken;
  baseUrl: string;
}

function defaultDeps(): DeviceTokenDeps {
  return {
    authHandler: (request) => getAuth().handler(request),
    insertToken: insertApiToken,
    baseUrl: loadEnv().BETTER_AUTH_URL ?? DEFAULT_ORIGIN,
  };
}

function authRequest(deps: DeviceTokenDeps, path: string, clientIp: string, init: RequestInit & { headers: Record<string, string> }) {
  return new Request(`${deps.baseUrl}/api/auth${path}`, {
    method: "POST",
    ...init,
    headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: clientIp, ...init.headers },
  });
}

export async function createDeviceToken(
  input: DeviceTokenInput,
  clientIp: string,
  deps: DeviceTokenDeps = defaultDeps(),
): Promise<DeviceTokenOutcome> {
  const signIn = await deps.authHandler(
    authRequest(deps, "/sign-in/email", clientIp, {
      headers: {},
      body: JSON.stringify({ email: input.email, password: input.password }),
    }),
  );

  if (signIn.status === 429) {
    return { kind: "rate_limited", retryAfter: signIn.headers.get("retry-after") };
  }

  const sessionToken = signIn.headers.get(SESSION_TOKEN_HEADER);

  if (!signIn.ok || !sessionToken) {
    return { kind: "invalid_credentials" };
  }

  const rawToken = `pat_${randomBytes(32).toString("hex")}`;

  await deps.insertToken({ label: input.label, tokenHash: hashApiToken(rawToken), ownerEmail: input.email });

  await deps
    .authHandler(authRequest(deps, "/sign-out", clientIp, { headers: { authorization: `Bearer ${sessionToken}` }, body: "{}" }))
    .catch(() => log.warn({}, "device_token_session_cleanup_failed"));

  return { kind: "created", token: rawToken, label: input.label };
}
