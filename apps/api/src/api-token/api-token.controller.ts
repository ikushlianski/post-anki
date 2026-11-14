import type http from "node:http";
import { randomBytes } from "node:crypto";
import { createApiTokenInputSchema, type CreatedApiToken } from "@post-anki/shared";
import { getRequestAuthContext } from "../auth/request-auth-context.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { hashApiToken } from "./api-token.hash.js";
import { getApiTokenSummary, listApiTokens, revokeApiTokenById } from "./api-token.owner.repo.js";
import { insertApiToken } from "./api-token.repo.js";

function rejectApiKeyCaller(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (getRequestAuthContext(req).kind === "device_token") {
    sendError(res, 403, "api_key_cannot_manage_keys");

    return true;
  }

  return false;
}

export async function handleCreateApiToken(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (rejectApiKeyCaller(req, res)) {
    return;
  }

  const body = await readJsonBody(req, createApiTokenInputSchema);

  if (!body.ok) {
    sendError(res, 400, "invalid_input", body.issues);

    return;
  }

  const rawToken = `pat_${randomBytes(32).toString("hex")}`;
  const { id } = await insertApiToken({
    label: body.data.name,
    tokenHash: hashApiToken(rawToken),
    scopes: body.data.scopes,
  });
  const summary = await getApiTokenSummary(id);

  if (!summary) {
    sendError(res, 500, "internal_error");

    return;
  }

  const created: CreatedApiToken = { ...summary, token: rawToken };

  res.setHeader("cache-control", "no-store");
  sendJson(res, 201, created);
}

export async function handleListApiTokens(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (rejectApiKeyCaller(req, res)) {
    return;
  }

  res.setHeader("cache-control", "no-store");
  sendJson(res, 200, { tokens: await listApiTokens() });
}

export async function handleRevokeApiToken(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  if (rejectApiKeyCaller(req, res)) {
    return;
  }

  if (await revokeApiTokenById(id)) {
    sendJson(res, 200, { id, revoked: true });

    return;
  }

  const existing = await getApiTokenSummary(id);

  if (existing) {
    sendError(res, 409, "already_revoked");

    return;
  }

  sendError(res, 404, "not_found");
}
