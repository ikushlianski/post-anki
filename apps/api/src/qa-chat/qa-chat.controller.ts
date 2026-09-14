import type http from "node:http";
import { askQaChatInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { askQaChat, type QaChatError } from "./qa-chat.service.js";

const STATUS: Record<QaChatError, number> = {
  not_found: 404,
};

export async function handleAskQaChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, askQaChatInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await askQaChat(body.data);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
