import type http from "node:http";
import { updateAccountInputSchema } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getAccount, updateAccountName } from "./account.repo.js";
import { resolveCurrentSession } from "./account.session.js";

export async function handleGetAccount(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const current = await resolveCurrentSession(req);

  if (!current) {
    sendError(res, 401, "no_user_session");
    return;
  }

  const account = await getAccount(getDb(), current);

  if (!account) {
    sendError(res, 404, "account_not_found");
    return;
  }

  sendJson(res, 200, account);
}

export async function handleUpdateAccount(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const current = await resolveCurrentSession(req);

  if (!current) {
    sendError(res, 401, "no_user_session");
    return;
  }

  const body = await readJsonBody(req, updateAccountInputSchema);

  if (!body.ok) {
    sendError(res, 400, "invalid_input", body.issues);
    return;
  }

  const account = await updateAccountName(getDb(), current, body.data.name);

  if (!account) {
    sendError(res, 404, "account_not_found");
    return;
  }

  sendJson(res, 200, account);
}
