import type http from "node:http";
import { askKnowledgeBitChatInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { askKnowledgeBitChat, type KnowledgeBitChatError } from "./knowledge-bit-chat.service.js";

const STATUS: Record<KnowledgeBitChatError, number> = {
  not_found: 404,
  not_approved: 403,
};

export async function handleAskKnowledgeBitChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): Promise<void> {
  const body = await readJsonBody(req, askKnowledgeBitChatInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await askKnowledgeBitChat(id, body.data);

  if ("error" in result) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result);
}
