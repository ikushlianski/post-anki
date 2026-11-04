import type http from "node:http";
import {
  saveNotionConnectionInput,
  type NotionConnectionCheckResult,
  type NotionConnectionStatus,
} from "@post-anki/shared";
import { loadEnv } from "../shared/env.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { encryptSecret } from "./connector-secret.crypto.js";
import { deleteConnectorSecret, saveConnectorSecret } from "./connector-secret.repo.js";
import { defaultNotionGateway } from "./default-notion-gateway.js";
import { NOTION_SECRET_NAME, resolveNotionToken } from "./resolve-notion-token.js";

async function readStatus(): Promise<NotionConnectionStatus> {
  const resolved = await resolveNotionToken();

  return {
    configured: resolved !== null,
    origin: resolved?.origin ?? "none",
    canStoreToken: Boolean(loadEnv().CONNECTOR_SECRET_KEY),
  };
}

export async function handleGetNotionConnection(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await readStatus());
}

export async function handleSaveNotionConnection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const keyBase64 = loadEnv().CONNECTOR_SECRET_KEY;

  if (!keyBase64) {
    sendError(res, 409, "secret_key_missing", "Set CONNECTOR_SECRET_KEY in the server environment first.");
    return;
  }

  const body = await readJsonBody(req, saveNotionConnectionInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: "token: required" });
    return;
  }

  await saveConnectorSecret(NOTION_SECRET_NAME, encryptSecret(body.data.token, keyBase64));
  sendJson(res, 200, await readStatus());
}

export async function handleDeleteNotionConnection(res: http.ServerResponse): Promise<void> {
  await deleteConnectorSecret(NOTION_SECRET_NAME);
  sendJson(res, 200, await readStatus());
}

export async function handleCheckNotionConnection(res: http.ServerResponse): Promise<void> {
  const check = await defaultNotionGateway().checkConnection();
  const result: NotionConnectionCheckResult = {
    ok: check.ok,
    workspaceName: check.workspaceName,
    reason: check.reason,
  };

  sendJson(res, 200, result);
}
