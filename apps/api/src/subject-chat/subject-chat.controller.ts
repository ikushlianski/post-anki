import type http from "node:http";
import { askSubjectChatInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { askSubjectChat } from "./subject-chat.service.js";

// POST /subject-chat/ask
export async function handleAskSubjectChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, askSubjectChatInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await askSubjectChat(body.data);

  if (result === "subject_not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}
