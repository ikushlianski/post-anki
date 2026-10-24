import type http from "node:http";
import { hashApiToken } from "../api-token/api-token.hash.js";
import { findActiveTokenByHash } from "../api-token/api-token.repo.js";
import { sendError, sendJson } from "../shared/http.js";
import {
  buildJwks,
  loadSyncSigningKey,
  signSyncToken,
  SYNC_TOKEN_TTL_SECONDS,
} from "./sync-auth.keys.js";

const NOT_CONFIGURED_MESSAGE =
  "Set SYNC_JWT_PRIVATE_KEY (PKCS8 PEM, EC P-256) to enable PowerSync sync tokens";
const INVALID_KEY_MESSAGE = "SYNC_JWT_PRIVATE_KEY is not a valid EC P-256 PKCS8 PEM key";

const DEFAULT_SUBJECT = "owner";

function sendKeyError(res: http.ServerResponse, reason: "not_configured" | "invalid_key"): void {
  sendError(
    res,
    503,
    reason === "not_configured" ? "sync_auth_not_configured" : "sync_auth_invalid_key",
    reason === "not_configured" ? NOT_CONFIGURED_MESSAGE : INVALID_KEY_MESSAGE,
  );
}

async function resolveSubject(req: http.IncomingMessage): Promise<string> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return DEFAULT_SUBJECT;
  }

  const token = await findActiveTokenByHash(hashApiToken(header.slice("Bearer ".length)));

  return token?.id ?? DEFAULT_SUBJECT;
}

export async function handleCreateSyncToken(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const loaded = loadSyncSigningKey();

  if (!loaded.ok) {
    sendKeyError(res, loaded.reason);
    return;
  }

  const { token, expiresAt } = await signSyncToken(loaded.key, await resolveSubject(req));

  res.setHeader("cache-control", "no-store");
  sendJson(res, 201, { token, expiresAt, expiresInSeconds: SYNC_TOKEN_TTL_SECONDS });
}

export async function handleListSyncKeys(res: http.ServerResponse): Promise<void> {
  const loaded = loadSyncSigningKey();

  if (!loaded.ok) {
    sendKeyError(res, loaded.reason);
    return;
  }

  res.setHeader("cache-control", "public, max-age=60");
  sendJson(res, 200, await buildJwks(loaded.key));
}
