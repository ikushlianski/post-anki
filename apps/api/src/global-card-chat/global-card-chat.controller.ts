import type http from "node:http";
import { askGlobalCardChatInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { askGlobalCardChat } from "./global-card-chat.service.js";

export async function handleAskGlobalCardChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, askGlobalCardChatInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await askGlobalCardChat(body.data);

  sendJson(res, 200, result);
}
